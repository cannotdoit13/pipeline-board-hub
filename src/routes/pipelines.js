const express = require("express");
const {
  refreshRuns,
  ingestEvent,
  listRuns,
  listRepos,
} = require("../services/pipelineService");
const crypto = require("crypto");
const { verifyGithubSignature } = require("../middleware/webhookAuth");
const { upsertRepository } = require("../data/store");
const {
  getSchedulerState,
  runPollCycle,
  runDailyReconciliation,
} = require("../services/schedulerService");

const router = express.Router();
const defaultWorkspace = "ws_default";
const defaultRepo = "demo/pipeline-board-hub";

function normalizeWorkflowRunPayload(body) {
  const run = body.workflow_run || {};
  const mapConclusion = (status, conclusion) => {
    if (status === "queued") return "queued";
    if (status === "in_progress") return "running";
    if (conclusion === "success") return "success";
    if (conclusion === "cancelled") return "cancelled";
    if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "startup_failure") return "failed";
    return "running";
  };
  return {
    id: String(run.id || ""),
    repo: body.repository?.full_name || defaultRepo,
    branch: run.head_branch || "main",
    commitSha: run.head_sha || "",
    actor: run.actor?.login || body.sender?.login || "github-user",
    status: mapConclusion(run.status, run.conclusion),
    durationSec: run.run_started_at && run.updated_at
      ? Math.max(0, Math.floor((new Date(run.updated_at) - new Date(run.run_started_at)) / 1000))
      : 0,
    startedAt: run.run_started_at || run.created_at || new Date().toISOString(),
    finishedAt: run.updated_at || run.created_at || new Date().toISOString(),
    logsUrl: run.html_url || "",
  };
}

router.get("/runs", async (req, res) => {
  const runs = await listRuns({
    workspaceId: defaultWorkspace,
    provider: req.query.provider,
    status: req.query.status,
    repo: req.query.repo,
  });
  res.json({ runs });
});

router.post("/refresh", async (req, res) => {
  const runs = await refreshRuns({
    workspaceId: defaultWorkspace,
    repo: req.body.repo || defaultRepo,
    provider: req.body.provider || "mock",
    limit: Number(req.body.limit || 25),
    status: req.body.status,
  });
  res.json({ runs, count: runs.length });
});

router.post("/events", verifyGithubSignature, async (req, res) => {
  const githubEvent = req.headers["x-github-event"];
  const isWorkflowRun = githubEvent === "workflow_run" && req.body.workflow_run;
  const provider = isWorkflowRun ? "github-actions" : req.body.provider || "mock";
  const eventId = req.headers["x-github-delivery"] || req.body.event?.eventId;
  const payloadHash = crypto.createHash("sha256").update(req.rawBody || "").digest("hex");
  const mappedEvent = isWorkflowRun ? normalizeWorkflowRunPayload(req.body) : req.body.event || {};
  const run = await ingestEvent({
    workspaceId: defaultWorkspace,
    provider,
    event: { ...mappedEvent, eventId, payloadHash },
  });
  if (!run) return res.status(202).json({ skipped: true, reason: "Duplicate event ignored." });
  res.status(201).json({ run });
});

router.get("/repos", async (req, res) => {
  const repos = await listRepos({ workspaceId: defaultWorkspace });
  res.json({ repos });
});

router.post("/repos/register", async (req, res) => {
  const fullName = req.body.fullName;
  const provider = req.body.provider || "github-actions";
  if (!fullName || !fullName.includes("/")) {
    return res.status(400).json({ error: "fullName must be owner/repo." });
  }
  await upsertRepository({
    workspaceId: defaultWorkspace,
    fullName,
    defaultPipelineProvider: provider,
  });
  const repos = await listRepos({ workspaceId: defaultWorkspace });
  return res.status(201).json({ repos });
});

router.get("/scheduler/status", async (req, res) => {
  res.json({ scheduler: getSchedulerState() });
});

router.post("/scheduler/poll", async (req, res) => {
  const mode = req.body.mode === "low" ? "low" : "active";
  const result = await runPollCycle({ mode, workspaceId: defaultWorkspace });
  res.json({ mode, result, scheduler: getSchedulerState() });
});

router.post("/scheduler/reconcile", async (req, res) => {
  const result = await runDailyReconciliation({ workspaceId: defaultWorkspace });
  res.json({ result, scheduler: getSchedulerState() });
});

module.exports = router;
