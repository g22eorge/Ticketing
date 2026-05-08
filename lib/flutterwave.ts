/**
 * flutterwave.ts
 *
 * Thin wrapper around the Flutterwave v3 API.
 * Set FLW_SECRET_KEY in .env.local (never expose client-side).
 *
 * Docs: https://developer.flutterwave.com/docs
 */

import { getFlwSecretKey } from "@/lib/platform-settings";

const FLW_BASE = "https://api.flutterwave.com/v3";

async function secretKey(): Promise<string> {
  const key = await getFlwSecretKey();
  if (!key) throw new Error("FLW_SECRET_KEY is not configured");
  return key;
}

async function flwFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${FLW_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await secretKey()}`,
      ...options.headers,
    },
  });

  const json = (await res.json()) as { status: string; message?: string; data: T };

  if (!res.ok || json.status !== "success") {
    throw new Error(json.message ?? `Flutterwave error: ${res.status}`);
  }

  return json.data;
}

// ── Plan prices (UGX) ─────────────────────────────────────────────────────────

export const FLW_PLAN_PRICES: Record<string, number> = {
  GROWTH:     95_000,
  ENTERPRISE: 180_000,
};

export const FLW_CURRENCY = "UGX";

// ── Payment plan (subscription) ───────────────────────────────────────────────

export type FlwPaymentPlan = {
  id: number;
  name: string;
  amount: number;
  interval: string;
  currency: string;
  status: string;
};

/** Get or create a Flutterwave payment plan for a given app plan tier. */
export async function getOrCreatePaymentPlan(
  planName: "GROWTH" | "ENTERPRISE",
): Promise<FlwPaymentPlan> {
  const amount = FLW_PLAN_PRICES[planName];
  const name = `Repair Manager ${planName}`;

  // Check if plan already exists (by listing plans and matching name).
  const plans = await flwFetch<FlwPaymentPlan[]>("/payment-plans?status=active");
  const existing = plans.find((p) => p.name === name && p.currency === FLW_CURRENCY);
  if (existing) return existing;

  // Create it.
  return flwFetch<FlwPaymentPlan>("/payment-plans", {
    method: "POST",
    body: JSON.stringify({
      amount,
      name,
      interval: "monthly",
      currency: FLW_CURRENCY,
    }),
  });
}

// ── Hosted payment link ───────────────────────────────────────────────────────

export type FlwPaymentInitResponse = {
  link: string;
};

type InitPaymentParams = {
  txRef: string;          // unique reference for this transaction
  amount: number;
  email: string;
  name: string;
  phone?: string;
  planId: number;         // FLW payment plan ID for recurring billing
  redirectUrl: string;    // where FLW sends the user after payment
  meta?: Record<string, string>;
};

/** Generate a hosted payment page URL. Redirect the user to this link. */
export async function initializePayment(params: InitPaymentParams): Promise<string> {
  const data = await flwFetch<FlwPaymentInitResponse>("/payments", {
    method: "POST",
    body: JSON.stringify({
      tx_ref: params.txRef,
      amount: params.amount,
      currency: FLW_CURRENCY,
      redirect_url: params.redirectUrl,
      customer: {
        email: params.email,
        name: params.name,
        phonenumber: params.phone,
      },
      payment_plan: params.planId,
      payment_options: "mobilemoney,card",
      customizations: {
        title: "Repair Manager",
        description: "Monthly subscription",
        logo: process.env.NEXT_PUBLIC_APP_URL
          ? `${process.env.NEXT_PUBLIC_APP_URL}/logo.png`
          : undefined,
      },
      meta: params.meta,
    }),
  });

  return data.link;
}

// ── Verify a completed transaction ───────────────────────────────────────────

export type FlwTransaction = {
  id: number;
  tx_ref: string;
  flw_ref: string;
  amount: number;
  currency: string;
  status: string;         // "successful" | "failed"
  payment_plan?: number;  // plan ID if subscription
  customer: { email: string; name: string };
  meta?: Record<string, string>;
};

export async function verifyTransaction(transactionId: string): Promise<FlwTransaction> {
  return flwFetch<FlwTransaction>(`/transactions/${transactionId}/verify`);
}

// ── Webhook signature verification ───────────────────────────────────────────

import { createHmac } from "crypto";

export async function verifyWebhookSignature(payload: string, signature: string): Promise<boolean> {
  const { getFlwWebhookSecret } = await import("@/lib/platform-settings");
  const secret = await getFlwWebhookSecret();
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  return expected === signature;
}

// ── Cancel a subscription ─────────────────────────────────────────────────────

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await flwFetch(`/subscriptions/${subscriptionId}/cancel`, { method: "PUT" });
}
