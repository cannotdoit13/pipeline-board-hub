const express = require("express");
const { createFromFailedRun, assignItem, listItems, removeItem, bulkRemoveItems } = require("../services/boardService");
const { listMemberProfiles } = require("../data/store");
const { recomputeMemberProfiles } = require("../services/memberProfileService");

const router = express.Router();
const defaultWorkspace = "ws_default";

router.get("/items", async (req, res) => {
  const items = await listItems({
    workspaceId: defaultWorkspace,
    status: req.query.status,
    assigneeId: req.query.assigneeId,
    repo: req.query.repo,
    severity: req.query.severity,
  });
  res.json({ items });
});

router.delete("/items", async (req, res) => {
  const mode = req.query.mode || req.body.mode;
  if (!["mock", "completed", "all"].includes(mode)) {
    return res.status(400).json({ error: "mode must be mock, completed, or all." });
  }
  const result = await bulkRemoveItems({
    workspaceId: defaultWorkspace,
    mode,
  });
  res.json(result);
});

router.post("/items/from-failed-run", async (req, res) => {
  const item = await createFromFailedRun({
    workspaceId: defaultWorkspace,
    runId: req.body.runId,
    boardProvider: req.body.boardProvider || "github-projects",
  });
  if (!item) return res.status(400).json({ error: "Failed run not found or not failed." });
  res.status(201).json({ item });
});

router.patch("/items/:itemId/assign", async (req, res) => {
  const item = await assignItem({
    workspaceId: defaultWorkspace,
    itemId: req.params.itemId,
    assigneeId: req.body.assigneeId,
    boardProvider: req.body.boardProvider || "github-projects",
  });
  if (!item) return res.status(404).json({ error: "Board item not found." });
  res.json({ item });
});

router.delete("/items/:itemId", async (req, res) => {
  const item = await removeItem({
    workspaceId: defaultWorkspace,
    itemId: req.params.itemId,
  });
  if (!item) return res.status(404).json({ error: "Board item not found." });
  res.json({ deleted: item });
});

router.get("/members", async (req, res) => {
  const members = await listMemberProfiles({ workspaceId: defaultWorkspace });
  res.json({ members });
});

router.post("/members/recompute", async (req, res) => {
  const members = await recomputeMemberProfiles({ workspaceId: defaultWorkspace });
  res.json({ members });
});

module.exports = router;
