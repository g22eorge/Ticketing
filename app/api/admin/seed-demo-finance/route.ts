import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";

export const dynamic = "force-dynamic";

async function requirePlatformAdmin() {
  const { user } = await getCurrentUserRole();
  const platformEmail = process.env.PLATFORM_ADMIN_EMAIL;
  if (!platformEmail || !user?.email || user.email !== platformEmail) return null;
  if (user.role !== "ADMIN") return null;
  return user;
}

function suffix() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export async function POST(req: Request) {
  const user = await requirePlatformAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const orgId = url.searchParams.get("orgId")?.trim() || user.orgId || "";
  if (!orgId) {
    return NextResponse.json(
      { error: "Missing orgId. Provide ?orgId=... or ensure platform admin belongs to an org." },
      { status: 400 },
    );
  }

  const branchId = url.searchParams.get("branchId")?.trim() || null;

  const tag = suffix();

  const result = await prisma.$transaction(async (tx) => {
    // 1) POS demo sale (Sale + SaleItem + Payment)
    const sale = await tx.sale.create({
      data: {
        orgId,
        branchId,
        status: "PAID",
        saleNumber: `S-DEMO-${tag}`,
        subtotal: 100_000,
        discountAmount: 0,
        vatAmount: 0,
        totalAmount: 100_000,
        paidAmount: 100_000,
        paidAt: new Date(),
        createdById: user.id,
        notes: "Seeded demo sale",
      },
      select: { id: true, saleNumber: true },
    });

    await tx.saleItem.create({
      data: {
        saleId: sale.id,
        description: "DEMO: Accessories sale",
        quantity: 1,
        unitPrice: 100_000,
        lineTotal: 100_000,
      },
    });

    const posPayment = await tx.payment.create({
      data: {
        orgId,
        saleId: sale.id,
        invoiceId: null,
        amount: 100_000,
        method: "CASH",
        reference: `DEMO-POS-${tag}`,
        createdById: user.id,
        receivedAt: new Date(),
        note: "Seeded demo POS payment",
      },
      select: { id: true },
    });

    // 2) Repairs demo invoice payment (Client + Job + Invoice + Payment)
    const client = await tx.client.create({
      data: {
        orgId,
        fullName: `Demo Client ${tag}`,
        phone: `DEMO-${tag}`,
        email: null,
        organization: null,
      },
      select: { id: true },
    });

    const job = await tx.job.create({
      data: {
        orgId,
        branchId,
        clientId: client.id,
        createdById: user.id,
        status: "COMPLETED",
        repairPath: "IN_HOUSE",
        jobNumber: `EIS-DEMO-${tag}`,
        deviceType: "OTHER",
        brand: "Demo",
        model: "Demo Device",
        issueDescription: "Seeded demo repair job",
        clientBill: 250_000,
        vatApplicable: true,
        completedAt: new Date(),
      },
      select: { id: true, jobNumber: true },
    });

    const invoice = await tx.invoice.create({
      data: {
        orgId,
        jobId: job.id,
        invoiceNumber: `INV-DEMO-${tag}`,
        status: "PAID",
        issuedAt: new Date(),
        totalAmount: 250_000,
        paidAmount: 250_000,
        paidAt: new Date(),
        notes: "Seeded demo invoice",
      },
      select: { id: true, invoiceNumber: true },
    });

    const repairPayment = await tx.payment.create({
      data: {
        orgId,
        invoiceId: invoice.id,
        saleId: null,
        amount: 250_000,
        method: "CASH",
        reference: `DEMO-INV-${tag}`,
        createdById: user.id,
        receivedAt: new Date(),
        note: "Seeded demo repair payment",
      },
      select: { id: true },
    });

    // Keep legacy job flags in sync so old views also show paid.
    await tx.job.update({
      where: { id: job.id },
      data: {
        clientPaid: true,
        clientPaidAt: new Date(),
        clientPaidById: user.id,
        clientPaymentRef: `DEMO-INV-${tag}`,
        invoiceNumber: invoice.invoiceNumber,
        invoiceIssuedAt: new Date(),
      },
    });

    return {
      ok: true,
      orgId,
      sale: { id: sale.id, saleNumber: sale.saleNumber, paymentId: posPayment.id },
      job: { id: job.id, jobNumber: job.jobNumber },
      invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber, paymentId: repairPayment.id },
    };
  });

  return NextResponse.json(result);
}
