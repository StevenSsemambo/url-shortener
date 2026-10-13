const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/app");
const { createDb } = require("../src/db");

// A fake cache that records calls, so we can prove the cache is used.
function fakeCache() {
  const store = new Map();
  return { enabled: true, store, get: async (c) => store.get(c) ?? null, set: async (c, u) => void store.set(c, u), del: async (c) => void store.delete(c), close: async () => {} };
}

let server, base, db, cache;

before(async () => {
  db = createDb(":memory:");
  cache = fakeCache();
  server = createApp({ db, cache }).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); db.close(); });

const post = (body) => fetch(`${base}/api/shorten`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("shortens a URL and returns a 6 character code", async () => {
  const res = await post({ url: "https://example.com/some/long/path?x=1" });
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.match(data.code, /^[A-Za-z0-9]{6}$/);
  assert.equal(data.shortUrl, `${base}/${data.code}`);
  assert.equal(data.visits, 0);
});

test("same URL returns the same short code (no duplicates)", async () => {
  const a = await (await post({ url: "https://dedupe.example.com/" })).json();
  const res = await post({ url: "https://dedupe.example.com/" });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).code, a.code);
});

test("rejects invalid, non-http and missing URLs", async () => {
  for (const url of ["not a url", "javascript:alert(1)", "ftp://x.com/f", "", undefined, 123]) {
    assert.equal((await post({ url })).status, 400, String(url));
  }
});

test("rejects malformed JSON", async () => {
  const res = await fetch(`${base}/api/shorten`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{bad" });
  assert.equal(res.status, 400);
});

test("expand returns the long URL", async () => {
  const { code } = await (await post({ url: "https://expand.example.com/page" })).json();
  const res = await fetch(`${base}/api/expand/${code}`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { code, longUrl: "https://expand.example.com/page" });
});

test("unknown code gives 404 on expand, stats and redirect", async () => {
  for (const p of ["/api/expand/nope123", "/api/stats/nope123", "/nope123"]) {
    assert.equal((await fetch(base + p, { redirect: "manual" })).status, 404, p);
  }
});

test("redirect sends 302 to the long URL and counts visits", async () => {
  const { code } = await (await post({ url: "https://redirect.example.com/" })).json();
  for (let i = 0; i < 3; i++) {
    const res = await fetch(`${base}/${code}`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "https://redirect.example.com/");
  }
  const stats = await (await fetch(`${base}/api/stats/${code}`)).json();
  assert.equal(stats.visits, 3);
  assert.ok(stats.lastVisitedAt);
});

test("stats endpoint does not count as a visit", async () => {
  const { code } = await (await post({ url: "https://stats.example.com/" })).json();
  await fetch(`${base}/api/stats/${code}`);
  await fetch(`${base}/api/stats/${code}`);
  assert.equal((await (await fetch(`${base}/api/stats/${code}`)).json()).visits, 0);
});

test("cache: first lookup is a MISS, second is a HIT, visits still counted", async () => {
  const { code } = await (await post({ url: "https://cache.example.com/" })).json();
  assert.equal(cache.store.has(code), false);
  const first = await fetch(`${base}/${code}`, { redirect: "manual" });
  assert.equal(first.headers.get("x-cache"), "MISS");
  assert.equal(cache.store.get(code), "https://cache.example.com/");
  const second = await fetch(`${base}/${code}`, { redirect: "manual" });
  assert.equal(second.headers.get("x-cache"), "HIT");
  assert.equal((await (await fetch(`${base}/api/stats/${code}`)).json()).visits, 2);
});

test("custom code works, and duplicates and reserved names are refused", async () => {
  const ok = await post({ url: "https://custom.example.com/", customCode: "my-link" });
  assert.equal(ok.status, 201);
  assert.equal((await ok.json()).code, "my-link");
  assert.equal((await post({ url: "https://other.example.com/", customCode: "my-link" })).status, 409);
  assert.equal((await post({ url: "https://x.example.com/", customCode: "api" })).status, 400);
  assert.equal((await post({ url: "https://x.example.com/", customCode: "a!" })).status, 400);
});

test("health endpoint", async () => {
  assert.equal((await (await fetch(`${base}/health`)).json()).status, "ok");
});
