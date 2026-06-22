import { hashPassword } from "better-auth/crypto";
import { Role } from "@prisma/client";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Plus, Search, ShieldCheck, Lock, ChevronDown, CircleDot, Circle, Users, X } from "lucide-react";
import { CopyButton } from "@/components/settings/CopyButton";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { INVITE_TTL_DAYS } from "@/lib/invites";
import { checkUserLimit } from "@/lib/plan-limits";
import { rateLimit } from "@/lib/rate-limit";
import { EXTRA_PERMISSIONS } from "@/lib/permissions";

type SearchParams = {
  q?: string;
  userId?: string;
  limitError?: string;
  inviteUrl?: string;
  error?: string;
  add?: string;
  saved?: string;
};

// ── Schemas ─────────────────────────────────────────────────────────────────
const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(80),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.nativeEnum(Role),
});

const resetSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(8),
  confirm: z.string().min(8),
}).refine((d) => d.password === d.confirm, {
  message: "Passwords do not match",
  path: ["confirm"],
});

// ── Role Data ────────────────────────────────────────────────────────────────
const roleOptions: Array<{ value: Role; label: string; description: string }> = [
  { value: Role.ADMIN, label: "Admin", description: "Full system access and user management." },
  { value: Role.OPS, label: "Operations", description: "Manages tickets, clients, and documents." },
  { value: Role.FRONT_DESK, label: "Front Desk", description: "Client intake and basic documents." },
  { value: Role.TECHNICIAN_INTERNAL, label: "Technician", description: "Updates assigned tickets and diagnosis." },
  { value: Role.FINANCE, label: "Finance", description: "Invoices, receipts, and billing." },
];

const roleDefaults: Record<Role, Array<(typeof EXTRA_PERMISSIONS)[number]>> = {
  ADMIN: ["can_run_internal_repairs","can_intake","can_manage_intake","can_search_jobs","can_generate_job_cards","can_view_job_progress","can_view_approved_cost","can_assign_jobs","can_view_external_updates","can_view_external_quotes","can_review_external_bills","can_view_accounts_summary","can_approve_invoices"],
  OPS: ["can_manage_intake","can_search_jobs","can_generate_job_cards","can_assign_jobs","can_view_external_updates","can_view_external_quotes","can_review_external_bills","can_view_accounts_summary","can_approve_invoices"],
  FINANCE: ["can_search_jobs","can_view_approved_cost","can_view_external_quotes","can_review_external_bills","can_view_accounts_summary","can_approve_invoices"],
  FRONT_DESK: ["can_intake","can_manage_intake","can_generate_job_cards","can_view_job_progress","can_search_jobs"],
  TECHNICIAN_INTERNAL: ["can_run_internal_repairs","can_search_jobs","can_view_job_progress","can_view_external_updates"],
  MANAGER: [],
  TECH_MANAGER: [],
  SALES: [],
  SALES_MANAGER: [],
  SALES_CORPORATE: [],
  SALES_RETAIL: [],
  SALES_POS: [],
  TECH_FIELD: [],
  TECHNICIAN_EXTERNAL: [],
  INTAKE: [],
};

function roleLabel(role: Role) {
  if (role === "TECHNICIAN_INTERNAL") return "Technician";
  if (role === "TECHNICIAN_EXTERNAL") return "External Tech";
  if (role === "FRONT_DESK" || role === "INTAKE") return "Front Desk";
  if (role === "OPS") return "Operations";
  return roleOptions.find((r) => r.value === role)?.label ?? role;
}

