import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { parseCliArgs, redactConnectionUrl, unwrapCliQuery } from "../src/cli-args.js";
import { explain } from "../src/youspeak.js";

test("CLI explain preserves quoted values through the real command boundary", () => {
  const cli = resolve(import.meta.dir, "../src/cli.ts");
  for (const query of [
    'cards demo/notes where title="quiet and rest"',
    'cards demo/notes where title="the newest 20"',
  ]) {
    for (const argument of [query, `"${query}"`, `'${query}'`]) {
      const result = spawnSync(process.execPath, [cli, "explain", argument], {
        encoding: "utf8",
        timeout: 10_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(`${explain(query)}\n`);
    }
  }
});

test("CLI query unwrapping preserves unmatched quotes and whitespace", () => {
  for (const input of [
    "", '"', "'", '"hello', "hello'", '"hello\'',
    ' cards demo/notes where title="rest" ',
    'cards demo/notes where title="rest"',
  ]) {
    expect(unwrapCliQuery(input)).toBe(input);
  }
  expect(unwrapCliQuery('"hello"')).toBe("hello");
  expect(unwrapCliQuery("'hello'")).toBe("hello");
});

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

test("rejects duplicate global options instead of silently taking the last", () => {
  expect(() => parseCliArgs([
    "hello",
    "--conn",
    "postgresql://localhost/one",
    "--conn",
    "postgresql://localhost/two",
  ])).toThrow(/--conn may appear only once/);
  expect(() => parseCliArgs([
    "--by",
    "agent:one",
    "word",
    "retire",
    "contains",
    "how",
    "declared",
    "--by",
    "agent:two",
  ])).toThrow(/--by may appear only once/);
});

test("redacts every potentially credential-bearing URL component", () => {
  const redacted = redactConnectionUrl(
    "postgresql://alice:swordfish@db.example:5432/app?credential=hunter2&sslmode=require#private",
  );
  expect(redacted).toBe("postgresql://***:***@db.example:5432/app");
  expect(redactConnectionUrl("not a URL")).toBe("<unparseable connection string>");
});
