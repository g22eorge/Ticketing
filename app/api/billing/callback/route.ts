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
import { getTransactionStatus, parseMerchantRef } from "@/lib/pesapal";
import { OrgPlan } from "@prisma/client";
import { sendPaymentConfirmation } from "@/lib/email";

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

    const parsed = parseMerchantRef(merchantReference);
    if (!parsed) return NextResponse.redirect(`${base}/settings/billing?payment=failed`);
    const { orgId, plan } = parsed;

    const renewsAt = new Date();
    renewsAt.setMonth(renewsAt.getMonth() + 1);

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
