require("dotenv").config();

const { createApp } = require("./app");
const { initStore, defaultWorkspaceId } = require("./data/store");
const { startScheduler } = require("./services/schedulerService");

const app = createApp();
const port = process.env.PORT || 4000;

initStore().then(() => {
  const schedulerEnabled = (process.env.ENABLE_SCHEDULER || "true").toLowerCase() === "true";
  if (schedulerEnabled) {
    startScheduler({ workspaceId: defaultWorkspaceId });
  }
  app.listen(port, () => {
    console.log(`Pipeline Board Hub running on port ${port}`);
  });
});
