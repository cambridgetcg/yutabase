import { expect, test } from "bun:test";

import { parseCliArgs, redactConnectionUrl } from "../src/cli-args.js";

test("parses global connection and claimant flags", () => {
  expect(parseCliArgs([
    "query", "hello", "--conn", "postgresql://localhost/example", "--by", "agent:test",
  ])).toEqual({
    conn: "postgresql://localhost/example",
    by: "agent:test",
    positional: ["query", "hello"],
  });
});

test("preserves deck annex --by as a physical column mapping", () => {
  expect(parseCliArgs([
    "--by", "agent:test",
    "deck", "annex", "legacy.cards", "as", "archive/cards",
    "--id", "card_id", "--by", "claimed_by", "--how", "claim_kind",
  ])).toEqual({
    conn: undefined,
    by: "agent:test",
    positional: [
      "deck", "annex", "legacy.cards", "as", "archive/cards",
      "--id", "card_id", "--by", "claimed_by", "--how", "claim_kind",
    ],
  });
});

test("rejects global flags without values", () => {
  expect(() => parseCliArgs(["hello", "--conn"])).toThrow(/--conn requires a value/);
  expect(() => parseCliArgs(["hello", "--by", "--conn", "postgresql:\/\/localhost\/x"]))
    .toThrow(/--by requires a value/);
});

test("redacts every potentially credential-bearing URL component", () => {
  const redacted = redactConnectionUrl(
    "postgresql://alice:swordfish@db.example:5432/app?credential=hunter2&sslmode=require#private",
  );
  expect(redacted).toBe("postgresql://***:***@db.example:5432/app");
  expect(redactConnectionUrl("not a URL")).toBe("<unparseable connection string>");
});
