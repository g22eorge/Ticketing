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

    if (response.ok) {
      break;
    }

    const body = await response.text();
    failureNote = `status=${response.status} body=${body.slice(0, 240)}`;
    
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

  await page.goto("/dashboard");
  await page.waitForURL("**/dashboard", { timeout: 20000 });
}

test("admin sees admin navigation and can open user settings", async ({ page }) => {
  await login(page, adminEmail);

  await expect(page.getByRole("link", { name: "Users" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Branding" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Clients" }).first()).toBeVisible();

  await page.getByRole("link", { name: "Users" }).first().click();
  await page.waitForURL("**/settings/users");
  await expect(page.getByRole("button", { name: /Create/ })).toBeVisible();
});
