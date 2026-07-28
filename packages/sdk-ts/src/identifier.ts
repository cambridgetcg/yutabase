/** Quote one YUTABASE/PostgreSQL lower-snake identifier safely. */
export function ident(name: string): string {
  if (!isIdentifier(name)) throw new Error(`BAD IDENTIFIER: "${name}"`);
  return `"${name}"`;
}

export function isIdentifier(name: string): boolean {
  // The accepted alphabet is ASCII, so character and UTF-8 byte counts match.
  // Refuse names PostgreSQL would silently truncate at NAMEDATALEN (64).
  return name.length <= 63 && isLogicalIdentifier(name);
}

export function isLogicalIdentifier(name: string): boolean {
  return /^[a-z_][a-z0-9_]*$/.test(name);
}

/** Keep the five canonical card/claim fields on distinct physical columns. */
export function assertDistinctMappedColumns(columns: readonly string[]): void {
  const seen = new Set<string>();
  const duplicate = columns.find((column) => {
    if (seen.has(column)) return true;
    seen.add(column);
    return false;
  });
  if (duplicate !== undefined) {
    throw new Error(
      `DUPLICATE MAPPED COLUMN: "${duplicate}" cannot represent more than one of id/at/by/how/src`,
    );
  }
}
