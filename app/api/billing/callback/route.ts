/**
 * GET /api/billing/callback
 *
 * Flutterwave redirects here after the user completes (or cancels) payment.
 * Query params: status, tx_ref, transaction_id
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTransaction } from "@/lib/flutterwave";
import { OrgPlan } from "@prisma/client";
import { sendPaymentConfirmation } from "@/lib/email";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const transactionId = searchParams.get("transaction_id");

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (status !== "successful" || !transactionId) {
    return NextResponse.redirect(`${base}/settings/billing?payment=cancelled`);
  }

  try {
    const tx = await verifyTransaction(transactionId);

    if (tx.status !== "successful") {
      return NextResponse.redirect(`${base}/settings/billing?payment=failed`);
    }

    const orgId = tx.meta?.orgId;
    const targetPlan = tx.meta?.targetPlan as OrgPlan | undefined;

    if (!orgId || !targetPlan) {
      return NextResponse.redirect(`${base}/settings/billing?payment=failed`);
    }

    const renewsAt = new Date();
    renewsAt.setMonth(renewsAt.getMonth() + 1);

    const updatedOrg = await prisma.organization.update({
      where: { id: orgId },
      data: {
        plan: targetPlan,
        billingStatus: "ACTIVE",
        flwCustomerId: String(tx.customer.email), // use email as stable customer ref
        planRenewsAt: renewsAt,
        planCancelledAt: null,
      },
      select: { name: true },
    });

    // Fire-and-forget payment confirmation email.
    const admin = await prisma.user.findFirst({
      where: { orgId, role: "ADMIN" },
      select: { email: true, name: true },
    });
    if (admin) {
      void sendPaymentConfirmation(
        admin.email,
        admin.name,
        updatedOrg.name,
        targetPlan,
        tx.amount,
      );
    }

    return NextResponse.redirect(`${base}/settings/billing?payment=success`);
  } catch (err) {
    console.error("[billing/callback]", err);
    return NextResponse.redirect(`${base}/settings/billing?payment=failed`);
  }
}
