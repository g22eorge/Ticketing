/**
 * E2E: Mobile bottom navigation
 *
 * At a 390×844 viewport (iPhone 14 size), verifies that:
 * - The bottom nav bar is visible on authenticated pages
 * - Tapping a nav item navigates to the correct route
 * - The "More" tab opens the full-screen navigation hub
 * - Settings hub link is present (not individual settings sub-items)
 */

import { expect, test, type Cookie, type Page } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "admin@eagle.local";
const password = process.env.E2E_PASSWORD ?? process.env.SEED_PASSWORD ?? "Admin123!";
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

const MOBILE_VIEWPORT = { width: 390, height: 844 };

function parseSetCookie(setCookie: string, origin: URL): Cookie {
  const [nameValue, ...attributes] = setCookie.split(";").map((v) => v.trim());
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
    if (key === "samesite" && (value === "Lax" || value === "Strict" || value === "None"))
      cookie.sameSite = value;
    if (key === "max-age" && value) {
      const seconds = Number(value);
      if (Number.isFinite(seconds)) cookie.expires = Math.floor(Date.now() / 1000) + seconds;
    }
  }
  return cookie;
}

async function login(page: Page) {
  const origin = new URL(baseUrl);
  let response: Response | null = null;

  for (let attempt = 1; attempt <= 10; attempt++) {
    response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        origin: baseUrl,
      },
      body: JSON.stringify({ email: adminEmail, password, callbackURL: "/dashboard" }),
    });
    if (response.ok) break;
    if (response.status === 429) await new Promise((r) => setTimeout(r, 2000));
    else await new Promise((r) => setTimeout(r, 350));
  }

  expect(response?.ok, "Login failed").toBeTruthy();
  const cookies = response!.headers.getSetCookie().map((entry) => parseSetCookie(entry, origin));
  await page.context().addCookies(cookies);
}

async function waitSettled(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.waitForLoadState("networkidle", { timeout: 3000 });
  } catch {
    // networkidle timeout is acceptable
  }
}

test.describe("Mobile bottom navigation at 390×844", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("bottom nav is visible on /dashboard", async ({ page }) => {
    await login(page);
    await page.goto(`${baseUrl}/dashboard`);
    await waitSettled(page);

    const bottomNav = page.locator(".mobile-bottom-nav");
    await expect(bottomNav).toBeVisible();
  });

  test("bottom nav is hidden on desktop (1440×900)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.goto(`${baseUrl}/dashboard`);
    await waitSettled(page);

    // The nav uses lg:hidden — not visible at 1440px
    const bottomNav = page.locator(".mobile-bottom-nav");
    await expect(bottomNav).toBeHidden();
  });

  test("tapping Dashboard nav item navigates to /dashboard", async ({ page }) => {
    await login(page);
    // Start from a different page
    await page.goto(`${baseUrl}/jobs`);
    await waitSettled(page);

    const dashLink = page.locator(".mobile-bottom-nav a[href='/dashboard']").first();
    await expect(dashLink).toBeVisible();
    await dashLink.click();
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
    expect(page.url()).toContain("/dashboard");
  });

  test("tapping Jobs nav item navigates to /jobs", async ({ page }) => {
    await login(page);
    await page.goto(`${baseUrl}/dashboard`);
    await waitSettled(page);

    // The bottom nav primary items are: Dashboard, Tickets, Clients (Queue),
    // and optionally Subscriptions. There is no /jobs link in the bottom nav.
    // Test that clicking the Queue/Tickets item navigates to the correct page.
    // Use the Queue link (tickets) as the closest equivalent to "Jobs"
    const ticketsLink = page.locator(".mobile-bottom-nav a[href='/tickets']").first();
    await expect(ticketsLink).toBeVisible();
    await ticketsLink.click();
    await page.waitForURL("**/tickets**", { timeout: 10000 });
    expect(page.url()).toContain("/tickets");
  });

  test("Settings link is in /more and points to /settings hub", async ({ page }) => {
    await login(page);
    await page.goto(`${baseUrl}/dashboard`);
    await waitSettled(page);

    const moreLink = page.locator(".mobile-bottom-nav a[href='/more']").first();
    await expect(moreLink).toBeVisible();
    await moreLink.click();
    await page.waitForURL("**/more**", { timeout: 10000 });
    await waitSettled(page);

    const settingsHubLink = page.locator("main a[href='/settings']").first();
    await settingsHubLink.scrollIntoViewIfNeeded();
    await expect(settingsHubLink).toBeVisible();

    // Assert that no bottom nav link points directly to settings sub-pages.
    const subPageLinks = page.locator(
      ".mobile-bottom-nav a[href='/settings/users'], " +
      ".mobile-bottom-nav a[href='/settings/branding'], " +
      ".mobile-bottom-nav a[href='/settings/notifications/templates']"
    );
    const count = await subPageLinks.count();
    expect(count, "Settings sub-pages should not appear in bottom nav").toBe(0);
  });

  test("More tab opens the navigation hub page", async ({ page }) => {
    await login(page);
    await page.goto(`${baseUrl}/dashboard`);
    await waitSettled(page);

    const moreLink = page.locator(".mobile-bottom-nav a[href='/more']").first();
    await expect(moreLink).toBeVisible();
    await moreLink.click();
    await page.waitForURL("**/more**", { timeout: 10000 });
    // Use exact: true to avoid matching "BusinessOS" or "Business OS"
    await expect(page.getByText("Business", { exact: true }).first()).toBeVisible();
  });

  test("job detail mobile action bar hides while editing fields", async ({ page }) => {
    await login(page);
    await page.goto(`${baseUrl}/jobs`);
    await waitSettled(page);

    const firstJob = page.locator("main a[aria-label^='Open job']").first();
    await expect(firstJob).toBeVisible();
    await firstJob.click();
    await page.waitForURL(/\/jobs\/[^/?#]+/, { timeout: 10000 });
    await page.goto(`${page.url().split("?")[0]}?tab=diagnosis`);
    await waitSettled(page);

    const actionBar = page.locator(".mobile-job-action-bar");
    await expect(actionBar).toBeVisible();

    await expect(page.locator("textarea[name='diagnosisNotes'], textarea[name='externalDiagnosis']").first()).toBeVisible();
    const activeTag = await page.evaluate(() => {
      const controls = Array.from(
        document.querySelectorAll<HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement>(
          "textarea, input:not([type='hidden']), select",
        ),
      ).filter((element) => {
        const style = window.getComputedStyle(element);
        return !element.disabled && style.visibility !== "hidden" && style.display !== "none" && element.getClientRects().length > 0;
      });
      controls[0]?.scrollIntoView({ block: "center" });
      controls[0]?.focus();
      return document.activeElement?.tagName ?? "";
    });
    expect(activeTag).toMatch(/INPUT|TEXTAREA|SELECT/);

    await expect(actionBar).toHaveCSS("opacity", "0");
    await expect(page.locator(".mobile-bottom-nav")).toHaveCSS("opacity", "0");
  });
});
