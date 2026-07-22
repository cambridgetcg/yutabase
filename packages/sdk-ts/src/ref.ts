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
 * Accepts exactly "book/deck/full-uuid". Prefix lookup is not part of the
 * frozen core because the compiler uses exact UUID equality.
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
  validateIdentifier(book, "book");
  validateIdentifier(deck, "deck");
  if (!isValidUuid(id)) {
    throw new Error(`BAD REF: "${ref}" — id is not a full UUID`);
  }
  return { book, deck, id };
}

/** Format a Ref back to its string form. */
export function formatRef(ref: Ref): string {
  const validated = parseRef(`${ref.book}/${ref.deck}/${ref.id}`);
  return `${validated.book}/${validated.deck}/${validated.id}`;
}

/** Build a ref from components. */
export function makeRef(book: string, deck: string, id: string): Ref {
  return parseRef(`${book}/${deck}/${id}`);
}

function isValidUuid(s: string): boolean {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRe.test(s);
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
  const [book, deck] = parts;
  if (book !== "*") validateIdentifier(book, "book pattern");
  if (deck !== "*") validateIdentifier(deck, "deck pattern");
  return { book, deck };
}

function validateIdentifier(value: string, label: string): void {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error(`BAD REF: ${label} "${value}" is not lower_snake`);
  }
}
