import { expect, test } from "bun:test";

import { validateColumnType } from "../src/ddl.js";

test("deck-new type grammar keeps common and qualified PostgreSQL types", () => {
  expect(validateColumnType("TEXT")).toBe("text");
  expect(validateColumnType("numeric(12, 2)")).toBe("numeric(12, 2)");
  expect(validateColumnType("public.price_amount[]")).toBe("public.price_amount[]");
  expect(validateColumnType("timestamp with time zone")).toBe("timestamp with time zone");
});

test("deck-new type grammar rejects SQL syntax and quoted identifiers", () => {
  expect(() => validateColumnType("text); DROP SCHEMA yu CASCADE; --")).toThrow(/BAD COLUMN TYPE/);
  expect(() => validateColumnType('"CustomType"')).toThrow(/BAD COLUMN TYPE/);
  expect(() => validateColumnType("text DEFAULT 'surprise'")).toThrow(/BAD COLUMN TYPE/);
});
