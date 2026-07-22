import { describe, expect, test } from "bun:test";

import {
  CANDIDATE_REVISION,
  CANDIDATE_VERSION,
  CANDIDATE_COLUMNS,
  LEGACY_CORE_COLUMNS,
  hasAnyColumn,
  hasColumnShape,
  planInstall,
  type InstallProbe,
} from "../src/install.js";

const empty: InstallProbe = {
  hasYuSchema: false,
  hasLexicon: false,
  hasLexiconVersions: false,
  hasRegistry: false,
  hasThreads: false,
  hasSeverLog: false,
  hasViaSchema: false,
  hasLegacyIntegrity: false,
  hasPhysicalSchema: false,
  hasPhysicalTable: false,
  hasStandardMeta: false,
  hasLegacyCoreShape: false,
  hasCandidateShape: false,
  hasCandidateObjects: false,
  hasCandidateFootprint: false,
};

describe("candidate install planning", () => {
  test("column probes require every typed field and candidate NOT NULL contract", () => {
    expect(hasColumnShape(LEGACY_CORE_COLUMNS, LEGACY_CORE_COLUMNS)).toBe(true);
    expect(hasColumnShape(LEGACY_CORE_COLUMNS.slice(1), LEGACY_CORE_COLUMNS)).toBe(false);
    expect(hasColumnShape(
      CANDIDATE_COLUMNS.map((column) => ({ ...column, notNull: false })),
      CANDIDATE_COLUMNS,
    )).toBe(false);
    expect(hasColumnShape(
      CANDIDATE_COLUMNS.filter((column) => column.tableName !== "word_versions"),
      CANDIDATE_COLUMNS,
    )).toBe(false);
    expect(CANDIDATE_COLUMNS).toContainEqual({
      tableName: "threads", columnName: "word_version", udtName: "int4", notNull: true,
    });
    expect(hasAnyColumn(
      [...LEGACY_CORE_COLUMNS, CANDIDATE_COLUMNS[0]],
      CANDIDATE_COLUMNS,
    )).toBe(true);
  });

  test("fresh installs apply the complete ordered migration set", () => {
    expect(planInstall(empty)).toEqual({
      mode: "fresh",
      migrations: [
        "0001_yu_core.sql",
        "0002_starter_lexicon.sql",
        "0004_candidate_hardening.sql",
      ],
    });
  });

  test("fresh install refuses an unrelated pre-existing via namespace", () => {
    expect(() => planInstall({ ...empty, hasViaSchema: true })).toThrow(/PARTIAL/);
  });

  test("legacy v0.1 cores apply only candidate hardening", () => {
    expect(planInstall({
      ...empty,
      hasYuSchema: true,
      hasLexicon: true,
      hasLexiconVersions: true,
      hasRegistry: true,
      hasThreads: true,
      hasSeverLog: true,
      hasViaSchema: true,
      hasLegacyIntegrity: true,
      hasLegacyCoreShape: true,
    })).toEqual({ mode: "upgrade", migrations: ["0004_candidate_hardening.sql"] });
  });

  test("legacy upgrades require the complete original auxiliary base", () => {
    const completeLegacy: InstallProbe = {
      ...empty,
      hasYuSchema: true,
      hasLexicon: true,
      hasLexiconVersions: true,
      hasRegistry: true,
      hasThreads: true,
      hasSeverLog: true,
      hasViaSchema: true,
      hasLegacyIntegrity: true,
      hasLegacyCoreShape: true,
    };
    for (const missing of [
      "hasLexiconVersions",
      "hasSeverLog",
      "hasViaSchema",
      "hasLegacyIntegrity",
    ] as const) {
      expect(() => planInstall({ ...completeLegacy, [missing]: false })).toThrow(/PARTIAL/);
    }
  });

  test("the exact candidate identity is already current", () => {
    expect(planInstall({
      ...empty,
      hasYuSchema: true,
      hasLexicon: true,
      hasLexiconVersions: true,
      hasRegistry: true,
      hasThreads: true,
      hasSeverLog: true,
      hasViaSchema: true,
      hasLegacyIntegrity: true,
      hasPhysicalSchema: true,
      hasPhysicalTable: true,
      hasStandardMeta: true,
      hasLegacyCoreShape: true,
      hasCandidateShape: true,
      hasCandidateObjects: true,
      hasCandidateFootprint: true,
      standard: "YUTABASE",
      profile: "postgres",
      version: CANDIDATE_VERSION,
      revision: CANDIDATE_REVISION,
    })).toEqual({ mode: "current", migrations: [] });
  });

  test("partial and unknown/newer identities fail closed", () => {
    expect(() => planInstall({ ...empty, hasYuSchema: true, hasRegistry: true })).toThrow(/PARTIAL/);
    expect(() => planInstall({
      ...empty,
      hasYuSchema: true,
      hasLexicon: true,
      hasRegistry: true,
      hasThreads: true,
    })).toThrow(/PARTIAL/);
    expect(() => planInstall({
      ...empty,
      hasYuSchema: true,
      hasLexicon: true,
      hasLexiconVersions: true,
      hasRegistry: true,
      hasThreads: true,
      hasSeverLog: true,
      hasViaSchema: true,
      hasLegacyIntegrity: true,
      hasLegacyCoreShape: true,
      hasCandidateFootprint: true,
    })).toThrow(/PARTIAL/);
    expect(() => planInstall({
      ...empty,
      hasYuSchema: true,
      hasLexicon: true,
      hasLexiconVersions: true,
      hasRegistry: true,
      hasThreads: true,
      hasSeverLog: true,
      hasViaSchema: true,
      hasLegacyIntegrity: true,
      hasPhysicalSchema: true,
      hasPhysicalTable: true,
      hasStandardMeta: true,
      hasLegacyCoreShape: true,
      hasCandidateShape: true,
      hasCandidateObjects: true,
      hasCandidateFootprint: true,
      standard: "YUTABASE",
      profile: "postgres",
      version: "0.2.0",
      revision: 5,
    })).toThrow(/UNSUPPORTED YUTABASE IDENTITY/);
  });
});
