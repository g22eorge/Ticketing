import { Role } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function normalizeRole(role: Role): Role {
  // Keep legacy role values working with new UI language.
  return role === "INTAKE" ? "FRONT_DESK" : role;
}

export async function getSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function requireSession() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

export async function requireRole(allowed: Role[]) {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  });

  const role = user ? normalizeRole(user.role) : null;

  if (!user?.isActive || !role || !allowed.includes(role)) {
    redirect("/dashboard");
  }

  return { session, role };
}

export async function getCurrentUserRole() {
  const session = await requireSession();
  let user:
    | {
        id: string;
        role: Role;
        isActive: boolean;
        accessMode: "FULL" | "READ_ONLY";
        name: string;
        email: string;
        phone: string | null;
        orgId: string | null;
        permissions: string[];
      }
    | null = null;

  try {
    const row = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        role: true,
        isActive: true,
        accessMode: true,
        name: true,
        email: true,
        phone: true,
        orgId: true,
        permissionGrants: { select: { permission: true } },
      },
    });

    user = row
      ? {
          id: row.id,
          role: normalizeRole(row.role),
          isActive: row.isActive,
          accessMode: (row.accessMode as unknown as "FULL" | "READ_ONLY") ?? "FULL",
          name: row.name,
          email: row.email,
          phone: row.phone ?? null,
          orgId: row.orgId ?? null,
          permissions: row.permissionGrants
            .map((p) => p.permission)
            .filter((permission): permission is string => typeof permission === "string" && permission.length > 0),
        }
      : null;
  } catch {
    // Fallback for partially migrated DBs (older deployments).
    const baseUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true, isActive: true, name: true, email: true },
    });

    let phone: string | null = null;
    let orgId: string | null = null;
    let permissions: string[] = [];
    let accessMode: "FULL" | "READ_ONLY" = "FULL";

    if (baseUser) {
      try {
        const rows = await prisma.$queryRaw<Array<{ phone: string | null; orgId: string | null; accessMode: string | null }>>`
          SELECT phone, orgId, accessMode FROM "User" WHERE id = ${session.user.id} LIMIT 1
        `;
        phone = rows[0]?.phone ?? null;
        orgId = rows[0]?.orgId ?? null;
        accessMode = rows[0]?.accessMode === "READ_ONLY" ? "READ_ONLY" : "FULL";
      } catch {
        phone = null;
        orgId = null;
        accessMode = "FULL";
      }

      try {
        const permissionRows = await prisma.$queryRaw<Array<{ permission: string }>>`
          SELECT permission FROM "UserPermission" WHERE userId = ${session.user.id}
        `;
        permissions = permissionRows
          .map((row) => row.permission)
          .filter((p): p is string => typeof p === "string" && p.length > 0);
      } catch {
        permissions = [];
      }
    }

    user = baseUser
      ? { ...baseUser, role: normalizeRole(baseUser.role), phone, orgId, permissions, accessMode }
      : null;
  }

  if (!user?.isActive) {
    redirect("/login");
  }

  return { session, user };
}

// For API routes and background tasks: never redirect, return null user instead.
export async function getCurrentUserRoleOptional() {
  const session = await getSession();
  if (!session?.user) {
    return { session: null, user: null as null };
  }

  try {
    const row = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        role: true,
        isActive: true,
        accessMode: true,
        name: true,
        email: true,
        phone: true,
        orgId: true,
        permissionGrants: { select: { permission: true } },
      },
    });

    if (!row?.isActive) {
      return { session, user: null as null };
    }

    return {
      session,
      user: {
        id: row.id,
        role: normalizeRole(row.role),
        isActive: row.isActive,
        accessMode: (row.accessMode as unknown as "FULL" | "READ_ONLY") ?? "FULL",
        name: row.name,
        email: row.email,
        phone: row.phone ?? null,
        orgId: row.orgId ?? null,
        permissions: row.permissionGrants
          .map((p) => p.permission)
          .filter((p): p is string => typeof p === "string" && p.length > 0),
      },
    };
  } catch {
    const baseUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true, isActive: true, name: true, email: true },
    });

    if (!baseUser?.isActive) {
      return { session, user: null as null };
    }

    return {
      session,
      user: {
        ...baseUser,
        role: normalizeRole(baseUser.role),
        phone: null,
        orgId: null,
        accessMode: "FULL" as const,
        permissions: [],
      },
    };
  }
}
