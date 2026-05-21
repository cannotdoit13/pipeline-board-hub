class JiraAdapter {
  constructor() {
    this.provider = "jira";
  }

  async createItem({ title }) {
    return {
      id: "jira_stub",
      provider: this.provider,
      title,
      status: "todo",
    };
  }

  async assignItem({ item, assigneeId }) {
    item.assigneeId = assigneeId;
    return item;
  }
}

module.exports = { JiraAdapter };
