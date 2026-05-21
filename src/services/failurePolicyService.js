const { countRecentFailures } = require("../data/store");
const { completeJson } = require("./llmClient");

function isImportantBranch(branch = "") {
  const value = branch.toLowerCase();
  return (
    value === "main" ||
    value === "master" ||
    value.startsWith("release") ||
    value.startsWith("hotfix") ||
    value.includes("prod")
  );
}

async function evaluateFailureForTicket({ workspaceId, run }) {
  const recentFailures = await countRecentFailures({
    workspaceId,
    repo: run.repo,
    branch: run.branch,
    hours: Number(process.env.FAILURE_LOOKBACK_HOURS || 6),
  });

  if (recentFailures >= Number(process.env.FAILURE_REPEAT_THRESHOLD || 2)) {
    return {
      shouldCreate: true,
      reason: `Repeated failure threshold met: ${recentFailures} failures in lookback window.`,
      source: "policy",
      recentFailures,
    };
  }

  const fallback = () => {
    const important = isImportantBranch(run.branch);
    return {
      shouldCreate: important,
      reason: important
        ? `Important branch failure (${run.branch}) should be tracked immediately.`
        : "First failure on non-critical branch; wait for repeat to avoid noise.",
      source: "fallback-policy",
      recentFailures,
    };
  };

  const decision = await completeJson({
    system:
      "You decide whether a failed CI run deserves an immediate work item. Return only JSON with shouldCreate boolean and reason string. Prefer avoiding duplicate/noisy tickets unless the branch is important.",
    user: JSON.stringify({
      run: {
        repo: run.repo,
        branch: run.branch,
        actor: run.actor,
        commitSha: run.commitSha,
        logsUrl: run.logsUrl,
      },
      recentFailures,
      policy:
        "Create if repeated failures >= 2, or if this is an important branch failure like main/master/release/hotfix/prod. Otherwise do not create yet.",
    }),
    fallback,
  });

  return {
    shouldCreate: Boolean(decision.shouldCreate),
    reason: decision.reason || fallback().reason,
    source: decision.source || "llm",
    recentFailures,
  };
}

module.exports = { evaluateFailureForTicket, isImportantBranch };
