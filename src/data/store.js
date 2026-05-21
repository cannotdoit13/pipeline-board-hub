const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const { id } = require("../utils/id");

const defaultWorkspaceId = "ws_default";
const now = () => new Date().toISOString();

let db;

function parseJsonSafe(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

async function initStore() {
  if (db) return db;

  db = await open({
    filename: path.join(process.cwd(), "pipeline_board_hub.db"),
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      defaultBoardProvider TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY,
      workspaceId TEXT NOT NULL,
      fullName TEXT NOT NULL,
      defaultPipelineProvider TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      workspaceId TEXT NOT NULL,
      repo TEXT NOT NULL,
      branch TEXT,
      commitSha TEXT,
      actor TEXT,
      status TEXT,
      durationSec INTEGER,
      startedAt TEXT,
      finishedAt TEXT,
      logsUrl TEXT,
      dedupeKey TEXT UNIQUE
    );
    CREATE TABLE IF NOT EXISTS board_items (
      id TEXT PRIMARY KEY,
      workspaceId TEXT NOT NULL,
      provider TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      severity TEXT,
      status TEXT NOT NULL,
      assigneeId TEXT,
      links TEXT,
      comments TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS member_profiles (
      id TEXT PRIMARY KEY,
      workspaceId TEXT NOT NULL,
      name TEXT NOT NULL,
      githubUser TEXT,
      skills TEXT,
      throughputScore REAL,
      qualityScore REAL,
      activeLoad INTEGER
    );
    CREATE TABLE IF NOT EXISTS task_recommendations (
      id TEXT PRIMARY KEY,
      workspaceId TEXT NOT NULL,
      requirementText TEXT NOT NULL,
      tasks TEXT NOT NULL,
      recommendedAssigneeId TEXT,
      estimatedTimelineDays INTEGER,
      confidence REAL,
      riskLevel TEXT,
      explanation TEXT,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS approval_decisions (
      id TEXT PRIMARY KEY,
      workspaceId TEXT NOT NULL,
      recommendationId TEXT NOT NULL,
      decision TEXT NOT NULL,
      reviewer TEXT NOT NULL,
      reason TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      eventId TEXT NOT NULL,
      payloadHash TEXT,
      createdAt TEXT NOT NULL,
      UNIQUE(provider, eventId)
    );
  `);

  await seedDefaults();
  return db;
}

async function seedDefaults() {
  const workspace = await db.get("SELECT id FROM workspaces WHERE id = ?", defaultWorkspaceId);
  if (!workspace) {
    await db.run(
      "INSERT INTO workspaces (id, name, defaultBoardProvider, createdAt) VALUES (?, ?, ?, ?)",
      [defaultWorkspaceId, "Default Workspace", "github-projects", now()]
    );
  }

  const repo = await db.get("SELECT id FROM repositories WHERE id = ?", "repo_demo");
  if (!repo) {
    await db.run(
      "INSERT INTO repositories (id, workspaceId, fullName, defaultPipelineProvider, createdAt) VALUES (?, ?, ?, ?, ?)",
      ["repo_demo", defaultWorkspaceId, "demo/pipeline-board-hub", "mock", now()]
    );
  }

  const members = await db.get("SELECT COUNT(*) AS total FROM member_profiles");
  if (!members || members.total === 0) {
    const seedMembers = [
      {
        id: "mem_anna",
        name: "Anna",
        githubUser: "anna-dev",
        skills: ["frontend", "docs", "ci"],
        throughputScore: 0.8,
        qualityScore: 0.9,
        activeLoad: 2,
      },
      {
        id: "mem_raj",
        name: "Raj",
        githubUser: "raj-dev",
        skills: ["backend", "api", "db", "ci"],
        throughputScore: 0.85,
        qualityScore: 0.88,
        activeLoad: 3,
      },
      {
        id: "mem_li",
        name: "Li",
        githubUser: "li-dev",
        skills: ["security", "api", "infra"],
        throughputScore: 0.75,
        qualityScore: 0.92,
        activeLoad: 1,
      },
    ];
    for (const member of seedMembers) {
      await db.run(
        `INSERT INTO member_profiles (id, workspaceId, name, githubUser, skills, throughputScore, qualityScore, activeLoad)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          member.id,
          defaultWorkspaceId,
          member.name,
          member.githubUser,
          JSON.stringify(member.skills),
          member.throughputScore,
          member.qualityScore,
          member.activeLoad,
        ]
      );
    }
  }
}

async function upsertRepository({ id, workspaceId, fullName, defaultPipelineProvider }) {
  await initStore();
  const repoId = id || `repo_${fullName.replace(/[^\w]/g, "_")}`;
  await db.run(
    `INSERT INTO repositories (id, workspaceId, fullName, defaultPipelineProvider, createdAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      workspaceId=excluded.workspaceId,
      fullName=excluded.fullName,
      defaultPipelineProvider=excluded.defaultPipelineProvider`,
    [repoId, workspaceId || defaultWorkspaceId, fullName, defaultPipelineProvider || "github-actions", now()]
  );
}

