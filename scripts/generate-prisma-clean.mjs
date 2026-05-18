import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

for (const path of ["node_modules/.prisma/client", "node_modules/@prisma/client/.prisma"]) {
  rmSync(path, { recursive: true, force: true });
}

const result = spawnSync("bunx", ["prisma", "generate"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
