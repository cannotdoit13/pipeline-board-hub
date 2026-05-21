const {
  addRecommendation,
  addDecision,
  getRecommendationById,
  updateRecommendation,
} = require("../data/store");
const { classifyRisk, canAutoApply } = require("./riskPolicy");
const { resolveAssignee } = require("./identityMapper");
const { completeJson } = require("./llmClient");

function inferSkillTag(text) {
  const t = text.toLowerCase();
  if (t.includes("ui") || t.includes("frontend")) return "frontend";
  if (t.includes("db") || t.includes("query")) return "db";
  if (t.includes("pipeline") || t.includes("ci")) return "ci";
  if (t.includes("security") || t.includes("auth")) return "security";
  return "backend";
}

function buildTasks(requirementText, context = {}) {
  if (context.failedRun) {
    const run = context.failedRun;
    return [
      {
        title: `Triage failed workflow for ${run.repo}`,
        description: `Review failed run ${run.id} on branch ${run.branch}. Logs: ${run.logsUrl}`,
        estimateHours: 1,
        risk: "low",
        labels: ["ci", "triage"],
      },
      {
        title: "Identify failing job and root cause",
        description: `Inspect commit ${run.commitSha}, recent changes, dependency updates, and flaky-test indicators.`,
        estimateHours: 2,
        risk: "medium",
        labels: ["ci", "debugging"],
      },
      {
        title: "Implement fix and add regression coverage",
        description: "Patch the workflow/test/code issue, rerun the pipeline, and document the cause in the linked work item.",
        estimateHours: 4,
        risk: "medium",
        labels: ["fix", "testing"],
      },
    ];
  }

  return [
    {
      title: "Clarify acceptance criteria",
      description: `Capture business and technical criteria for: ${requirementText}`,
      estimateHours: 2,
      risk: "low",
      labels: ["analysis"],
    },
    {
      title: "Implement change",
      description: "Apply code and integration updates for requirement.",
      estimateHours: 5,
      risk: "medium",
      labels: ["implementation"],
    },
    {
      title: "Add tests and validation",
      description: "Add regression tests and verify deployment readiness.",
      estimateHours: 3,
      risk: "low",
      labels: ["testing"],
    },
  ];
}

async function recommend({ workspaceId, requirementText, context = {} }) {
  const skillTag = inferSkillTag(requirementText);
  const confidence = context.hasRelatedHistory ? 0.87 : 0.76;
  const riskLevel = classifyRisk(requirementText, confidence);
  const assignee = await resolveAssignee({
    workspaceId,
    githubUser: context.preferredGithubUser,
    skillTag,
  });
  const fallbackTasks = buildTasks(requirementText, context);
  const llmOutput = await completeJson({
    system:
      "You are an engineering planning assistant. Return strict JSON with tasks array, estimatedTimelineDays number, confidence number, riskLevel string, and explanation string. Do not include markdown.",
    user: JSON.stringify({
      requirementText,
      context,
      fallbackTasks,
      expectedTaskFields: ["title", "description", "estimateHours", "risk", "labels"],
    }),
    fallback: () => ({
      tasks: fallbackTasks,
      estimatedTimelineDays: Math.max(1, Math.ceil(fallbackTasks.reduce((a, t) => a + t.estimateHours, 0) / 6)),
      confidence,
      riskLevel,
      explanation: `Recommended ${assignee} for skill ${skillTag} with confidence ${confidence}.`,
    }),
  });

  const tasks = Array.isArray(llmOutput.tasks) && llmOutput.tasks.length > 0 ? llmOutput.tasks : fallbackTasks;
  const estimatedTimelineDays = Math.max(1, Math.ceil(tasks.reduce((a, t) => a + t.estimateHours, 0) / 6));
  const finalConfidence = Number(llmOutput.confidence || confidence);
  const finalRiskLevel = llmOutput.riskLevel || riskLevel;

  const recommendation = await addRecommendation({
    workspaceId,
    requirementText,
    tasks,
    recommendedAssigneeId: assignee,
    estimatedTimelineDays: Number(llmOutput.estimatedTimelineDays || estimatedTimelineDays),
    confidence: finalConfidence,
    riskLevel: finalRiskLevel,
    explanation:
      llmOutput.explanation || `Recommended ${assignee} for skill ${skillTag} with confidence ${finalConfidence}.`,
  });

  if (canAutoApply({ riskLevel: finalRiskLevel, confidence: finalConfidence })) {
    recommendation.status = "auto-applied";
    await updateRecommendation({
      workspaceId,
      recommendationId: recommendation.id,
      patch: { status: "auto-applied" },
    });
    recommendation.status = "auto-applied";
    await addDecision({
      workspaceId,
      recommendationId: recommendation.id,
      decision: "auto-applied",
      reviewer: "system",
      reason: "low-risk policy matched",
    });
  }

  return recommendation;
}

async function decide({ workspaceId, recommendationId, decision, reviewer, reason, edits = {} }) {
  const recommendation = await getRecommendationById({ workspaceId, recommendationId });
  if (!recommendation) return null;

  const patch = {
    status: decision,
  };
  if (decision === "approved" || decision === "edited") {
    if (edits.recommendedAssigneeId) patch.recommendedAssigneeId = edits.recommendedAssigneeId;
    if (edits.estimatedTimelineDays) patch.estimatedTimelineDays = edits.estimatedTimelineDays;
    if (Array.isArray(edits.tasks) && edits.tasks.length > 0) patch.tasks = edits.tasks;
  }

  const updated = await updateRecommendation({
    workspaceId,
    recommendationId,
    patch,
  });

  await addDecision({
    workspaceId,
    recommendationId,
    decision,
    reviewer,
    reason,
  });

  return updated;
}

module.exports = { recommend, decide };