async function listRepositories({ workspaceId }) {
  await initStore();
  return db.all("SELECT * FROM repositories WHERE workspaceId = ? ORDER BY createdAt DESC", [workspaceId]);
}

async function addPipelineRun(run) {
  await initStore();
  const payload = {
    id: run.id || id("run"),
    provider: run.provider,
    workspaceId: run.workspaceId || defaultWorkspaceId,
    repo: run.repo,
    branch: run.branch || "main",
    commitSha: run.commitSha || "",
    actor: run.actor || "system",
    status: run.status || "success",
    durationSec: run.durationSec || 0,
    startedAt: run.startedAt || now(),
    finishedAt: run.finishedAt || now(),
    logsUrl: run.logsUrl || "",
  };
  const dedupeKey = `${payload.provider}:${payload.repo}:${payload.commitSha}:${payload.startedAt}`;
  await db.run(
    `INSERT INTO pipeline_runs (id, provider, workspaceId, repo, branch, commitSha, actor, status, durationSec, startedAt, finishedAt, logsUrl, dedupeKey)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(dedupeKey) DO UPDATE SET
      status=excluded.status,
      durationSec=excluded.durationSec,
      finishedAt=excluded.finishedAt,
      logsUrl=excluded.logsUrl`,
    [
      payload.id,
      payload.provider,
      payload.workspaceId,
      payload.repo,
      payload.branch,
      payload.commitSha,
      payload.actor,
      payload.status,
      payload.durationSec,
      payload.startedAt,
      payload.finishedAt,
      payload.logsUrl,
      dedupeKey,
    ]
  );
  return payload;
}

async function listPipelineRuns({ workspaceId, provider, status, repo }) {
  await initStore();
  const rows = await db.all(
    `SELECT * FROM pipeline_runs
     WHERE workspaceId = ?
     AND (? IS NULL OR provider = ?)
     AND (? IS NULL OR status = ?)
     AND (? IS NULL OR repo = ?)
     ORDER BY startedAt DESC`,
    [workspaceId, provider || null, provider || null, status || null, status || null, repo || null, repo || null]
  );
  return rows;
}

async function countRecentRuns({ workspaceId, repo, hours = 24 }) {
  await initStore();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const row = await db.get(
    `SELECT COUNT(*) AS total
     FROM pipeline_runs
     WHERE workspaceId = ?
       AND repo = ?
       AND startedAt >= ?`,
    [workspaceId, repo, since]
  );
  return row?.total || 0;
}

async function countRecentFailures({ workspaceId, repo, branch, hours = 6 }) {
  await initStore();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const row = await db.get(
    `SELECT COUNT(*) AS total
     FROM pipeline_runs
     WHERE workspaceId = ?
       AND repo = ?
       AND (? IS NULL OR branch = ?)
       AND status = 'failed'
       AND startedAt >= ?`,
    [workspaceId, repo, branch || null, branch || null, since]
  );
  return row?.total || 0;
}

async function getPipelineRunById({ workspaceId, runId }) {
  await initStore();
  return db.get("SELECT * FROM pipeline_runs WHERE workspaceId = ? AND id = ?", [workspaceId, runId]);
}

