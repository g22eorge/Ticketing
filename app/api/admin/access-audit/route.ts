import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";

import { can } from "@/lib/permissions";
import { assertPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type AccessMatrix = {
  jobs: boolean;
  intake: boolean;
  technicians: boolean;
  clients: boolean;
  inventory: boolean;
  reports: boolean;
  invoices: boolean;
  payoutFollowups: boolean;
  userManagement: boolean;
};

function buildAccess(role: Role, isActive: boolean, permissions: string[]): AccessMatrix {
  if (!isActive) {
    return {
      jobs: false,
      intake: false,
      technicians: false,
      clients: false,
      inventory: false,
      reports: false,
      invoices: false,
      payoutFollowups: false,
      userManagement: false,
    };
  }

  const user = { role, permissions };
  return {
    jobs: true,
    intake: can.viewIntake(user),
    technicians: true,
    clients: can.viewClientInfo(user),
    inventory: ["ADMIN", "OPS", "TECHNICIAN_INTERNAL"].includes(role),
    reports: can.viewAccountsSummary(user),
    invoices: can.viewFinancials(user),
    payoutFollowups: can.reviewExternalBills(user) || can.approveInvoices(user),
    userManagement: role === "ADMIN",
  };
}

export async function GET(req: NextRequest) {
  const actor = await assertPlatformAdmin();
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const query = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";

  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }],
    include: {
      permissionGrants: {
        select: { permission: true },
        orderBy: { permission: "asc" },
      },
    },
  });

  const rows = users
    .map((u) => {
      const permissions = u.permissionGrants.map((grant) => grant.permission);
      const access = buildAccess(u.role, u.isActive, permissions);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        permissions,
        access,
        blockers: [
          ...(u.isActive ? [] : ["User is inactive"]),
          ...(access.jobs ? [] : ["Cannot access jobs"]),
        ],
      };
    })
    .filter((row) => {
      if (!query) return true;
      return (
        row.name.toLowerCase().includes(query)
        || row.email.toLowerCase().includes(query)
        || row.role.toLowerCase().includes(query)
      );
    });

  const usersMissingJobsAccess = rows.filter((row) => !row.access.jobs);
  const inactiveUsers = rows.filter((row) => !row.isActive);

  return NextResponse.json({
    ok: true,
    summary: {
      totalUsers: rows.length,
      inactiveUsers: inactiveUsers.length,
      usersMissingJobsAccess: usersMissingJobsAccess.length,
    },
    usersMissingJobsAccess,
    inactiveUsers,
    rows,
  });
}
