/**
 * POST /api/webhooks/flutterwave
 *
 * Handles recurring billing events from Flutterwave:
 *   - charge.completed  → renew plan, extend planRenewsAt
 *   - subscription.cancelled → set billingStatus CANCELLED
 *
 * Configure this URL in the Flutterwave dashboard under Webhooks.
 * Set FLW_WEBHOOK_SECRET to the same secret you set in the dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/flutterwave";
import { OrgPlan } from "@prisma/client";
import { sendPaymentFailedAlert } from "@/lib/email";
import { recordBillingEvent } from "@/lib/billing-events";

type FlwWebhookPayload = {
  event: string;
  data: {
    id: number;
    tx_ref: string;
    status: string;
    amount: number;
    currency: string;
    payment_plan?: number;
    customer: { email: string };
    meta?: Record<string, string>;
  };
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("verif-hash") ?? "";

  if (!(await verifyWebhookSignature(rawBody, signature))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: FlwWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as FlwWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event, data } = payload;

  try {
    if (event === "charge.completed" && data.status === "successful") {
      // Extract orgId from tx_ref: "rmgr-{orgId}-{uuid}"
      const orgId = data.meta?.orgId ?? extractOrgFromTxRef(data.tx_ref);
      const targetPlan = data.meta?.targetPlan as OrgPlan | undefined;

      if (!orgId) {
        return NextResponse.json({ received: true });
      }

      const renewsAt = new Date();
      renewsAt.setMonth(renewsAt.getMonth() + 1);

      await prisma.organization.update({
        where: { id: orgId },
        data: {
          ...(targetPlan ? { plan: targetPlan } : {}),
          billingStatus: "ACTIVE",
          planRenewsAt: renewsAt,
          flwSubscriptionId: data.payment_plan ? String(data.payment_plan) : undefined,
        },
      });

      void recordBillingEvent({
        orgId,
        event: "charge.completed",
        amount: data.amount,
        currency: data.currency,
        status: "successful",
        flwTxId: String(data.id),
        txRef: data.tx_ref,
        plan: targetPlan ?? null,
      });
    }

    if (event === "charge.completed" && data.status !== "successful") {
      // Payment failed — notify the org admin.
      const orgId = data.meta?.orgId ?? extractOrgFromTxRef(data.tx_ref);
      if (orgId) {
        void recordBillingEvent({
          orgId,
          event: "charge.completed",
          amount: data.amount,
          currency: data.currency,
          status: data.status,
          flwTxId: String(data.id),
          txRef: data.tx_ref,
        });
        const org = await prisma.organization.findUnique({
          where: { id: orgId },
          select: { name: true },
        });
        const admin = await prisma.user.findFirst({
          where: { orgId, role: "ADMIN" },
          select: { email: true, name: true },
        });
        if (org && admin) {
          void sendPaymentFailedAlert(admin.email, admin.name, org.name);
        }
      }
    }

    if (event === "subscription.cancelled") {
      const orgId = data.meta?.orgId ?? extractOrgFromTxRef(data.tx_ref);
      if (orgId) {
        await prisma.organization.update({
          where: { id: orgId },
          data: { billingStatus: "CANCELLED", planCancelledAt: new Date() },
        });
        void recordBillingEvent({
          orgId,
          event: "subscription.cancelled",
          amount: 0,
          currency: data.currency,
          status: "cancelled",
          flwTxId: String(data.id),
          txRef: data.tx_ref,
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[webhook/flutterwave]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function extractOrgFromTxRef(txRef: string): string | null {
  // Format: rmgr-{orgId}-{uuid}
  const match = txRef.match(/^rmgr-([^-]+(?:-[^-]+)*)-[0-9a-f-]{36}$/);
  return match?.[1] ?? null;
}
