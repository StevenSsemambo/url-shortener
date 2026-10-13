// ---------------------------------------------------------------------------
// Optional Redis cache. Maps  code -> long URL  so redirects skip the database read.
//
// Design rules:
//  * If REDIS_URL is not set, caching is simply switched off (the app still works).
//  * If Redis goes down, every call fails fast and the app falls back to the database.
//    Redis is an optimisation, never a point of failure.
// ---------------------------------------------------------------------------
const TTL_SECONDS = 60 * 60; // entries expire after 1 hour

function disabledCache() {
  return {
    enabled: false,
    get: async () => null,
    set: async () => {},
    del: async () => {},
    close: async () => {},
  };
}

function createCache(url = process.env.REDIS_URL) {
  if (!url) return disabledCache();

  const Redis = require("ioredis");
  const client = new Redis(url, {
    enableOfflineQueue: false, // when disconnected, commands error immediately instead of queueing
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000), // keep trying to reconnect in the background
  });
  client.on("error", () => {}); // connection errors are handled per call below
  client.on("ready", () => console.log("Redis cache connected"));

  const key = (code) => `url:${code}`;

  return {
    enabled: true,
    get: async (code) => {
      try {
        return await client.get(key(code));
      } catch {
        return null; // treat any Redis problem as a cache miss
      }
    },
    set: async (code, longUrl) => {
      try {
        await client.set(key(code), longUrl, "EX", TTL_SECONDS);
      } catch {
        /* ignore */
      }
    },
    del: async (code) => {
      try {
        await client.del(key(code));
      } catch {
        /* ignore */
      }
    },
    close: async () => {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    },
  };
}

module.exports = { createCache };
