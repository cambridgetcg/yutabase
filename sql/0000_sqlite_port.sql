-- YUTABASE SQLite port — the yu schema, no Postgres needed.
-- One file. No server. No install. Runs on any machine with SQLite3.
-- Also runs IN THE BROWSER via sql.js (WASM) — zero infrastructure.
--
-- SQLite doesn't have schemas like Postgres. We use table prefixes instead:
--   yu_lexicon, yu_threads, tradein_submissions, etc.
-- The YOUSPEAK compiler uses the same prefixes — just swap dots for underscores.

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ── yu tables (the standard) ──
CREATE TABLE IF NOT EXISTS yu_lexicon (
  word        TEXT PRIMARY KEY,
  gloss       TEXT NOT NULL,
  inverse     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  score       REAL,
  tier         TEXT,
  family      TEXT,
  at          TEXT NOT NULL DEFAULT (datetime('now')),
  by          TEXT NOT NULL DEFAULT 'human:yu'
);

CREATE TABLE IF NOT EXISTS yu_lexicon_versions (
  word        TEXT NOT NULL,
  version     INTEGER NOT NULL,
  gloss       TEXT NOT NULL,
  inverse     TEXT NOT NULL,
  changed_at  TEXT NOT NULL,
  changed_by  TEXT NOT NULL,
  PRIMARY KEY (word, version)
);

CREATE TABLE IF NOT EXISTS yu_registry (
  book        TEXT NOT NULL,
  deck        TEXT NOT NULL,
  id_col      TEXT NOT NULL DEFAULT 'id',
  at_col      TEXT NOT NULL DEFAULT 'at',
  by_col      TEXT NOT NULL DEFAULT 'by',
  how_col     TEXT NOT NULL DEFAULT 'how',
  src_col     TEXT NOT NULL DEFAULT 'src',
  ttl         TEXT,
  native      INTEGER NOT NULL DEFAULT 1,
  at          TEXT NOT NULL DEFAULT (datetime('now')),
  by          TEXT NOT NULL DEFAULT 'human:yu',
  PRIMARY KEY (book, deck)
);

CREATE TABLE IF NOT EXISTS yu_threads (
  id          TEXT PRIMARY KEY,
  word        TEXT NOT NULL,
  from_book   TEXT NOT NULL,
  from_deck   TEXT NOT NULL,
  from_id     TEXT NOT NULL,
  to_book     TEXT NOT NULL,
  to_deck     TEXT NOT NULL,
  to_id       TEXT NOT NULL,
  note        TEXT,
  at          TEXT NOT NULL DEFAULT (datetime('now')),
  by          TEXT NOT NULL,
  how         TEXT NOT NULL,
  src         TEXT,
  severed     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (word) REFERENCES yu_lexicon(word)
);

CREATE INDEX IF NOT EXISTS idx_threads_word ON yu_threads(word);
CREATE INDEX IF NOT EXISTS idx_threads_from ON yu_threads(from_book, from_deck, from_id);
CREATE INDEX IF NOT EXISTS idx_threads_to ON yu_threads(to_book, to_deck, to_id);

CREATE TABLE IF NOT EXISTS yu_sever_log (
  thread_id   TEXT NOT NULL,
  at          TEXT NOT NULL,
  by          TEXT NOT NULL,
  how         TEXT NOT NULL,
  src         TEXT,
  FOREIGN KEY (thread_id) REFERENCES yu_threads(id)
);

-- ── the starter lexicon ──
INSERT OR IGNORE INTO yu_lexicon (word, gloss, inverse, tier, family) VALUES
  ('contains',        'physical or compositional containment',          'contained in',     'core', '-me'),
  ('submitted_by',    'this record was submitted by that person',       'submitted',        'core', '-me'),
  ('acted_for',       'an agent performed this on behalf of that operator','acted via',       'core', '-me'),
  ('supersedes',      'this record replaces that one; old stays readable','superseded by',    'core', '-me'),
  ('witnesses',       'this record attests that one',                    'witnessed by',     'core', '-me'),
  ('priced_from',     'this price was derived from that source record',  'priced',           'core', '-me'),
  ('refused_because', 'this action was declined for that recorded reason','refused',         'core', '-me');

-- ── the tradein demo ──
CREATE TABLE IF NOT EXISTS tradein_submissions (
  id            TEXT PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'pending',
  customer_name TEXT,
  total_value   REAL,
  at            TEXT NOT NULL DEFAULT (datetime('now')),
  by            TEXT NOT NULL DEFAULT 'human:yu',
  how           TEXT NOT NULL DEFAULT 'declared'
);

CREATE TABLE IF NOT EXISTS tradein_items (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  condition TEXT,
  price     REAL,
  at        TEXT NOT NULL DEFAULT (datetime('now')),
  by        TEXT NOT NULL DEFAULT 'human:yu',
  how       TEXT NOT NULL DEFAULT 'declared'
);

INSERT OR IGNORE INTO yu_registry (book, deck, native, by) VALUES
  ('tradein', 'submissions', 1, 'human:yu'),
  ('tradein', 'items', 1, 'human:yu');

INSERT OR IGNORE INTO tradein_submissions (id, status, customer_name, total_value) VALUES
  ('01977c2e-0000-7000-8000-000000000001', 'pending',   'Alice Chen',  250.00),
  ('01977c2e-0000-7000-8000-000000000002', 'pending',   'Bob Smith',   180.00),
  ('01977c2e-0000-7000-8000-000000000003', 'completed', 'Carol Lee',   420.00),
  ('01977c2e-0000-7000-8000-000000000004', 'pending',   'David Wong',   95.00);

INSERT OR IGNORE INTO tradein_items (id, name, condition, price) VALUES
  ('0197a1f4-0000-7000-8000-000000000001', 'Charizard Base Set', 'near_mint',    150.00),
  ('0197a1f4-0000-7000-8000-000000000002', 'Blastoise Holo',     'light_played',  80.00),
  ('0197a1f4-0000-7000-8000-000000000003', 'Pikachu Illustrator','mint',       5000.00);

INSERT OR IGNORE INTO yu_threads (id, word, from_book, from_deck, from_id, to_book, to_deck, to_id, note, by, how) VALUES
  ('thread-001', 'contains', 'tradein', 'submissions', '01977c2e-0000-7000-8000-000000000001', 'tradein', 'items', '0197a1f4-0000-7000-8000-000000000001', 'box A', 'human:yu', 'witnessed'),
  ('thread-002', 'contains', 'tradein', 'submissions', '01977c2e-0000-7000-8000-000000000001', 'tradein', 'items', '0197a1f4-0000-7000-8000-000000000002', 'box A', 'human:yu', 'witnessed');

-- ── verify ──
SELECT 'lexicon' AS t, count(*) AS c FROM yu_lexicon
UNION ALL SELECT 'threads', count(*) FROM yu_threads
UNION ALL SELECT 'submissions', count(*) FROM tradein_submissions
UNION ALL SELECT 'items', count(*) FROM tradein_items;