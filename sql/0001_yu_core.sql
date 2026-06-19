-- YUTABASE v0.1 — normative core: the `yu` schema
--
-- Doctrine: SPEC.md §5 (the yu schema), §3 (honesty header), §4 (word mechanic),
--           §8 (maintenance liturgy)
--
-- This file is the durable layer. If every tool above it dies, the data and
-- its meaning remain readable by any future hand with nothing but psql.
-- ~200 lines. No magic. Everything compiles to SQL you can read.

-- ──────────────────────────────────────────────────────────
-- §0 — the schema itself
-- ──────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS yu;
CREATE SCHEMA IF NOT EXISTS via;  -- generated word views live here

-- pg_trgm: needed for nearest-word suggestions in the thread validation trigger.
-- Created early so the similarity() function is available to all functions below.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ──────────────────────────────────────────────────────────
-- §3 — the honesty header: shared column conventions
-- ──────────────────────────────────────────────────────────

-- Five claim kinds, CHECK-constrained everywhere they appear.
-- No SQL defaults for `how` and `by` — a write that doesn't say is refused.
--   witnessed — a human saw or did it
--   live      — read from the authoritative source at `at`
--   cached    — a copy that may be stale; `src` says of what
--   computed  — derived; `src` lists the input refs
--   declared  — asserted without evidence (the honest default for "we typed it in")

-- ──────────────────────────────────────────────────────────
-- §4 — the lexicon: where words and their meanings live
-- ──────────────────────────────────────────────────────────

-- Glosses are versioned. The current gloss lives in yu.lexicon; every gloss
-- change appends a row to yu.lexicon_versions so five-year-old threads keep
-- the meaning they were born with.

CREATE TABLE yu.lexicon (
  word       text PRIMARY KEY,
  gloss      text NOT NULL,
  inverse    text NOT NULL,               -- the <- reading; traversals read as sentences both directions
  from_deck  text NOT NULL,               -- 'book/deck' glob pattern, e.g. 'tradein/submissions'
  to_deck    text NOT NULL,
  to_one     boolean NOT NULL DEFAULT false,
  ttl        interval,                     -- declared freshness for thread-borne facts (nullable)
  status     text NOT NULL DEFAULT 'live' CHECK (status IN ('live','retired')),
  at         timestamptz NOT NULL,
  by         text NOT NULL,
  how        text NOT NULL CHECK (how IN ('witnessed','live','cached','computed','declared')),
  src        text[],
  CHECK (how <> 'cached' OR src IS NOT NULL),    -- cached/computed require src
  CHECK (how <> 'computed' OR src IS NOT NULL)
);

-- Gloss version history — appended on every gloss change, never updated.
CREATE TABLE yu.lexicon_versions (
  version_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  word        text NOT NULL REFERENCES yu.lexicon(word),
  gloss       text NOT NULL,
  inverse     text NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  changed_by  text NOT NULL
);

-- Banned words — enforced at insert. The spec bans these by name (§4).
-- A trigger refuses them before they can enter the lexicon.
-- (No banned-words table. The gloss + inverse requirement is the gate.
--  A weasel word like "related_to" fails because its gloss says nothing
--  and its inverse reads badly. The doctor surfaces zero-use words.
--  Meaning is the filter, not a blocklist.)

