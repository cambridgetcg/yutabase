/** Quote one YUTABASE/PostgreSQL lower-snake identifier safely. */
export function ident(name: string): string {
  if (!isIdentifier(name)) throw new Error(`BAD IDENTIFIER: "${name}"`);
  return `"${name}"`;
}

export function isIdentifier(name: string): boolean {
  return /^[a-z_][a-z0-9_]*$/.test(name);
}
