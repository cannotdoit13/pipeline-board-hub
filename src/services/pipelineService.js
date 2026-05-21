const {
  addPipelineRun,
  listPipelineRuns,
  insertWebhookEvent,
  upsertRepository,
  listRepositories,
  countRecentRuns,
} = require("../data/store");
const { MockPipelineAdapter } = require("../adapters/pipeline/mockPipelineAdapter");
const { GitHubActionsAdapter } = require("../adapters/pipeline/githubActionsAdapter");
const { AzurePipelinesAdapter } = require("../adapters/pipeline/azurePipelinesAdapter");
const { recomputeMemberProfiles } = require("./memberProfileService");
const { ensureBoardItemForFailedRun } = require("./boardService");

const adapters = {
  mock: new MockPipelineAdapter(),
  "github-actions": new GitHubActionsAdapter(),
  "azure-pipelines": new AzurePipelinesAdapter(),
};

function getPipelineAdapter(provider = "mock") {
  return adapters[provider] || adapters.mock;
}

async function refreshRuns({ workspaceId, repo, provider, limit, status }) {
  await upsertRepository({
    workspaceId,
    fullName: repo,
    defaultPipelineProvider: provider || "mock",
  });
  const adapter = getPipelineAdapter(provider);
  const runs = await adapter.fetchRuns({ workspaceId, repo, limit, status });
  for (const run of runs) {
    const saved = await addPipelineRun(run);
    if (saved.status === "failed") {
      await ensureBoardItemForFailedRun({ workspaceId, run: saved, boardProvider: "github-projects" });
    }
  }
  await recomputeMemberProfiles({ workspaceId });
  return runs;
}

async function ingestEvent({ workspaceId, provider, event }) {
  if (event.eventId) {
    const inserted = await insertWebhookEvent({
      provider,
      eventId: event.eventId,
      payloadHash: event.payloadHash,
    });
    if (!inserted) return null;
  }
  const adapter = getPipelineAdapter(provider);
  const run = await adapter.ingestEvent({ workspaceId, event });
  await upsertRepository({
    workspaceId,
    fullName: run.repo,
    defaultPipelineProvider: provider,
  });
  const saved = await addPipelineRun(run);
  if (saved.status === "failed") {
    await ensureBoardItemForFailedRun({ workspaceId, run: saved, boardProvider: "github-projects" });
  }
  await recomputeMemberProfiles({ workspaceId });
  return saved;
}

async function listRuns({ workspaceId, provider, status, repo }) {
  return listPipelineRuns({ workspaceId, provider, status, repo });
}

async function listRepos({ workspaceId }) {
  return listRepositories({ workspaceId });
}

async function classifyRepoActivity({ workspaceId, repo, activeThreshold = 4, windowHours = 24 }) {
  const recentCount = await countRecentRuns({ workspaceId, repo, hours: windowHours });
  return recentCount >= activeThreshold ? "active" : "low";
}

module.exports = { refreshRuns, ingestEvent, listRuns, listRepos, classifyRepoActivity };
