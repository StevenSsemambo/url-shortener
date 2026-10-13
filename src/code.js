// Short code generation.
const crypto = require("node:crypto");

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; // base62
const CODE_LENGTH = 6; // 62^6 = about 56.8 billion combinations

/** Random code like "xYz123". crypto.randomInt is unbiased and unpredictable. */
function generateCode(length = CODE_LENGTH) {
  let code = "";
  for (let i = 0; i < length; i++) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return code;
}

/** Custom aliases: 3-32 letters, digits, - or _ */
const CUSTOM_CODE = /^[A-Za-z0-9_-]{3,32}$/;

// Codes that would clash with our own routes.
const RESERVED = new Set(["api", "health", "index.html", "favicon.ico"]);

module.exports = { generateCode, CUSTOM_CODE, RESERVED };
