const { id } = require("../../utils/id");

class MockPipelineAdapter {
  constructor() {
    this.provider = "mock";
  }

  fetchRuns({ workspaceId, repo, limit = 25, status }) {
    const statuses = ["success", "failed", "cancelled", "running"];
    const runs = Array.from({ length: limit }).map((_, index) => {
      const picked = statuses[index % statuses.length];
      return {
        id: id("run"),
        provider: this.provider,
        workspaceId,
        repo,
        branch: index % 2 === 0 ? "main" : "feature/mock",
        commitSha: `sha_${index.toString().padStart(4, "0")}`,
        actor: index % 2 === 0 ? "anna-dev" : "raj-dev",
        status: picked,
        durationSec: 60 + index * 5,
        startedAt: new Date(Date.now() - (index + 1) * 3600000).toISOString(),
        finishedAt: new Date(Date.now() - index * 3600000).toISOString(),
        logsUrl: `https://example.local/logs/${index}`,
      };
    });
    return status ? runs.filter((r) => r.status === status) : runs;
  }

  ingestEvent({ workspaceId, event }) {
    return {
      id: event.id || id("run"),
      provider: this.provider,
      workspaceId,
      repo: event.repo || "demo/pipeline-board-hub",
      branch: event.branch || "main",
      commitSha: event.commitSha || id("sha"),
      actor: event.actor || "system",
      status: event.status || "success",
      durationSec: event.durationSec || 120,
      startedAt: event.startedAt || new Date(Date.now() - 120000).toISOString(),
      finishedAt: event.finishedAt || new Date().toISOString(),
      logsUrl: event.logsUrl || "https://example.local/logs/event",
    };
  }
}

module.exports = { MockPipelineAdapter };
