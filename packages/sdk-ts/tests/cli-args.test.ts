import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { parseCliArgs, redactConnectionUrl, unwrapCliQuery } from "../src/cli-args.js";
import { compile, explain } from "../src/youspeak.js";

test("CLI JSON explain preserves the native compiler plan without executing it", () => {
  const query = 'cards demo/notes where title="the newest 20" newest 7';
  const result = spawnSync(process.execPath, [
    resolve(import.meta.dir, "../src/cli.ts"), "explain", "--json", query,
  ], { encoding: "utf8", timeout: 10_000 });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toEqual({
    stage: "logical-preview",
    executed: false,
    compiled: compile(query),
  });
});

test("JSON explain carries read, write and wrapper metadata without binding credentials", () => {
  const from = "demo/notes/01900000-0000-7000-8000-000000000001";
  const to = "demo/notes/01900000-0000-7000-8000-000000000002";
  const queries = [
    "hello",
    `card ${from}`,
    'cards demo/notes where title="literal --json and newest 20"',
    `cards demo/notes where amount=${"9".repeat(400)} newest 1000`,
    `${from} -> mentions`,
    `thread ${from} --mentions--> ${to} note "a quoted ' value" how computed src urn:example:source`,
    "sever 01900000-0000-7000-8000-000000000003 how declared",
    'explain "cards demo/notes newest 5"',
  ];
  for (const query of queries) {
    for (const argument of [query, `"${query}"`, `'${query}'`]) {
      const startedAt = Date.now();
      const result = spawnSync(process.execPath, [
        resolve(import.meta.dir, "../src/cli.ts"),
        "--conn", "postgresql://127.0.0.1:1/not_connected", "--by", "agent:not_bound",
        "explain", "--json", argument,
      ], { encoding: "utf8", timeout: 10_000 });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const actual = JSON.parse(result.stdout);
      const compiled = compile(query);
      if (query.startsWith("thread ")) {
        // Compilation generates a fresh draft ID/time; compare their contracts,
        // not two independent random/clock observations.
        const timeIndex = compiled.claimantParamIndex! + 1;
        expect(actual.compiled.params[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        const generatedAt = Date.parse(actual.compiled.params[timeIndex]);
        expect(generatedAt).toBeGreaterThanOrEqual(startedAt);
        expect(generatedAt).toBeLessThanOrEqual(Date.now());
        compiled.params[0] = actual.compiled.params[0];
        compiled.params[timeIndex] = actual.compiled.params[timeIndex];
      }
      expect(actual).toEqual({
        stage: "logical-preview", executed: false, compiled,
      });
    }
  }
});

test("JSON explain refuses invalid forms without a success document", () => {
  const cases = [
    { args: [], error: "USAGE:" },
    { args: ["--json", "hello"], error: "UNRECOGNIZED QUERY:" },
    { args: ["hello", "--json"], error: "UNRECOGNIZED QUERY:" },
    { args: ["cards demo/notes newest 0"], error: "BAD LIMIT:" },
    { args: ["cards demo/notes newest 1001"], error: "BAD LIMIT:" },
    ...["\n", "\r", "\u2028", "\u2029"].map((separator) => ({
      args: [`cards demo/notes where title="line one${separator}newest 20"`],
      error: "UNRECOGNIZED QUERY:",
    })),
  ];
  for (const { args, error } of cases) {
    const result = spawnSync(process.execPath, [
      resolve(import.meta.dir, "../src/cli.ts"), "explain", "--json", ...args,
    ], { encoding: "utf8", timeout: 10_000 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(error);
  }
});

test("CLI help makes the unexecuted JSON preview discoverable", () => {
  const result = spawnSync(process.execPath, [
    resolve(import.meta.dir, "../src/cli.ts"), "--help",
  ], { encoding: "utf8", timeout: 10_000 });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toContain('explain [--json] "<youspeak>"');
  expect(result.stdout).toContain("No connection or execution");
});

test("plain explain retains the compiler's empty-query error", () => {
  const result = spawnSync(process.execPath, [
    resolve(import.meta.dir, "../src/cli.ts"), "explain", '""',
  ], { encoding: "utf8", timeout: 10_000 });
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("EMPTY QUERY\n");
});

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