async function addBoardItem(item) {
  await initStore();
  const payload = {
    id: item.id || id("board"),
    workspaceId: item.workspaceId || defaultWorkspaceId,
    provider: item.provider || "github-projects",
    title: item.title,
    description: item.description || "",
    severity: item.severity || "medium",
    status: item.status || "todo",
    assigneeId: item.assigneeId || null,
    links: item.links || {},
    comments: item.comments || [],
    createdAt: item.createdAt || now(),
  };

  await db.run(
    `INSERT INTO board_items (id, workspaceId, provider, title, description, severity, status, assigneeId, links, comments, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.id,
      payload.workspaceId,
      payload.provider,
      payload.title,
      payload.description,
      payload.severity,
      payload.status,
      payload.assigneeId,
      JSON.stringify(payload.links),
      JSON.stringify(payload.comments),
      payload.createdAt,
    ]
  );
  return payload;
}

async function updateBoardItem({ workspaceId, itemId, patch = {} }) {
  await initStore();
  const item = await getBoardItemById({ workspaceId, itemId });
  if (!item) return null;
  const updated = {
    ...item,
    ...patch,
    links: patch.links || item.links,
    comments: patch.comments || item.comments,
  };
  await db.run(
    `UPDATE board_items
     SET status = ?, assigneeId = ?, links = ?, comments = ?, description = ?, title = ?
     WHERE workspaceId = ? AND id = ?`,
    [
      updated.status,
      updated.assigneeId,
      JSON.stringify(updated.links),
      JSON.stringify(updated.comments),
      updated.description,
      updated.title,
      workspaceId,
      itemId,
    ]
  );
  return updated;
}

async function getBoardItemById({ workspaceId, itemId }) {
  await initStore();
  const row = await db.get("SELECT * FROM board_items WHERE workspaceId = ? AND id = ?", [workspaceId, itemId]);
  if (!row) return null;
  row.links = parseJsonSafe(row.links, {});
  row.comments = parseJsonSafe(row.comments, []);
  return row;
}

async function getBoardItemByRunId({ workspaceId, runId }) {
  await initStore();
  const rows = await db.all("SELECT * FROM board_items WHERE workspaceId = ?", [workspaceId]);
  for (const row of rows) {
    const links = parseJsonSafe(row.links, {});
    if (links.runId === runId) {
      return {
        ...row,
        links,
        comments: parseJsonSafe(row.comments, []),
      };
    }
  }
  return null;
}

async function getOpenBoardItemByFailureContext({ workspaceId, repo, branch }) {
  await initStore();
  const items = await listBoardItems({ workspaceId });
  return (
    items.find((item) => {
      const open = !["done", "closed", "completed"].includes(item.status);
      return open && item.links?.repo === repo && item.links?.branch === branch;
    }) || null
  );
}

async function deleteBoardItem({ workspaceId, itemId }) {
  await initStore();
  const existing = await getBoardItemById({ workspaceId, itemId });
  if (!existing) return null;
  await db.run("DELETE FROM board_items WHERE workspaceId = ? AND id = ?", [workspaceId, itemId]);
  await addAuditLog({
    action: "board_item.deleted",
    details: { workspaceId, itemId, title: existing.title },
  });
  return existing;
}

async function listBoardItems({ workspaceId, status, assigneeId, repo, severity }) {
  await initStore();
  const rows = await db.all("SELECT * FROM board_items WHERE workspaceId = ? ORDER BY createdAt DESC", [workspaceId]);
  return rows
    .map((row) => ({
      ...row,
      links: parseJsonSafe(row.links, {}),
      comments: parseJsonSafe(row.comments, []),
    }))
    .filter((row) => !status || row.status === status)
    .filter((row) => !assigneeId || row.assigneeId === assigneeId)
    .filter((row) => !repo || row.links.repo === repo)
    .filter((row) => !severity || row.severity === severity);
}

async function bulkDeleteBoardItems({ workspaceId, mode }) {
  await initStore();
  const items = await listBoardItems({ workspaceId });
  const shouldDelete = (item) => {
    if (mode === "completed") return ["done", "closed", "completed"].includes(item.status);
    if (mode === "mock") return item.links.repo === "demo/pipeline-board-hub" || item.links.repo?.startsWith("demo/");
    if (mode === "all") return true;
    return false;
  };

  const targets = items.filter(shouldDelete);
  for (const item of targets) {
    await deleteBoardItem({ workspaceId, itemId: item.id });
  }
  return { deletedCount: targets.length, mode };
}

async function listMemberProfiles({ workspaceId }) {
  await initStore();
  const rows = await db.all("SELECT * FROM member_profiles WHERE workspaceId = ?", [workspaceId]);
  return rows.map((row) => ({
    ...row,
    skills: parseJsonSafe(row.skills, []),
  }));
}

async function upsertMemberProfile(profile) {
  await initStore();
  await db.run(
    `INSERT INTO member_profiles (id, workspaceId, name, githubUser, skills, throughputScore, qualityScore, activeLoad)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      githubUser=excluded.githubUser,
      skills=excluded.skills,
      throughputScore=excluded.throughputScore,
      qualityScore=excluded.qualityScore,
      activeLoad=excluded.activeLoad`,
    [
      profile.id,
      profile.workspaceId || defaultWorkspaceId,
      profile.name,
      profile.githubUser,
      JSON.stringify(profile.skills || []),
      profile.throughputScore || 0,
      profile.qualityScore || 0,
      profile.activeLoad || 0,
    ]
  );
}

async function addRecommendation(rec) {
  await initStore();
  const payload = {
    id: rec.id || id("rec"),
    workspaceId: rec.workspaceId || defaultWorkspaceId,
    requirementText: rec.requirementText,
    tasks: rec.tasks || [],
    recommendedAssigneeId: rec.recommendedAssigneeId || null,
    estimatedTimelineDays: rec.estimatedTimelineDays || 1,
    confidence: rec.confidence || 0,
    riskLevel: rec.riskLevel || "medium",
    explanation: rec.explanation || "",
    status: rec.status || "pending",
    createdAt: rec.createdAt || now(),
  };
  await db.run(
    `INSERT INTO task_recommendations (id, workspaceId, requirementText, tasks, recommendedAssigneeId, estimatedTimelineDays, confidence, riskLevel, explanation, status, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.id,
      payload.workspaceId,
      payload.requirementText,
      JSON.stringify(payload.tasks),
      payload.recommendedAssigneeId,
      payload.estimatedTimelineDays,
      payload.confidence,
      payload.riskLevel,
      payload.explanation,
      payload.status,
      payload.createdAt,
    ]
  );
  return payload;
}

