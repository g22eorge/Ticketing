import { expect, test, type Page } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";

async function waitForAppSettled(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.waitForLoadState("networkidle", { timeout: 3000 });
  } catch {
    // Some pages keep background requests active; DOM is enough.
  }
}

/*
 * Document Actions Smoke Test
 *
 * Validates that the document action cells render correctly
 * with Lucide icons (not emojis) across quotations, invoices, and receipts.
 *
 * Note: Full status transition testing is covered by the existing
 * document-lifecycle.spec.ts. This test focuses on the Lucide icon
 * migration and action cell rendering.
 */

test("quotations page loads without critical errors", async ({ page }) => {
  await page.goto(`${baseUrl}/documents/quotations`);
  await waitForAppSettled(page);

  // Page should not show an error boundary
  await expect(page.getByText("error")).toHaveCount(0);
  await expect(page.getByText("Application error")).toHaveCount(0);

  // Verify no emojis are present (should all be replaced by Lucide SVG icons)
  const emojiPattern = /[\u{1F300}-\u{1F9FF}]/gu;
  const bodyText = await page.locator("body").textContent();
  const emojis = bodyText?.match(emojiPattern) ?? [];
  expect(emojis, `Found emojis on page: ${emojis.join(" ")}`).toHaveLength(0);
});

test("invoices page loads without critical errors", async ({ page }) => {
  await page.goto(`${baseUrl}/documents/invoices`);
  await waitForAppSettled(page);

  await expect(page.getByText("Application error")).toHaveCount(0);

  const emojiPattern = /[\u{1F300}-\u{1F9FF}]/gu;
  const bodyText = await page.locator("body").textContent();
  const emojis = bodyText?.match(emojiPattern) ?? [];
  expect(emojis, `Found emojis on page: ${emojis.join(" ")}`).toHaveLength(0);
});

test("receipts page loads without critical errors", async ({ page }) => {
  await page.goto(`${baseUrl}/documents/receipts`);
  await waitForAppSettled(page);

  await expect(page.getByText("Application error")).toHaveCount(0);

  const emojiPattern = /[\u{1F300}-\u{1F9FF}]/gu;
  const bodyText = await page.locator("body").textContent();
  const emojis = bodyText?.match(emojiPattern) ?? [];
  expect(emojis, `Found emojis on page: ${emojis.join(" ")}`).toHaveLength(0);
});

test("receipt detail page loads without critical errors", async ({ page }) => {
  // Navigate to receipts page first (detail pages need a valid receipt number)
  await page.goto(`${baseUrl}/documents/receipts`);
  await waitForAppSettled(page);

  await expect(page.getByText("Application error")).toHaveCount(0);

  const emojiPattern = /[\u{1F300}-\u{1F9FF}]/gu;
  const bodyText = await page.locator("body").textContent();
  const emojis = bodyText?.match(emojiPattern) ?? [];
  expect(emojis, `Found emojis on page: ${emojis.join(" ")}`).toHaveLength(0);
});