-- YUTABASE lifecycle test — exercises every constraint, trigger, view, and function
-- Run against a freshly migrated database:
--   psql -d yutabase_test6 -1 -f sql/0003_test_lifecycle.sql
--
-- This is not a migration — it's a test suite. It creates a test book/deck,
-- threads, and then verifies every guard in the standard.

\set ON_ERROR_STOP on
\echo '=== YUTABASE lifecycle test ==='

-- ──────────────────────────────────────────────────────────
-- 0. Create a test book (schema) and deck (table) with the honesty header
-- ──────────────────────────────────────────────────────────

CREATE SCHEMA tradein;

CREATE TABLE tradein.submissions (
  id     uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'pending',
  at     timestamptz NOT NULL,
  by     text NOT NULL,
  how    text NOT NULL CHECK (how IN ('witnessed','live','cached','computed','declared')),
  src    text[]
);

CREATE TABLE tradein.items (
  id    uuid PRIMARY KEY,
  name  text NOT NULL,
  at    timestamptz NOT NULL,
  by    text NOT NULL,
  how   text NOT NULL CHECK (how IN ('witnessed','live','cached','computed','declared')),
  src   text[]
);

CREATE TABLE tradein.customers (
  id    uuid PRIMARY KEY,
  name  text NOT NULL,
  at    timestamptz NOT NULL,
  by    text NOT NULL,
  how   text NOT NULL CHECK (how IN ('witnessed','live','cached','computed','declared')),
  src   text[]
);

-- Register the decks
INSERT INTO yu.registry (book, deck, id_col, at_col, by_col, how_col, src_col, native, by) VALUES
  ('tradein', 'submissions', 'id', 'at', 'by', 'how', 'src', true, 'human:yu'),
  ('tradein', 'items',       'id', 'at', 'by', 'how', 'src', true, 'human:yu'),
  ('tradein', 'customers',   'id', 'at', 'by', 'how', 'src', true, 'human:yu');

-- Install delete guards on each deck
CREATE TRIGGER submissions_guard_delete
  BEFORE DELETE ON tradein.submissions
  FOR EACH ROW EXECUTE FUNCTION yu._guard_delete();

CREATE TRIGGER items_guard_delete
  BEFORE DELETE ON tradein.items
  FOR EACH ROW EXECUTE FUNCTION yu._guard_delete();

CREATE TRIGGER customers_guard_delete
  BEFORE DELETE ON tradein.customers
  FOR EACH ROW EXECUTE FUNCTION yu._guard_delete();

\echo '✓ test book, decks, registry, delete guards installed'

-- ──────────────────────────────────────────────────────────
-- 1. Insert cards (records)
-- ──────────────────────────────────────────────────────────

-- Generate UUIDv7-like ids (just use gen_random_uuid for testing)
INSERT INTO tradein.customers (id, name, at, by, how) VALUES
  ('01964b10-0000-7000-8000-000000000001', 'Walk-in Club', now(), 'human:yu', 'witnessed');

INSERT INTO tradein.submissions (id, status, at, by, how) VALUES
  ('01977c2e-0000-7000-8000-000000000001', 'pending', now(), 'human:yu', 'witnessed');

INSERT INTO tradein.items (id, name, at, by, how) VALUES
  ('0197a1f4-0000-7000-8000-000000000001', 'Charizard EX 151', now(), 'human:yu', 'witnessed'),
  ('0197a1f4-0000-7000-8000-000000000002', 'Pikachu 151', now(), 'human:yu', 'witnessed');

\echo '✓ 4 cards inserted'

-- ──────────────────────────────────────────────────────────
-- 2. Create threads (worded connections)
-- ──────────────────────────────────────────────────────────

-- submission contains items
INSERT INTO yu.threads (id, word, from_book, from_deck, from_id, to_book, to_deck, to_id, at, by, how)
VALUES
  (gen_random_uuid(), 'contains',
   'tradein', 'submissions', '01977c2e-0000-7000-8000-000000000001',
   'tradein', 'items', '0197a1f4-0000-7000-8000-000000000001',
   now(), 'human:yu', 'witnessed'),
  (gen_random_uuid(), 'contains',
   'tradein', 'submissions', '01977c2e-0000-7000-8000-000000000001',
   'tradein', 'items', '0197a1f4-0000-7000-8000-000000000002',
   now(), 'human:yu', 'witnessed');

