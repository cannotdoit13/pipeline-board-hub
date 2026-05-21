const express = require("express");
const { recommend, decide } = require("../services/aiRecommendationService");
const { listRecommendations, listAuditLogs, getPipelineRunById } = require("../data/store");

const router = express.Router();
const defaultWorkspace = "ws_default";

router.post("/recommendations", async (req, res) => {
  const recommendation = await recommend({
    workspaceId: defaultWorkspace,
    requirementText: req.body.requirementText || "General requirement",
    context: req.body.context || {},
  });
  res.status(201).json({ recommendation });
});

router.post("/recommendations/from-failed-run", async (req, res) => {
  const run = await getPipelineRunById({
    workspaceId: defaultWorkspace,
    runId: req.body.runId,
  });
  if (!run || run.status !== "failed") {
    return res.status(400).json({ error: "Failed run not found." });
  }

  const recommendation = await recommend({
    workspaceId: defaultWorkspace,
    requirementText: `Fix failed pipeline ${run.repo} on ${run.branch}`,
    context: {
      hasRelatedHistory: true,
      preferredGithubUser: run.actor,
      failedRun: run,
    },
  });

  return res.status(201).json({ recommendation });
});

router.get("/recommendations", async (req, res) => {
  const status = req.query.status;
  const recommendations = await listRecommendations({
    workspaceId: defaultWorkspace,
    status,
  });
  res.json({ recommendations });
});

router.get("/recommendations/pending", async (req, res) => {
  const recommendations = await listRecommendations({
    workspaceId: defaultWorkspace,
    status: "pending",
  });
  res.json({ recommendations });
});

router.post("/recommendations/:id/decision", async (req, res) => {
  const recommendation = await decide({
    workspaceId: defaultWorkspace,
    recommendationId: req.params.id,
    decision: req.body.decision,
    reviewer: req.body.reviewer || "reviewer",
    reason: req.body.reason || "",
    edits: req.body.edits || {},
  });
  if (!recommendation) return res.status(404).json({ error: "Recommendation not found." });
  res.json({ recommendation });
});

router.get("/audits", async (req, res) => {
  const audits = await listAuditLogs();
  res.json({ audits });
});

module.exports = router;
