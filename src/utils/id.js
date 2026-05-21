const crypto = require("crypto");

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

module.exports = { id };
