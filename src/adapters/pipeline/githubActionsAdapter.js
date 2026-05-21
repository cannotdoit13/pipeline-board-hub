class GitHubActionsAdapter {
  constructor() {
    this.provider = "github-actions";
  }

  async fetchRuns({ workspaceId, repo, limit = 25, status }) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return [
        {
          id: "gha_stub_1",
          provider: this.provider,
          workspaceId,
          repo,
          branch: "main",
          commitSha: "stub_commit_sha",
          actor: "github-user",
          status: status || "success",
          durationSec: 180,
          startedAt: new Date(Date.now() - 180000).toISOString(),
          finishedAt: new Date().toISOString(),
          logsUrl: "https://github.com/actions/runs/stub",
        },
      ].slice(0, limit);
    }

    const [owner, repoName] = repo.split("/");
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/actions/runs?per_page=${Math.min(limit, 100)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub Actions fetch failed: ${res.status} ${body}`);
    }

    const payload = await res.json();
    const mapStatus = (run) => {
      if (run.status === "queued") return "queued";
      if (run.status === "in_progress") return "running";
      if (run.conclusion === "success") return "success";
      if (run.conclusion === "cancelled") return "cancelled";
      if (run.conclusion === "failure" || run.conclusion === "timed_out") return "failed";
      return "running";
    };

    const mapped = (payload.workflow_runs || []).map((run) => {
      const startedAt = run.run_started_at || run.created_at;
      const finishedAt = run.updated_at || startedAt;
      const durationSec = Math.max(
        0,
        Math.floor((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000)
      );
      return {
        id: String(run.id),
        provider: this.provider,
        workspaceId,
        repo,
        branch: run.head_branch || "unknown",
        commitSha: run.head_sha || "",
        actor: run.actor?.login || "github-user",
        status: mapStatus(run),
        durationSec,
        startedAt,
        finishedAt,
        logsUrl: run.html_url,
      };
    });
    return status ? mapped.filter((r) => r.status === status) : mapped;
  }

  async ingestEvent({ workspaceId, event }) {
    const status = event.status || (event.conclusion === "success" ? "success" : "failed");
    return {
      id: event.id || "gha_event_stub",
      provider: this.provider,
      workspaceId,
      repo: event.repo,
      branch: event.branch,
      commitSha: event.commitSha,
      actor: event.actor,
      status,
      durationSec: event.durationSec,
      startedAt: event.startedAt,
      finishedAt: event.finishedAt,
      logsUrl: event.logsUrl,
    };
  }
}

module.exports = { GitHubActionsAdapter };
