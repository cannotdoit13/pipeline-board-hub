const { addBoardItem, updateBoardItem } = require("../../data/store");

class GitHubProjectsAdapter {
  constructor() {
    this.provider = "github-projects";
  }

  async createItem({ workspaceId, title, description, severity, links }) {
    return addBoardItem({
      workspaceId,
      provider: this.provider,
      title,
      description,
      severity,
      links,
    });
  }

  async assignItem({ workspaceId, item, assigneeId }) {
    return updateBoardItem({
      workspaceId,
      itemId: item.id,
      patch: { assigneeId },
    });
  }

  async updateStatus({ workspaceId, item, status }) {
    return updateBoardItem({
      workspaceId,
      itemId: item.id,
      patch: { status },
    });
  }

  async addComment({ workspaceId, item, body }) {
    const comments = item.comments || [];
    comments.push({
      body,
      createdAt: new Date().toISOString(),
    });
    return updateBoardItem({
      workspaceId,
      itemId: item.id,
      patch: { comments },
    });
  }
}

module.exports = { GitHubProjectsAdapter };
