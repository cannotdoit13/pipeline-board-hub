const fs = require("fs");
const path = require("path");
const { ingestEvent } = require("../src/services/pipelineService");

async function run() {
  const fixturePath = path.join(__dirname, "..", "fixtures", "pipeline-events.json");
  const payload = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
  for (const item of payload) {
    await ingestEvent({
      workspaceId: "ws_default",
      provider: item.provider,
      event: item.event,
    });
  }
  console.log(`Replayed ${payload.length} events.`);
}

run();
