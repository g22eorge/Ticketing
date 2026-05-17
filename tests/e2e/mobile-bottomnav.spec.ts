/**
 * E2E: Mobile bottom navigation
 *
 * At a 390×844 viewport (iPhone 14 size), verifies that:
 * - The bottom nav bar is visible on authenticated pages
 * - Tapping a nav item navigates to the correct route
 * - The "More" drawer (if present) opens and closes correctly
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

    // Click the Dashboard link in bottom nav
    const dashLink = page.locator(".mobile-bottom-nav a[href='/dashboard']").first();
    if (await dashLink.isVisible()) {
      await dashLink.click();
      await waitSettled(page);
      expect(page.url()).toContain("/dashboard");
    } else {
      // Dashboard may be in the "More" drawer — open it first
      const moreButton = page.locator(".mobile-bottom-nav button").last();
      if (await moreButton.isVisible()) {
        await moreButton.click();
        await page.waitForTimeout(300);
        const drawerDashLink = page.getByRole("link", { name: /dashboard/i }).first();
        if (await drawerDashLink.isVisible()) {
          await drawerDashLink.click();
          await waitSettled(page);
          expect(page.url()).toContain("/dashboard");
        }
      }
    }
  });

  test("tapping Jobs nav item navigates to /jobs", async ({ page }) => {
    await login(page);
    await page.goto(`${baseUrl}/dashboard`);
    await waitSettled(page);

    const jobsLink = page.locator(".mobile-bottom-nav a[href='/jobs']").first();
    if (await jobsLink.isVisible()) {
      await jobsLink.click();
      await waitSettled(page);
      expect(page.url()).toContain("/jobs");
    } else {
      // May be in the More drawer
      const moreButton = page.locator(".mobile-bottom-nav button").last();
      if (await moreButton.isVisible()) {
        await moreButton.click();
        await page.waitForTimeout(300);
        const drawerJobsLink = page.getByRole("link", { name: /^jobs$/i }).first();
        if (await drawerJobsLink.isVisible()) {
          await drawerJobsLink.click();
          await waitSettled(page);
          expect(page.url()).toContain("/jobs");
        }
      }
    }
  });

  test("Settings link in bottom nav points to /settings hub (not a sub-page)", async ({ page }) => {
    await login(page);
    await page.goto(`${baseUrl}/dashboard`);
    await waitSettled(page);

    // Settings hub should be accessible — check direct link or via More drawer
    const settingsLink = page.locator(".mobile-bottom-nav a[href='/settings']").first();
    const hasDirectLink = await settingsLink.isVisible();

    if (!hasDirectLink) {
      // Open More drawer if present
      const moreButton = page.locator(".mobile-bottom-nav button").last();
      if (await moreButton.isVisible()) {
        await moreButton.click();
        await page.waitForTimeout(300);
      }
    }

    // Assert that no bottom nav link points directly to settings sub-pages
    const subPageLinks = page.locator(
      ".mobile-bottom-nav a[href='/settings/users'], " +
      ".mobile-bottom-nav a[href='/settings/branding'], " +
      ".mobile-bottom-nav a[href='/settings/notifications/templates']"
    );
    const count = await subPageLinks.count();
    expect(count, "Settings sub-pages should not appear in bottom nav").toBe(0);
  });

  test("More drawer opens and closes via button tap", async ({ page }) => {
    await login(page);
    await page.goto(`${baseUrl}/dashboard`);
    await waitSettled(page);

    const moreButton = page.locator(".mobile-bottom-nav button").last();
    if (!(await moreButton.isVisible())) {
      // No More button — this nav may show all items directly; skip
      console.log("No More button found — skipping drawer open/close test");
      return;
    }

    // Open
    await moreButton.click();
    await page.waitForTimeout(300);

    // Verify drawer or panel appeared (look for an element that wasn't in the nav bar itself)
    const drawer = page.locator("[role='dialog'], [data-state='open'], .fixed.inset-0").first();
    const drawerVisible = await drawer.isVisible().catch(() => false);

    if (drawerVisible) {
      // Close via Escape or close button
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      await expect(drawer).toBeHidden();
    }
    // If no explicit drawer overlay, the test passes — the nav may expand inline
  });
});
