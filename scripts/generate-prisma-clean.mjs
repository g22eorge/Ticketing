import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const paths = ["node_modules/.prisma/client", "node_modules/@prisma/client/.prisma"];
if (process.env.CLEAR_NEXT_CACHE === "1") {
  paths.unshift(".next");
}

for (const path of paths) {
  rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

const result = spawnSync("bunx", ["prisma", "generate"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