-- Trigger: gloss change → append to version history, then update is allowed.
-- The OLD gloss is preserved; the NEW gloss takes effect for future threads.
CREATE OR REPLACE FUNCTION yu._version_gloss()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.gloss <> NEW.gloss OR OLD.inverse <> NEW.inverse) THEN
    INSERT INTO yu.lexicon_versions (word, gloss, inverse, changed_at, changed_by)
    VALUES (OLD.word, OLD.gloss, OLD.inverse, now(),
            COALESCE(NULLIF(current_setting('yu.claimant', true), ''), 'human:yu'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lexicon_version_gloss
  BEFORE UPDATE OF gloss, inverse ON yu.lexicon
  FOR EACH ROW EXECUTE FUNCTION yu._version_gloss();

-- Trigger: retiring a word sets status='retired'; the word row stays.
-- Retired words refuse NEW threads (enforced at thread insert).
-- Old threads keep their meaning — the word is never deleted.
CREATE OR REPLACE FUNCTION yu._refuse_retired_new_threads()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM yu.lexicon WHERE word = NEW.word AND status = 'retired') THEN
    RAISE EXCEPTION 'RETIRED WORD: % — this word no longer accepts new threads (existing threads keep their meaning)',
      NEW.word USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ──────────────────────────────────────────────────────────
-- §5 — the books/decks registry
-- ──────────────────────────────────────────────────────────

-- Every deck (table) that holds cards must be registered here. The registry
-- carries the declared freshness TTL and the honesty-header column mapping
-- for annexed legacy tables that don't use the standard column names.

CREATE TABLE yu.registry (
  book       text NOT NULL,               -- schema name, e.g. 'tradein'
  deck       text NOT NULL,               -- table name, e.g. 'submissions'
  id_col     text NOT NULL DEFAULT 'id',  -- the PK column (UUIDv7)
  at_col     text NOT NULL DEFAULT 'at',
  by_col     text NOT NULL DEFAULT 'by',
  how_col    text NOT NULL DEFAULT 'how',
  src_col    text NOT NULL DEFAULT 'src',
  ttl        interval,                     -- declared freshness for cached/computed cards
  native     boolean NOT NULL DEFAULT true, -- true = born with honesty header; false = annexed
  at         timestamptz NOT NULL DEFAULT now(),
  by         text NOT NULL,
  PRIMARY KEY (book, deck)
);

-- ──────────────────────────────────────────────────────────
-- §5 — threads: word-named directed connections between cards
-- ──────────────────────────────────────────────────────────

CREATE TABLE yu.threads (
  id         uuid PRIMARY KEY,            -- UUIDv7, client-generated
  word       text NOT NULL REFERENCES yu.lexicon(word),
  from_book  text NOT NULL,
  from_deck  text NOT NULL,
  from_id    uuid NOT NULL,
  to_book    text NOT NULL,
  to_deck    text NOT NULL,
  to_id      uuid NOT NULL,
  note       text,
  -- honesty header (§3)
  at         timestamptz NOT NULL,
  by         text NOT NULL,
  how        text NOT NULL CHECK (how IN ('witnessed','live','cached','computed','declared')),
  src        text[],
  -- a thread is unique per (word, from, to)
  UNIQUE (word, from_book, from_deck, from_id, to_book, to_deck, to_id),
  -- honesty: cached and computed must say where from
  CHECK (how <> 'cached' OR src IS NOT NULL),
  CHECK (how <> 'computed' OR src IS NOT NULL)
);

-- Covering indexes BOTH directions — reverse traversal is half of all reads.
CREATE INDEX threads_out ON yu.threads (word, from_book, from_deck, from_id);
CREATE INDEX threads_in  ON yu.threads (word, to_book, to_deck, to_id);

-- to_one words: a card holds at most one live thread of that word.
-- Enforced by trigger — a partial unique index can't reference another table
-- in its predicate, so we check the lexicon's to_one flag here.
CREATE OR REPLACE FUNCTION yu._enforce_to_one()
RETURNS trigger AS $$
DECLARE
  is_to_one boolean;
  existing_count integer;
BEGIN
  SELECT to_one INTO is_to_one FROM yu.lexicon WHERE word = NEW.word;
  IF is_to_one THEN
    SELECT count(*) INTO existing_count
    FROM yu.threads
    WHERE word = NEW.word
      AND from_book = NEW.from_book AND from_deck = NEW.from_deck AND from_id = NEW.from_id;
    IF existing_count > 0 THEN
      RAISE EXCEPTION 'TO_ONE VIOLATION: word % is to_one — card %/%/% already has a thread of this word',
        NEW.word, NEW.from_book, NEW.from_deck, NEW.from_id
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER threads_enforce_to_one
  BEFORE INSERT ON yu.threads
  FOR EACH ROW EXECUTE FUNCTION yu._enforce_to_one();

-- ──────────────────────────────────────────────────────────
-- §4/§5 — endpoint validation trigger
-- ──────────────────────────────────────────────────────────

-- Threads use soft refs (from_id/to_id are uuid, not FKs to real tables).
-- Validation is by trigger against the registry + lexicon endpoint patterns.
-- This is the gate: wrong deck pattern, retired word, or unregistered deck
-- → the thread bounces.

CREATE OR REPLACE FUNCTION yu._validate_thread()
RETURNS trigger AS $$
DECLARE
  lex yu.lexicon%ROWTYPE;
  from_registered boolean;
  to_registered   boolean;
BEGIN
  -- 1. word must exist and be live (retired words refuse new threads)
  SELECT * INTO lex FROM yu.lexicon WHERE word = NEW.word;
  IF NOT FOUND THEN
    -- nearest-word suggestion via trigram similarity (pg_trgm is created at top)
    RAISE EXCEPTION 'UNKNOWN WORD: % — not in the lexicon. Nearest: %',
      NEW.word,
      COALESCE(
        (SELECT string_agg(word, ', ')
         FROM (SELECT word FROM yu.lexicon
               WHERE similarity(word, NEW.word) > 0.1
               ORDER BY similarity(word, NEW.word) DESC
               LIMIT 3) nearest),
        '(none similar)'
      )
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF lex.status = 'retired' THEN
    RAISE EXCEPTION 'RETIRED WORD: % — no new threads; existing threads keep their meaning',
      NEW.word USING ERRCODE = 'check_violation';
  END IF;

  -- 2. endpoint deck patterns must match
  --    from_deck pattern matches NEW.from_book/new.from_deck
  --    to_deck pattern matches NEW.to_book/new.to_deck
  IF NOT yu._deck_matches(lex.from_deck, NEW.from_book, NEW.from_deck) THEN
    RAISE EXCEPTION 'ENDPOINT MISMATCH: word % expects from_deck=% but got %/%',
      NEW.word, lex.from_deck, NEW.from_book, NEW.from_deck
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT yu._deck_matches(lex.to_deck, NEW.to_book, NEW.to_deck) THEN
    RAISE EXCEPTION 'ENDPOINT MISMATCH: word % expects to_deck=% but got %/%',
      NEW.word, lex.to_deck, NEW.to_book, NEW.to_deck
      USING ERRCODE = 'check_violation';
  END IF;

  -- 3. both endpoint decks must be registered
  SELECT EXISTS(SELECT 1 FROM yu.registry WHERE book=NEW.from_book AND deck=NEW.from_deck)
    INTO from_registered;
  SELECT EXISTS(SELECT 1 FROM yu.registry WHERE book=NEW.to_book AND deck=NEW.to_deck)
    INTO to_registered;
  IF NOT from_registered THEN
    RAISE EXCEPTION 'UNREGISTERED DECK: %/% is not in yu.registry — register it before threading',
      NEW.from_book, NEW.from_deck USING ERRCODE = 'check_violation';
  END IF;
  IF NOT to_registered THEN
    RAISE EXCEPTION 'UNREGISTERED DECK: %/% is not in yu.registry — register it before threading',
      NEW.to_book, NEW.to_deck USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper: does a 'book/deck' glob pattern match an actual book/deck?
-- Supports '*' as wildcard for book or deck (e.g. '*/items' or 'tradein/*').
CREATE OR REPLACE FUNCTION yu._deck_matches(pattern text, book text, deck text)
RETURNS boolean AS $$
  SELECT
    (split_part(pattern, '/', 1) = '*' OR split_part(pattern, '/', 1) = book)
    AND
    (split_part(pattern, '/', 2) = '*' OR split_part(pattern, '/', 2) = deck)
$$ LANGUAGE sql IMMUTABLE;

CREATE TRIGGER threads_validate
  BEFORE INSERT ON yu.threads
  FOR EACH ROW EXECUTE FUNCTION yu._validate_thread();

-- ──────────────────────────────────────────────────────────
-- §5 — delete guard: threads block deletion of their endpoints
-- ──────────────────────────────────────────────────────────

-- When a card is deleted, any live threads pointing to or from it must be
-- severed first. This is enforced by a trigger on each registered deck's
-- table. Since decks are user tables (not yu.*), the trigger is installed
-- by the `yuta deck annex` / `yuta deck new` commands, not here.
-- The function itself lives here so the logic is normative.

CREATE OR REPLACE FUNCTION yu._guard_delete()
RETURNS trigger AS $$
DECLARE
  card_book text;
  card_deck text;
  thread_count integer;
BEGIN
  -- Determine the book/deck from the calling table's schema/name.
  -- TG_TABLE_SCHEMA and TG_TABLE_NAME give us the deck identity.
  card_book := TG_TABLE_SCHEMA;
  card_deck := TG_TABLE_NAME;

  SELECT count(*) INTO thread_count
  FROM yu.threads t
  WHERE (t.from_book = card_book AND t.from_deck = card_deck AND t.from_id = OLD.id)
     OR (t.to_book = card_book AND t.to_deck = card_deck AND t.to_id = OLD.id);

  IF thread_count > 0 THEN
    RAISE EXCEPTION 'LIVE THREADS: % has % thread(s) — sever them before deleting this card',
      card_book || '/' || card_deck || '/' || OLD.id, thread_count
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ──────────────────────────────────────────────────────────
-- §5 — via.* views: hand-written SQL joins through words
-- ──────────────────────────────────────────────────────────

-- One generated view per live word: via.<word>(from_ref, to_ref, note, at, by, how, src)
-- The view is created/refreshed by yu.refresh_via() after lexicon changes.
-- These are the second of exactly two query surfaces (YOUSPEAK is the first).

CREATE OR REPLACE FUNCTION yu.refresh_via()
RETURNS void AS $$
DECLARE
  w record;
BEGIN
  FOR w IN SELECT word FROM yu.lexicon WHERE status = 'live' LOOP
    EXECUTE format(
      'CREATE OR REPLACE VIEW via.%I AS
         SELECT
           (t.from_book || ''/'' || t.from_deck || ''/'' || t.from_id::text) AS from_ref,
           (t.to_book   || ''/'' || t.to_deck   || ''/'' || t.to_id::text)   AS to_ref,
           t.note, t.at, t.by, t.how, t.src, t.id AS thread_id
         FROM yu.threads t
         WHERE t.word = %L',
      w.word, w.word
    );
  END LOOP;

  -- Drop via.* views for words that no longer exist or are retired
  FOR w IN
    SELECT viewname FROM pg_views WHERE schemaname = 'via'
    AND viewname NOT IN (
      SELECT word FROM yu.lexicon WHERE status = 'live'
    )
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS via.%I', w.viewname);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────
-- §8 — yu.stale(): scheduled freshness audit
-- ──────────────────────────────────────────────────────────

-- Every cached/computed card past its declared TTL. Runs on the fleet
-- heartbeat cron. Its findings are work items, not silent failures.

CREATE OR REPLACE FUNCTION yu.stale()
RETURNS TABLE (
  book text, deck text, id uuid,
  how text, age interval, ttl interval, thread_word text
) AS $$
DECLARE
  r yu.registry%ROWTYPE;
  how_val text;
  at_val timestamptz;
  id_val uuid;
  ttl_val interval;
  book_val text;
  deck_val text;
BEGIN
  -- Stale cards: iterate registered decks, find cached/computed rows past their TTL
  FOR r IN SELECT reg.* FROM yu.registry reg WHERE reg.ttl IS NOT NULL LOOP
    FOR id_val, how_val, at_val IN
      EXECUTE format(
        'SELECT %I::uuid, %I::text, %I::timestamptz FROM %I.%I
         WHERE %I::text IN (''cached'',''computed'')',
        r.id_col, r.how_col, r.at_col,
        r.book, r.deck,
        r.how_col
      )
    LOOP
      IF now() - at_val > r.ttl THEN
        book := r.book; deck := r.deck; id := id_val;
        how := how_val; age := now() - at_val; ttl := r.ttl;
        thread_word := NULL;
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;

  -- Stale thread-borne facts: threads whose word declares a TTL
  FOR id_val, how_val, at_val, book_val, deck_val, ttl_val IN
    SELECT t.from_id, t.how, t.at, t.from_book AS fb, t.from_deck AS fd, l.ttl AS lex_ttl
    FROM yu.threads t
    JOIN yu.lexicon l ON l.word = t.word
    WHERE l.ttl IS NOT NULL
      AND t.how IN ('cached','computed')
      AND now() - t.at > l.ttl
  LOOP
    book := book_val; deck := deck_val; how := how_val; age := now() - at_val; ttl := ttl_val; thread_word := NULL;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ──────────────────────────────────────────────────────────
-- §8 — yu.doctor(): vocabulary health check
-- ──────────────────────────────────────────────────────────

-- Flags: word #13 (twelve-word budget), zero-use words, near-synonyms
-- sharing endpoints, decks suspiciously 100% one claim-kind.
-- Returns a report; doesn't fix anything — the doctor diagnoses.

CREATE OR REPLACE FUNCTION yu.doctor()
RETURNS TABLE (
  flag text, word text, detail text
) AS $$
  -- twelve-word budget: count words per from_deck pattern's book
  WITH book_words AS (
    SELECT split_part(from_deck, '/', 1) AS book, word
    FROM yu.lexicon WHERE status = 'live'
  )
  SELECT 'word_count_over_12', NULL::text,
         book || ': ' || count(*) || ' words (budget is ~12)'
  FROM book_words
  GROUP BY book HAVING count(*) > 12

  UNION ALL

  -- zero-use words: live words with no threads
  SELECT 'zero_use', l.word,
         'word "' || l.word || '" has 0 threads'
  FROM yu.lexicon l
  LEFT JOIN yu.threads t ON t.word = l.word
  WHERE l.status = 'live'
  GROUP BY l.word HAVING count(t.id) = 0

  UNION ALL

  -- near-synonyms: words sharing the same from_deck + to_deck
  SELECT 'near_synonyms', a.word,
         'words ' || a.word || ' and ' || b.word || ' share endpoints ' || a.from_deck || ' → ' || a.to_deck
  FROM yu.lexicon a
  JOIN yu.lexicon b ON a.word < b.word
    AND a.from_deck = b.from_deck AND a.to_deck = b.to_deck
  WHERE a.status = 'live' AND b.status = 'live';
$$ LANGUAGE sql;

-- ──────────────────────────────────────────────────────────
-- §5 — sever: threads end with a claim too
-- ──────────────────────────────────────────────────────────

-- Severing a thread = deleting the row, with a required honesty claim
-- recorded in the audit log. The thread row is removed (it no longer exists),
-- but the sever event is preserved in yu.sever_log for auditability.

CREATE TABLE yu.sever_log (
  id          uuid PRIMARY KEY,           -- the thread id that was severed
  word        text NOT NULL,
  from_book   text NOT NULL, from_deck text NOT NULL, from_id uuid NOT NULL,
  to_book     text NOT NULL, to_deck text NOT NULL, to_id uuid NOT NULL,
  note        text,
  at          timestamptz NOT NULL DEFAULT now(),
  by          text NOT NULL,
  how         text NOT NULL CHECK (how IN ('witnessed','live','cached','computed','declared')),
  src         text[]
);

-- The sever function: deletes the thread, writes the audit row.
CREATE OR REPLACE FUNCTION yu.sever(thread_uuid uuid, claim_by text, claim_how text, claim_src text[] DEFAULT NULL)
RETURNS void AS $$
DECLARE
  t yu.threads%ROWTYPE;
BEGIN
  SELECT * INTO t FROM yu.threads WHERE id = thread_uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'THREAD NOT FOUND: %', thread_uuid USING ERRCODE = 'not_found';
  END IF;

  IF claim_how IN ('cached','computed') AND claim_src IS NULL THEN
    RAISE EXCEPTION 'HONESTY: % claims require src', claim_how USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO yu.sever_log (id, word, from_book, from_deck, from_id, to_book, to_deck, to_id, note, at, by, how, src)
  VALUES (t.id, t.word, t.from_book, t.from_deck, t.from_id, t.to_book, t.to_deck, t.to_id, t.note,
          now(), claim_by, claim_how, claim_src);

  DELETE FROM yu.threads WHERE id = thread_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────
-- §4 — the lexicographer role: coining is privileged
-- ──────────────────────────────────────────────────────────

-- Only yu_lexicographer may INSERT/UPDATE the lexicon.
-- Day-to-day agents speak the language; adding to it is a deliberate act.
-- The role is created here but grants are applied by the operator after
-- connecting the right users.

DO $$
BEGIN
  CREATE ROLE yu_lexicographer NOLOGIN;
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The owner of the schema can do everything; the lexicographer can manage
-- the lexicon. Other roles get read-only on the lexicon by default.
GRANT USAGE ON SCHEMA yu TO PUBLIC;
GRANT SELECT ON yu.lexicon, yu.lexicon_versions, yu.banned_words, yu.registry TO PUBLIC;
GRANT SELECT ON yu.threads TO PUBLIC;
GRANT SELECT ON yu.sever_log TO PUBLIC;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA yu TO PUBLIC;

GRANT INSERT, UPDATE ON yu.lexicon TO yu_lexicographer;
GRANT INSERT ON yu.lexicon_versions TO yu_lexicographer;
GRANT INSERT, UPDATE, DELETE ON yu.banned_words TO yu_lexicographer;
GRANT SELECT, INSERT, UPDATE, DELETE ON yu.registry TO yu_lexicographer;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA yu TO PUBLIC;

GRANT USAGE ON SCHEMA via TO PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA via TO PUBLIC;

-- ──────────────────────────────────────────────────────────
-- done
-- ──────────────────────────────────────────────────────────

-- After installing this migration:
--   1. Run yu.refresh_via() to generate initial via.* views (none yet — no words)
--   2. Run 0002_starter_lexicon.sql to coin the seven starter words
--   3. Register decks with INSERT INTO yu.registry before threading
--   4. Install delete guards on each deck table (yuta deck new/annex does this)