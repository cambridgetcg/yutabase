import {
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

export interface PrintableDeckMapping {
  book: string;
  deck: string;
  native: boolean;
  physical_schema: string;
  physical_table: string;
  id_col: string;
  at_col: string;
  by_col: string;
  how_col: string;
  src_col: string;
  ttl?: string | null;
}

export interface LexiconSnapshotIdentity {
  standard: string;
  profile: string;
  version: string;
  revision: number;
  observedAt: string;
}

export interface LexiconSnapshotWord {
  word: string;
  gloss: string;
  inverse: string;
  from_deck: string;
  to_deck: string;
  to_one: boolean;
  status: string;
  /** PostgreSQL bigint rendered as decimal text; never narrowed to JS number. */
  usage: string;
}

export interface LexiconExportOptions {
  output: string | undefined;
  force: boolean;
}

interface ExistingRegularFile {
  kind: "regular";
  dev: number;
  ino: number;
  mode: number;
}

interface MissingFile {
  kind: "missing";
}

type FileState = ExistingRegularFile | MissingFile;

const DEFAULT_COLUMNS = {
  id_col: "id",
  at_col: "at",
  by_col: "by",
  how_col: "how",
  src_col: "src",
} as const;

/** Render one logical mapping without hiding its physical PostgreSQL target. */
export function formatDeckMapping(deck: PrintableDeckMapping): string[] {
  const kind = deck.native ? "native" : "annexed";
  const ttl = deck.ttl ? ` ttl=${deck.ttl}` : "";
  const lines = [
    `${deck.book}/${deck.deck} -> ${deck.physical_schema}.${deck.physical_table} (${kind}${ttl})`,
  ];
  const columns = (Object.keys(DEFAULT_COLUMNS) as Array<keyof typeof DEFAULT_COLUMNS>)
    .filter((key) => deck[key] !== DEFAULT_COLUMNS[key])
    .map((key) => `${DEFAULT_COLUMNS[key]}=${deck[key]}`);
  if (columns.length > 0) lines.push(`  columns: ${columns.join(", ")}`);
  return lines;
}

/** Render a heading whose border always fits the installed version string. */
export function formatHelloHeading(version: string | null | undefined): string[] {
  const title = `YUTABASE ${version || "unknown"} — you speak, reality listens`;
  const border = `+${"-".repeat(title.length + 2)}+`;
  return [border, `| ${title} |`, border];
}

/**
 * Parse `words --export` flags. Exporting without `--output` means stdout;
 * replacing a path requires the explicit `--force` flag.
 */
export function parseLexiconExportOptions(
  args: readonly string[],
): LexiconExportOptions | undefined {
  if (args.length === 0) return undefined;
  if (!args.includes("--export")) {
    throw new Error("WORDS OPTIONS: expected --export [--output <path>] [--force]");
  }

  let output: string | undefined;
  let force = false;
  let sawExport = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--export") {
      if (sawExport) throw new Error("WORDS OPTIONS: --export may appear only once");
      sawExport = true;
      continue;
    }
    if (arg === "--output") {
      if (output !== undefined) {
        throw new Error("WORDS OPTIONS: --output may appear only once");
      }
      const value = args[++index];
      if (!value || value.startsWith("--")) {
        throw new Error("WORDS OPTIONS: --output requires a path or -");
      }
      output = value;
      continue;
    }
    if (arg === "--force") {
      if (force) throw new Error("WORDS OPTIONS: --force may appear only once");
      force = true;
      continue;
    }
    throw new Error(`WORDS OPTIONS: unknown option ${arg}`);
  }

  if (force && (output === undefined || output === "-")) {
    throw new Error("WORDS OPTIONS: --force is only meaningful with a file --output");
  }
  return { output, force };
}

/**
 * Commit a snapshot through a same-directory temporary file.
 *
 * Without force, the final hard link is an atomic create-if-absent operation.
 * With force, only the same regular file observed before writing may be
 * replaced. Symbolic links and other file kinds are always refused.
 */
