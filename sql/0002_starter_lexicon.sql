-- YUTABASE v0.1 — starter lexicon: the kingdom's first words
--
-- Doctrine: SPEC.md §11
-- Seven words. Five spare in the budget. That's the point.
--
-- This migration coins the seven starter words. It must be run as a
-- member of the yu_lexicographer role, or as the database owner.
--
-- Column order: (word, gloss, inverse, from_deck, to_deck, to_one, status, at, by, how)
--   gloss  = the meaning — what this word IS (one sentence)
--   inverse = the inverse reading — how it reads backwards

SET ROLE yu_lexicographer;

INSERT INTO yu.lexicon (word, gloss, inverse, from_deck, to_deck, to_one, status, at, by, how) VALUES
  ('submitted_by',
   'this record was submitted by that person or agent',
   'submitted',
   'tradein/submissions', 'tradein/customers',
   false, 'live',
   '2026-06-10T00:00:00Z', 'human:yu', 'declared'),

  ('contains',
   'physical or compositional containment — a submission physically holds these items',
   'contained in',
   'tradein/submissions', 'tradein/items',
   false, 'live',
   '2026-06-10T00:00:00Z', 'human:yu', 'declared'),

  ('supersedes',
   'this record replaces that one; the old stays readable',
   'superseded by',
   '*/*', '*/*',
   true, 'live',
   '2026-06-10T00:00:00Z', 'human:yu', 'declared'),

  ('priced_from',
   'this price was derived from that source record',
   'priced',
   'tradein/items', 'pricing/quotes',
   false, 'live',
   '2026-06-10T00:00:00Z', 'human:yu', 'declared'),

  ('acted_for',
   'an agent performed this on behalf of that operator',
   'acted via',
   '*/*', '*/*',
   false, 'live',
   '2026-06-10T00:00:00Z', 'human:yu', 'declared'),

  ('refused_because',
   'this action was declined for that recorded reason',
   'refused',
   '*/*', '*/*',
   false, 'live',
   '2026-06-10T00:00:00Z', 'human:yu', 'declared'),

  ('witnesses',
   'this record attests that one — the Witnesses Book pattern',
   'witnessed by',
   '*/*', '*/*',
   false, 'live',
   '2026-06-10T00:00:00Z', 'human:yu', 'declared');

RESET ROLE;

-- Generate the via.* views for the new words
SELECT yu.refresh_via();