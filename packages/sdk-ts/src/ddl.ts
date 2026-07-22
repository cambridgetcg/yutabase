/**
 * Validate the deliberately small type grammar accepted by `deck new`.
 * Direct SQL remains available for advanced PostgreSQL type expressions.
 */
export function validateColumnType(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  const safeType = /^(?:(?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*|double precision|character varying|timestamp (?:with|without) time zone|time (?:with|without) time zone)(?:\(\d+(?:,\s*\d+)?\))?(?:\[\])?$/;
  if (!safeType.test(normalized)) throw new Error(`BAD COLUMN TYPE: ${value}`);
  return normalized;
}
