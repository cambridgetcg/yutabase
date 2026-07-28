import { expect, test } from "bun:test";

import { Yuta } from "../src/client.js";
import {
  CANDIDATE_CAPABILITIES,
  CANDIDATE_REVISION,
  CANDIDATE_VERSION,
} from "../src/install.js";

const CANDIDATE_METADATA = Object.freeze({
  standard: "YUTABASE",
  profile: "postgres",
  version: CANDIDATE_VERSION,
  revision: CANDIDATE_REVISION,
  capabilities: [...CANDIDATE_CAPABILITIES],
});

test("claimant configuration fails clearly for invalid runtime values", async () => {
  expect(
    () =>
      new Yuta({
        connectionString: "postgresql://127.0.0.1:1/not-contacted",
        claimant: null as never,
      }),
  ).toThrow(/non-blank string without NUL/);

  const yuta = new Yuta({
    connectionString: "postgresql://127.0.0.1:1/not-contacted",
  });
  try {
    expect(() => yuta.setClaimant(" \t\n\v\f\r ")).toThrow(/non-blank/);
    expect(() => yuta.setClaimant("agent:test\0hidden")).toThrow(/NUL/);
  } finally {
    await yuta.close();
  }
});

test("candidate binding retries a failed observation and caches success", async () => {
  const yuta = new Yuta({
    connectionString: "postgresql://127.0.0.1:1/not-contacted",
  });
  let checks = 0;
  const harness = yuta as unknown as {
    checkCandidateBinding: () => Promise<void>;
  };
  harness.checkCandidateBinding = async () => {
    checks++;
    if (checks === 1) throw new Error("repairable candidate drift");
  };

  try {
    await expect(yuta.assertCandidateBinding()).rejects.toThrow(
      /repairable candidate drift/,
    );
    await expect(yuta.assertCandidateBinding()).resolves.toBeUndefined();
    await expect(yuta.assertCandidateBinding()).resolves.toBeUndefined();
    expect(checks).toBe(2);
  } finally {
    await yuta.close();
  }
});

