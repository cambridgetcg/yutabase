import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { FRESH_INSTALL_MIGRATIONS } from "../src/install.js";

const sourceRoot = resolve(import.meta.dir, "../../../sql");
const targetRoot = resolve(import.meta.dir, "../dist/sql");

await mkdir(targetRoot, { recursive: true });
for (const filename of FRESH_INSTALL_MIGRATIONS) {
  await copyFile(resolve(sourceRoot, filename), resolve(targetRoot, filename));
}
