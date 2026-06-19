// uuidv7.test.ts — test UUIDv7 generation
import { test, expect } from "bun:test";
import { uuidv7, uuidv7Timestamp } from "../src/uuidv7.js";

test("uuidv7 generates valid UUID format", () => {
  const id = uuidv7();
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("uuidv7 version nibble is 7", () => {
  const id = uuidv7();
  expect(id[14]).toBe("7");
});

test("uuidv7 variant bits are correct", () => {
  const id = uuidv7();
  const variantNibble = id[19];
  expect(["8", "9", "a", "b"]).toContain(variantNibble);
});

test("uuidv7 is time-sortable", () => {
  const ts = Date.now();
  const id1 = uuidv7(ts);
  const id2 = uuidv7(ts + 1000);
  expect(id1 < id2).toBe(true);
});

test("uuidv7Timestamp extracts the time", () => {
  const ts = Date.now();
  const id = uuidv7(ts);
  const extracted = uuidv7Timestamp(id);
  expect(extracted).toBe(ts);
});

test("uuidv7Timestamp returns null for non-v7", () => {
  const extracted = uuidv7Timestamp("01977c2e-0000-4000-8000-000000000001");
  expect(extracted).toBeNull();
});