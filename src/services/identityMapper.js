const { listMemberProfiles } = require("../data/store");

async function resolveAssignee({ workspaceId, githubUser, skillTag, defaultMemberId }) {
  const members = await listMemberProfiles({ workspaceId });

  if (githubUser) {
    const exact = members.find((m) => m.githubUser === githubUser);
    if (exact) return exact.id;
  }

  if (skillTag) {
    const skilled = members
      .filter((m) => m.skills.includes(skillTag))
      .sort((a, b) => a.activeLoad - b.activeLoad || b.qualityScore - a.qualityScore);
    if (skilled.length > 0) return skilled[0].id;
  }

  if (defaultMemberId) return defaultMemberId;

  const leastBusy = members.sort(
    (a, b) => a.activeLoad - b.activeLoad || b.throughputScore - a.throughputScore
  );
  return leastBusy[0]?.id;
}

module.exports = { resolveAssignee };
