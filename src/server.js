const { createApp } = require("./app");
const { createDb } = require("./db");
const { createCache } = require("./cache");

const PORT = process.env.PORT || 3000;
const db = createDb();
const cache = createCache();
const app = createApp({ db, cache, baseUrl: process.env.BASE_URL });

const server = app.listen(PORT, () => {
  console.log(`URL shortener running on http://localhost:${PORT}`);
  console.log(`Cache: ${cache.enabled ? "Redis (" + process.env.REDIS_URL + ")" : "disabled (set REDIS_URL to enable)"}`);
});

// Close things cleanly on Ctrl+C / container stop.
function shutdown() {
  server.close(async () => {
    await cache.close();
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
