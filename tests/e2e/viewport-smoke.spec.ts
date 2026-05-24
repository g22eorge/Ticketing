import { expect, test, type Cookie, type Page } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "admin@eagle.local";
const password = process.env.E2E_PASSWORD ?? process.env.SEED_PASSWORD ?? "Admin123!";
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

function parseSetCookie(setCookie: string, origin: URL): Cookie {
  const [nameValue, ...attributes] = setCookie.split(";").map((value) => value.trim());
  const [name, ...valueParts] = nameValue.split("=");

  const cookie: Cookie = {
    name,
    value: valueParts.join("="),
    domain: origin.hostname,
    path: "/",
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
  };

  for (const attribute of attributes) {
    const [keyRaw, ...rawValue] = attribute.split("=");
    const key = keyRaw.toLowerCase();
    const value = rawValue.join("=");

    if (key === "path" && value) cookie.path = value;
    if (key === "domain" && value) cookie.domain = value;
    if (key === "httponly") cookie.httpOnly = true;
    if (key === "secure") cookie.secure = true;
    if (key === "samesite" && (value === "Lax" || value === "Strict" || value === "None")) {
      cookie.sameSite = value;
    }
    if (key === "max-age" && value) {
      const seconds = Number(value);
      if (Number.isFinite(seconds)) cookie.expires = Math.floor(Date.now() / 1000) + seconds;
    }
  }

  return cookie;
}

async function login(page: Page, email: string) {
  const origin = new URL(baseUrl);
  let response: Response | null = null;
  let failureNote = "";

  for (let attempt = 1; attempt <= 15; attempt += 1) {
    response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        origin: baseUrl,
      },
      body: JSON.stringify({ email, password, callbackURL: "/dashboard" }),
    });

    if (response.ok) break;
    const body = await response.text();
    failureNote = `status=${response.status} body=${body.slice(0, 180)}`;
    
    if (response.status === 429) {
      // Rate limited - wait longer before retry
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } else {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  expect(response?.ok, failureNote).toBeTruthy();
  const cookies = response!.headers.getSetCookie().map((entry) => parseSetCookie(entry, origin));
  await page.context().addCookies(cookies);
}

async function waitForAppSettled(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.waitForLoadState("networkidle", { timeout: 3000 });
  } catch {
    // Some pages keep background requests active; DOM is enough for overflow checks.
  }
}

const viewports = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 1366 },
] as const;

const paths = [
  // Core
  "/dashboard",
  "/jobs",
  "/jobs/new",
  "/clients",
  "/technicians",
  "/reports",
  // Finance
  "/finance/journal",
  "/finance/accounts",
  "/finance/bank",
  "/finance/expenses",
  "/finance/reports/pl",
  "/finance/reports/balance-sheet",
  "/finance/reports/cash-flow",
  "/finance/reports/aged-receivables",
  // Inventory
  "/inventory",
  "/inventory/stock-counts",
  "/inventory/suppliers",
  "/inventory/purchase-orders",
  "/inventory/purchase-requests",
  // Sales & POS
  "/sales",
  "/pos",
  "/sales/campaigns",
  // Documents
  "/documents/invoices",
  "/documents/quotations",
  "/documents/delivery-notes",
  // Settings
  "/settings/users",
  "/settings/branding",
  "/settings/profile",
  "/technicians/payouts",
] as const;

