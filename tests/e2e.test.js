const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createApp } = require("../src/app");
const { listBoardItems } = require("../src/data/store");

test("supports failed run to board item and ai recommendation", async () => {
  const app = createApp();

  await request(app).post("/api/pipelines/refresh").send({
    provider: "mock",
    repo: "demo/pipeline-board-hub",
    limit: 8,
  });

  const runsRes = await request(app).get("/api/pipelines/runs?status=failed&provider=mock");
  assert.equal(runsRes.status, 200);
  assert.ok(runsRes.body.runs.length > 0);

  const failedRun = runsRes.body.runs[0];
  const itemRes = await request(app).post("/api/board/items/from-failed-run").send({
    runId: failedRun.id,
  });
  assert.equal(itemRes.status, 201);
  assert.ok(itemRes.body.item.assigneeId);

  const recRes = await request(app).post("/api/ai/recommendations").send({
    requirementText: "Fix flaky pipeline and add api tests",
    context: { hasRelatedHistory: true, preferredGithubUser: "raj-dev" },
  });
  assert.equal(recRes.status, 201);
  assert.ok(recRes.body.recommendation.tasks.length > 0);
});

test("deduplicates webhook events by event id", async () => {
  const app = createApp();
  const eventId = `delivery_${Date.now()}`;
  const payload = {
    provider: "mock",
    event: {
      eventId,
      id: "evt_x_1",
      repo: "demo/pipeline-board-hub",
      branch: "main",
      commitSha: "dup001",
      actor: "anna-dev",
      status: "failed",
      startedAt: "2026-05-01T00:00:00.000Z",
      finishedAt: "2026-05-01T00:01:00.000Z",
      logsUrl: "https://example.local/logs/dup001",
    },
  };
  const first = await request(app).post("/api/pipelines/events").send(payload);
  const second = await request(app).post("/api/pipelines/events").send(payload);
  assert.equal(first.status, 201);
  assert.equal(second.status, 202);
});

test("auto-creates board item for failed runs on refresh", async () => {
  const app = createApp();
  await request(app).post("/api/pipelines/refresh").send({
    provider: "mock",
    repo: "demo/pipeline-board-hub",
    limit: 12,
  });

  const failedRunsRes = await request(app).get("/api/pipelines/runs?provider=mock&status=failed");
  assert.equal(failedRunsRes.status, 200);
  assert.ok(failedRunsRes.body.runs.length > 0);
  const failedRun = failedRunsRes.body.runs[0];

  const items = await listBoardItems({ workspaceId: "ws_default" });
  const linked = items.filter((i) => i.links && i.links.runId === failedRun.id);
  assert.ok(linked.length >= 1);
});

test("does not auto-create noisy first failure on non-critical branch", async () => {
  const app = createApp();
  const eventId = `first_failure_${Date.now()}`;
  const payload = {
    provider: "mock",
    event: {
      eventId,
      id: `first_failure_run_${Date.now()}`,
      repo: "demo/noisy-repo",
      branch: "feature/noise",
      commitSha: `noise_${Date.now()}`,
      actor: "anna-dev",
      status: "failed",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      logsUrl: "https://example.local/logs/noise",
    },
  };

  const res = await request(app).post("/api/pipelines/events").send(payload);
  assert.equal(res.status, 201);
  const items = await listBoardItems({ workspaceId: "ws_default", repo: "demo/noisy-repo" });
  assert.equal(items.length, 0);
});

test("auto-creates after repeated failure on same non-critical branch", async () => {
  const app = createApp();
  const repo = `demo/repeated-${Date.now()}`;
  for (let i = 0; i < 2; i++) {
    await request(app).post("/api/pipelines/events").send({
      provider: "mock",
      event: {
        eventId: `repeat_failure_${Date.now()}_${i}`,
        id: `repeat_failure_run_${Date.now()}_${i}`,
        repo,
        branch: "feature/repeat",
        commitSha: `repeat_${Date.now()}_${i}`,
        actor: "raj-dev",
        status: "failed",
        startedAt: new Date(Date.now() + i).toISOString(),
        finishedAt: new Date(Date.now() + i + 1).toISOString(),
        logsUrl: "https://example.local/logs/repeat",
      },
    });
  }

  const items = await listBoardItems({ workspaceId: "ws_default", repo });
  assert.ok(items.length >= 1);
});

test("accepts native workflow_run webhook payload format", async () => {
  const app = createApp();
  const payload = {
    action: "completed",
    repository: { full_name: "demo/pipeline-board-hub" },
    sender: { login: "anna-dev" },
    workflow_run: {
      id: 999999001,
      status: "completed",
      conclusion: "failure",
      head_branch: "main",
      head_sha: "native001",
      actor: { login: "anna-dev" },
      run_started_at: "2026-05-04T00:00:00.000Z",
      updated_at: "2026-05-04T00:03:00.000Z",
      html_url: "https://github.com/demo/runs/999999001",
    },
  };
  const res = await request(app)
    .post("/api/pipelines/events")
    .set("x-github-event", "workflow_run")
    .set("x-github-delivery", `delivery_native_${Date.now()}`)
    .send(payload);

  assert.equal(res.status, 201);
  assert.equal(res.body.run.provider, "github-actions");
  assert.equal(res.body.run.status, "failed");
});

test("deletes board items", async () => {
  const app = createApp();
  await request(app).post("/api/pipelines/refresh").send({
    provider: "mock",
    repo: "demo/pipeline-board-hub",
    limit: 4,
  });
  const items = await listBoardItems({ workspaceId: "ws_default" });
  assert.ok(items.length > 0);

  const res = await request(app).delete(`/api/board/items/${items[0].id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.deleted.id, items[0].id);
});

test("creates useful ai plan from failed run", async () => {
  const app = createApp();
  await request(app).post("/api/pipelines/refresh").send({
    provider: "mock",
    repo: "demo/pipeline-board-hub",
    limit: 8,
  });
  const failedRunsRes = await request(app).get("/api/pipelines/runs?provider=mock&status=failed");
  const failedRun = failedRunsRes.body.runs[0];

  const res = await request(app).post("/api/ai/recommendations/from-failed-run").send({
    runId: failedRun.id,
  });
  assert.equal(res.status, 201);
  assert.match(res.body.recommendation.tasks[0].title, /Triage failed workflow/);
});

test("filters and bulk deletes board items", async () => {
  const app = createApp();
  await request(app).post("/api/pipelines/refresh").send({
    provider: "mock",
    repo: "demo/pipeline-board-hub",
    limit: 8,
  });

  const filtered = await request(app).get("/api/board/items?severity=high");
  assert.equal(filtered.status, 200);
  assert.ok(Array.isArray(filtered.body.items));

  const deleted = await request(app).delete("/api/board/items?mode=mock");
  assert.equal(deleted.status, 200);
  assert.ok(deleted.body.deletedCount >= 0);
});

test("exposes scheduler status", async () => {
  const app = createApp();
  const res = await request(app).get("/api/pipelines/scheduler/status");
  assert.equal(res.status, 200);
  assert.ok(res.body.scheduler);
});