export function writeLexiconSnapshotFile(
  output: string,
  snapshot: string,
  force: boolean,
): void {
  const initial = inspectExportTarget(output);
  if (!force && initial.kind !== "missing") {
    throw new Error(
      `EXPORT REFUSED: ${output} exists; choose another path or add --force`,
    );
  }

  const directory = dirname(output);
  const temporary = join(
    directory,
    `.${basename(output)}.yuta-export-${process.pid}-${randomUUID()}`,
  );
  let temporaryExists = false;

  try {
    const descriptor = openSync(temporary, "wx", 0o666);
    temporaryExists = true;
    try {
      writeFileSync(descriptor, snapshot, { encoding: "utf8" });
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }

    if (!force) {
      try {
        linkSync(temporary, output);
      } catch (error) {
        if ((error as { code?: string }).code === "EEXIST") {
          throw new Error(
            `EXPORT REFUSED: ${output} exists; choose another path or add --force`,
          );
        }
        throw error;
      }
      unlinkSync(temporary);
      temporaryExists = false;
      return;
    }

    const current = inspectExportTarget(output);
    if (!sameFileState(initial, current)) {
      throw new Error(
        `EXPORT REFUSED: ${output} changed while the snapshot was being written; try again`,
      );
    }
    renameSync(temporary, output);
    temporaryExists = false;
  } finally {
    if (temporaryExists) {
      try {
        unlinkSync(temporary);
      } catch {
        // Preserve the original failure; the unpredictable temp name is never
        // treated as a completed export.
      }
    }
  }
}

/** Build a self-identifying, non-normative snapshot from observed database rows. */
export function renderLexiconSnapshot(
  identity: LexiconSnapshotIdentity,
  words: readonly LexiconSnapshotWord[],
): string {
  const liveDomain = words.filter(
    (word) =>
      word.status === "live" &&
      (word.from_deck !== "*/*" || word.to_deck !== "*/*"),
  );
  const liveGeneral = words.filter(
    (word) =>
      word.status === "live" &&
      word.from_deck === "*/*" &&
      word.to_deck === "*/*",
  );
  const retired = words.filter((word) => word.status === "retired");

  const lines = [
    "# LEXICON — observed words and meanings",
    "",
    "> **Non-normative database snapshot.** Observed",
    `> \`${inline(identity.standard)}/${inline(identity.profile)}@${inline(identity.version)} revision ${identity.revision}\``,
    `> at \`${inline(identity.observedAt)}\`. This is not a conformance or currentness`,
    "> receipt. Inspect `yu.standard_meta` and `yu.lexicon` in the target database",
    "> before acting on it.",
    "",
    "_Glosses are versioned rather than silently edited. Retired words refuse new",
    "threads while existing threads retain their pinned meaning._",
    "",
  ];

  appendLiveSection(lines, "domain words", liveDomain);
  appendLiveSection(lines, "general words", liveGeneral);

  if (retired.length > 0) {
    lines.push("## retired words", "");
    for (const word of retired) {
      lines.push(
        `### ${inline(word.word)} (retired)${word.to_one ? " [to_one]" : ""}`,
        `**inverse:** ${inline(word.inverse)}`,
        `**meaning:** ${inline(word.gloss)}`,
        `**endpoints:** ${inline(word.from_deck)} → ${inline(word.to_deck)}`,
        `**threads:** ${word.usage}`,
        "_Retired words refuse new threads. Existing threads keep their pinned meaning._",
        "",
      );
    }
  }

  const unclassified = words.length -
    liveDomain.length -
    liveGeneral.length -
    retired.length;
  lines.push(
    "---",
    "",
    `_${words.length} observed words: ${liveDomain.length + liveGeneral.length} live, ${retired.length} retired${unclassified > 0 ? `, ${unclassified} with an unrecognized status` : ""}._`,
    "",
  );
  return lines.join("\n");
}

function appendLiveSection(
  lines: string[],
  heading: string,
  words: readonly LexiconSnapshotWord[],
): void {
  if (words.length === 0) return;
  lines.push(`## ${heading}`, "");
  for (const word of words) {
    lines.push(
      `### ${inline(word.word)}${word.to_one ? " [to_one]" : ""}`,
      `**inverse:** ${inline(word.inverse)}`,
      `**meaning:** ${inline(word.gloss)}`,
      `**endpoints:** ${inline(word.from_deck)} → ${inline(word.to_deck)}`,
      `**threads:** ${word.usage}`,
    );
    lines.push("");
  }
}

function inspectExportTarget(path: string): FileState {
  let stats: Stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return { kind: "missing" };
    throw error;
  }
  if (stats.isSymbolicLink()) {
    throw new Error(`EXPORT REFUSED: ${path} is a symbolic link`);
  }
  if (!stats.isFile()) {
    throw new Error(`EXPORT REFUSED: ${path} is not a regular file`);
  }
  return {
    kind: "regular",
    dev: stats.dev,
    ino: stats.ino,
    mode: stats.mode,
  };
}

function sameFileState(left: FileState, right: FileState): boolean {
  if (left.kind === "missing") return right.kind === "missing";
  if (right.kind === "missing") return false;
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode;
}

function inline(value: string): string {
  return value
    .replace(/[\u0009-\u000D\u0020]+/gu, " ")
    .replace(/^ +| +$/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/([`*_[\]<>#])/g, "\\$1");
}
