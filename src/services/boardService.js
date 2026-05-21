const {
  getPipelineRunById,
  getBoardItemById,
  getBoardItemByRunId,
  getOpenBoardItemByFailureContext,
  deleteBoardItem,
  listBoardItems,
  bulkDeleteBoardItems,
  addAuditLog,
} = require("../data/store");
const { GitHubProjectsAdapter } = require("../adapters/board/githubProjectsAdapter");
const { AzureBoardsAdapter } = require("../adapters/board/azureBoardsAdapter");
const { JiraAdapter } = require("../adapters/board/jiraAdapter");
const { resolveAssignee } = require("./identityMapper");
const { recomputeMemberProfiles } = require("./memberProfileService");
const { evaluateFailureForTicket } = require("./failurePolicyService");

const adapters = {
  "github-projects": new GitHubProjectsAdapter(),
  "azure-boards": new AzureBoardsAdapter(),
  jira: new JiraAdapter(),
};

function getBoardAdapter(provider = "github-projects") {
  return adapters[provider] || adapters["github-projects"];
}

async function createFromFailedRun({ workspaceId, runId, boardProvider = "github-projects" }) {
  const run = await getPipelineRunById({ workspaceId, runId });
  if (!run) return null;
  return ensureBoardItemForFailedRun({ workspaceId, run, boardProvider, bypassPolicy: true });
}

async function ensureBoardItemForFailedRun({
  workspaceId,
  run,
  boardProvider = "github-projects",
  bypassPolicy = false,
}) {
  if (!run || run.status !== "failed") return null;
  const existing = await getBoardItemByRunId({ workspaceId, runId: run.id });
  if (existing) return existing;
  const openContextItem = await getOpenBoardItemByFailureContext({
    workspaceId,
    repo: run.repo,
    branch: run.branch,
  });
  if (openContextItem) {
    await addAuditLog({
      action: "board_item.skipped_duplicate_failure_context",
      details: { runId: run.id, existingItemId: openContextItem.id, repo: run.repo, branch: run.branch },
    });
    return openContextItem;
  }

  if (!bypassPolicy) {
    const decision = await evaluateFailureForTicket({ workspaceId, run });
    await addAuditLog({
      action: "failure_ticket.policy_evaluated",
      details: { runId: run.id, ...decision },
    });
    if (!decision.shouldCreate) return null;
  }

  const adapter = getBoardAdapter(boardProvider);
  const item = await adapter.createItem({
    workspaceId,
    title: `Fix failed pipeline: ${run.repo} ${run.branch}`,
    description: `Run ${run.id} failed for ${run.commitSha}. Logs: ${run.logsUrl}`,
    severity: "high",
    links: {
      runId: run.id,
      repo: run.repo,
      branch: run.branch,
      commitSha: run.commitSha,
      logsUrl: run.logsUrl,
    },
  });

  const assigneeId = await resolveAssignee({
    workspaceId,
    githubUser: run.actor,
    skillTag: "ci",
  });
  const assignedItem = await adapter.assignItem({ workspaceId, item, assigneeId });
  await recomputeMemberProfiles({ workspaceId });

  return assignedItem;
}

async function assignItem({ workspaceId, itemId, assigneeId, boardProvider = "github-projects" }) {
  const item = await getBoardItemById({ workspaceId, itemId });
  if (!item) return null;
  const adapter = getBoardAdapter(boardProvider);
  const updated = await adapter.assignItem({ workspaceId, item, assigneeId });
  await recomputeMemberProfiles({ workspaceId });
  return updated;
}

async function listItems({ workspaceId, status, assigneeId, repo, severity }) {
  return listBoardItems({ workspaceId, status, assigneeId, repo, severity });
}

async function removeItem({ workspaceId, itemId }) {
  const deleted = await deleteBoardItem({ workspaceId, itemId });
  if (deleted) {
    await recomputeMemberProfiles({ workspaceId });
  }
  return deleted;
}

async function bulkRemoveItems({ workspaceId, mode }) {
  const result = await bulkDeleteBoardItems({ workspaceId, mode });
  await recomputeMemberProfiles({ workspaceId });
  return result;
}

module.exports = {
  createFromFailedRun,
  ensureBoardItemForFailedRun,
  assignItem,
  listItems,
  removeItem,
  bulkRemoveItems,
};
