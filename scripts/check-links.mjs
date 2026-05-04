#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const appDir = path.join(root, "app");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".next" || entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }
      files.push(...(await walk(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function normalizeRouteFromPage(filePath) {
  const relative = filePath.replace(appDir, "").replace(/\\/g, "/");
  const withoutPage = relative.replace(/\/page\.tsx$/, "");
  const withoutGroups = withoutPage.replace(/\/\([^/]+\)/g, "");
  return withoutGroups === "" ? "/" : withoutGroups;
}

function toMatcher(routePattern) {
  const escaped = routePattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\[\.\.\.[^\]]+\]/g, ".+")
    .replace(/\[[^\]]+\]/g, "[^/]+");
  return new RegExp(`^${escaped}$`);
}

const pageFiles = (await walk(appDir)).filter((file) => file.endsWith("/page.tsx"));
const routes = pageFiles.map(normalizeRouteFromPage);
const matchers = routes.map((route) => ({ route, regex: toMatcher(route) }));

const tsxFiles = (await walk(root)).filter(
  (file) => file.endsWith(".tsx") && !file.includes("/.next/") && !file.includes("/node_modules/"),
);

const hrefRegex = /href\s*=\s*"(\/[^"#?]*)"/g;
const broken = [];

for (const file of tsxFiles) {
  const content = await readFile(file, "utf8");
  for (const match of content.matchAll(hrefRegex)) {
    const href = match[1];
    const ok = matchers.some((m) => m.regex.test(href));
    if (!ok) {
      broken.push({ file: path.relative(root, file), href });
    }
  }
}

if (broken.length === 0) {
  console.log("OK: no broken static internal href links found.");
  process.exit(0);
}

console.log("Broken internal links found:");
for (const item of broken) {
  console.log(`- ${item.href} in ${item.file}`);
}
process.exit(1);
