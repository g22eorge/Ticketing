/**
 * pesapal.ts — Pesapal v3 API wrapper
 * Docs: https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/api-reference
 *
 * Set PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET in .env.local
 * Set PESAPAL_ENV=production for live payments (default: sandbox)
 */

import { getPesapalConsumerKey, getPesapalConsumerSecret } from "@/lib/platform-settings";

export const PESAPAL_BASE =
  process.env.PESAPAL_ENV === "production"
    ? "https://pay.pesapal.com/v3"
    : "https://cybqa.pesapal.com/pesapalv3";

// ── Plan prices (UGX) ─────────────────────────────────────────────────────────

export const PLAN_PRICES: Record<string, number> = {
  STARTER:       35_000,
  PROFESSIONAL:  75_000,
  ENTERPRISE:   120_000,
};

export const CURRENCY = "UGX";

// ── Auth token (module-level cache, 4-min TTL) ────────────────────────────────

let tokenCache: { token: string; expiresAt: number } | null = null;

export async function getAuthToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const consumerKey = await getPesapalConsumerKey();
  const consumerSecret = await getPesapalConsumerSecret();
  if (!consumerKey || !consumerSecret) throw new Error("Pesapal credentials not configured");

  const res = await fetch(`${PESAPAL_BASE}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ consumer_key: consumerKey, consumer_secret: consumerSecret }),
  });

  const json = (await res.json()) as { token?: string; error?: { message: string } };
  if (!res.ok || !json.token) throw new Error(json.error?.message ?? `Pesapal auth failed: ${res.status}`);

  tokenCache = { token: json.token, expiresAt: Date.now() + 4 * 60 * 1000 };
  return json.token;
}

async function pesapalFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  const res = await fetch(`${PESAPAL_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error(`Pesapal non-JSON response: ${text.slice(0, 200)}`); }

  const j = json as Record<string, unknown>;
  if (!res.ok) throw new Error((j?.error as Record<string, unknown>)?.message as string ?? j?.message as string ?? `Pesapal error: ${res.status}`);
  return json as T;
}

// ── IPN registration ──────────────────────────────────────────────────────────

type IpnEntry = { ipn_id: string; url: string; status: string };

export async function registerIpn(ipnUrl: string): Promise<string> {
  const result = await pesapalFetch<IpnEntry>("/api/URLSetup/RegisterIPN", {
    method: "POST",
    body: JSON.stringify({ url: ipnUrl, ipn_notification_type: "GET" }),
  });
  return result.ipn_id;
}

export async function getRegisteredIpns(): Promise<IpnEntry[]> {
  return pesapalFetch<IpnEntry[]>("/api/URLSetup/GetIpnList");
}

/** Get the stored IPN ID, or auto-register one if not yet stored. */
export async function getOrCreateIpnId(): Promise<string> {
  const { getPlatformSetting, setPlatformSetting } = await import("@/lib/platform-settings");
  const stored = await getPlatformSetting("PESAPAL_IPN_ID");
  if (stored) return stored;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const ipnId = await registerIpn(`${baseUrl}/api/webhooks/pesapal`);
  await setPlatformSetting("PESAPAL_IPN_ID", ipnId);
  return ipnId;
}

// ── Submit order (initiate payment) ──────────────────────────────────────────

type SubmitOrderParams = {
  merchantReference: string;
  amount: number;
  currency: string;
  description: string;
  callbackUrl: string;
  ipnId: string;
  email: string;
  name: string;
};

export type SubmitOrderResult = {
  order_tracking_id: string;
  merchant_reference: string;
  redirect_url: string;
  status: string;
};

export async function submitOrder(params: SubmitOrderParams): Promise<SubmitOrderResult> {
  const nameParts = params.name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? params.name;
  const lastName = nameParts.slice(1).join(" ") || firstName;

  return pesapalFetch<SubmitOrderResult>("/api/Transactions/SubmitOrderRequest", {
    method: "POST",
    body: JSON.stringify({
      id: params.merchantReference,
      currency: params.currency,
      amount: params.amount,
      description: params.description,
      callback_url: params.callbackUrl,
      notification_id: params.ipnId,
      billing_address: {
        email_address: params.email,
        first_name: firstName,
        last_name: lastName,
      },
    }),
  });
}

// ── Transaction status ────────────────────────────────────────────────────────

export type PesapalTxStatus = {
  payment_method: string;
  amount: number;
  created_date: string;
  confirmation_code: string;
  payment_status_description: "Completed" | "Failed" | "Reversed" | "Pending" | "Invalid";
  merchant_reference: string;
  payment_status_code: string;
  currency: string;
  error: { error_type: string | null; code: string | null; message: string | null };
};

export async function getTransactionStatus(orderTrackingId: string): Promise<PesapalTxStatus> {
  return pesapalFetch<PesapalTxStatus>(
    `/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
  );
}

// ── Merchant reference encoding ───────────────────────────────────────────────

const PLAN_CODE: Record<string, string> = { STARTER: "S", PROFESSIONAL: "P", ENTERPRISE: "E" };
const PLAN_FROM_CODE: Record<string, string> = { S: "STARTER", P: "PROFESSIONAL", E: "ENTERPRISE" };

/** Build a unique merchant reference encoding orgId and plan. Max ~35 chars. */
export function buildMerchantRef(orgId: string, plan: "STARTER" | "PROFESSIONAL" | "ENTERPRISE"): string {
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `${orgId}-${rand}-${PLAN_CODE[plan]}`;
}

/** Parse orgId and plan from a merchant reference built with buildMerchantRef. */
export function parseMerchantRef(ref: string): { orgId: string; plan: "STARTER" | "PROFESSIONAL" | "ENTERPRISE" } | null {
  const parts = ref.split("-");
  if (parts.length < 3) return null;
  const planCode = parts[parts.length - 1];
  const plan = PLAN_FROM_CODE[planCode] as "STARTER" | "PROFESSIONAL" | "ENTERPRISE" | undefined;
  if (!plan) return null;
  const orgId = parts.slice(0, parts.length - 2).join("-");
  return orgId ? { orgId, plan } : null;
}
