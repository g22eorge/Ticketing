/**
 * GET /api/webhooks/pesapal
 *
 * Pesapal IPN (Instant Payment Notification) handler.
 * Pesapal sends a GET request with OrderTrackingId, OrderMerchantReference,
 * and OrderNotificationType when a payment status changes.
 *
 * Must respond with the Pesapal acknowledgment JSON and HTTP 200.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTransactionStatus, parseMerchantRef } from "@/lib/pesapal";
import { OrgPlan } from "@prisma/client";
import { recordBillingEvent } from "@/lib/billing-events";
import { sendPaymentConfirmation, sendPaymentFailedAlert } from "@/lib/email";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const orderTrackingId = searchParams.get("OrderTrackingId") ?? "";
  const merchantReference = searchParams.get("OrderMerchantReference") ?? "";
  const notificationType = searchParams.get("OrderNotificationType") ?? "";

  // Pesapal requires this exact acknowledgment format.
  const ack = {
    orderNotificationType: notificationType,
    orderTrackingId,
    orderMerchantReference: merchantReference,
    status: "200",
  };

  if (!orderTrackingId || !merchantReference) {
    return NextResponse.json(ack);
  }

  try {
    const tx = await getTransactionStatus(orderTrackingId);
    const parsed = parseMerchantRef(merchantReference);

    if (!parsed) return NextResponse.json(ack);
    const { orgId, plan } = parsed;

    if (tx.payment_status_description === "Completed") {
      const renewsAt = new Date();
      renewsAt.setMonth(renewsAt.getMonth() + 1);

      await prisma.organization.update({
        where: { id: orgId },
        data: {
          plan: plan as OrgPlan,
          billingStatus: "ACTIVE",
          planRenewsAt: renewsAt,
          planCancelledAt: null,
          flwSubscriptionId: orderTrackingId,
        },
      });

      void recordBillingEvent({
        orgId,
        event: "charge.completed",
        amount: tx.amount,
        currency: tx.currency,
        status: "successful",
        flwTxId: tx.confirmation_code,
        txRef: merchantReference,
        plan,
      });

      const [org, admin] = await Promise.all([
        prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
        prisma.user.findFirst({ where: { orgId, role: "ADMIN" }, select: { email: true, name: true } }),
      ]);
      if (org && admin) {
        void sendPaymentConfirmation(admin.email, admin.name, org.name, plan as OrgPlan, tx.amount);
      }
    } else if (tx.payment_status_description === "Failed" || tx.payment_status_description === "Reversed") {
      void recordBillingEvent({
        orgId,
        event: "charge.completed",
        amount: tx.amount,
        currency: tx.currency,
        status: tx.payment_status_description.toLowerCase(),
        txRef: merchantReference,
        plan,
      });

      const [org, admin] = await Promise.all([
        prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
        prisma.user.findFirst({ where: { orgId, role: "ADMIN" }, select: { email: true, name: true } }),
      ]);
      if (org && admin) {
        void sendPaymentFailedAlert(admin.email, admin.name, org.name);
      }
    }
  } catch (err) {
    console.error("[webhook/pesapal]", err);
  }

  return NextResponse.json(ack);
}
