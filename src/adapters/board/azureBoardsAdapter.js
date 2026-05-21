class AzureBoardsAdapter {
  constructor() {
    this.provider = "azure-boards";
  }

  async createItem({ title }) {
    return {
      id: "azure_board_stub",
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

module.exports = { AzureBoardsAdapter };
