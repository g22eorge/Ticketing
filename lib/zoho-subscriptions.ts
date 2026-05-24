/**
 * zoho-subscriptions.ts — Zoho Subscriptions API wrapper
 * Docs: https://www.zoho.com/subscriptions/api/v1/
 *
 * Required credentials (stored in PlatformSetting or env vars):
 *   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID
 *   ZOHO_REGION  (US | EU | IN | AU | JP — default: US)
 *
 * Plan code mappings (stored in PlatformSetting):
 *   ZOHO_PLAN_CODE_STARTER, ZOHO_PLAN_CODE_PROFESSIONAL, ZOHO_PLAN_CODE_ENTERPRISE
 */

import { getPlatformSetting, setPlatformSetting } from "@/lib/platform-settings";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ZohoPlan = {
  plan_code: string;
  name: string;
  recurring_price: number;
  currency_code: string;
  interval: number;
  interval_unit: string;
  status: string;
};

// ── Region hosts ──────────────────────────────────────────────────────────────

const REGION_HOSTS: Record<string, { accounts: string; api: string }> = {
  US: { accounts: "https://accounts.zoho.com",    api: "https://www.zohoapis.com" },
  EU: { accounts: "https://accounts.zoho.eu",     api: "https://www.zohoapis.eu" },
  IN: { accounts: "https://accounts.zoho.in",     api: "https://www.zohoapis.in" },
  AU: { accounts: "https://accounts.zoho.com.au", api: "https://www.zohoapis.com.au" },
  JP: { accounts: "https://accounts.zoho.jp",     api: "https://www.zohoapis.jp" },
};

async function getHosts(): Promise<{ accounts: string; api: string }> {
  const region = (await getPlatformSetting("ZOHO_REGION")) ?? process.env.ZOHO_REGION ?? "US";
  return REGION_HOSTS[region.toUpperCase()] ?? REGION_HOSTS.US;
}

// ── OAuth2 token (module-level cache, ~55-min TTL) ────────────────────────────

let tokenCache: { token: string; expiresAt: number } | null = null;

export async function getZohoAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const [clientId, clientSecret, refreshToken] = await Promise.all([
    getPlatformSetting("ZOHO_CLIENT_ID").then(v => v ?? process.env.ZOHO_CLIENT_ID ?? ""),
    getPlatformSetting("ZOHO_CLIENT_SECRET").then(v => v ?? process.env.ZOHO_CLIENT_SECRET ?? ""),
    getPlatformSetting("ZOHO_REFRESH_TOKEN").then(v => v ?? process.env.ZOHO_REFRESH_TOKEN ?? ""),
  ]);

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Zoho credentials not configured — set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN in Platform Settings.",
    );
  }

  const { accounts } = await getHosts();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(`${accounts}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error ?? `Zoho OAuth failed (${res.status})`);
  }

  // Cache with a 1-minute buffer before real expiry
  const ttl = ((json.expires_in ?? 3600) - 60) * 1000;
  tokenCache = { token: json.access_token, expiresAt: Date.now() + ttl };
  return json.access_token;
}

// ── Plans API ─────────────────────────────────────────────────────────────────

export async function getZohoPlans(): Promise<ZohoPlan[]> {
  const orgId = (await getPlatformSetting("ZOHO_ORG_ID")) ?? process.env.ZOHO_ORG_ID ?? "";
  if (!orgId) throw new Error("ZOHO_ORG_ID not configured in Platform Settings.");

  const [token, { api }] = await Promise.all([getZohoAccessToken(), getHosts()]);

  const res = await fetch(
    `${api}/billing/v1/plans?organization_id=${encodeURIComponent(orgId)}`,
    {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "X-com-zoho-subscriptions-organizationid": orgId,
        Accept: "application/json",
      },
    },
  );

  const json = (await res.json()) as { plans?: ZohoPlan[]; message?: string; code?: number };
  if (!res.ok) throw new Error(json.message ?? `Zoho plans fetch failed (${res.status})`);
  return json.plans ?? [];
}

// ── Sync plan prices ──────────────────────────────────────────────────────────

/**
 * Fetches prices from Zoho, maps them via stored plan code mappings,
 * and persists to PlatformSetting (PLAN_PRICE_STARTER, etc.).
 *
 * Returns a map of { STARTER: price, PROFESSIONAL: price, ENTERPRISE: price }
 * for the plans that were successfully resolved.
 */
export async function syncPlanPricesFromZoho(): Promise<Record<string, number>> {
  const plans = await getZohoPlans();
  const lookup = new Map(plans.map(p => [p.plan_code, p]));

  const APP_PLANS = ["STARTER", "PROFESSIONAL", "ENTERPRISE"] as const;

  const results: Record<string, number> = {};

  await Promise.all(
    APP_PLANS.map(async (appPlan) => {
      const zohoCode = await getPlatformSetting(`ZOHO_PLAN_CODE_${appPlan}`);
      if (!zohoCode) return; // not mapped — skip

      const zohoplan = lookup.get(zohoCode);
      if (!zohoplan) return; // plan code not found in Zoho

      const price = Math.max(0, zohoplan.recurring_price - 10_000);
      if (price > 0) {
        await setPlatformSetting(`PLAN_PRICE_${appPlan}`, String(price));
        results[appPlan] = price;
      }
    }),
  );

  return results;
}
