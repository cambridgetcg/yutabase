import { isNonblankText } from "./nonblank.js";

export interface DeckNewArgs {
  deckRef: string;
  columnSpecs: string[];
  ttl: string | undefined;
}

export interface DeckAnnexArgs {
  tableRef: string;
  deckRef: string;
  idCol: string;
  atCol: string;
  byCol: string;
  howCol: string;
  srcCol: string;
}

export interface WordAddArgs {
  word: string;
  gloss: string;
  inverse: string;
  fromDeck: string;
  toDeck: string;
  toOne: boolean;
}

export interface WordRetireArgs {
  word: string;
  how: string;
  src: string[] | undefined;
}

export function parseDeckNewArgs(args: readonly string[]): DeckNewArgs {
  const deckRef = requiredHead(args, "DECK NEW");
  const columnSpecs: string[] = [];
  let ttl: string | undefined;

  for (let index = 1; index < args.length; index++) {
    const token = args[index];
    if (token === "--ttl") {
      if (ttl !== undefined) fail("DECK NEW", "--ttl may appear only once");
      ttl = flagValue(args, ++index, "DECK NEW", "--ttl");
      continue;
    }
    if (token.startsWith("--")) {
      fail("DECK NEW", `unknown option ${token}`);
    }
    columnSpecs.push(token);
  }
  return { deckRef, columnSpecs, ttl };
}

export function parseDeckAnnexArgs(args: readonly string[]): DeckAnnexArgs {
  const tableRef = requiredHead(args, "DECK ANNEX");
  if (args[1] !== "as" || !args[2] || args[2].startsWith("--")) {
    fail("DECK ANNEX", "expected <schema.table> as <book/deck>");
  }
  const deckRef = args[2];
  const values: Record<string, string> = {
    "--id": "id",
    "--at": "at",
    "--by": "by",
    "--how": "how",
    "--src": "src",
  };
  const seen = new Set<string>();
  for (let index = 3; index < args.length; index++) {
    const flag = args[index];
    if (!(flag in values)) {
      fail("DECK ANNEX", `unknown option or token ${flag}`);
    }
    if (seen.has(flag)) {
      fail("DECK ANNEX", `${flag} may appear only once`);
    }
    seen.add(flag);
    values[flag] = flagValue(args, ++index, "DECK ANNEX", flag);
  }
  return {
    tableRef,
    deckRef,
    idCol: values["--id"],
    atCol: values["--at"],
    byCol: values["--by"],
    howCol: values["--how"],
    srcCol: values["--src"],
  };
}

export function parseWordAddArgs(args: readonly string[]): WordAddArgs {
  const word = requiredHead(args, "WORD ADD");
  const values = new Map<string, string>();
  let toOne = false;

  for (let index = 1; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--to-one") {
      if (toOne) fail("WORD ADD", "--to-one may appear only once");
      toOne = true;
      continue;
    }
    if (!["--gloss", "--inverse", "--from", "--to"].includes(flag)) {
      fail("WORD ADD", `unknown option or token ${flag}`);
    }
    if (values.has(flag)) fail("WORD ADD", `${flag} may appear only once`);
    values.set(
      flag,
      flagValue(
        args,
        ++index,
        "WORD ADD",
        flag,
        flag === "--gloss" || flag === "--inverse",
      ),
    );
  }

  for (const flag of ["--gloss", "--inverse", "--from", "--to"]) {
    if (!values.has(flag)) fail("WORD ADD", `missing required ${flag}`);
  }
  return {
    word,
    gloss: values.get("--gloss")!,
    inverse: values.get("--inverse")!,
    fromDeck: values.get("--from")!,
    toDeck: values.get("--to")!,
    toOne,
  };
}

export function parseWordRetireArgs(args: readonly string[]): WordRetireArgs {
  const word = requiredHead(args, "WORD RETIRE");
  if (args[1] !== "how") {
    fail("WORD RETIRE", "expected <word> how <claim> [src <locator> ...]");
  }
  const how = plainValue(args[2], "WORD RETIRE", "how");
  if (args.length === 3) return { word, how, src: undefined };
  if (args[3] !== "src" || args.length === 4) {
    fail("WORD RETIRE", "expected src followed by at least one locator");
  }
  return {
    word,
    how,
    src: args.slice(4).map((value, index) =>
      plainValue(value, "WORD RETIRE", `src[${index}]`, true)
    ),
  };
}

function requiredHead(args: readonly string[], command: string): string {
  return plainValue(args[0], command, "first argument");
}

function flagValue(
  args: readonly string[],
  index: number,
  command: string,
  flag: string,
  candidateText = false,
): string {
  const value = args[index];
  if (
    value === undefined ||
    value.startsWith("--") ||
    (candidateText ? !isNonblankText(value) : value.trim() === "")
  ) {
    fail(command, `${flag} requires a non-blank value`);
  }
  return value;
}

function plainValue(
  value: string | undefined,
  command: string,
  label: string,
  candidateText = false,
): string {
  if (
    value === undefined ||
    (candidateText ? !isNonblankText(value) : value.trim() === "")
  ) {
    fail(command, `${label} must be non-blank`);
  }
  return value;
}

function fail(command: string, detail: string): never {
  throw new Error(`${command} OPTIONS: ${detail}`);
}