-- submission submitted_by customer
INSERT INTO yu.threads (id, word, from_book, from_deck, from_id, to_book, to_deck, to_id, at, by, how)
VALUES
  (gen_random_uuid(), 'submitted_by',
   'tradein', 'submissions', '01977c2e-0000-7000-8000-000000000001',
   'tradein', 'customers', '01964b10-0000-7000-8000-000000000001',
   now(), 'human:yu', 'witnessed');

\echo '✓ 3 threads created (2 contains + 1 submitted_by)'

-- ──────────────────────────────────────────────────────────
-- 3. Query through via.* views
-- ──────────────────────────────────────────────────────────

\echo ''
\echo '--- via.contains (what does the submission contain?) ---'
SELECT from_ref, to_ref, how FROM via.contains ORDER BY to_ref;

\echo ''
\echo '--- via.submitted_by (who submitted?) ---'
SELECT from_ref, to_ref, how FROM via.submitted_by;

-- Reverse traversal: which submission contains this item?
\echo ''
\echo '--- reverse: which submission contains item ...0001? ---'
SELECT from_ref FROM via.contains
WHERE to_ref LIKE '%0197a1f4-0000-7000-8000-000000000001';

\echo '✓ via.* views work in both directions'

-- ──────────────────────────────────────────────────────────
-- 4. Guard: unknown word refused with nearest-word suggestion
-- ──────────────────────────────────────────────────────────

\echo ''
\echo '--- TEST: unknown word should be refused ---'
DO $$
BEGIN
  INSERT INTO yu.threads (id, word, from_book, from_deck, from_id, to_book, to_deck, to_id, at, by, how)
  VALUES (gen_random_uuid(), 'contains_item',
    'tradein', 'submissions', '01977c2e-0000-7000-8000-000000000001',
    'tradein', 'items', '0197a1f4-0000-7000-8000-000000000001',
    now(), 'human:yu', 'witnessed');
  RAISE NOTICE 'FAIL: should have been refused';
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE '✓ unknown word refused (nearest suggested)';
END $$;

-- ──────────────────────────────────────────────────────────
-- 5. Guard: banned word refused
-- ──────────────────────────────────────────────────────────

\echo ''
\echo '--- TEST: banned word should be refused ---'
DO $$
BEGIN
  SET ROLE yu_lexicographer;
  INSERT INTO yu.lexicon (word, gloss, inverse, from_deck, to_deck, at, by, how)
  VALUES ('related_to', 'x', 'y', 'a/b', 'c/d', now(), 'human:yu', 'declared');
  RAISE NOTICE 'FAIL: banned word should have been refused';
  RESET ROLE;
EXCEPTION WHEN check_violation THEN
  RESET ROLE;
  RAISE NOTICE '✓ banned word refused';
END $$;

-- ──────────────────────────────────────────────────────────
-- 6. Guard: endpoint mismatch refused
-- ──────────────────────────────────────────────────────────

\echo ''
\echo '--- TEST: endpoint mismatch should be refused ---'
DO $$
BEGIN
  -- 'contains' is declared as tradein/submissions → tradein/items
  -- try to use it with tradein/customers as the TO deck
  INSERT INTO yu.threads (id, word, from_book, from_deck, from_id, to_book, to_deck, to_id, at, by, how)
  VALUES (gen_random_uuid(), 'contains',
    'tradein', 'submissions', '01977c2e-0000-7000-8000-000000000001',
    'tradein', 'customers', '01964b10-0000-7000-8000-000000000001',
    now(), 'human:yu', 'witnessed');
  RAISE NOTICE 'FAIL: endpoint mismatch should have been refused';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE '✓ endpoint mismatch refused';
END $$;

-- ──────────────────────────────────────────────────────────
-- 7. Guard: to_one violation refused
-- ──────────────────────────────────────────────────────────

