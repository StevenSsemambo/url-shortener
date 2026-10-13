// SQLite storage layer. All SQL lives here so the rest of the app never sees it.
const Database = require("better-sqlite3");

function createDb(file = process.env.DB_FILE || "urls.db") {
  const db = new Database(file);
  db.pragma("journal_mode = WAL"); // faster writes, safe concurrent reads

  db.exec(`
    CREATE TABLE IF NOT EXISTS urls (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      code            TEXT    NOT NULL UNIQUE,
      long_url        TEXT    NOT NULL,
      visits          INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      last_visited_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_urls_long_url ON urls(long_url);
  `);

  // Prepared once, reused for every request (faster and safe from SQL injection).
  const insert = db.prepare("INSERT INTO urls (code, long_url) VALUES (?, ?)");
  const byCode = db.prepare("SELECT * FROM urls WHERE code = ?");
  const byUrl = db.prepare("SELECT * FROM urls WHERE long_url = ? ORDER BY id LIMIT 1");
  const hit = db.prepare("UPDATE urls SET visits = visits + 1, last_visited_at = datetime('now') WHERE code = ?");

  return {
    /** Returns the new row, or throws a SQLITE_CONSTRAINT error if the code already exists. */
    create: (code, longUrl) => {
      insert.run(code, longUrl);
      return byCode.get(code);
    },
    findByCode: (code) => byCode.get(code),
    findByUrl: (longUrl) => byUrl.get(longUrl),
    recordVisit: (code) => hit.run(code),
    close: () => db.close(),
  };
}

module.exports = { createDb };
