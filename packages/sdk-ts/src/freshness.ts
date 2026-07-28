export interface FreshnessBanner {
  totalValues: number;
  cachedCount: number;
  computedCount: number;
  oldestCachedDays: number | null;
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Summarize claim kinds represented in one result.
 *
 * Traversal rows repeat the final edge at the top level and carry the complete
 * one- or two-edge route in `path`. Count that path once instead of counting
 * only (or double-counting) its final edge. Ordinary card rows still use their
 * top-level honesty header.
 */
export function summarizeFreshness(
  rows: readonly Record<string, unknown>[],
  nowMs = Date.now(),
): FreshnessBanner | undefined {
  if (!Number.isFinite(nowMs)) {
    throw new RangeError("FRESHNESS: now must be a finite millisecond timestamp");
  }

  let totalValues = 0;
  let cachedCount = 0;
  let computedCount = 0;
  let oldestCachedAt: number | null = null;

  for (const row of rows) {
    const claims = traversalPathClaims(row) ?? [row];
    for (const claim of claims) {
      if (typeof claim.how !== "string") continue;

      totalValues++;
      if (claim.how === "cached") {
        cachedCount++;
        const claimedAt = timestampMilliseconds(claim.at);
        if (
          claimedAt !== null &&
          (oldestCachedAt === null || claimedAt < oldestCachedAt)
        ) {
          oldestCachedAt = claimedAt;
        }
      } else if (claim.how === "computed") {
        computedCount++;
      }
    }
  }

  if (totalValues === 0) return undefined;

  return {
    totalValues,
    cachedCount,
    computedCount,
    oldestCachedDays:
      oldestCachedAt === null
        ? null
        : Math.max(
            0,
            Math.floor((nowMs - oldestCachedAt) / MILLISECONDS_PER_DAY),
          ),
  };
}

function traversalPathClaims(
  row: Record<string, unknown>,
): Record<string, unknown>[] | null {
  if (
    typeof row.thread_id !== "string" ||
    !Array.isArray(row.path) ||
    row.path.length === 0 ||
    !row.path.every(
      (edge) =>
        edge !== null &&
        typeof edge === "object" &&
        !Array.isArray(edge) &&
        typeof (edge as Record<string, unknown>).thread_id === "string",
    )
  ) {
    return null;
  }

  return row.path as Record<string, unknown>[];
}

function timestampMilliseconds(value: unknown): number | null {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : null;
  if (date === null) return null;

  const milliseconds = date.getTime();
  return Number.isFinite(milliseconds) ? milliseconds : null;
}