test("mapped card reads pin registry resolution through physical execution", async () => {
  const yuta = new Yuta({
    connectionString: "postgresql://127.0.0.1:1/not-contacted",
  });
  const harness = yuta as unknown as {
    sql: unknown;
    assertCandidateBinding: () => Promise<void>;
  };
  const originalSql = harness.sql as { end: () => Promise<void> };
  const statements: string[] = [];
  let beginCount = 0;
  let beginOptions: string | undefined;

  const tx = Object.assign(
    (strings: TemplateStringsArray) => {
      const statement = strings.join("?");
      statements.push(statement);
      if (statement.includes("FROM yu.standard_meta")) {
        return Promise.resolve([{ ...CANDIDATE_METADATA }]);
      }
      if (statement.includes("FROM yu._lock_registry_mapping")) {
        return Promise.resolve([{
          physical_schema: "physical",
          physical_table: "cards",
          id_col: "card_id",
          at_col: "observed_at",
          by_col: "claimant",
          how_col: "claim_kind",
          src_col: "sources",
        }]);
      }
      throw new Error(`unexpected tagged query: ${statement}`);
    },
    {
      unsafe: async (statement: string) => {
        statements.push(statement);
        return [{
          card_id: "01977c2e-0000-7000-8000-000000000001",
          observed_at: "2026-07-28T00:00:00.000Z",
          claimant: "agent:test/session",
          claim_kind: "declared",
          sources: null,
        }];
      },
    },
  );

  harness.sql = {
    begin: async (
      options: string,
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => {
      beginCount++;
      beginOptions = options;
      return callback(tx);
    },
  };
  harness.assertCandidateBinding = async () => {};

  try {
    const card = await yuta.card(
      "logical/cards/01977c2e-0000-7000-8000-000000000001",
    );
    expect(beginCount).toBe(1);
    expect(beginOptions).toBe("isolation level read committed");
    expect(statements[0]).toContain("FROM yu.standard_meta");
    expect(statements[0]).not.toContain("FOR SHARE");
    expect(statements[1]).toContain("FROM yu._lock_registry_mapping");
    expect(statements[1]).not.toContain("FROM yu.registry");
    expect(statements[1]).not.toContain("FOR SHARE");
    expect(statements[2]).toContain('FROM "physical"."cards"');
    expect(card?.id).toBe("01977c2e-0000-7000-8000-000000000001");
    expect(card?.by).toBe("agent:test/session");
  } finally {
    harness.sql = originalSql;
    await yuta.close();
  }
});

test("a missing owner-rights mapping keeps the SDK's UNREGISTERED DECK contract", async () => {
  const yuta = new Yuta({
    connectionString: "postgresql://127.0.0.1:1/not-contacted",
  });
  const harness = yuta as unknown as {
    sql: unknown;
    assertCandidateBinding: () => Promise<void>;
  };
  const originalSql = harness.sql as { end: () => Promise<void> };
  let physicalSqlRan = false;
  const tx = Object.assign(
    (strings: TemplateStringsArray) => {
      const statement = strings.join("?");
      if (statement.includes("FROM yu.standard_meta")) {
        return Promise.resolve([{ ...CANDIDATE_METADATA }]);
      }
      if (statement.includes("FROM yu._lock_registry_mapping")) {
        return Promise.resolve([]);
      }
      throw new Error(`unexpected tagged query: ${statement}`);
    },
    {
      unsafe: async () => {
        physicalSqlRan = true;
        return [];
      },
    },
  );

  harness.sql = {
    begin: async (
      options: string,
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => {
      expect(options).toBe("isolation level read committed");
      return callback(tx);
    },
  };
  harness.assertCandidateBinding = async () => {};

  try {
    await expect(
      yuta.card(
        "logical/missing/01977c2e-0000-7000-8000-000000000001",
      ),
    ).rejects.toThrow(/UNREGISTERED DECK: logical\/missing/);
    expect(physicalSqlRan).toBe(false);
  } finally {
    harness.sql = originalSql;
    await yuta.close();
  }
});

test("traversal enrichment resolves and pins name mappings through the owner-rights helper", async () => {
  const yuta = new Yuta({
    connectionString: "postgresql://127.0.0.1:1/not-contacted",
  });
  const harness = yuta as unknown as {
    sql: unknown;
    assertCandidateBinding: () => Promise<void>;
  };
  const originalSql = harness.sql as { end: () => Promise<void> };
  const statements: string[] = [];
  const uuid = "01977c2e-0000-7000-8000-000000000001";

  const tx = Object.assign(
    (strings: TemplateStringsArray) => {
      const statement = strings.join("?");
      statements.push(statement);
      if (statement.includes("FROM yu.standard_meta")) {
        return Promise.resolve([{ ...CANDIDATE_METADATA }]);
      }
      if (statement.includes("FROM yu._lock_registry_mapping")) {
        return Promise.resolve([{
          physical_schema: "physical",
          physical_table: "cards",
          id_col: "card_id",
        }]);
      }
      if (statement.includes("FROM information_schema.columns")) {
        return Promise.resolve([{ present: 1 }]);
      }
      throw new Error(`unexpected tagged query: ${statement}`);
    },
    {
      unsafe: async (statement: string) => {
        statements.push(statement);
        if (statement.includes("FROM yu.threads")) {
          return [{
            book: "logical",
            deck: "cards",
            id: uuid,
            how: "witnessed",
          }];
        }
        if (statement.includes('FROM "physical"."cards"')) {
          return [{ id: uuid, name: "Pinned card" }];
        }
        throw new Error(`unexpected unsafe query: ${statement}`);
      },
    },
  );

  harness.sql = {
    begin: async (
      options: string,
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => {
      expect(options).toBe("isolation level read committed");
      return callback(tx);
    },
  };
  harness.assertCandidateBinding = async () => {};

  try {
    const rows = await yuta.traverse(
      `logical/cards/${uuid}`,
      "->",
      "contains",
    );
    expect(rows[0]?.name).toBe("Pinned card");
    expect(rows[0]?.ref).toBe(`logical/cards/${uuid}`);
    expect(statements[0]).toContain("FROM yu.standard_meta");
    expect(statements[1]).toContain("FROM yu.threads");
    expect(statements[2]).toContain("FROM yu._lock_registry_mapping");
    expect(statements[2]).not.toContain("FROM yu.registry");
    expect(statements[2]).not.toContain("FOR SHARE");
    expect(statements[3]).toContain("FROM information_schema.columns");
    expect(statements[4]).toContain('FROM "physical"."cards"');
  } finally {
    harness.sql = originalSql;
    await yuta.close();
  }
});

test("all semantic execution paths refresh candidate metadata inside their READ COMMITTED transaction", async () => {
  const yuta = new Yuta({
    connectionString: "postgresql://127.0.0.1:1/not-contacted",
    claimant: "agent:test/session",
  });
  const harness = yuta as unknown as {
    sql: unknown;
    assertCandidateBinding: () => Promise<void>;
  };
  const originalSql = harness.sql as { end: () => Promise<void> };
  const transactions: string[][] = [];
  const uuid = "01977c2e-0000-7000-8000-000000000001";

  harness.sql = {
    begin: async (
      options: string,
      callback: (transaction: unknown) => Promise<unknown>,
    ) => {
      expect(options).toBe("isolation level read committed");
      const statements: string[] = [];
      transactions.push(statements);
      const tx = Object.assign(
        (strings: TemplateStringsArray) => {
          const statement = strings.join("?");
          statements.push(statement);
          if (statement.includes("FROM yu.standard_meta")) {
            return Promise.resolve([{ ...CANDIDATE_METADATA }]);
          }
          if (statement.includes("FROM yu._lock_registry_mapping")) {
            return Promise.resolve([{
              physical_schema: "physical",
              physical_table: "cards",
              id_col: "id",
              at_col: "at",
              by_col: "by",
              how_col: "how",
              src_col: "src",
            }]);
          }
          throw new Error(`unexpected tagged query: ${statement}`);
        },
        {
          unsafe: async (statement: string) => {
            statements.push(statement);
            return [];
          },
        },
      );
      return callback(tx);
    },
  };
  harness.assertCandidateBinding = async () => {};

  try {
    await yuta.card(`logical/cards/${uuid}`);
    await yuta.traverse(`logical/cards/${uuid}`, "->", "contains");
    await yuta.thread(
      `logical/cards/${uuid}`,
      "contains",
      `logical/cards/${uuid}`,
      "witnessed",
    );
    await yuta.sever(uuid, "witnessed");
    await yuta.query(`card logical/cards/${uuid}`);

    expect(transactions).toHaveLength(5);
    for (const statements of transactions) {
      expect(statements[0]).toContain("FROM yu.standard_meta");
      expect(statements[0]).not.toContain("FOR SHARE");
      expect(statements.length).toBeGreaterThanOrEqual(2);
    }
  } finally {
    harness.sql = originalSql;
    await yuta.close();
  }
});

test("semantic execution refuses stale identity, revision, or capability metadata before its SQL", async () => {
  const staleRows = [
    { ...CANDIDATE_METADATA, standard: "OTHER" },
    { ...CANDIDATE_METADATA, profile: "sqlite" },
    { ...CANDIDATE_METADATA, version: "0.1.0-candidate.0" },
    { ...CANDIDATE_METADATA, revision: CANDIDATE_REVISION - 1 },
    {
      ...CANDIDATE_METADATA,
      capabilities: CANDIDATE_METADATA.capabilities.slice(0, -1),
    },
    {
      ...CANDIDATE_METADATA,
      capabilities: [...CANDIDATE_METADATA.capabilities].reverse(),
    },
  ];
  const uuid = "01977c2e-0000-7000-8000-000000000001";

  for (const staleRow of staleRows) {
    const yuta = new Yuta({
      connectionString: "postgresql://127.0.0.1:1/not-contacted",
    });
    const harness = yuta as unknown as {
      sql: unknown;
      assertCandidateBinding: () => Promise<void>;
    };
    const originalSql = harness.sql as { end: () => Promise<void> };
    let semanticSqlRan = false;

    harness.sql = {
      begin: async (
        options: string,
        callback: (transaction: unknown) => Promise<unknown>,
      ) => {
        expect(options).toBe("isolation level read committed");
        const tx = Object.assign(
          (strings: TemplateStringsArray) => {
            expect(strings.join("?")).toContain("FROM yu.standard_meta");
            return Promise.resolve([staleRow]);
          },
          {
            unsafe: async () => {
              semanticSqlRan = true;
              return [];
            },
          },
        );
        return callback(tx);
      },
    };
    harness.assertCandidateBinding = async () => {};

    try {
      await expect(
        yuta.traverse(`logical/cards/${uuid}`, "->", "contains"),
      ).rejects.toThrow(/STALE YUTABASE BINDING/);
      expect(semanticSqlRan).toBe(false);
    } finally {
      harness.sql = originalSql;
      await yuta.close();
    }
  }
});

test("raw SQL escape hatches do not opt into semantic identity freshness checks", async () => {
  const yuta = new Yuta({
    connectionString: "postgresql://127.0.0.1:1/not-contacted",
  });
  const harness = yuta as unknown as { sql: unknown };
  const originalSql = harness.sql as { end: () => Promise<void> };
  const statements: string[] = [];
  const rawSql = Object.assign(
    (strings: TemplateStringsArray) => {
      statements.push(strings.join("?"));
      return Promise.resolve([{ value: 1 }]);
    },
    {
      unsafe: async (statement: string) => {
        statements.push(statement);
        return [{ value: 2 }];
      },
      begin: async () => {
        throw new Error("raw SQL must not enter the semantic transaction path");
      },
    },
  );
  harness.sql = rawSql;

  try {
    await expect(yuta.sqlTag`SELECT ${1} AS value`).resolves.toEqual([
      { value: 1 },
    ]);
    await expect(yuta.exec("SELECT 2 AS value")).resolves.toEqual([
      { value: 2 },
    ]);
    expect(statements).toEqual(["SELECT ? AS value", "SELECT 2 AS value"]);
  } finally {
    harness.sql = originalSql;
    await yuta.close();
  }
});

test("trusted operator transactions use the runtime integrity isolation", async () => {
  const yuta = new Yuta({
    connectionString: "postgresql://127.0.0.1:1/not-contacted",
  });
  const harness = yuta as unknown as { sql: unknown };
  const originalSql = harness.sql as { end: () => Promise<void> };
  const statements: string[] = [];
  let beginOptions: string | undefined;

  harness.sql = {
    begin: async (
      options: string,
      callback: (transaction: {
        unsafe: (statement: string) => Promise<void>;
      }) => Promise<void>,
    ) => {
      beginOptions = options;
      return callback({
        unsafe: async (statement: string) => {
          statements.push(statement);
        },
      });
    },
  };

  try {
    await yuta.execTransaction(["SELECT 1", "SELECT 2"]);
    expect(beginOptions).toBe("isolation level read committed");
    expect(statements).toEqual(["SELECT 1", "SELECT 2"]);
  } finally {
    harness.sql = originalSql;
    await yuta.close();
  }
});
