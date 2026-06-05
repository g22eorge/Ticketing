// @ts-nocheck
export const dynamic = "force-dynamic";

import Link from "next/link";
import { JobStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";


import { can } from "@/lib/permissions";
import { orgDb } from "@/lib/prisma";
import { sanitizeOptionalText, sanitizeText } from "@/lib/sanitize";
import { getCurrentUserRole } from "@/lib/session";
import { formatEATDate } from "@/lib/date-eat";

const createClientSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(3),
  email: z.string().optional(),
  organization: z.string().optional(),
});

type SearchParams = {
  q?: string;
  segment?: string;
  page?: string;
  create?: string;
  createError?: string;
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user } = await getCurrentUserRole();
  const db = orgDb(user.orgId);
  if (!can.viewClientInfo(user)) {
    redirect("/dashboard");
  }

  const filters = await searchParams;
  const page = Math.max(Number(filters.page ?? "1") || 1, 1);
  const pageSize = 20;
  const segment = filters.segment ?? "all";

  const where: Prisma.ClientWhereInput = {
    ...(filters.q
      ? {
          OR: [
            { fullName: { contains: filters.q } },
            { phone: { contains: filters.q } },
            { email: { contains: filters.q } },
            { organization: { contains: filters.q } },
          ],
        }
      : {}),
  };

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Build segment filter for the DB query
  const segmentWhere: Prisma.ClientWhereInput =
    segment === "active" ? { jobs: { some: {} } }
    : segment === "new"  ? { jobs: { none: {} } }
    : segment === "high" ? { jobs: { some: {} } } // further filtered below
    : {};

  const pagedWhere: Prisma.ClientWhereInput = { ...where, ...segmentWhere };

  const [matchingClients, total, totalClients, activeClients, newClients, withManyJobs, kpiNewThisMonth, kpiWithActiveJobs, kpiWithOrg] = await Promise.all([
    db.client.findMany({
      where: pagedWhere,
      include: { _count: { select: { jobs: true } } },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.client.count({ where: pagedWhere }).catch(() => 0),
    db.client.count().catch(() => 0),
    db.client.count({ where: { jobs: { some: {} } } }).catch(() => 0),
    db.client.count({ where: { jobs: { none: {} } } }).catch(() => 0),
    db.client.count({ where: { jobs: { some: {} } } }).catch(() => 0), // approx for "high" tab badge
    db.client.count({ where: { createdAt: { gte: monthStart } } }).catch(() => 0),
    db.client.count({ where: { jobs: { some: { status: { notIn: [JobStatus.COMPLETED, JobStatus.CLOSED] } } } } }).catch(() => 0),
    db.client.count({ where: { organization: { not: null } } }).catch(() => 0),
  ]);

  type ClientRow = Prisma.ClientGetPayload<{
    include: { _count: { select: { jobs: true } } };
  }>;

  // For "high" segment: the DB returned all clients with jobs, now filter locally on the page only
  const filteredClients = segment === "high"
    ? (matchingClients as ClientRow[]).filter((c) => c._count.jobs >= 3)
    : (matchingClients as ClientRow[]);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, total);
  const prevPage = Math.max(page - 1, 1);
  const nextPage = Math.min(page + 1, totalPages);
  const isPrevDisabled = page <= 1;
  const isNextDisabled = page >= totalPages;
  const clients = filteredClients;
  // kpiTotal is the same as totalClients (total count across all segments for the KPI bar)
  const kpiTotal = totalClients;

  async function createClientAction(formData: FormData) {
    "use server";

    const { user: currentUser } = await getCurrentUserRole();
    if (!(currentUser.role === "ADMIN" || currentUser.role === "OPS")) return;

    const parsed = createClientSchema.safeParse({
      fullName: String(formData.get("fullName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      organization: String(formData.get("organization") ?? ""),
    });

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const field = String(firstIssue?.path[0] ?? "input");
      const msg = field === "fullName" ? "Full name must be at least 2 characters"
        : field === "phone" ? "Phone number must be at least 3 characters"
        : "Invalid input";
      redirect(`/clients?createError=${encodeURIComponent(msg)}`);
    }

    const normalizedPhone = sanitizeText(parsed.data.phone);
    const orgClient = orgDb(currentUser.orgId);
    const existingByPhone = await orgClient.client.findFirst({
      where: { phone: normalizedPhone },
      select: { id: true },
    });

    if (existingByPhone) {
      redirect(`/clients?createError=${encodeURIComponent("A client with this phone number already exists")}`);
    }

    await orgClient.client.create({
      data: {
        fullName: sanitizeText(parsed.data.fullName),
        phone: normalizedPhone,
        email: sanitizeOptionalText(parsed.data.email),
        organization: sanitizeOptionalText(parsed.data.organization),
      },
    });

    revalidatePath("/clients");

    // Close the quick-create panel by returning to the base URL.
    redirect("/clients");
  }

  async function deleteClientAction(formData: FormData) {
    "use server";

    const { user: currentUser } = await getCurrentUserRole();
    const db = orgDb(user.orgId);
    if (currentUser.role !== "ADMIN") return;

    const id = String(formData.get("id") ?? "");
    if (!id) return;

    const clientWithJobs = await db.client.findUnique({
      where: { id },
      include: { _count: { select: { jobs: true } } },
    });

    if (!clientWithJobs || clientWithJobs._count.jobs > 0) return;
    await db.client.delete({ where: { id } });
    revalidatePath("/clients");
  }

  const preserved = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => typeof value === "string" && value.length > 0),
  ) as Record<string, string>;
  const hasClientFilters = Boolean(filters.q || segment !== "all");
  const showCreate = filters.create === "1" || Boolean(filters.createError);

  const preservedWithoutSegment = Object.fromEntries(
    Object.entries(preserved).filter(([key]) => key !== "segment" && key !== "page"),
  ) as Record<string, string>;
  function segmentHref(next: string) {
    const params = new URLSearchParams(preservedWithoutSegment);
    if (next && next !== "all") params.set("segment", next);
    const query = params.toString();
    return query ? `/clients?${query}` : "/clients";
  }

  const paginationBar = totalPages > 1 ? (
    <div className="flex items-center gap-1.5">
      <Link
        href={`?${new URLSearchParams({ ...preserved, page: String(prevPage) }).toString()}`}
        aria-disabled={isPrevDisabled}
        className={`rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-medium transition-colors ${
          isPrevDisabled
            ? "pointer-events-none opacity-30 text-[var(--ink-muted)]"
            : "text-[var(--ink)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/6"
        }`}
      >
        ← Prev
      </Link>
      <span className="min-w-[3rem] text-center text-xs tabular-nums text-[var(--ink-muted)]">{page} / {totalPages}</span>
      <Link
        href={`?${new URLSearchParams({ ...preserved, page: String(nextPage) }).toString()}`}
        aria-disabled={isNextDisabled}
        className={`rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-medium transition-colors ${
          isNextDisabled
            ? "pointer-events-none opacity-30 text-[var(--ink-muted)]"
            : "text-[var(--ink)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/6"
        }`}
      >
        Next →
      </Link>
    </div>
  ) : null;

  return (
    <div className="space-y-4">

      {/* ══ MOBILE HEADER ══ */}
      <div className="lg:hidden space-y-3">
        {/* Title row + New Client CTA */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-black text-[var(--ink)]">Clients</h1>
            <p className="text-[13px] text-[var(--ink-muted)]">{kpiTotal} total</p>
          </div>
          {(user.role === "ADMIN" || user.role === "OPS") ? (
            <Link href="/clients?create=1"
              className="btn-premium rounded-xl px-4 py-2 text-[13px] font-bold">
              + New
            </Link>
          ) : null}
        </div>

        {/* Compact 4-number stat row */}
        <div className="grid grid-cols-4 overflow-hidden rounded-2xl border border-[var(--line)] divide-x divide-[var(--line)]">
          {([
            { label: "Total",   value: kpiTotal },
            { label: "New",     value: kpiNewThisMonth },
            { label: "Active",  value: kpiWithActiveJobs },
            { label: "Orgs",    value: kpiWithOrg },
          ] as const).map(({ label, value }) => (
            <div key={label} className="flex flex-col items-center py-3">
              <p className="text-[22px] font-black leading-none tabular-nums text-[var(--ink)]">{value}</p>
              <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">{label}</p>
            </div>
          ))}
        </div>

        {/* 4-chip segment filter — grid fills full width */}
        <div className="grid grid-cols-4 gap-1.5">
          {([
            { seg: "all",    label: "All",      count: totalClients },
            { seg: "active", label: "Active",   count: activeClients },
            { seg: "new",    label: "No job",   count: newClients },
            { seg: "high",   label: "Top",      count: withManyJobs },
          ] as const).map(({ seg, label, count }) => (
            <Link key={seg} href={segmentHref(seg)}
              className={`rounded-full py-1.5 text-center text-[12px] font-bold transition ${
                segment === seg
                  ? "bg-[var(--accent)] text-black"
                  : "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"
              }`}>
              {label}{count > 0 && segment !== seg ? ` ${count}` : ""}
            </Link>
          ))}
        </div>

        {/* Search — full width, no redundant button */}
        <form method="GET">
          {filters.segment ? <input type="hidden" name="segment" value={filters.segment} /> : null}
          <div className="relative">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]/50" aria-hidden>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Name, phone or email…"
              className="h-10 w-full rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] pl-9 pr-4 text-[13px] outline-none placeholder:text-[var(--ink-muted)]/50 focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/14"
            />
            {filters.q && (
              <Link href="/clients" className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]/50">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </Link>
            )}
          </div>
        </form>
      </div>

      {/* ══ DESKTOP: KPI tiles (unchanged) ══ */}
      <div className="hidden lg:grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Total Clients</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{kpiTotal}</p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">all time</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">New This Month</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{kpiNewThisMonth}</p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">+{kpiNewThisMonth} this month</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">With Active Jobs</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{kpiWithActiveJobs}</p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">open repairs</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Organisations</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{kpiWithOrg}</p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">with org name</p>
        </div>
      </div>

      {/* ══ DESKTOP: Stat chips + New Client ══ */}
      <div className="panel-shadow hidden lg:flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {([
            { seg: "all",  label: `${totalClients} total`          },
            { seg: "active", label: `${activeClients} active`       },
            { seg: "new",  label: `${newClients} no job`            },
            { seg: "high", label: `${withManyJobs} high activity`   },
          ] as const).map(({ seg, label }) => (
            <Link key={seg} href={segmentHref(seg)}
              className={`rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${
                segment === seg
                  ? "border-[var(--accent)] bg-[var(--accent)] text-black"
                  : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40"
              }`}>
              {label}
            </Link>
          ))}
        </div>
        {(user.role === "ADMIN" || user.role === "OPS") ? (
          <Link href="/clients?create=1" className="btn-premium shrink-0 rounded-lg px-4 py-2.5 text-[12px] font-bold">
            + New Client
          </Link>
        ) : null}
      </div>

      {/* ══ DESKTOP: Filter panel ══ */}
      <div className="panel-shadow hidden lg:block rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <form className="space-y-2.5 p-3">
          <div className="flex items-center gap-2">
            <input
              name="q"
              defaultValue={filters.q}
              aria-label="Search clients"
              placeholder="Search by name, phone, email…"
              className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none transition placeholder:text-[var(--ink-muted)] focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15"
            />
            <button type="submit" className="btn-premium-secondary shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium">Search</button>
            {hasClientFilters ? (
              <Link href="/clients" className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-1.5 text-[12px] text-[var(--ink-muted)]">Reset</Link>
            ) : null}
          </div>
        </form>

        {/* Quick create form for OPS/ADMIN — collapsed by default */}
        {(user.role === "ADMIN" || user.role === "OPS") ? (
          <details open={showCreate} className="border-t border-[var(--line)]">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)] hover:bg-[var(--panel-strong)]/30 [&::-webkit-details-marker]:hidden">
              Quick create client
              <span className="text-[13px] font-semibold text-[var(--accent)]">{showCreate ? "Hide" : "Show"}</span>
            </summary>
            <form action={createClientAction} noValidate className="px-3 pb-3">
              {filters.createError ? (
                <p className="mb-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  {filters.createError}
                </p>
              ) : null}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input name="fullName" placeholder="Full name *" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15" />
                <input name="phone" placeholder="Phone *" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15" />
                <input name="email" placeholder="Email" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15" />
                <input name="organization" placeholder="Organization" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button type="submit" className="btn-premium rounded-lg px-4 py-2.5 text-[13px] font-bold">
                  Create
                </button>
                <Link href="/clients" className="text-xs font-medium text-[var(--ink-muted)] underline-offset-2 hover:underline">
                  Cancel
                </Link>
              </div>
            </form>
          </details>
        ) : null}
      </div>

      {/* ── Clients table / cards ── */}
      {clients.length === 0 ? (
        <div className="panel-shadow flex flex-col items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-6 py-14 text-center">
          <svg viewBox="0 0 40 40" fill="none" className="h-10 w-10 opacity-20" aria-hidden="true">
            <circle cx="20" cy="14" r="7" stroke="currentColor" strokeWidth="2"/>
            <path d="M6 36c0-7.732 6.268-14 14-14s14 6.268 14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <p className="text-sm font-medium text-[var(--ink-muted)]">No clients match this view</p>
          {hasClientFilters ? (
            <Link href="/clients" className="text-xs text-[var(--accent)] hover:underline">Clear filters</Link>
          ) : null}
        </div>
      ) : (
        <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">

          {/* Table header bar — desktop shows pagination, mobile shows count only */}
          <div className="hidden lg:flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
            <p className="text-xs text-[var(--ink-muted)]">
              <span className="font-bold text-[var(--ink)]">{pageStart}–{pageEnd}</span>
              {" of "}
              <span className="font-bold text-[var(--ink)]">{total}</span>
              {" clients"}
            </p>
            {paginationBar}
          </div>

          {/* ── Mobile cards ── */}
          <div className="lg:hidden">
              {(clients as ClientRow[]).map((client) => (
                <div key={client.id} className="border-b border-[var(--line)] last:border-b-0">
                  {/* Single-row card: avatar + content + inline action icons */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Avatar */}
                    <Link href={`/clients/${client.id}`} className="shrink-0">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-black ${
                        client._count.jobs >= 3 ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                        : client._count.jobs > 0 ? "bg-sky-500/15 text-sky-600"
                        : "bg-[var(--panel-strong)] text-[var(--ink-muted)]"
                      }`}>
                        {client.fullName[0]?.toUpperCase() ?? "?"}
                      </div>
                    </Link>
                    {/* Content — tappable to open detail */}
                    <Link href={`/clients/${client.id}`} className="min-w-0 flex-1 active:opacity-70">
                      <p className="truncate text-[14px] font-bold text-[var(--ink)]">{client.fullName}</p>
                      <p className="mt-0.5 truncate text-[13px] text-[var(--ink-muted)]">
                        {client.phone}
                        {client.organization ? <> · <span className="opacity-80">{client.organization}</span></> : null}
                        {client._count.jobs > 0
                          ? <> · <span className={client._count.jobs >= 3 ? "text-[var(--accent)] font-semibold" : ""}>{client._count.jobs} {client._count.jobs === 1 ? "job" : "jobs"}</span></>
                          : null}
                      </p>
                    </Link>
                    {/* Inline action icons — compact, no separate row */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      <a href={`tel:${client.phone}`} aria-label={`Call ${client.fullName}`}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] active:bg-[var(--panel-strong)]/60">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.09 9.5a19.79 19.79 0 01-3-8.72A2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>
                      </a>
                      <a href={`https://wa.me/${client.phone.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${client.fullName}`}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/8 text-emerald-600 active:bg-emerald-500/15">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      </a>
                      {user.role === "ADMIN" && client._count.jobs === 0 ? (
                        <form action={deleteClientAction}>
                          <input type="hidden" name="id" value={client.id} />
                          <button type="submit" aria-label="Delete client"
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]/50 active:text-red-500">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}

            {totalPages > 1 ? (
              <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-3">
                <span className="text-xs text-[var(--ink-muted)]">
                  <span className="font-semibold text-[var(--ink)]">{pageStart}–{pageEnd}</span> of {total}
                </span>
                {paginationBar}
              </div>
            ) : null}
          </div>

          {/* ── Desktop table ── */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[860px] border-collapse text-[13px]">
              <thead className="bg-[var(--panel-strong)]/50 text-left text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
                <tr className="border-b border-[var(--line)]">
                  <th className="w-[3px] p-0" aria-hidden="true" />
                  <th className="px-4 py-2.5">Client</th>
                  <th className="px-4 py-2.5">Phone</th>
                  <th className="hidden px-4 py-2.5 2xl:table-cell">Email</th>
                  <th className="hidden px-4 py-2.5 2xl:table-cell">Organization</th>
                  <th className="px-4 py-2.5">Jobs</th>
                  <th className="px-4 py-2.5">Joined</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {(clients as ClientRow[]).map((client) => (
                  <tr key={`desktop-${client.id}`} className="group transition-colors hover:bg-[var(--panel-strong)]/40">
                    {/* Activity strip */}
                    <td className="w-[3px] p-0" aria-hidden="true">
                      <div className={`h-full min-h-[3rem] w-[3px] ${
                        client._count.jobs >= 3
                          ? "bg-[var(--accent)]"
                          : client._count.jobs > 0
                            ? "bg-blue-400"
                            : "bg-slate-200"
                      }`} />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <Link
                        href={`/clients/${client.id}`}
                        className="font-semibold text-[var(--ink)] transition-colors hover:text-[var(--accent)]"
                      >
                        {client.fullName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-middle text-[var(--ink-muted)]">{client.phone}</td>
                    <td className="hidden px-4 py-3 align-middle text-[var(--ink-muted)] 2xl:table-cell">{client.email ?? <span className="opacity-40">—</span>}</td>
                    <td className="hidden px-4 py-3 align-middle text-[var(--ink-muted)] 2xl:table-cell">{client.organization ?? <span className="opacity-40">—</span>}</td>
                    <td className="px-4 py-3 align-middle">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${
                        client._count.jobs >= 3
                          ? "border border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[#9A7A00]"
                          : client._count.jobs > 0
                            ? "border border-blue-400/30 bg-blue-500/10 text-blue-700 dark:text-blue-400"
                            : "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"
                      }`}>
                        {client._count.jobs}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle text-[var(--ink-muted)]">
                      {formatEATDate(client.createdAt)}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/clients/${client.id}`}
                          className="btn-premium-secondary whitespace-nowrap rounded-lg px-2.5 py-1 text-[13px] font-semibold"
                        >
                          Open
                        </Link>
                        {user.role === "ADMIN" ? (
                          <form action={deleteClientAction} className="inline">
                            <input type="hidden" name="id" value={client.id} />
                            <button
                              type="submit"
                              disabled={client._count.jobs > 0}
                              className="whitespace-nowrap rounded-lg border border-red-400/30 bg-red-500/5 px-2.5 py-1 text-[13px] font-medium text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Delete
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}

    </div>
  );
}
