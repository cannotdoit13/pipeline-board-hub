const { refreshRuns, listRepos, classifyRepoActivity } = require("./pipelineService");
const { defaultWorkspaceId } = require("../data/store");

const schedulerState = {
  enabled: false,
  activePollMinutes: 15,
  lowPollMinutes: 60,
  reconcileHours: 24,
  activeThreshold: 4,
  lastActivePollAt: null,
  lastLowPollAt: null,
  lastReconcileAt: null,
  timers: [],
  logs: [],
};

function pushLog(message) {
  schedulerState.logs.unshift({
    at: new Date().toISOString(),
    message,
  });
  schedulerState.logs = schedulerState.logs.slice(0, 100);
}

async function runPollCycle({ mode = "active", workspaceId = defaultWorkspaceId }) {
  const repos = await listRepos({ workspaceId });
  const target = [];
  for (const repo of repos) {
    if (repo.defaultPipelineProvider === "mock") continue;
    const activity = await classifyRepoActivity({
      workspaceId,
      repo: repo.fullName,
      activeThreshold: schedulerState.activeThreshold,
    });
    if (mode === "active" && activity === "active") target.push(repo);
    if (mode === "low" && activity === "low") target.push(repo);
  }

  let totalRuns = 0;
  let failures = 0;
  for (const repo of target) {
    try {
      const runs = await refreshRuns({
        workspaceId,
        repo: repo.fullName,
        provider: repo.defaultPipelineProvider || "github-actions",
        limit: 20,
      });
      totalRuns += runs.length;
    } catch (error) {
      failures++;
      pushLog(`Poll(${mode}) repo=${repo.fullName} error=${error.message}`);
    }
  }
  pushLog(`Poll(${mode}) repos=${target.length} runs=${totalRuns} failures=${failures}`);
  if (mode === "active") schedulerState.lastActivePollAt = new Date().toISOString();
  if (mode === "low") schedulerState.lastLowPollAt = new Date().toISOString();
  return { reposPolled: target.length, runsFetched: totalRuns, failures };
}

async function runDailyReconciliation({ workspaceId = defaultWorkspaceId }) {
  const repos = await listRepos({ workspaceId });
  let totalRuns = 0;
  let failures = 0;
  for (const repo of repos) {
    if (repo.defaultPipelineProvider === "mock") continue;
    try {
      const runs = await refreshRuns({
        workspaceId,
        repo: repo.fullName,
        provider: repo.defaultPipelineProvider || "github-actions",
        limit: 100,
      });
      totalRuns += runs.length;
    } catch (error) {
      failures++;
      pushLog(`Reconcile repo=${repo.fullName} error=${error.message}`);
    }
  }
  schedulerState.lastReconcileAt = new Date().toISOString();
  pushLog(`Reconcile repos=${repos.length} runs=${totalRuns} failures=${failures}`);
  return { reposPolled: repos.length, runsFetched: totalRuns, failures };
}

function startScheduler({ workspaceId = defaultWorkspaceId } = {}) {
  if (schedulerState.enabled) return schedulerState;
  schedulerState.enabled = true;

  schedulerState.activePollMinutes = Number(process.env.ACTIVE_POLL_MINUTES || 15);
  schedulerState.lowPollMinutes = Number(process.env.LOW_POLL_MINUTES || 60);
  schedulerState.reconcileHours = Number(process.env.RECONCILE_HOURS || 24);
  schedulerState.activeThreshold = Number(process.env.ACTIVE_REPO_THRESHOLD || 4);

  const activeTimer = setInterval(() => {
    runPollCycle({ mode: "active", workspaceId }).catch((err) => pushLog(`Poll(active) error: ${err.message}`));
  }, schedulerState.activePollMinutes * 60 * 1000);

  const lowTimer = setInterval(() => {
    runPollCycle({ mode: "low", workspaceId }).catch((err) => pushLog(`Poll(low) error: ${err.message}`));
  }, schedulerState.lowPollMinutes * 60 * 1000);

  const reconcileTimer = setInterval(() => {
    runDailyReconciliation({ workspaceId }).catch((err) => pushLog(`Reconcile error: ${err.message}`));
  }, schedulerState.reconcileHours * 60 * 60 * 1000);

  schedulerState.timers = [activeTimer, lowTimer, reconcileTimer];
  pushLog("Scheduler started.");

  // Run initial cycles immediately
  runPollCycle({ mode: "active", workspaceId }).catch((err) => pushLog(`Initial active poll error: ${err.message}`));
  runPollCycle({ mode: "low", workspaceId }).catch((err) => pushLog(`Initial low poll error: ${err.message}`));

  return schedulerState;
}

function stopScheduler() {
  schedulerState.timers.forEach((t) => clearInterval(t));
  schedulerState.timers = [];
  schedulerState.enabled = false;
  pushLog("Scheduler stopped.");
  return schedulerState;
}

function getSchedulerState() {
  return {
    ...schedulerState,
    timers: schedulerState.timers.length,
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  getSchedulerState,
  runPollCycle,
  runDailyReconciliation,
};
