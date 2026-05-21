class AzurePipelinesAdapter {
  constructor() {
    this.provider = "azure-pipelines";
  }

  async fetchRuns({ workspaceId, repo, limit = 25, status }) {
    // Placeholder for Azure DevOps integration.
    return [
      {
        id: "azp_stub_1",
        provider: this.provider,
        workspaceId,
        repo,
        branch: "main",
        commitSha: "stub_azure_commit",
        actor: "azure-user",
        status: status || "success",
        durationSec: 240,
        startedAt: new Date(Date.now() - 240000).toISOString(),
        finishedAt: new Date().toISOString(),
        logsUrl: "https://dev.azure.com/org/project/_build/results?buildId=1",
      },
    ].slice(0, limit);
  }

  async ingestEvent({ workspaceId, event }) {
    return {
      id: event.id || "azp_event_stub",
      provider: this.provider,
      workspaceId,
      repo: event.repo,
      branch: event.branch,
      commitSha: event.commitSha,
      actor: event.actor,
      status: event.status,
      durationSec: event.durationSec,
      startedAt: event.startedAt,
      finishedAt: event.finishedAt,
      logsUrl: event.logsUrl,
    };
  }
}

module.exports = { AzurePipelinesAdapter };
