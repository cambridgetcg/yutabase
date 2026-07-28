import { describe, expect, test } from "bun:test";

import {
  parseDeckAnnexArgs,
  parseDeckNewArgs,
  parseWordAddArgs,
  parseWordRetireArgs,
} from "../src/cli-command-args.js";

describe("strict mutating CLI options", () => {
  test("parses deck new columns and TTL without swallowing typos", () => {
    expect(parseDeckNewArgs([
      "work/tasks",
      "status:text",
      "--ttl",
      "7 days",
    ])).toEqual({
      deckRef: "work/tasks",
      columnSpecs: ["status:text"],
      ttl: "7 days",
    });
    expect(() => parseDeckNewArgs(["work/tasks", "--ttl"]))
      .toThrow(/--ttl requires a non-blank value/);
    expect(() => parseDeckNewArgs(["work/tasks", "--tll", "7 days"]))
      .toThrow(/unknown option --tll/);
    expect(() => parseDeckNewArgs([
      "work/tasks",
      "--ttl",
      "7 days",
      "--ttl",
      "8 days",
    ])).toThrow(/--ttl may appear only once/);
  });

  test("parses annex column mappings and rejects unknown or duplicate flags", () => {
    expect(parseDeckAnnexArgs([
      "legacy.rows",
      "as",
      "work/tasks",
      "--id",
      "row_id",
      "--by",
      "claimant",
    ])).toEqual({
      tableRef: "legacy.rows",
      deckRef: "work/tasks",
      idCol: "row_id",
      atCol: "at",
      byCol: "claimant",
      howCol: "how",
      srcCol: "src",
    });
    expect(() => parseDeckAnnexArgs([
      "legacy.rows",
      "as",
      "work/tasks",
      "--scr",
      "sources",
    ])).toThrow(/unknown option or token --scr/);
    expect(() => parseDeckAnnexArgs([
      "legacy.rows",
      "as",
      "work/tasks",
      "--src",
      "--how",
      "claim_kind",
    ])).toThrow(/--src requires a non-blank value/);
    expect(() => parseDeckAnnexArgs([
      "legacy.rows",
      "as",
      "work/tasks",
      "--id",
      "one",
      "--id",
      "two",
    ])).toThrow(/--id may appear only once/);
  });

  test("requires every word-add option and preserves explicit to_one", () => {
    expect(parseWordAddArgs([
      "produced",
      "--gloss",
      "this task produced that artifact",
      "--inverse",
      "produced by",
      "--from",
      "work/tasks",
      "--to",
      "git/commits",
      "--to-one",
    ])).toMatchObject({ word: "produced", toOne: true });
    expect(() => parseWordAddArgs([
      "produced",
      "--gloss",
      "meaning",
      "--inverse",
      "inverse",
      "--from",
      "work/tasks",
      "--too",
      "git/commits",
    ])).toThrow(/unknown option or token --too/);
    expect(() => parseWordAddArgs([
      "produced",
      "--gloss",
      "meaning",
      "--inverse",
      "inverse",
      "--from",
      "work/tasks",
    ])).toThrow(/missing required --to/);
    expect(() => parseWordAddArgs([
      "produced",
      "--gloss",
      "\t\n\v\f\r ",
      "--inverse",
      "inverse",
      "--from",
      "work/tasks",
      "--to",
      "git/commits",
    ])).toThrow(/--gloss requires a non-blank value/);
    expect(parseWordAddArgs([
      "produced",
      "--gloss",
      "\u00A0",
      "--inverse",
      "inverse",
      "--from",
      "work/tasks",
      "--to",
      "git/commits",
    ]).gloss).toBe("\u00A0");
  });

  test("parses word retirement as one closed grammar", () => {
    expect(parseWordRetireArgs([
      "produced",
      "how",
      "computed",
      "src",
      "urn:example:decision:1",
    ])).toEqual({
      word: "produced",
      how: "computed",
      src: ["urn:example:decision:1"],
    });
    expect(() => parseWordRetireArgs([
      "produced",
      "later",
      "how",
      "declared",
    ])).toThrow(/expected <word> how/);
    expect(() => parseWordRetireArgs([
      "produced",
      "how",
      "computed",
      "src",
    ])).toThrow(/at least one locator/);
    expect(() => parseWordRetireArgs([
      "produced",
      "how",
      "computed",
      "src",
      "\t\n\v\f\r ",
    ])).toThrow(/src\[0\] must be non-blank/);
  });
});
