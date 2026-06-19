// ref.ts — ref parser: book/deck/id
//
// Doctrine: SPEC.md §2 — "globally addressable by ref `book/deck/id`"
//
// A ref is three slashes: tradein/submissions/01977c2e-...
// It identifies exactly one card.

export interface Ref {
  book: string;   // schema name, e.g. "tradein"
  deck: string;   // table name, e.g. "submissions"
  id: string;     // UUID, e.g. "01977c2e-0000-7000-8000-000000000001"
}

/**
 * Parse a ref string into its components.
 * Accepts "book/deck/id" or "book/deck/uuid-prefix" (short refs are
 * expanded by the database query, not here — this parser is strict).
 *
 * @throws on malformed ref
 */
export function parseRef(ref: string): Ref {
  const parts = ref.split("/");
  if (parts.length !== 3) {
    throw new Error(`BAD REF: "${ref}" — expected book/deck/id (3 segments, got ${parts.length})`);
  }
  const [book, deck, id] = parts;
  if (!book || !deck || !id) {
    throw new Error(`BAD REF: "${ref}" — book, deck, and id are all required`);
  }
  // Validate UUID format loosely (8-4-4-4-12 or hex)
  if (!isValidUuid(id)) {
    throw new Error(`BAD REF: "${ref}" — id is not a valid UUID`);
  }
  return { book, deck, id };
}

/** Format a Ref back to its string form. */
export function formatRef(ref: Ref): string {
  return `${ref.book}/${ref.deck}/${ref.id}`;
}

/** Build a ref from components. */
export function makeRef(book: string, deck: string, id: string): Ref {
  return { book, deck, id };
}

function isValidUuid(s: string): boolean {
  // Accept full UUID or partial (for lookups)
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const shortRe = /^[0-9a-f]{8,}$/i;
  return uuidRe.test(s) || shortRe.test(s);
}

/**
 * Parse a "book/deck" pattern (without id) — used by lexicon endpoints.
 * e.g. "tradein/submissions" to { book: "tradein", deck: "submissions" }
 * Also supports glob patterns like star-slash-star or "tradein/star"
 */
export function parseDeckPattern(pattern: string): { book: string; deck: string } {
  const parts = pattern.split("/");
  if (parts.length !== 2) {
    throw new Error(`BAD DECK PATTERN: "${pattern}" — expected book/deck (2 segments)`);
  }
  return { book: parts[0], deck: parts[1] };
}