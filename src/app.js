const express = require("express");
const cors = require("cors");

const pipelinesRoute = require("./routes/pipelines");
const boardRoute = require("./routes/board");
const aiRoute = require("./routes/ai");
const githubRoute = require("./routes/github");

function createApp() {
  const app = express();
  app.use(cors());
  app.use(
    express.json({
      verify: (req, res, buf) => {
        req.rawBody = buf.toString();
      },
    })
  );
  app.use(express.static("public"));

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      service: "pipeline-board-hub",
      time: new Date().toISOString(),
    });
  });

  app.use("/api/pipelines", pipelinesRoute);
  app.use("/api/board", boardRoute);
  app.use("/api/ai", aiRoute);
  app.use("/api/github", githubRoute);

  app.get("/api/status", (req, res) => {
    res.json({
      choices: {
        pipelineProviders: ["mock", "github-actions", "azure-pipelines"],
        boardProviders: ["github-projects", "azure-boards", "jira"],
        aiHosting: "external-llm-compatible",
        automationMode: "auto-low-risk-with-approval",
      },
      why: {
        firstVerticalSlice: "GitHub-first path delivers fastest working MVP.",
        adapters: "Multi-provider support without business logic rewrite.",
        approvalGate: "Improves trust and prevents risky autonomous changes.",
      },
      alternatives: {
        firstProvider: ["azure-first", "jira-first"],
        aiHosting: ["azure-openai-only", "self-hosted-models"],
        autonomy: ["recommend-only", "fully-auto"],
      },
    });
  });

  return app;
}

module.exports = { createApp };
