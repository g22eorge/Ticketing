import { NextResponse } from "next/server";

import { assertPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { normalizeCurrency } from "@/lib/currency";

export const dynamic = "force-dynamic";

function suffix() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function GET() {
  const user = await assertPlatformAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, name: true, slug: true, plan: true, billingStatus: true },
  }).catch(() => []);

  const defaultOrgId = user.orgId ?? orgs[0]?.id ?? "";
  const orgOptions = orgs.map((org) => `
    <option value="${escapeHtml(org.id)}" ${org.id === defaultOrgId ? "selected" : ""}>
      ${escapeHtml(org.name)} (${escapeHtml(org.slug)}) · ${escapeHtml(org.plan)} · ${escapeHtml(org.billingStatus)}
    </option>
  `).join("");

  return new Response(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Seed Demo Finance Data</title>
        <style>
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
          main { max-width: 760px; margin: 48px auto; padding: 24px; }
          section { background: #fff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 24px; box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08); }
          h1 { margin: 0 0 8px; font-size: 24px; }
          p { color: #475569; line-height: 1.5; }
          label { display: block; margin: 18px 0 8px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #64748b; }
          select, input { width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px; font-size: 14px; }
          button { margin-top: 18px; border: 0; border-radius: 999px; background: #0f766e; color: white; padding: 12px 18px; font-weight: 800; cursor: pointer; }
          pre { margin-top: 18px; white-space: pre-wrap; background: #0f172a; color: #e2e8f0; border-radius: 14px; padding: 16px; min-height: 80px; }
          .warn { border-left: 4px solid #f59e0b; background: #fffbeb; padding: 12px 14px; border-radius: 10px; }
        </style>
      </head>
      <body>
        <main>
          <section>
            <h1>Seed Demo Finance Data</h1>
            <p class="warn">This is additive production test data. It creates demo repairs, invoices, payments, delivery notes, POS sales, and complaints for the selected organisation.</p>
            <label for="orgId">Organisation</label>
            <select id="orgId">${orgOptions || `<option value="">No organisations found</option>`}</select>
            <label for="months">Trend Months</label>
            <input id="months" type="number" min="1" max="12" value="6" />
            <button id="seed">Seed demo data</button>
            <pre id="result">Ready.</pre>
          </section>
        </main>
        <script>
          document.getElementById('seed').addEventListener('click', async () => {
            const orgId = document.getElementById('orgId').value;
            const months = document.getElementById('months').value || '6';
            const out = document.getElementById('result');
            out.textContent = 'Seeding...';
            const res = await fetch('/api/admin/seed-demo-finance?orgId=' + encodeURIComponent(orgId) + '&months=' + encodeURIComponent(months), { method: 'POST' });
            out.textContent = JSON.stringify(await res.json(), null, 2);
          });
        </script>
      </body>
    </html>`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function POST(req: Request) {
  const user = await assertPlatformAdmin();
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
  const months = Math.min(12, Math.max(1, Number(url.searchParams.get("months") ?? 6) || 6));

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { baseCurrency: true } }).catch(() => null);
  const baseCurrency = normalizeCurrency(org?.baseCurrency, "UGX");

  const tag = suffix();

  const result = await prisma.$transaction(async (tx) => {
    const created = {
      sales: 0,
      jobs: 0,
      invoices: 0,
      payments: 0,
      deliveryNotes: 0,
      complaints: 0,
    };

    // 1) POS demo sale (Sale + SaleItem + Payment)
    const sale = await tx.sale.create({
      data: {
        orgId,
        branchId,
        status: "PAID",
        saleNumber: `S-DEMO-${tag}`,
        currency: baseCurrency,
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
        currency: baseCurrency,
        exchangeRateToBase: null,
        amount: 100_000,
        method: "CASH",
        reference: `DEMO-POS-${tag}`,
        createdById: user.id,
        receivedAt: new Date(),
        note: "Seeded demo POS payment",
      },
      select: { id: true },
    });
    created.sales += 1;
    created.payments += 1;

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
    created.jobs += 1;

    const invoice = await tx.invoice.create({
      data: {
        orgId,
        jobId: job.id,
        invoiceNumber: `INV-DEMO-${tag}`,
        status: "PAID",
        issuedAt: new Date(),
        currency: baseCurrency,
        totalAmount: 250_000,
        paidAmount: 250_000,
        paidAt: new Date(),
        notes: "Seeded demo invoice",
      },
      select: { id: true, invoiceNumber: true },
    });
    created.invoices += 1;

    const repairPayment = await tx.payment.create({
      data: {
        orgId,
        invoiceId: invoice.id,
        saleId: null,
        currency: baseCurrency,
        exchangeRateToBase: null,
        amount: 250_000,
        method: "CASH",
        reference: `DEMO-INV-${tag}`,
        createdById: user.id,
        receivedAt: new Date(),
        note: "Seeded demo repair payment",
      },
      select: { id: true },
    });
    created.payments += 1;

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

    for (let index = 0; index < months; index += 1) {
      const monthOffset = months - index;
      const completedAt = daysAgo(monthOffset * 30);
      const issuedAt = new Date(completedAt);
      issuedAt.setDate(issuedAt.getDate() + 1);
      const paidAt = new Date(issuedAt);
      paidAt.setDate(paidAt.getDate() + 1);
      const serial = `${tag}-${String(index + 1).padStart(2, "0")}`;
      const repairTotal = 180_000 + index * 35_000;
      const externalCost = 65_000 + index * 12_000;

      const trendClient = await tx.client.create({
        data: {
          orgId,
          fullName: `Demo Trend Client ${index + 1}`,
          phone: `DEMO-TREND-${serial}`,
        },
        select: { id: true },
      });

      const trendJob = await tx.job.create({
        data: {
          orgId,
          branchId,
          clientId: trendClient.id,
          createdById: user.id,
          assignedToId: user.id,
          status: "COMPLETED",
          repairPath: index % 2 === 0 ? "EXTERNAL" : "IN_HOUSE",
          jobNumber: `EIS-TREND-${serial}`,
          deviceType: index % 2 === 0 ? "PHONE_ANDROID" : "WINDOWS_PC",
          brand: index % 2 === 0 ? "Samsung" : "Dell",
          model: index % 2 === 0 ? "Demo Galaxy" : "Demo Latitude",
          issueDescription: "Seeded trend repair job for production dashboard testing",
          diagnosisNotes: "Demo diagnosis completed",
          workDone: "Demo repair completed and quality checked",
          clientBill: repairTotal,
          externalTechBill: index % 2 === 0 ? externalCost : null,
          externalTechFee: index % 2 === 0 ? externalCost : null,
          vatApplicable: true,
          clientApproved: true,
          receivedAt: daysAgo(monthOffset * 30 + 4),
          completedAt,
        },
        select: { id: true, jobNumber: true },
      });
      created.jobs += 1;

      const trendInvoice = await tx.invoice.create({
        data: {
          orgId,
          jobId: trendJob.id,
          invoiceNumber: `INV-TREND-${serial}`,
          status: "PAID",
          issuedAt,
          currency: baseCurrency,
          totalAmount: repairTotal,
          paidAmount: repairTotal,
          paidAt,
          notes: "Seeded trend invoice",
        },
        select: { id: true, invoiceNumber: true },
      });
      created.invoices += 1;

      await tx.payment.create({
        data: {
          orgId,
          invoiceId: trendInvoice.id,
          saleId: null,
          currency: baseCurrency,
          amount: repairTotal,
          method: index % 2 === 0 ? "MOBILE_MONEY" : "CASH",
          reference: `DEMO-TREND-PAY-${serial}`,
          createdById: user.id,
          receivedAt: paidAt,
          note: "Seeded trend repair payment",
        },
      });
      created.payments += 1;

      const deliveryNote = await tx.deliveryNote.create({
        data: {
          orgId,
          invoiceId: trendInvoice.id,
          deliveryNoteNumber: `DN-TREND-${serial}`,
          deliveredByName: user.name,
          receivedByName: `Demo Trend Client ${index + 1}`,
          createdById: user.id,
          note: "Seeded trend delivery note",
          items: { create: [{ description: `Repair handover for ${trendJob.jobNumber}`, quantity: 1 }] },
        },
        select: { id: true },
      });
      void deliveryNote;
      created.deliveryNotes += 1;

      const trendSale = await tx.sale.create({
        data: {
          orgId,
          branchId,
          status: "PAID",
          saleNumber: `S-TREND-${serial}`,
          currency: baseCurrency,
          subtotal: 45_000 + index * 10_000,
          discountAmount: 0,
          vatAmount: 0,
          totalAmount: 45_000 + index * 10_000,
          paidAmount: 45_000 + index * 10_000,
          paidAt,
          createdById: user.id,
          notes: "Seeded trend POS sale",
          items: { create: [{ description: "Demo accessory", quantity: 1, unitPrice: 45_000 + index * 10_000, lineTotal: 45_000 + index * 10_000 }] },
        },
        select: { id: true },
      });
      created.sales += 1;

      await tx.payment.create({
        data: {
          orgId,
          saleId: trendSale.id,
          invoiceId: null,
          currency: baseCurrency,
          amount: 45_000 + index * 10_000,
          method: "CASH",
          reference: `DEMO-TREND-SALE-${serial}`,
          createdById: user.id,
          receivedAt: paidAt,
          note: "Seeded trend POS payment",
        },
      });
      created.payments += 1;
    }

    const complaintStatuses = ["RECEIVED", "INVESTIGATING", "RESOLVED"] as const;
    for (const [index, status] of complaintStatuses.entries()) {
      await tx.complaint.create({
        data: {
          orgId,
          complaintNumber: `CMP-DEMO-${tag}-${index + 1}`,
          status,
          category: index === 0 ? "SERVICE_QUALITY" : index === 1 ? "REPAIR_DELAY" : "BILLING",
          clientName: `Demo Complaint Client ${index + 1}`,
          clientPhone: `DEMO-CMP-${tag}-${index + 1}`,
          description: index === 0
            ? "Demo complaint awaiting first response"
            : index === 1
              ? "Demo complaint under investigation"
              : "Demo complaint resolved after follow-up",
          resolution: status === "RESOLVED" ? "Client contacted and resolution accepted" : null,
          resolvedAt: status === "RESOLVED" ? new Date() : null,
        },
      });
      created.complaints += 1;
    }

    return {
      ok: true,
      orgId,
      created,
      sale: { id: sale.id, saleNumber: sale.saleNumber, paymentId: posPayment.id },
      job: { id: job.id, jobNumber: job.jobNumber },
      invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber, paymentId: repairPayment.id },
    };
  });

  return NextResponse.json(result);
}
