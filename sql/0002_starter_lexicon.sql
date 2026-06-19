-- YUTABASE v0.1 — starter lexicon: the kingdom's first words
--
-- Doctrine: SPEC.md §11
-- Seven words. That's the point.
--
-- This migration coins the seven starter words. It must be run as a
-- member of the yu_lexicographer role, or as the database owner.

-- The honesty header on each word itself: these were declared by the
-- standard's authors on 2026-06-10. how='declared' because a vocabulary
-- is asserted, not witnessed — the honest claim for "we defined this."

SET ROLE yu_lexicographer;

INSERT INTO yu.lexicon (word, gloss, inverse, from_deck, to_deck, to_one, status, at, by, how) VALUES
  ('submitted_by', 'submitted',
   'this record was submitted by that person or agent',
   'tradein/submissions', 'tradein/customers',
   false, 'live',
   '2026-06-10T00:00:00Z', 'human:yu', 'declared'),

  ('contains', 'contained in',
   'physical or compositional containment — a submission contains these items',
   'tradein/submissions', 'tradein/items',
   false, 'live',
   '2026-06-10T00:00:00Z', 'human:yu', 'declared'),

  ('supersedes', 'superseded by',
   'this record replaces that one; the old stays readable',
   '*/*', '*/*',
   true, 'live',
   '2026-06-10T00:00:00Z', 'human:yu', 'declared'),

  ('priced_from', 'priced',
   'this price was derived from that source record',
   'tradein/items', 'pricing/quotes',
   false, 'live',
   '2026-06-10T00:00:00Z', 'human:yu', 'declared'),

  ('acted_for', 'acted via',
   'an agent performed this on behalf of that operator',
   '*/*', '*/*',
   false, 'live',
   '2026-06-10T00:00:00Z', 'human:yu', 'declared'),

  ('refused_because', 'refused',
   'this action was declined for that recorded reason',
   '*/*', '*/*',
   false, 'live',
   '2026-06-10T00:00:00Z', 'human:yu', 'declared'),

  ('witnesses', 'witnessed by',
   'this record attests that one — the Witnesses Book pattern',
   '*/*', '*/*',
   false, 'live',
   '2026-06-10T00:00:00Z', 'human:yu', 'declared');

RESET ROLE;

-- Generate the via.* views for the new words
SELECT yu.refresh_via();