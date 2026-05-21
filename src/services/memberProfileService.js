const {
  listMemberProfiles,
  listPipelineRuns,
  listBoardItems,
  upsertMemberProfile,
} = require("../data/store");

async function recomputeMemberProfiles({ workspaceId }) {
  const members = await listMemberProfiles({ workspaceId });
  const runs = await listPipelineRuns({ workspaceId });
  const items = await listBoardItems({ workspaceId });

  for (const member of members) {
    const userRuns = runs.filter((r) => r.actor === member.githubUser);
    const failedRuns = userRuns.filter((r) => r.status === "failed").length;
    const successRuns = userRuns.filter((r) => r.status === "success").length;
    const activeLoad = items.filter(
      (i) => i.assigneeId === member.id && ["todo", "in_progress"].includes(i.status)
    ).length;
    const throughputScore = Math.min(1, 0.4 + successRuns * 0.03);
    const qualityScore = Math.max(0.3, Math.min(1, 0.9 - failedRuns * 0.02));

    await upsertMemberProfile({
      ...member,
      activeLoad,
      throughputScore,
      qualityScore,
    });
  }

  return listMemberProfiles({ workspaceId });
}

module.exports = { recomputeMemberProfiles };
