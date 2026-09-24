CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  store TEXT NOT NULL,
  price REAL NOT NULL,
  previous_price REAL,
  typical_price REAL,
  currency TEXT NOT NULL DEFAULT 'INR',
  url TEXT NOT NULL,
  image_url TEXT,
  detected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id TEXT NOT NULL,
  price REAL NOT NULL,
  captured_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_deals (
  deal_id TEXT PRIMARY KEY,
  saved_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deals_score ON deals(score DESC);
CREATE INDEX IF NOT EXISTS idx_history_deal ON price_history(deal_id, captured_at DESC);
