import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageRoot = resolve(import.meta.dir, "..");
const temporaryRoot = mkdtempSync(join(tmpdir(), "yutabase-package-"));
const npmEnvironment = { ...process.env };

// `npm publish --dry-run` exports this setting into prepack scripts. The smoke
// test must still create and install a real temporary tarball, otherwise npm's
// inherited dry-run turns the check itself into a no-op.
delete npmEnvironment.npm_config_dry_run;
delete npmEnvironment.NPM_CONFIG_DRY_RUN;

try {
  const packOutput = execFileSync(
    "npm",
    ["pack", "--ignore-scripts", "--pack-destination", temporaryRoot],
    { cwd: packageRoot, encoding: "utf8", env: npmEnvironment },
  );
  const filename = packOutput.trim().split(/\r?\n/).at(-1);
  if (!filename) throw new Error("package smoke: npm pack did not return a filename");

  const consumer = join(temporaryRoot, "consumer");
  mkdirSync(consumer);
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(temporaryRoot, filename)],
    { cwd: consumer, stdio: "pipe", env: npmEnvironment },
  );

  const installed = join(consumer, "node_modules", "yutabase");
  for (const migration of [
    "0001_yu_core.sql",
    "0002_starter_lexicon.sql",
    "0004_candidate_hardening.sql",
  ]) {
    if (!existsSync(join(installed, "dist", "sql", migration))) {
      throw new Error(`package smoke: missing dist/sql/${migration}`);
    }
  }
  if (existsSync(join(installed, "dist", "nen.js"))) {
    throw new Error("package smoke: experimental nen.js escaped into the candidate package");
  }

  const help = execFileSync(
    join(consumer, "node_modules", ".bin", "yuta"),
    ["--help"],
    { cwd: consumer, encoding: "utf8" },
  );
  if (!help.includes("YUTABASE 0.1.0-candidate.1")) {
    throw new Error("package smoke: installed CLI did not report the candidate identity");
  }

  execFileSync(
    "node",
    [
      "--input-type=module",
      "--eval",
      "import { CANDIDATE_VERSION, compile } from 'yutabase'; " +
      "if (CANDIDATE_VERSION !== '0.1.0-candidate.1' || compile('hello').sql !== 'SELECT 1') process.exit(1);",
    ],
    { cwd: consumer, stdio: "pipe" },
  );

  console.log("package smoke: packed SQL assets, Node import, and installed CLI are valid");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