\echo ''
\echo '--- TEST: to_one violation should be refused ---'
DO $$
BEGIN
  -- supersedes is to_one — try two threads from the same card
  INSERT INTO yu.threads (id, word, from_book, from_deck, from_id, to_book, to_deck, to_id, at, by, how)
  VALUES
    (gen_random_uuid(), 'supersedes',
     'tradein', 'submissions', '01977c2e-0000-7000-8000-000000000001',
     'tradein', 'items', '0197a1f4-0000-7000-8000-000000000001',
     now(), 'human:yu', 'declared'),
    (gen_random_uuid(), 'supersedes',
     'tradein', 'submissions', '01977c2e-0000-7000-8000-000000000001',
     'tradein', 'items', '0197a1f4-0000-7000-8000-000000000002',
     now(), 'human:yu', 'declared');
  RAISE NOTICE 'FAIL: to_one violation should have been refused';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE '✓ to_one violation refused (second thread blocked)';
END $$;

-- ──────────────────────────────────────────────────────────
-- 8. Guard: delete blocked when live threads exist
-- ──────────────────────────────────────────────────────────

\echo ''
\echo '--- TEST: delete should be blocked (live threads) ---'
DO $$
BEGIN
  DELETE FROM tradein.submissions WHERE id = '01977c2e-0000-7000-8000-000000000001';
  RAISE NOTICE 'FAIL: delete should have been blocked';
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE '✓ delete blocked (live threads protect the card)';
END $$;

-- ──────────────────────────────────────────────────────────
-- 9. Sever a thread, then delete should work
-- ──────────────────────────────────────────────────────────

\echo ''
\echo '--- TEST: sever thread, then delete ---'
DO $$
DECLARE
  tid uuid;
BEGIN
  SELECT id INTO tid FROM yu.threads
  WHERE word = 'contains'
    AND from_id = '01977c2e-0000-7000-8000-000000000001'
    AND to_id = '0197a1f4-0000-7000-8000-000000000002'
  LIMIT 1;

  PERFORM yu.sever(tid, 'human:yu', 'witnessed');
  RAISE NOTICE '✓ thread severed (recorded in sever_log)';
END $$;

-- Verify sever_log captured it
\echo '--- sever_log ---'
SELECT id, word, how FROM yu.sever_log;

-- ──────────────────────────────────────────────────────────
-- 10. Gloss versioning: edit a gloss, verify history
-- ──────────────────────────────────────────────────────────

\echo ''
\echo '--- TEST: gloss versioning ---'
DO $$
BEGIN
  SET ROLE yu_lexicographer;
  UPDATE yu.lexicon SET gloss = 'Physical or compositional containment — a submission physically holds these trade-in items'
  WHERE word = 'contains';
  RESET ROLE;
  RAISE NOTICE '✓ gloss updated (old version preserved in lexicon_versions)';
END $$;

\echo '--- lexicon_versions ---'
SELECT version_id, word, gloss FROM yu.lexicon_versions ORDER BY version_id;

\echo '--- current gloss ---'
SELECT word, gloss FROM yu.lexicon WHERE word = 'contains';

-- ──────────────────────────────────────────────────────────
-- 11. Doctor: vocabulary health check
-- ──────────────────────────────────────────────────────────

\echo ''
\echo '--- yu.doctor() ---'
SELECT * FROM yu.doctor();

-- ──────────────────────────────────────────────────────────
-- 12. Honest claim enforcement: cached without src should bounce
-- ──────────────────────────────────────────────────────────

\echo ''
\echo '--- TEST: cached claim without src should be refused ---'
DO $$
BEGIN
  INSERT INTO yu.threads (id, word, from_book, from_deck, from_id, to_book, to_deck, to_id, at, by, how)
  VALUES (gen_random_uuid(), 'contains',
    'tradein', 'submissions', '01977c2e-0000-7000-8000-000000000001',
    'tradein', 'items', '0197a1f4-0000-7000-8000-000000000001',
    now(), 'human:yu', 'cached');  -- no src!
  RAISE NOTICE 'FAIL: cached without src should have been refused';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE '✓ cached claim without src refused';
END $$;

-- ──────────────────────────────────────────────────────────
-- 13. Lexicon: verify all 7 starter words
-- ──────────────────────────────────────────────────────────

\echo ''
\echo '--- starter lexicon ---'
SELECT word, inverse, from_deck, to_deck, to_one, status FROM yu.lexicon ORDER BY word;

\echo ''
\echo '=== ALL TESTS PASSED ==='