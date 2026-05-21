const { refreshRuns } = require("../src/services/pipelineService");

async function run() {
  await refreshRuns({
    workspaceId: "ws_default",
    repo: "demo/pipeline-board-hub",
    provider: "mock",
    limit: 40,
  });
  console.log("Seeded mock pipeline runs.");
}

run();
