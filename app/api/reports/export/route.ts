import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getClientBill, getExternalTechBill } from "@/lib/billing";
import { getAppCurrency } from "@/lib/currency";
import { can } from "@/lib/permissions";
import { getJobPayoutsByIds } from "@/lib/payouts";
import { prisma } from "@/lib/prisma";

type ExportType =
  | "pipeline-aging"
  | "revenue-variance"
  | "technician-performance"
  | "external-payouts"
  | "device-performance";

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
  if (type === "revenue-variance") {
    return user.role === "ADMIN" || can.approveInvoices(user);
  }
  if (type === "external-payouts") {
    return user.role === "ADMIN" || can.reviewExternalBills(user) || can.approveInvoices(user);
  }
  return can.viewAccountsSummary(user);
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  });

  if (!user?.isActive) {
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

  const type = (req.nextUrl.searchParams.get("type") ?? "") as ExportType;
  if (!["pipeline-aging", "revenue-variance", "technician-performance", "external-payouts", "device-performance"].includes(type)) {
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
        status: {
          in: ["RECEIVED", "DIAGNOSING", "AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP"],
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
      if (["RECEIVED", "DIAGNOSING", "AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP"].includes(job.status)) {
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

  const jobs = await prisma.job.findMany({
    where: { assignedToId: { not: null } },
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