async function updateRecommendation({ workspaceId, recommendationId, patch = {} }) {
  await initStore();
  const current = await getRecommendationById({ workspaceId, recommendationId });
  if (!current) return null;
  const updated = {
    ...current,
    ...patch,
  };
  await db.run(
    `UPDATE task_recommendations
     SET tasks = ?, recommendedAssigneeId = ?, estimatedTimelineDays = ?, confidence = ?, riskLevel = ?, explanation = ?, status = ?
     WHERE workspaceId = ? AND id = ?`,
    [
      JSON.stringify(updated.tasks || []),
      updated.recommendedAssigneeId,
      updated.estimatedTimelineDays,
      updated.confidence,
      updated.riskLevel,
      updated.explanation,
      updated.status,
      workspaceId,
      recommendationId,
    ]
  );
  return updated;
}

async function getRecommendationById({ workspaceId, recommendationId }) {
  await initStore();
  const row = await db.get(
    "SELECT * FROM task_recommendations WHERE workspaceId = ? AND id = ?",
    [workspaceId, recommendationId]
  );
  if (!row) return null;
  row.tasks = parseJsonSafe(row.tasks, []);
  return row;
}

async function listRecommendations({ workspaceId, status }) {
  await initStore();
  const rows = await db.all(
    `SELECT * FROM task_recommendations
     WHERE workspaceId = ?
     AND (? IS NULL OR status = ?)
     ORDER BY createdAt DESC`,
    [workspaceId, status || null, status || null]
  );
  return rows.map((row) => ({
    ...row,
    tasks: parseJsonSafe(row.tasks, []),
  }));
}

async function addDecision(decision) {
  await initStore();
  const payload = {
    id: decision.id || id("dec"),
    workspaceId: decision.workspaceId || defaultWorkspaceId,
    recommendationId: decision.recommendationId,
    decision: decision.decision,
    reviewer: decision.reviewer || "system",
    reason: decision.reason || "",
    createdAt: now(),
  };
  await db.run(
    `INSERT INTO approval_decisions (id, workspaceId, recommendationId, decision, reviewer, reason, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.id,
      payload.workspaceId,
      payload.recommendationId,
      payload.decision,
      payload.reviewer,
      payload.reason,
      payload.createdAt,
    ]
  );
  await addAuditLog({
    action: "recommendation.decision",
    details: payload,
  });
  return payload;
}

async function addAuditLog({ action, details }) {
  await initStore();
  const payload = {
    id: id("audit"),
    action,
    details: JSON.stringify(details || {}),
    createdAt: now(),
  };
  await db.run("INSERT INTO audit_logs (id, action, details, createdAt) VALUES (?, ?, ?, ?)", [
    payload.id,
    payload.action,
    payload.details,
    payload.createdAt,
  ]);
}

async function listAuditLogs() {
  await initStore();
  const rows = await db.all("SELECT * FROM audit_logs ORDER BY createdAt DESC");
  return rows.map((row) => ({
    ...row,
    details: parseJsonSafe(row.details, {}),
  }));
}

async function insertWebhookEvent({ provider, eventId, payloadHash }) {
  await initStore();
  try {
    await db.run(
      "INSERT INTO webhook_events (id, provider, eventId, payloadHash, createdAt) VALUES (?, ?, ?, ?, ?)",
      [id("wevt"), provider, eventId, payloadHash || "", now()]
    );
    return true;
  } catch (error) {
    if (String(error.message || "").includes("UNIQUE")) return false;
    throw error;
  }
}

module.exports = {
  defaultWorkspaceId,
  initStore,
  upsertRepository,
  listRepositories,
  addPipelineRun,
  listPipelineRuns,
  countRecentRuns,
  countRecentFailures,
  getPipelineRunById,
  addBoardItem,
  updateBoardItem,
  getBoardItemById,
  getBoardItemByRunId,
  getOpenBoardItemByFailureContext,
  deleteBoardItem,
  listBoardItems,
  bulkDeleteBoardItems,
  listMemberProfiles,
  upsertMemberProfile,
  addRecommendation,
  updateRecommendation,
  getRecommendationById,
  listRecommendations,
  addDecision,
  addAuditLog,
  listAuditLogs,
  insertWebhookEvent,
};
