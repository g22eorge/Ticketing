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
        name: string;
        email: string;
        phone: string | null;
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
        name: true,
        email: true,
        phone: true,
        permissionGrants: { select: { permission: true } },
      },
    });

    user = row
      ? {
          id: row.id,
          role: normalizeRole(row.role),
          isActive: row.isActive,
          name: row.name,
          email: row.email,
          phone: row.phone ?? null,
          permissions: row.permissionGrants
            .map((p) => p.permission)
            .filter((permission): permission is string => typeof permission === "string" && permission.length > 0),
        }
      : null;
  } catch {
    // Fallback for partially migrated DBs (older deployments).
    const baseUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        role: true,
        isActive: true,
        name: true,
        email: true,
      },
    });

    let phone: string | null = null;
    let permissions: string[] = [];
    if (baseUser) {
      try {
        const phoneRows = await prisma.$queryRaw<Array<{ phone: string | null }>>`
          SELECT phone FROM "User" WHERE id = ${session.user.id} LIMIT 1
        `;
        phone = phoneRows[0]?.phone ?? null;
      } catch {
        phone = null;
      }

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
    }

    user = baseUser
      ? {
        ...baseUser,
        role: normalizeRole(baseUser.role),
        phone,
        permissions,
      }
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
        name: true,
        email: true,
        phone: true,
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
        name: row.name,
        email: row.email,
        phone: row.phone ?? null,
        permissions: row.permissionGrants
          .map((p) => p.permission)
          .filter((permission): permission is string => typeof permission === "string" && permission.length > 0),
      },
    };
  } catch {
    // Older DB fallback
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
        permissions: [],
      },
    };
  }
}
