import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getClientBill, getExternalTechBill } from "@/lib/billing";
import { getAppCurrency } from "@/lib/currency";
import { can } from "@/lib/permissions";
import { getJobPayoutsByIds } from "@/lib/payouts";
import { prisma } from "@/lib/prisma";
import { JOB_STATUSES, isOpenJobStatus } from "@/lib/job-status";

type ExportType =
  | "pipeline-aging"
  | "revenue-variance"
  | "technician-performance"
  | "external-payouts"
  | "device-performance"
  | "pos-sales"
  | "invoices"
  | "expenses"
  | "inventory-stock"
  | "leads"
  | "staff-sales";

function toCsv(rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) => {
    const raw = String(value ?? "");
    if (raw.includes(",") || raw.includes("\n") || raw.includes('"')) {
      return `"${raw.replaceAll('"', '""')}"`;
    }
    return raw;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header] ?? "")).join(","));
  }
  return lines.join("\n");
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function parseMonth(value: string | null) {
  if (!value) {
    const now = new Date();
    return { start: startOfMonth(now), end: endOfMonth(now), label: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}` };
  }
  const parts = value.split("-");
  if (parts.length !== 2) {
    const now = new Date();
    return { start: startOfMonth(now), end: endOfMonth(now), label: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}` };
  }
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    const now = new Date();
    return { start: startOfMonth(now), end: endOfMonth(now), label: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}` };
  }
  const date = new Date(year, month - 1, 1);
  return { start: startOfMonth(date), end: endOfMonth(date), label: `${year}-${String(month).padStart(2, "0")}` };
}

function allowedForType(user: { role: Role; permissions: string[] }, type: ExportType) {
  if (type === "revenue-variance")   return can.runFinancialReports(user);
  if (type === "external-payouts")   return can.reviewExternalBills(user) || can.approveInvoices(user);
  if (type === "invoices")           return can.approveInvoices(user);
  if (type === "expenses")           return can.runFinancialReports(user);
  if (type === "pos-sales")          return can.viewAllSales(user);
  if (type === "staff-sales")        return can.viewAllSales(user);
  if (type === "inventory-stock")    return can.manageInventory(user);
  if (type === "leads")              return can.viewAllSales(user) || can.createLeads(user);
  return can.viewAccountsSummary(user);
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true, orgId: true },
  });

  if (!user?.isActive || !user.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let permissions: string[] = [];
  try {
    const permissionRows = await prisma.$queryRaw<Array<{ permission: string }>>`
      SELECT permission FROM "UserPermission" WHERE userId = ${session.user.id}
    `;
    permissions = permissionRows
      .map((row) => row.permission)
      .filter((permission): permission is string => typeof permission === "string" && permission.length > 0);
  } catch {
    permissions = [];
  }

  const permissionUser = { role: user.role, permissions };
  const orgId = user.orgId;

  const type = (req.nextUrl.searchParams.get("type") ?? "") as ExportType;
  if (!["pipeline-aging", "revenue-variance", "technician-performance", "external-payouts", "device-performance", "pos-sales", "invoices", "expenses", "inventory-stock", "leads", "staff-sales"].includes(type)) {
    return NextResponse.json({ error: "Invalid export type" }, { status: 400 });
  }

  if (!allowedForType(permissionUser, type)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const exportedAt = new Date().toISOString();
  const currency = getAppCurrency();

  if (type === "pipeline-aging") {
    const now = Date.now();
      const jobs = await prisma.job.findMany({
        where: {
          orgId,
          status: {
            in: JOB_STATUSES.filter(isOpenJobStatus),
          },
        },
      include: { assignedTo: true },
      orderBy: { receivedAt: "asc" },
    });

    const rows = jobs.map((job) => {
      const withTimeline = job as typeof job & {
        timelineConfidence?: string | null;
        timelineMinMinutes?: number | null;
        timelineMaxMinutes?: number | null;
      };
      const ageDays = Math.floor((now - job.receivedAt.getTime()) / (1000 * 60 * 60 * 24));
      const ageBucket = ageDays <= 2 ? "0-2d" : ageDays <= 7 ? "3-7d" : "8+d";
      return {
        exportedAt,
        jobNumber: job.jobNumber,
        status: job.status,
        repairPath: job.repairPath ?? "",
        etaWindow: job.repairTimeline ?? "",
        etaConfidence: withTimeline.timelineConfidence ?? "",
        etaMinHours: withTimeline.timelineMinMinutes ? (withTimeline.timelineMinMinutes / 60).toFixed(2) : "",
        etaMaxHours: withTimeline.timelineMaxMinutes ? (withTimeline.timelineMaxMinutes / 60).toFixed(2) : "",
        assignedTo: job.assignedTo?.name ?? "Unassigned",
        receivedAt: job.receivedAt.toISOString(),
        ageDays,
        ageBucket,
      };
    });

    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="pipeline-aging-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  if (type === "revenue-variance") {
    const month = parseMonth(req.nextUrl.searchParams.get("month"));
    const jobs = await prisma.job.findMany({
      where: {
        orgId,
        status: "COMPLETED",
        completedAt: { gte: month.start, lte: month.end },
      },
      include: { client: true },
      orderBy: { completedAt: "asc" },
    });

    const rows = jobs.map((job) => {
      const externalTechBill = getExternalTechBill(job) ?? 0;
      const clientBill = getClientBill(job) ?? 0;
      const repairMargin = clientBill - externalTechBill;
      const marginPct = clientBill > 0 ? (repairMargin / clientBill) * 100 : 0;

      return {
        exportedAt,
        month: month.label,
        currency,
        jobNumber: job.jobNumber,
        client: job.client.fullName,
        completedAt: job.completedAt?.toISOString() ?? "",
        externalTechBill: externalTechBill.toFixed(2),
        ourBillToClient: clientBill.toFixed(2),
        repairMargin: repairMargin.toFixed(2),
        marginPct: marginPct.toFixed(2),
      };
    });

    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="revenue-variance-${month.label}.csv"`,
      },
    });
  }

  if (type === "external-payouts") {
    const jobs = await prisma.job.findMany({
      where: {
        orgId,
        repairPath: "EXTERNAL",
        assignedTo: { is: { role: "TECHNICIAN_EXTERNAL" } },
      },
      include: { assignedTo: true },
      orderBy: { receivedAt: "asc" },
    });
    const payouts = await getJobPayoutsByIds(jobs.map((job) => job.id));

    const rows = jobs.map((job) => {
      const payout = payouts.get(job.id);

      return {
        exportedAt,
        currency,
        jobNumber: job.jobNumber,
        technician: job.assignedTo?.name ?? "Unassigned",
        status: job.status,
        completedAt: job.completedAt?.toISOString() ?? "",
        externalTechFee: (payout?.externalTechFee ?? 0).toFixed(2),
        payoutStatus: payout?.externalPaid ? "PAID" : "UNPAID",
        paidAt: payout?.externalPaidAt?.toISOString() ?? "",
        paymentRef: payout?.externalPaymentRef ?? "",
      };
    });

    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="external-payouts-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  if (type === "device-performance") {
    const month = parseMonth(req.nextUrl.searchParams.get("month"));
    const jobs = await prisma.job.findMany({
      where: {
        orgId,
        receivedAt: { gte: month.start, lte: month.end },
      },
      select: {
        deviceType: true,
        status: true,
        receivedAt: true,
        completedAt: true,
        repairPath: true,
        assignedTo: { select: { name: true } },
      },
    });

    const completedFinancial = await prisma.job.findMany({
      where: {
        orgId,
        status: "COMPLETED",
        completedAt: { gte: month.start, lte: month.end },
      },
      select: {
        deviceType: true,
        externalTechBill: true,
        clientBill: true,
      },
    });

    const stats = new Map<
      string,
      {
        total: number;
        open: number;
        completed: number;
        cancelledOrClosed: number;
        external: number;
        inHouse: number;
        turnaroundHoursSum: number;
        turnaroundCount: number;
        revenue: number;
        margin: number;
        techFreq: Map<string, number>;
      }
    >();

    const get = (deviceType: string) => {
      const current = stats.get(deviceType);
      if (current) return current;
      const created = {
        total: 0,
        open: 0,
        completed: 0,
        cancelledOrClosed: 0,
        external: 0,
        inHouse: 0,
        turnaroundHoursSum: 0,
        turnaroundCount: 0,
        revenue: 0,
        margin: 0,
        techFreq: new Map<string, number>(),
      };
      stats.set(deviceType, created);
      return created;
    };

    for (const job of jobs) {
      const bucket = get(job.deviceType);
      bucket.total += 1;
      if (isOpenJobStatus(job.status)) {
        bucket.open += 1;
      }
      if (job.status === "COMPLETED") {
        bucket.completed += 1;
        if (job.completedAt) {
          bucket.turnaroundHoursSum +=
            (job.completedAt.getTime() - job.receivedAt.getTime()) / 36e5;
          bucket.turnaroundCount += 1;
        }
      }
      if (job.status === "CLOSED") {
        bucket.cancelledOrClosed += 1;
      }
      if (job.repairPath === "EXTERNAL") bucket.external += 1;
      if (job.repairPath === "IN_HOUSE") bucket.inHouse += 1;
      if (job.assignedTo?.name) {
        bucket.techFreq.set(job.assignedTo.name, (bucket.techFreq.get(job.assignedTo.name) ?? 0) + 1);
      }
    }

    for (const job of completedFinancial) {
      const bucket = get(job.deviceType);
      const clientBill = getClientBill(job) ?? 0;
      const extBill = getExternalTechBill(job) ?? 0;
      bucket.revenue += clientBill;
      bucket.margin += clientBill - extBill;
    }

    const rows = [...stats.entries()]
      .map(([deviceType, s]) => {
        const topTech = [...s.techFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
        return {
          exportedAt,
          month: month.label,
          currency,
          deviceType,
          totalJobs: s.total,
          openJobs: s.open,
          completedJobs: s.completed,
          cancelledOrClosedJobs: s.cancelledOrClosed,
          externalJobs: s.external,
          inHouseJobs: s.inHouse,
          completionRatePct: s.total > 0 ? ((s.completed / s.total) * 100).toFixed(2) : "0.00",
          avgTurnaroundHours: s.turnaroundCount > 0 ? (s.turnaroundHoursSum / s.turnaroundCount).toFixed(2) : "0.00",
          revenue: s.revenue.toFixed(2),
          margin: s.margin.toFixed(2),
          avgMarginPerJob: s.completed > 0 ? (s.margin / s.completed).toFixed(2) : "0.00",
          topTechnician: topTech,
        };
      })
      .sort((a, b) => b.totalJobs - a.totalJobs);

    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="device-performance-${month.label}.csv"`,
      },
    });
  }

  // ── POS Sales ──────────────────────────────────────────────────────────────
  if (type === "pos-sales") {
    const month = parseMonth(req.nextUrl.searchParams.get("month"));
    const sales = await prisma.sale.findMany({
      where: { orgId, status: "PAID", paidAt: { gte: month.start, lte: month.end } },
      select: { saleNumber: true, paidAt: true, totalAmount: true, discountAmount: true, createdBy: { select: { name: true } } },
      orderBy: { paidAt: "asc" },
    }).catch(() => []);
    const rows = sales.map((s) => ({
      exportedAt,
      month: month.label,
      currency,
      saleNumber: s.saleNumber,
      paidAt: s.paidAt?.toISOString() ?? "",
      totalAmount: s.totalAmount.toFixed(2),
      discountAmount: s.discountAmount.toFixed(2),
      createdBy: s.createdBy?.name ?? "",
    }));
    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="pos-sales-${month.label}.csv"`,
      },
    });
  }

  // ── Invoices ───────────────────────────────────────────────────────────────
  if (type === "invoices") {
    const month = parseMonth(req.nextUrl.searchParams.get("month"));
    const invoices = await prisma.invoice.findMany({
      where: { orgId, issuedAt: { gte: month.start, lte: month.end } },
      include: { client: true },
      orderBy: { issuedAt: "asc" },
    }).catch(() => []);
    const rows = invoices.map((inv) => ({
      exportedAt,
      month: month.label,
      currency,
      invoiceNumber: inv.invoiceNumber,
      client: inv.client?.fullName ?? "",
      status: inv.status,
      issuedAt: inv.issuedAt.toISOString(),
      dueAt: inv.dueDate?.toISOString() ?? "",
      paidAt: inv.paidAt?.toISOString() ?? "",
      totalAmount: inv.totalAmount.toFixed(2),
      paidAmount: inv.paidAmount?.toFixed(2) ?? "0.00",
      balance: Math.max(0, inv.totalAmount - (inv.paidAmount ?? 0)).toFixed(2),
    }));
    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="invoices-${month.label}.csv"`,
      },
    });
  }

  // ── Expenses ───────────────────────────────────────────────────────────────
  if (type === "expenses") {
    const month = parseMonth(req.nextUrl.searchParams.get("month"));
    const expenses = await prisma.expense.findMany({
      where: { orgId, paidAt: { gte: month.start, lte: month.end } },
      include: { createdBy: true, supplier: true },
      orderBy: { paidAt: "asc" },
    }).catch(() => []);
    const rows = expenses.map((e) => ({
      exportedAt,
      month: month.label,
      currency,
      expenseNumber: e.expenseNumber,
      category: e.category,
      description: e.description,
      supplier: e.supplier?.name ?? "",
      paidAt: e.paidAt?.toISOString() ?? "",
      amount: e.amount.toFixed(2),
      method: e.method ?? "",
      reference: e.reference ?? "",
      createdBy: e.createdBy?.name ?? "",
    }));
    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="expenses-${month.label}.csv"`,
      },
    });
  }

  // ── Inventory Stock ────────────────────────────────────────────────────────
  if (type === "inventory-stock") {
    const parts = await prisma.part.findMany({
      where: { orgId, isActive: true },
      orderBy: { name: "asc" },
    }).catch(() => []);
    const rows = parts.map((p) => ({
      exportedAt,
      currency,
      sku: p.sku,
      name: p.name,
      manufacturer: p.manufacturer ?? "",
      qtyOnHand: p.qtyOnHand,
      reorderLevel: p.reorderLevel,
      stockStatus: p.qtyOnHand <= 0 ? "OUT_OF_STOCK" : p.qtyOnHand <= p.reorderLevel ? "LOW_STOCK" : "OK",
      unitCost: p.unitCost?.toFixed(2) ?? "",
      totalValue: p.unitCost != null ? (p.qtyOnHand * p.unitCost).toFixed(2) : "",
    }));
    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="inventory-stock-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  // ── Leads ──────────────────────────────────────────────────────────────────
  if (type === "leads") {
    const leads = await prisma.lead.findMany({
      where: { orgId },
      include: { assignedTo: true },
      orderBy: { createdAt: "desc" },
    }).catch(() => []);
    const rows = leads.map((l) => ({
      exportedAt,
      currency,
      leadName: l.fullName,
      organization: l.organization ?? "",
      email: l.email ?? "",
      phone: l.phone,
      status: l.status,
      source: l.source ?? "",
      estimatedValue: l.estimatedValue?.toFixed(2) ?? "",
      assignedTo: l.assignedTo?.name ?? "",
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    }));
    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  // ── Staff Sales Performance ────────────────────────────────────────────────
  if (type === "staff-sales") {
    const month = parseMonth(req.nextUrl.searchParams.get("month"));
    const [completedJobs, posSales, invoicesPaid, targets] = await Promise.all([
      prisma.job.findMany({ where: { orgId, status: "COMPLETED", completedAt: { gte: month.start, lte: month.end } }, select: { clientBill: true, createdById: true, createdBy: { select: { id: true, name: true } } } }).catch(() => []),
      prisma.sale.findMany({ where: { orgId, status: "PAID", paidAt: { gte: month.start, lte: month.end } }, select: { totalAmount: true, createdById: true, createdBy: { select: { id: true, name: true } } } }).catch(() => []),
      prisma.invoice.findMany({ where: { orgId, status: "PAID", paidAt: { gte: month.start, lte: month.end } }, select: { totalAmount: true, job: { select: { createdById: true, createdBy: { select: { id: true, name: true } } } } } }).catch(() => []),
      prisma.salesTarget.findMany({ where: { orgId, period: month.label, userId: { not: null } } }).catch(() => []),
    ]);
    const map = new Map<string, { name: string; repairRev: number; posRev: number; invoiceRev: number; target: number }>();
    for (const j of completedJobs) {
      if (!j.createdById || !j.createdBy) continue;
      const e = map.get(j.createdById) ?? { name: j.createdBy.name, repairRev: 0, posRev: 0, invoiceRev: 0, target: 0 };
      e.repairRev += getClientBill(j) ?? 0; map.set(j.createdById, e);
    }
    for (const s of posSales) {
      if (!s.createdById || !s.createdBy) continue;
      const e = map.get(s.createdById) ?? { name: s.createdBy.name, repairRev: 0, posRev: 0, invoiceRev: 0, target: 0 };
      e.posRev += s.totalAmount; map.set(s.createdById, e);
    }
    for (const inv of invoicesPaid) {
      if (!inv.job?.createdById || !inv.job?.createdBy) continue;
      const e = map.get(inv.job.createdById) ?? { name: inv.job.createdBy.name, repairRev: 0, posRev: 0, invoiceRev: 0, target: 0 };
      e.invoiceRev += inv.totalAmount; map.set(inv.job.createdById, e);
    }
    for (const t of targets) {
      if (!t.userId) continue;
      const e = map.get(t.userId); if (e) { e.target = t.targetRevenue; map.set(t.userId, e); }
    }
    const rows = [...map.values()].sort((a, b) => (b.repairRev + b.posRev + b.invoiceRev) - (a.repairRev + a.posRev + a.invoiceRev)).map((s) => {
      const total = s.repairRev + s.posRev + s.invoiceRev;
      return {
        exportedAt,
        month: month.label,
        currency,
        name: s.name,
        repairRevenue: s.repairRev.toFixed(2),
        posRevenue: s.posRev.toFixed(2),
        invoiceRevenue: s.invoiceRev.toFixed(2),
        totalRevenue: total.toFixed(2),
        target: s.target > 0 ? s.target.toFixed(2) : "",
        targetPct: s.target > 0 ? Math.round((total / s.target) * 100) + "%" : "",
      };
    });
    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="staff-sales-${month.label}.csv"`,
      },
    });
  }

  // ── Technician Performance (fallback) ──────────────────────────────────────
  const jobs = await prisma.job.findMany({
    where: { orgId, assignedToId: { not: null } },
    include: { assignedTo: true },
    orderBy: { receivedAt: "asc" },
  });

  const byTech = new Map<string, {
    name: string;
    role: string;
    assigned: number;
    completed: number;
    totalTurnaroundHours: number;
    completedWithTime: number;
  }>();

  for (const job of jobs) {
    if (!job.assignedTo) continue;
    const key = job.assignedTo.id;
    const bucket = byTech.get(key) ?? {
      name: job.assignedTo.name,
      role: job.assignedTo.role,
      assigned: 0,
      completed: 0,
      totalTurnaroundHours: 0,
      completedWithTime: 0,
    };

    bucket.assigned += 1;
    if (job.status === "COMPLETED") {
      bucket.completed += 1;
      if (job.completedAt) {
        bucket.totalTurnaroundHours +=
          (job.completedAt.getTime() - job.receivedAt.getTime()) / 36e5;
        bucket.completedWithTime += 1;
      }
    }

    byTech.set(key, bucket);
  }

  const rows = [...byTech.values()].map((tech) => ({
    exportedAt,
    technician: tech.name,
    role: tech.role,
    assignedJobs: tech.assigned,
    completedJobs: tech.completed,
    completionRatePct: tech.assigned > 0 ? ((tech.completed / tech.assigned) * 100).toFixed(2) : "0.00",
    avgTurnaroundHours: tech.completedWithTime > 0
      ? (tech.totalTurnaroundHours / tech.completedWithTime).toFixed(2)
      : "0.00",
  }));

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="technician-performance-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
