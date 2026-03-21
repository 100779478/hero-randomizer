const crypto = require("node:crypto");

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function toSqliteDate(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function createExpiry(days = 30) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return toSqliteDate(value);
}

module.exports = {
  createToken,
  createExpiry,
};
