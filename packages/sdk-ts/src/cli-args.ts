export interface ParsedCliArgs {
  conn: string | undefined;
  by: string | undefined;
  positional: string[];
}

/** Render a connection target without emitting any credential-bearing field. */
export function redactConnectionUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username) parsed.username = "***";
    if (parsed.password) parsed.password = "***";
    // Query parameters are provider-defined and may carry credentials under
    // arbitrary names, so the printable form drops all of them and fragments.
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "<unparseable connection string>";
  }
}

/**
 * Parse global CLI flags without stealing `deck annex --by <column>`.
 * A global claimant for annex must appear before `deck annex`.
 */
export function parseCliArgs(raw: readonly string[]): ParsedCliArgs {
  let conn: string | undefined;
  let by: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const token = raw[i];
    if (token === "--conn") {
      conn = requireFlagValue(raw, ++i, "--conn");
      continue;
    }
    if (token === "--by") {
      const value = requireFlagValue(raw, ++i, "--by");
      if (positional[0] === "deck" && positional[1] === "annex") {
        positional.push(token, value);
      } else {
        by = value;
      }
      continue;
    }
    positional.push(token);
  }

  return { conn, by, positional };
}

function requireFlagValue(raw: readonly string[], index: number, flag: string): string {
  const value = raw[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`MISSING VALUE: ${flag} requires a value`);
  }
  return value;
}
