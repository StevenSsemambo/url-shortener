# 5 minute walkthrough script (delete before submitting if you prefer)

**0:00 Intro (20s).** A URL shortener with Express, SQLite, visit tracking, and an optional Redis cache. I will go through each file, then demo with curl.

**0:20 code.js (30s).** ALPHABET is the 62 letters and digits. generateCode picks six characters with crypto.randomInt, which is unbiased and unpredictable. CUSTOM_CODE is the pattern allowed for custom aliases, and RESERVED are names that would clash with our routes.

**0:50 db.js (70s).** We open SQLite in WAL mode. The urls table has an id, a unique code, the long URL, a visits counter starting at zero, created_at, and last_visited_at. An index on long_url makes duplicate checks fast. Statements are prepared once: insert, find by code, find by URL, and a hit statement that adds one to visits and sets last_visited_at. `create` inserts and returns the row; if the code exists SQLite throws a constraint error, which the caller handles.

**2:00 cache.js (60s).** If REDIS_URL is not set, we return a cache that does nothing, so the app still works. Otherwise we create an ioredis client with the offline queue disabled so commands fail immediately if Redis is down. get, set and del each wrap the call in try/catch and treat any failure as a miss. Keys look like url:code and expire after one hour.

**3:00 app.js (110s).** parseUrl accepts only http and https, so javascript: links are rejected. `resolve` is the heart of it: check the cache, on a miss read the database and fill the cache, then always record the visit in the database so counts stay exact. POST /api/shorten validates the URL, handles custom codes with a 409 if taken, returns the existing code if the URL was already shortened, otherwise generates a code and retries on collision. GET /api/expand returns JSON and counts a visit. GET /api/stats returns everything without counting. The /:code route is last so it does not shadow the others, and redirects with 302 so browsers do not cache it and skip our counter. The error handler hides stack traces.

**4:50 server.js, demo (10s).** server.js wires everything and shuts down cleanly. Demo: shorten, redirect twice and show MISS then HIT, then stats. Thank you.
