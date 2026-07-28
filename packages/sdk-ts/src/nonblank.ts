/**
 * Mirror `yu._nonblank_text(text)` for values that cross into PostgreSQL.
 *
 * The candidate's portable blank set is exactly ASCII TAB, LF, VT, FF, CR,
 * and SPACE. PostgreSQL text cannot contain NUL; JavaScript can, so reject it
 * before the driver sees it.
 */
export function isNonblankText(value: unknown): value is string {
  return typeof value === "string" &&
    !value.includes("\0") &&
    /[^\u0009-\u000D\u0020]/u.test(value);
}