test("layout has no horizontal overflow across target viewports", async ({ page }) => {
  await login(page, adminEmail);

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const path of paths) {
      await page.goto(path);
      await waitForAppSettled(page);

      const overflowReport = await page.evaluate(() => {
        const offenders: string[] = [];
        const nodes = Array.from(document.querySelectorAll<HTMLElement>("body *"));

        for (const node of nodes) {
          const style = window.getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden") continue;
          if (style.position === "fixed") continue;
          if (node.getClientRects().length === 0) continue;

          const rect = node.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          if (rect.right <= window.innerWidth + 1) continue;

          let allowOverflow = false;
          let current: HTMLElement | null = node;
          while (current) {
            const currentStyle = window.getComputedStyle(current);
            if (
              currentStyle.overflowX === "auto" ||
              currentStyle.overflowX === "scroll" ||
              currentStyle.overflowX === "clip"
            ) {
              allowOverflow = true;
              break;
            }
            current = current.parentElement;
          }

          if (!allowOverflow) {
            if (node.closest("[class*='sm:block']")) {
              continue;
            }
            if (typeof node.className === "string" && node.className.includes("min-w-")) {
              continue;
            }
            const parentTable = node.closest("table");
            if (parentTable && parentTable.className.includes("min-w-")) {
              continue;
            }
            offenders.push(`${node.tagName.toLowerCase()}.${node.className}`.trim());
            if (offenders.length >= 4) break;
          }
        }

        return offenders;
      });

      expect(overflowReport, `${path} overflow at ${viewport.width}x${viewport.height}: ${overflowReport.join(" | ")}`).toEqual([]);
    }

    await page.goto("/clients");
    await waitForAppSettled(page);
    const firstClientLink = page.getByRole("link", { name: "Open" }).first();
    if (await firstClientLink.isVisible()) {
      await firstClientLink.click();
      await waitForAppSettled(page);
      const detailOverflow = await page.evaluate(() => {
        const offenders: string[] = [];
        const nodes = Array.from(document.querySelectorAll<HTMLElement>("body *"));

        for (const node of nodes) {
          const style = window.getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden") continue;
          if (style.position === "fixed") continue;
          if (node.getClientRects().length === 0) continue;

          const rect = node.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          if (rect.right <= window.innerWidth + 1) continue;

          let allowOverflow = false;
          let current: HTMLElement | null = node;
          while (current) {
            const currentStyle = window.getComputedStyle(current);
            if (
              currentStyle.overflowX === "auto" ||
              currentStyle.overflowX === "scroll" ||
              currentStyle.overflowX === "clip"
            ) {
              allowOverflow = true;
              break;
            }
            current = current.parentElement;
          }

          if (!allowOverflow) {
            if (node.closest("[class*='sm:block']")) continue;
            if (typeof node.className === "string" && node.className.includes("min-w-")) continue;
            const parentTable = node.closest("table");
            if (parentTable && parentTable.className.includes("min-w-")) continue;
            offenders.push(`${node.tagName.toLowerCase()}.${node.className}`.trim());
            if (offenders.length >= 4) break;
          }
        }

        return offenders;
      });

      expect(detailOverflow, `/clients/[id] overflow at ${viewport.width}x${viewport.height}: ${detailOverflow.join(" | ")}`).toEqual([]);
    }

    await page.goto("/jobs");
    await waitForAppSettled(page);
    const firstJobLink = page.getByRole("link", { name: "Open" }).first();
    if (await firstJobLink.isVisible()) {
      await firstJobLink.click();
      await waitForAppSettled(page);
      const jobDetailOverflow = await page.evaluate(() => {
        const offenders: string[] = [];
        const nodes = Array.from(document.querySelectorAll<HTMLElement>("body *"));

        for (const node of nodes) {
          const style = window.getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden") continue;
          if (style.position === "fixed") continue;
          if (node.getClientRects().length === 0) continue;

          const rect = node.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          if (rect.right <= window.innerWidth + 1) continue;

          let allowOverflow = false;
          let current: HTMLElement | null = node;
          while (current) {
            const currentStyle = window.getComputedStyle(current);
            if (
              currentStyle.overflowX === "auto" ||
              currentStyle.overflowX === "scroll" ||
              currentStyle.overflowX === "clip"
            ) {
              allowOverflow = true;
              break;
            }
            current = current.parentElement;
          }

          if (!allowOverflow) {
            if (node.closest("[class*='sm:block']")) continue;
            if (typeof node.className === "string" && node.className.includes("min-w-")) continue;
            const parentTable = node.closest("table");
            if (parentTable && parentTable.className.includes("min-w-")) continue;
            offenders.push(`${node.tagName.toLowerCase()}.${node.className}`.trim());
            if (offenders.length >= 4) break;
          }
        }

        return offenders;
      });

      expect(jobDetailOverflow, `/jobs/[id] overflow at ${viewport.width}x${viewport.height}: ${jobDetailOverflow.join(" | ")}`).toEqual([]);
    }
  }
});
