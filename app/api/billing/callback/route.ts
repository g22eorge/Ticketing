/**
 * GET /api/billing/callback
 *
 * Pesapal redirects here after the user completes (or abandons) payment.
 * Query params: OrderTrackingId, OrderMerchantReference, OrderNotificationType
 *
 * The IPN handler (/api/webhooks/pesapal) is the reliable server-to-server
 * confirmation. This callback is just for the user-facing redirect.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTransactionStatus, parseMerchantRef, PLAN_PRICES, CURRENCY } from "@/lib/pesapal";
import { OrgPlan } from "@prisma/client";
import { sendPaymentConfirmation } from "@/lib/email";

function addOneMonth(from: Date) {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const orderTrackingId = searchParams.get("OrderTrackingId");
  const merchantReference = searchParams.get("OrderMerchantReference");
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!orderTrackingId || !merchantReference) {
    return NextResponse.redirect(`${base}/settings/billing?payment=cancelled`);
  }

  try {
    const tx = await getTransactionStatus(orderTrackingId);

    if (tx.payment_status_description !== "Completed") {
      return NextResponse.redirect(`${base}/settings/billing?payment=failed`);
    }

    // Prevent forged merchantReference activating other orgs.
    if (tx.merchant_reference !== merchantReference) {
      return NextResponse.redirect(`${base}/settings/billing?payment=failed`);
    }

    const parsed = parseMerchantRef(merchantReference);
    if (!parsed) return NextResponse.redirect(`${base}/settings/billing?payment=failed`);
    const { orgId, plan } = parsed;

    // Ensure the paid amount matches the intended plan.
    const expectedAmount = PLAN_PRICES[plan];
    if (tx.currency !== CURRENCY || typeof expectedAmount !== "number" || tx.amount !== expectedAmount) {
      return NextResponse.redirect(`${base}/settings/billing?payment=failed`);
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, planRenewsAt: true },
    });
    if (!org) return NextResponse.redirect(`${base}/settings/billing?payment=failed`);

    const baseDate = org.planRenewsAt && org.planRenewsAt > new Date() ? org.planRenewsAt : new Date();
    const renewsAt = addOneMonth(baseDate);

    const updatedOrg = await prisma.organization.update({
      where: { id: orgId },
      data: {
        plan: plan as OrgPlan,
        billingStatus: "ACTIVE",
        planRenewsAt: renewsAt,
        planCancelledAt: null,
        flwSubscriptionId: orderTrackingId,
      },
      select: { name: true },
    });

    const admin = await prisma.user.findFirst({
      where: { orgId, role: "ADMIN" },
      select: { email: true, name: true },
    });
    if (admin) {
      void sendPaymentConfirmation(admin.email, admin.name, updatedOrg.name, plan as OrgPlan, tx.amount);
    }

    return NextResponse.redirect(`${base}/settings/billing?payment=success`);
  } catch (err) {
    console.error("[billing/callback]", err);
    return NextResponse.redirect(`${base}/settings/billing?payment=failed`);
  }
}