function formatLastSeen(value?: Date | null): string {
  if (!value) return "Never";
  const diff = Date.now() - value.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-UG", { dateStyle: "short" }).format(value);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user: currentUser, orgId } = await requireOrgSession();
  if (currentUser.role !== "ADMIN") redirect("/dashboard");

  const {
    q = "",
    userId,
    add,
    inviteUrl,
    error: errorParam,
    limitError,
  } = await searchParams;
  const showAdd = add === "1";
  const query = q.trim();

  // ── Data ────────────────────────────────────────────────────────────────────
  const users = await prisma.user.findMany({
    where: { orgId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      updatedAt: true,
      sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
    },
  }).catch(() => []);

  const filtered = query
    ? users.filter((u) =>
        [u.name, u.email, u.phone ?? "", u.role, roleLabel(u.role)]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())
      )
    : users;

  const selectedUser = filtered.find((u) => u.id === userId);

  // ── Server Actions ──────────────────────────────────────────────────────────
  async function saveUserChanges(formData: FormData) {
    "use server";
    const { user: actor, orgId: oId } = await requireOrgSession();
    if (actor.role !== "ADMIN") return;
    const parsed = updateSchema.safeParse({
      id: String(formData.get("id") ?? "").trim(),
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      phone: String(formData.get("phone") ?? "").trim(),
      role: String(formData.get("role") ?? "OPS") as Role,
    });
    if (!parsed.success) return;

    const target = await prisma.user.findFirst({
      where: { id: parsed.data.id, orgId: oId },
      select: { id: true, role: true },
    });
    if (!target) return;

    const perms = roleDefaults[parsed.data.role] ?? [];

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: parsed.data.id },
        data: { name: parsed.data.name, email: parsed.data.email, phone: parsed.data.phone || null, role: parsed.data.role },
      });
      await tx.userPermission.deleteMany({ where: { userId: parsed.data.id } });
      if (perms.length) {
        await tx.userPermission.createMany({
          data: perms.map((p) => ({ userId: parsed.data.id, permission: p })),
        });
      }
    });

    revalidatePath("/settings/users");
    redirect(`/settings/users?userId=${parsed.data.id}&saved=1`);
  }

  async function resetPassword(formData: FormData) {
    "use server";
    const { session, user: actor, orgId: oId } = await requireOrgSession();
    if (actor.role !== "ADMIN") return;
    const parsed = resetSchema.safeParse({
      userId: String(formData.get("userId") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
      confirm: String(formData.get("confirm") ?? ""),
    });
    if (!parsed.success) return;
    const target = await prisma.user.findFirst({
      where: { id: parsed.data.userId, orgId: oId },
      select: { id: true },
    });
    if (!target) return;

    const hashed = await hashPassword(parsed.data.password);
    await prisma.$transaction(async (tx) => {
      await tx.account.updateMany({
        where: { userId: parsed.data.userId, providerId: "credential" },
        data: { password: hashed },
      });
      await tx.session.deleteMany({ where: { userId: parsed.data.userId } }).catch(() => {});
    });
    revalidatePath("/settings/users");
  }

  async function toggleActive(formData: FormData) {
    "use server";
    const { session, user: actor, orgId: oId } = await requireOrgSession();
    if (actor.role !== "ADMIN") return;
    const targetId = String(formData.get("userId") ?? "").trim();
    if (!targetId || targetId === session.user.id) return;
    const target = await prisma.user.findFirst({
      where: { id: targetId, orgId: oId },
      select: { id: true, isActive: true },
    });
    if (!target) return;
    await prisma.user.update({ where: { id: targetId }, data: { isActive: !target.isActive } });
    if (target.isActive) {
      await prisma.session.deleteMany({ where: { userId: targetId } }).catch(() => {});
    }
    revalidatePath("/settings/users");
  }

  async function inviteUser(formData: FormData): Promise<void> {
    "use server";
    const { user: actor, orgId: oId } = await requireOrgSession();
    if (actor.role !== "ADMIN") redirect("/settings/users");
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const role = String(formData.get("role") ?? "OPS") as Role;
    if (!email || !email.includes("@")) redirect("/settings/users?add=1&error=Invalid+email");
    const rl = rateLimit.invite(oId);
    if (!rl.allowed) redirect("/settings/users?add=1&error=Too+many+invites");
    const existing = await prisma.user.findFirst({ where: { email, orgId: oId }, select: { id: true } });
    if (existing) redirect("/settings/users?add=1&error=Email+already+used");
    const limit = await checkUserLimit(oId);
    if (!limit.allowed) redirect(`/settings/users?add=1&limitError=${encodeURIComponent(limit.reason)}`);
    await prisma.userInvite.updateMany({ where: { email, orgId: oId, usedAt: null }, data: { expiresAt: new Date() } });
    const expires = new Date();
    expires.setDate(expires.getDate() + INVITE_TTL_DAYS);
    const invite = await prisma.userInvite.create({
      data: { email, role, orgId: oId, invitedById: actor.id, expiresAt: expires },
    });
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    redirect(`/settings/users?add=1&inviteUrl=${encodeURIComponent(`${base}/invite/${invite.token}`)}`);
  }

  async function createUser(formData: FormData) {
    "use server";
    const { user: actor, orgId: oId } = await requireOrgSession();
    if (actor.role !== "ADMIN") return;
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const phone = String(formData.get("phone") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const role = String(formData.get("role") ?? "OPS") as Role;
    if (!name || !email || !password) { redirect("/settings/users"); return; }
    const limit = await checkUserLimit(oId);
    if (!limit.allowed) { redirect(`/settings/users?add=1&limitError=${encodeURIComponent(limit.reason)}`); return; }
    const created = await prisma.user.create({ data: { orgId: oId, name, email, phone: phone || null, role, emailVerified: true } });
    await prisma.account.create({ data: { accountId: created.id, providerId: "credential", userId: created.id, password: await hashPassword(password) } });
    revalidatePath("/settings/users");
    redirect(`/settings/users?userId=${created.id}`);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const savedFlag = (await searchParams).saved === "1";

  return (
    <div className="min-w-0 min-h-screen relative space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/60">Settings</p>
          <h1 className="mt-1 text-xl font-bold text-[var(--ink)]">System Users</h1>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">{filtered.length} team member{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <Link
          href={showAdd ? "/settings/users" : "/settings/users?add=1"}
          className="btn-premium inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="mr-1.5 h-4 w-4" aria-hidden="true"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" /></svg>
          {showAdd ? "Done" : "Add user"}
        </Link>
      </div>

      {(limitError || errorParam) && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {limitError}
          {errorParam?.replaceAll("+", " ")}
        </div>
      )}

      {savedFlag && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-400">
          User saved.
        </div>
      )}

      {/* Add user panel */}
      {showAdd && (
        <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="border-b border-[var(--line)] px-4 py-2.5">
            <p className="text-[13px] font-semibold text-[var(--ink)]">Add User</p>
          </div>
          <div className="space-y-4 p-4">
            {/* Invite */}
            <form action={inviteUser} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex min-w-0 flex-1 gap-2">
                <input required type="email" name="email" placeholder="colleague@company.com" className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
                <select name="role" defaultValue="OPS" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50">
                  {roleOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                </select>
              </div>
              <button type="submit" className="btn-premium shrink-0 rounded-lg px-4 py-1.5 text-[13px]">Send invite</button>
            </form>
            {inviteUrl && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="mb-1 text-[13px] font-semibold text-emerald-400">Invite link generated</p>
                <div className="flex items-center gap-2">
                  <input readOnly value={inviteUrl} className="min-w-0 flex-1 rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[12px] text-[var(--ink)]" />
                  <CopyButton text={inviteUrl} />
                </div>
              </div>
            )}
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--line)]" /></div>
              <p className="relative flex justify-center bg-[var(--panel)] pr-3 text-[12px] text-[var(--ink-muted)]"><span className="bg-[var(--panel-strong)] px-2">or create directly</span></p>
            </div>
            <form action={createUser} className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              <input required name="name" placeholder="Full name" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50" />
              <input required type="email" name="email" placeholder="Email" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50" />
              <input name="phone" placeholder="Phone (optional)" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50" />
              <input required minLength={8} type="password" name="password" placeholder="Password (min 8)" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50" />
              <select name="role" defaultValue="OPS" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50">
                {roleOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>
              <button type="submit" className="btn-premium rounded-lg px-4 py-1.5 text-[13px] sm:col-span-2 xl:col-span-5">Create user</button>
            </form>
          </div>
        </section>
      )}

      {/* User list — always full width */}
      <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" aria-hidden="true"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM3 9a6 6 0 1 1 12 0A6 6 0 0 1 3 9Zm9.78 8.22a.75.75 0 0 0-1.06-1.06l-3.25 3.22V8.5a.75.75 0 0 0-1.5 0v5.09l-3.22-3.22a.75.75 0 1 0-1.06 1.06l3.75 3.75a.75.75 0 0 0 1.06 0l3.78-3.75Z" clipRule="evenodd" /></svg>
          <form method="GET" className="min-w-0 flex-1">
            <input name="q" defaultValue={query} placeholder="Search…" className="min-w-0 w-full rounded border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1 text-[13px] outline-none focus:border-[var(--accent)]/50" />
          </form>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-[var(--ink-muted)]">No users found.</p>
          ) : (
            filtered.map((u) => (
              <Link
                key={u.id}
                data-user-id={u.id}
                href={`/settings/users?userId=${u.id}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                className={`flex items-center gap-3 px-3 py-2.5 transition ${selectedUser?.id === u.id ? "bg-[var(--accent)]/8" : "hover:bg-[var(--panel-strong)]/40"}`}
              >
                <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${u.isActive ? "bg-emerald-400" : "bg-[var(--line)]"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[var(--ink)]">{u.name}</p>
                  <p className="truncate text-[12px] text-[var(--ink-muted)]">{roleLabel(u.role)}</p>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>

      {/* Detail overlay panel — absolute inset-y-0 fills parent (min-h-screen relative container) */}
      {selectedUser && (
        <>
          <Link
            href={`/settings/users${query ? `?q=${encodeURIComponent(query)}` : ""}`}
            className="absolute inset-0 z-10 bg-black/30 backdrop-blur-[2px]"
            aria-label="Close"
          />
          <div className="absolute inset-y-0 right-0 z-20 w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-2xl">
              {/* Panel header */}
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[var(--ink)]">{selectedUser.name}</p>
                  <p className="text-[13px] text-[var(--ink-muted)]">{selectedUser.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-semibold ${selectedUser.isActive ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"}`}>
                    {selectedUser.isActive ? <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true"><circle cx="10" cy="10" r="5" /></svg> : <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true"><circle cx="10" cy="10" r="5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>}
                    {selectedUser.isActive ? "Active" : "Inactive"}
                  </span>
                  <Link
                    href={`/settings/users${query ? `?q=${encodeURIComponent(query)}` : ""}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
                    title="Close"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
                  </Link>
                </div>
              </div>

              <div className="p-4 space-y-6">
                {/* Profile form */}
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-[var(--ink-muted)]" aria-hidden="true"><path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM7 9a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM3 9a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm9 7.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" /></svg>
                    <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">User Profile</p>
                  </div>
                  <form action={saveUserChanges} className="space-y-3">
                    <input type="hidden" name="id" value={selectedUser.id} />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <label className="text-[12px] font-medium text-[var(--ink-muted)]">Name</label>
                        <input name="name" defaultValue={selectedUser.name} required className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[12px] font-medium text-[var(--ink-muted)]">Email</label>
                        <input name="email" type="email" defaultValue={selectedUser.email} required className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[12px] font-medium text-[var(--ink-muted)]">Phone</label>
                        <input name="phone" defaultValue={selectedUser.phone ?? ""} className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-[12px] font-medium text-[var(--ink-muted)]">Role</label>
                        <select name="role" defaultValue={selectedUser.role} className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14">
                          {roleOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                        </select>
                        <p className="text-[12px] text-[var(--ink-muted)]">{roleOptions.find((o) => o.value === selectedUser.role)?.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pt-1">
                      <button type="submit" className="btn-premium rounded-lg px-6 py-2 text-[13px] font-semibold">Save Changes</button>
                    </div>
                  </form>
                </div>

                <div className="border-t border-[var(--line)]" />

                {/* Permissions */}
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-[var(--ink-muted)]" aria-hidden="true"><path fillRule="evenodd" d="M9.661 2.237a.75.75 0 0 1 .678 0 11.9 11.9 0 0 1 5.455 3.05l.255.255a.75.75 0 0 1-.238.948l-1.07.535a.75.75 0 0 1-1.07-.237l-.446-.892A9.4 9.4 0 0 0 8.94 3.653a.75.75 0 0 1 0-.535l.447-.892a.75.75 0 0 1 .238.948l-1.07.535a.75.75 0 0 1-1.07-.237l-.255-.255a11.9 11.9 0 0 0-5.455-3.05.75.75 0 0 1 0-.678l.91-1.82a.75.75 0 0 1 .832-.433l.255.255a11.9 11.9 0 0 1 5.455 3.05.75.75 0 0 1 .255.535 10.5 10.5 0 0 0-4.168-.535.75.75 0 0 1-.448-.129l-.255-.255a.75.75 0 0 1-.238-.948l.91-1.82Z" clipRule="evenodd" /></svg>
                    <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Permissions</p>
                  </div>
                  <RolePermissions role={selectedUser.role} userId={selectedUser.id} />
                </div>

                <div className="border-t border-[var(--line)]" />

                {/* Password reset */}
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70 transition hover:text-[var(--accent)]">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" /></svg>
                    Reset Password
                    <svg viewBox="0 0 20 20" fill="currentColor" className="ml-auto h-4 w-4 transition group-open:rotate-180" aria-hidden="true"><path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 0-1.06l4.97-4.97a.75.75 0 0 1 1.06 0l4.97 4.97a.75.75 0 0 1 0 1.06l-4.97 4.97a.75.75 0 0 1-1.06 0l-4.97-4.97Z" clipRule="evenodd" /></svg>
                  </summary>
                  <form action={resetPassword} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <input type="hidden" name="userId" value={selectedUser.id} />
                    <input required minLength={8} type="password" name="password" placeholder="New password" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50" />
                    <input required minLength={8} type="password" name="confirm" placeholder="Confirm password" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50" />
                    <button type="submit" className="btn-premium rounded-lg px-4 py-1.5 text-[13px]">Reset</button>
                  </form>
                </details>

                <div className="border-t border-[var(--line)]" />

                {/* Active / Deactivate */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Account Status</p>
                    <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
                      {selectedUser.isActive ? "User can sign in and access the system." : "User is deactivated and cannot sign in."}
                    </p>
                  </div>
                  {currentUser.id !== selectedUser.id ? (
                    <details className="group relative">
                      <summary className={`inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition ${selectedUser.isActive ? "border-red-400/30 text-red-400 hover:bg-red-500/10" : "border-emerald-400/30 text-emerald-400 hover:bg-emerald-500/10"}`}>
                        {selectedUser.isActive ? "Deactivate" : "Activate"}
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true"><path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 0-1.06l4.97-4.97a.75.75 0 0 1 1.06 0l4.97 4.97a.75.75 0 0 1 0 1.06l-4.97 4.97a.75.75 0 0 1-1.06 0l-4.97-4.97Z" clipRule="evenodd" /></svg>
                      </summary>
                      <div className="absolute right-0 top-full z-10 mt-2 w-72 rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] p-4 shadow-lg">
                        <p className="mb-3 text-[13px] text-[var(--ink)]">
                          {selectedUser.isActive ? "Are you sure you want to deactivate this user?" : "Reactivate this user?"}
                        </p>
                        <form action={toggleActive}>
                          <input type="hidden" name="userId" value={selectedUser.id} />
                          <button type="submit" className={`w-full rounded-lg px-3 py-1.5 text-[13px] font-semibold ${selectedUser.isActive ? "bg-red-500/15 text-red-400 hover:bg-red-500/20 border border-red-400/30" : "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-400/30"}`}>
                            Yes, {selectedUser.isActive ? "deactivate" : "activate"}
                          </button>
                        </form>
                      </div>
                    </details>
                  ) : (
                    <p className="rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1 text-[12px] text-[var(--ink-muted)]">You</p>
                  )}
                </div>

                <p className="text-[12px] text-[var(--ink-muted)]">
                  Last active {formatLastSeen(selectedUser.sessions[0]?.updatedAt ?? selectedUser.updatedAt)}
                </p>
              </div>
            </div>
          </>
        )}
    </div>
  );
}

async function RolePermissions({ role }: { role: Role; userId: string }) {
  const perms = roleDefaults[role] ?? [];
  return (
    <div>
      <p className="text-[13px] text-[var(--ink-muted)] mb-1">{roleOptions.find((o) => o.value === role)?.description}</p>
      <div className="flex flex-wrap gap-1.5">
        {perms.map((p) => (
          <span key={p} className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-0.5 text-[12px] text-[var(--ink-muted)]">
            {p.replace(/^can_/, "").replace(/_/g, " ")}
          </span>
        ))}
        {perms.length === 0 && <span className="text-[13px] text-[var(--ink-muted)]">No custom permissions for this role.</span>}
      </div>
    </div>
  );
}
