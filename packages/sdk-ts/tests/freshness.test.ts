import { describe, expect, test } from "bun:test";

import { summarizeFreshness } from "../src/freshness.js";

const NOW = Date.parse("2026-07-28T12:00:00.000Z");

describe("freshness summaries", () => {
  test("counts ordinary row-level claims and the oldest cached value", () => {
    expect(
      summarizeFreshness(
        [
          {
            how: "cached",
            at: new Date("2026-07-25T11:59:59.000Z"),
          },
          {
            how: "computed",
            at: "2026-07-28T10:00:00.000Z",
          },
          {
            how: "witnessed",
            at: "2026-07-28T11:00:00.000Z",
          },
        ],
        NOW,
      ),
    ).toEqual({
      totalValues: 3,
      cachedCount: 1,
      computedCount: 1,
      oldestCachedDays: 3,
    });
  });

  test("counts every traversal edge once instead of only its repeated final edge", () => {
    expect(
      summarizeFreshness(
        [
          {
            thread_id: "second",
            how: "computed",
            at: "2026-07-28T10:00:00.000Z",
            path: [
              {
                thread_id: "first",
                how: "cached",
                at: "2026-07-24T12:00:00.000Z",
              },
              {
                thread_id: "second",
                how: "computed",
                at: "2026-07-28T10:00:00.000Z",
              },
            ],
          },
        ],
        NOW,
      ),
    ).toEqual({
      totalValues: 2,
      cachedCount: 1,
      computedCount: 1,
      oldestCachedDays: 4,
    });
  });

  test("does not mistake an application card's unrelated path array for traversal", () => {
    expect(
      summarizeFreshness(
        [
          {
            how: "cached",
            at: "2026-07-27T12:00:00.000Z",
            path: [{ how: "computed", at: "2026-07-01T00:00:00.000Z" }],
          },
        ],
        NOW,
      ),
    ).toEqual({
      totalValues: 1,
      cachedCount: 1,
      computedCount: 0,
      oldestCachedDays: 1,
    });
  });

  test("keeps malformed times honest and never reports negative age", () => {
    expect(
      summarizeFreshness([{ how: "cached", at: "not-a-time" }], NOW),
    ).toEqual({
      totalValues: 1,
      cachedCount: 1,
      computedCount: 0,
      oldestCachedDays: null,
    });

    expect(
      summarizeFreshness(
        [{ how: "cached", at: "2026-07-29T12:00:00.000Z" }],
        NOW,
      )?.oldestCachedDays,
    ).toBe(0);
  });
});
