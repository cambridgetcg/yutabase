import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  formatDeckMapping,
  formatHelloHeading,
  parseLexiconExportOptions,
  renderLexiconSnapshot,
  writeLexiconSnapshotFile,
} from "../src/cli-output.js";

describe("deck mapping output", () => {
  test("always shows logical and physical names", () => {
    expect(formatDeckMapping({
      book: "pricing",
      deck: "quotes",
      native: false,
      physical_schema: "archive",
      physical_table: "quote_rows",
      id_col: "quote_id",
      at_col: "observed_at",
      by_col: "claimed_by",
      how_col: "claim_kind",
      src_col: "sources",
    })).toEqual([
      "pricing/quotes -> archive.quote_rows (annexed)",
      "  columns: id=quote_id, at=observed_at, by=claimed_by, how=claim_kind, src=sources",
    ]);
  });

  test("keeps default mappings compact", () => {
    expect(formatDeckMapping({
      book: "tradein",
      deck: "items",
      native: true,
      physical_schema: "tradein",
      physical_table: "items",
      id_col: "id",
      at_col: "at",
      by_col: "by",
      how_col: "how",
      src_col: "src",
      ttl: "7 days",
    })).toEqual([
      "tradein/items -> tradein.items (native ttl=7 days)",
    ]);
  });
});

describe("lexicon export options", () => {
  test("defaults export to stdout", () => {
    expect(parseLexiconExportOptions(["--export"])).toEqual({
      output: undefined,
      force: false,
    });
    expect(parseLexiconExportOptions(["--export", "--output", "-"])).toEqual({
      output: "-",
      force: false,
    });
  });

  test("requires explicit force for replacement semantics", () => {
    expect(parseLexiconExportOptions([
      "--export",
      "--output",
      "snapshot.md",
      "--force",
    ])).toEqual({ output: "snapshot.md", force: true });
    expect(() => parseLexiconExportOptions(["--export", "--force"]))
      .toThrow(/only meaningful with a file/);
  });

  test("rejects ambiguous or unknown flags", () => {
    expect(() => parseLexiconExportOptions(["--output", "x"]))
      .toThrow(/expected --export/);
    expect(() => parseLexiconExportOptions(["--export", "--output"]))
      .toThrow(/requires a path/);
    expect(() => parseLexiconExportOptions(["--export", "--wat"]))
      .toThrow(/unknown option/);
  });
});

test("hello heading expands to fit the installed version", () => {
  const heading = formatHelloHeading("0.1.0-candidate.123456789");
  expect(heading[0].length).toBe(heading[1].length);
  expect(heading[1]).toContain("0.1.0-candidate.123456789");
  expect(heading[2]).toBe(heading[0]);
});

describe("lexicon snapshot files", () => {
  test("creates absent files and preserves existing files without force", () => {
    withTemporaryDirectory((directory) => {
      const output = join(directory, "snapshot.md");
      writeLexiconSnapshotFile(output, "first\n", false);
      expect(readFileSync(output, "utf8")).toBe("first\n");

      expect(() => writeLexiconSnapshotFile(output, "second\n", false))
        .toThrow(/exists.*--force/);
      expect(readFileSync(output, "utf8")).toBe("first\n");
    });
  });

  test("force replaces a regular file atomically", () => {
    withTemporaryDirectory((directory) => {
      const output = join(directory, "snapshot.md");
      writeFileSync(output, "old\n");
      writeLexiconSnapshotFile(output, "new\n", true);
      expect(readFileSync(output, "utf8")).toBe("new\n");
    });
  });

  test("refuses symbolic links and directories without touching their targets", () => {
    withTemporaryDirectory((directory) => {
      const victim = join(directory, "victim.md");
      const link = join(directory, "snapshot.md");
      const nested = join(directory, "nested");
      writeFileSync(victim, "keep\n");
      symlinkSync(victim, link);
      mkdirSync(nested);

      expect(() => writeLexiconSnapshotFile(link, "replace\n", true))
        .toThrow(/symbolic link/);
      expect(readFileSync(victim, "utf8")).toBe("keep\n");
      expect(() => writeLexiconSnapshotFile(nested, "replace\n", true))
        .toThrow(/not a regular file/);
    });
  });
});

test("lexicon snapshots carry identity and do not duplicate retired domain words", () => {
  const snapshot = renderLexiconSnapshot(
    {
      standard: "YUTABASE",
      profile: "postgres",
      version: "0.1.0-candidate.1",
      revision: 5,
      observedAt: "2026-07-28T12:00:00.000Z",
    },
    [
      {
        word: "contains",
        gloss: "physical containment",
        inverse: "contained in",
        from_deck: "tradein/submissions",
        to_deck: "tradein/items",
        to_one: false,
        status: "live",
        usage: "2",
      },
      {
        word: "old_contains",
        gloss: "retired meaning",
        inverse: "old inverse",
        from_deck: "tradein/submissions",
        to_deck: "tradein/items",
        to_one: false,
        status: "retired",
        usage: "1",
      },
    ],
  );

  expect(snapshot).toContain(
    "`YUTABASE/postgres@0.1.0-candidate.1 revision 5`",
  );
  expect(snapshot).toContain("This is not a conformance or currentness");
  expect(snapshot.split("### old\\_contains (retired)").length - 1).toBe(1);
  expect(snapshot).toContain(
    "**endpoints:** tradein/submissions → tradein/items",
  );
  expect(snapshot).toContain("**threads:** 1");
  expect(snapshot).not.toContain("## general words");
});

test("snapshot rendering preserves text outside the candidate ASCII blank set", () => {
  const snapshot = renderLexiconSnapshot(
    {
      standard: "YUTABASE",
      profile: "postgres",
      version: "0.1.0-candidate.1",
      revision: 5,
      observedAt: "2026-07-28T12:00:00.000Z",
    },
    [{
      word: "contains",
      gloss: "\u00A0",
      inverse: "contained in",
      from_deck: "*/*",
      to_deck: "*/*",
      to_one: false,
      status: "live",
      usage: "0",
    }],
  );
  expect(snapshot).toContain("**meaning:** \u00A0");
});

function withTemporaryDirectory(run: (directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "yutabase-cli-output-"));
  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
