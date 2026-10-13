# URL Shortener

A bit.ly-style service: Node.js + Express, **SQLite** storage, visit tracking, and an optional **Redis** cache.

## Video walkthrough

**Video URL:** `PASTE_YOUR_PUBLIC_VIDEO_LINK_HERE`

## Run it

```bash
npm install
npm start                 # http://localhost:3000  (includes a small web UI)
npm test                  # 11 API tests, no Redis needed
```

Optional Redis cache:

```bash
REDIS_URL=redis://127.0.0.1:6379 npm start
```

Environment variables: `PORT` (3000), `DB_FILE` (urls.db), `BASE_URL` (used to build short links, defaults to the request host), `REDIS_URL` (cache off if unset).

## API

| Method | Path | Description |
|---|---|---|
| POST | `/api/shorten` | Body `{ "url": "https://...", "customCode": "optional" }`. Returns 201 with the new link, or 200 with the existing link if that URL was already shortened |
| GET | `/api/expand/:code` | Returns `{ code, longUrl }` as JSON. Counts as a visit |
| GET | `/:code` | 302 redirect to the long URL. Counts as a visit |
| GET | `/api/stats/:code` | `code, shortUrl, longUrl, visits, createdAt, lastVisitedAt`. Read-only, does **not** count as a visit |
| GET | `/health` | Status and cache mode |

```bash
curl -X POST localhost:3000/api/shorten -H 'Content-Type: application/json' -d '{"url":"https://example.com/very/long/path"}'
# {"code":"Z38Ace","shortUrl":"http://localhost:3000/Z38Ace","longUrl":"https://example.com/very/long/path","visits":0,...}

curl -i localhost:3000/Z38Ace          # 302 + Location header
curl localhost:3000/api/stats/Z38Ace   # visits: 1
```

Errors: 400 invalid URL/JSON/custom code, 404 unknown code, 409 custom code taken.

## Design decisions

- **Codes:** 6 characters of base62 from `crypto.randomInt` (about 56.8 billion combinations), unpredictable. On the rare collision the insert fails on the UNIQUE constraint and we retry (max 5).
- **Database:** `better-sqlite3` with prepared statements (fast, no SQL injection). Index on `long_url` makes de-duplication fast.
- **Validation:** only `http`/`https` URLs, max 2048 chars, so `javascript:` and `data:` links are rejected.
- **302, not 301:** a permanent redirect would be cached by browsers, which would then skip the server and never be counted.
- **Visits:** always written to the database, even on cache hits, so counts stay accurate.
- **Redis cache:** maps `code -> longUrl` with a 1 hour TTL. Cache-aside pattern: check Redis, on a miss read SQLite and fill Redis. Responses include an `X-Cache: HIT|MISS` header so it is easy to demonstrate.
- **Redis is optional and fails safe:** if `REDIS_URL` is unset the cache is off, and if Redis goes down mid-run every cache call fails fast and the app falls back to SQLite (tested).

## Structure

```
src/server.js   starts the app, graceful shutdown
src/app.js      routes and validation
src/db.js       SQLite schema and queries
src/cache.js    optional Redis cache
src/code.js     short code generation
public/         tiny web UI
test/           API tests
```
