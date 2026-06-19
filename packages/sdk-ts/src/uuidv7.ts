// uuidv7.ts — client-generated UUIDv7 (time-sortable, mergeable, no sequences)
//
// Doctrine: SPEC.md §2 — "ids are client-generated UUIDv7 (time-sortable,
// mergeable, no sequences)"
//
// UUIDv7: 48-bit Unix timestamp (ms) + 12-bit random + 62-bit random.
// Time-sortable means `ORDER BY id DESC LIMIT 20` gives "newest 20" for free.

/**
 * Generate a UUIDv7 string.
 * @param timestampMs Optional timestamp override (for testing / deterministic IDs)
 */
export function uuidv7(timestampMs?: number): string {
  const ts = timestampMs ?? Date.now();
  const bytes = new Uint8Array(16);

  // 48-bit timestamp (big-endian) in bytes 0-5
  // JS bitwise ops wrap at 32-bit, so use division for the high bytes
  bytes[0] = Math.floor(ts / 0x10000000000) & 0xff;
  bytes[1] = Math.floor(ts / 0x100000000) & 0xff;
  bytes[2] = Math.floor(ts / 0x1000000) & 0xff;
  bytes[3] = Math.floor(ts / 0x10000) & 0xff;
  bytes[4] = Math.floor(ts / 0x100) & 0xff;
  bytes[5] = ts & 0xff;

  // 12 bits of randomness in bytes 6-7, with version nibble (7)
  bytes[6] = 0x70 | (Math.random() * 0x0f);
  bytes[7] = Math.random() * 0xff;

  // 62 bits of randomness in bytes 8-15, with variant (10)
  bytes[8] = 0x80 | (Math.random() * 0x3f);
  for (let i = 9; i < 16; i++) bytes[i] = Math.random() * 0xff;

  return formatUuid(bytes);
}

/** Format 16 bytes as a standard UUID string. */
function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") + "-" +
    hex.slice(4, 6).join("") + "-" +
    hex.slice(6, 8).join("") + "-" +
    hex.slice(8, 10).join("") + "-" +
    hex.slice(10, 16).join("")
  );
}

/** Extract the timestamp from a UUIDv7 (ms since epoch), or null for non-v7. */
export function uuidv7Timestamp(id: string): number | null {
  const bytes = parseUuidBytes(id);
  if (!bytes) return null;
  if ((bytes[6] & 0xf0) !== 0x70) return null; // not v7

  const ts =
    (bytes[0] * 0x10000000000) +
    (bytes[1] * 0x100000000) +
    (bytes[2] * 0x1000000) +
    (bytes[3] * 0x10000) +
    (bytes[4] * 0x100) +
    bytes[5];
  return Math.floor(ts);
}

function parseUuidBytes(id: string): Uint8Array | null {
  const clean = id.replace(/-/g, "");
  if (clean.length !== 32) return null;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    const byte = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    bytes[i] = byte;
  }
  return bytes;
}