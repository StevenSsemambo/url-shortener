// Express app factory. Dependencies (db, cache) are passed in so tests can swap them.
const path = require("node:path");
const express = require("express");
const { generateCode, CUSTOM_CODE, RESERVED } = require("./code");

const MAX_URL_LENGTH = 2048;
const MAX_ATTEMPTS = 5; // retries if a random code collides with an existing one

/** Returns a normalised URL string, or null if it is not a valid http(s) URL. */
function parseUrl(input) {
  if (typeof input !== "string" || input.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null; // blocks javascript:, data:, file: ...
    return url.href;
  } catch {
    return null;
  }
}

function createApp({ db, cache, baseUrl }) {
  const app = express();
  app.use(express.json({ limit: "10kb" }));
  app.use(express.static(path.join(__dirname, "..", "public")));

  const base = (req) => (baseUrl || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
  const view = (row, req) => ({
    code: row.code,
    shortUrl: `${base(req)}/${row.code}`,
    longUrl: row.long_url,
    visits: row.visits,
    createdAt: row.created_at,
    lastVisitedAt: row.last_visited_at,
  });

  /**
   * Looks a code up (cache first, database second) and records the visit.
   * Returns { longUrl, source } or null when the code does not exist.
   */
  async function resolve(code) {
    let longUrl = await cache.get(code);
    let source = "hit";
    if (!longUrl) {
      source = "miss";
      const row = db.findByCode(code);
      if (!row) return null;
      longUrl = row.long_url;
      await cache.set(code, longUrl); // warm the cache for next time
    }
    db.recordVisit(code); // visit counts always go to the database, so they stay accurate
    return { longUrl, source };
  }

  // ---- API: shorten ----
  app.post("/api/shorten", (req, res) => {
    const longUrl = parseUrl(req.body?.url);
    if (!longUrl) {
      return res.status(400).json({ error: "Provide a valid http or https URL (max 2048 characters)." });
    }

    const custom = req.body.customCode;
    if (custom !== undefined) {
      if (typeof custom !== "string" || !CUSTOM_CODE.test(custom) || RESERVED.has(custom.toLowerCase())) {
        return res.status(400).json({ error: "customCode must be 3-32 characters: letters, digits, - or _." });
      }
      try {
        return res.status(201).json(view(db.create(custom, longUrl), req));
      } catch (err) {
        if (String(err.code).startsWith("SQLITE_CONSTRAINT")) {
          return res.status(409).json({ error: "That custom code is already taken." });
        }
        throw err;
      }
    }

    // Same URL submitted twice returns the same short link instead of creating a duplicate.
    const existing = db.findByUrl(longUrl);
    if (existing) return res.status(200).json(view(existing, req));

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return res.status(201).json(view(db.create(generateCode(), longUrl), req));
      } catch (err) {
        if (!String(err.code).startsWith("SQLITE_CONSTRAINT")) throw err; // only retry on a code collision
      }
    }
    res.status(503).json({ error: "Could not generate a unique code. Please try again." });
  });

  // ---- API: expand (returns JSON, counts as a visit) ----
  app.get("/api/expand/:code", async (req, res) => {
    const result = await resolve(req.params.code);
    if (!result) return res.status(404).json({ error: "Short URL not found." });
    res.set("X-Cache", result.source.toUpperCase());
    res.json({ code: req.params.code, longUrl: result.longUrl });
  });

  // ---- API: stats (read-only, does not count as a visit) ----
  app.get("/api/stats/:code", (req, res) => {
    const row = db.findByCode(req.params.code);
    if (!row) return res.status(404).json({ error: "Short URL not found." });
    res.json(view(row, req));
  });

  app.get("/health", (req, res) => res.json({ status: "ok", cache: cache.enabled ? "redis" : "disabled" }));

  // ---- Redirect: must be last so it does not shadow the routes above ----
  app.get("/:code", async (req, res) => {
    const result = await resolve(req.params.code);
    if (!result) return res.status(404).json({ error: "Short URL not found." });
    res.set("X-Cache", result.source.toUpperCase());
    res.redirect(302, result.longUrl); // 302 (temporary) so browsers do not cache it and skip our visit counter
  });

  // Central error handler: never leak stack traces to clients.
  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body." });
    console.error(err);
    res.status(500).json({ error: "Internal server error." });
  });

  return app;
}

module.exports = { createApp, parseUrl };
