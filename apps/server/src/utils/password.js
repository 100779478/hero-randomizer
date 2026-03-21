const crypto = require("node:crypto");

const SCRYPT_KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) {
    return false;
  }

  const [salt, original] = storedHash.split(":");
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const originalBuffer = Buffer.from(original, "hex");

  if (derived.length !== originalBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(derived, originalBuffer);
}

module.exports = {
  hashPassword,
  verifyPassword,
};
