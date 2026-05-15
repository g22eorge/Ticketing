import Link from "next/link";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { SearchToggle } from "@/components/shared/SearchToggle";


import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sanitizeOptionalText, sanitizeText } from "@/lib/sanitize";
import { requireOrgSession } from "@/lib/org-context";
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
  const { user, orgId } = await requireOrgSession();
  if (!can.viewClientInfo(user)) {
    redirect("/dashboard");
  }

  const filters = await searchParams;
  const page = Math.max(Number(filters.page ?? "1") || 1, 1);
  const pageSize = 20;
  const segment = filters.segment ?? "all";

  const where: Prisma.ClientWhereInput = {
    orgId,
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

  const [matchingClients, allCounts] = await Promise.all([
    prisma.client.findMany({
      where,
      include: { _count: { select: { jobs: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.client.findMany({ where: { orgId }, include: { _count: { select: { jobs: true } } } }),
  ]);

  type ClientRow = Prisma.ClientGetPayload<{
    include: { _count: { select: { jobs: true } } };
  }>;

  const segmentedClients = (matchingClients as ClientRow[]).filter((client) => {
    if (segment === "active") return client._count.jobs > 0;
    if (segment === "new") return client._count.jobs === 0;
    if (segment === "high") return client._count.jobs >= 3;
    return true;
  });

  const total = segmentedClients.length;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, total);
  const prevPage = Math.max(page - 1, 1);
  const nextPage = Math.min(page + 1, totalPages);
  const isPrevDisabled = page <= 1;
  const isNextDisabled = page >= totalPages;
  const clients = segmentedClients.slice((page - 1) * pageSize, page * pageSize);
  const totalClients = allCounts.length;
  const activeClients = allCounts.filter((c) => c._count.jobs > 0).length;
  const newClients = allCounts.filter((c) => c._count.jobs === 0).length;
  const withManyJobs = allCounts.filter((c) => c._count.jobs >= 3).length;

  async function createClientAction(formData: FormData) {
    "use server";

    const { user: currentUser, orgId: createOrgId } = await requireOrgSession();
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
    const existingByPhone = await prisma.client.findFirst({
      where: { orgId: createOrgId, phone: normalizedPhone },
      select: { id: true },
    });

    if (existingByPhone) {
      redirect(`/clients?createError=${encodeURIComponent("A client with this phone number already exists")}`);
    }

    await prisma.client.create({
      data: {
        orgId: createOrgId,
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

    const { user: currentUser, orgId: deleteOrgId } = await requireOrgSession();
    if (currentUser.role !== "ADMIN") return;

    const id = String(formData.get("id") ?? "");
    if (!id) return;

    const clientWithJobs = await prisma.client.findUnique({
      where: { id, orgId: deleteOrgId },
      include: { _count: { select: { jobs: true } } },
    });

    if (!clientWithJobs || clientWithJobs._count.jobs > 0) return;
    await prisma.client.delete({ where: { id, orgId: deleteOrgId } });
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

      {/* ── Stat chips bar ── */}
      <div className="panel-shadow flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Link
            href={segmentHref("all")}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
              segment === "all"
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"
            }`}
          >
            <span className={`font-bold ${segment === "all" ? "text-white" : "text-[var(--ink)]"}`}>{totalClients}</span> total
          </Link>
          <Link
            href={segmentHref("active")}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
              segment === "active"
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"
            }`}
          >
            <span className={`font-bold ${segment === "active" ? "text-white" : "text-[var(--ink)]"}`}>{activeClients}</span> active
          </Link>
          <Link
            href={segmentHref("new")}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
              segment === "new"
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"
            }`}
          >
            <span className={`font-bold ${segment === "new" ? "text-white" : "text-[var(--ink)]"}`}>{newClients}</span> no job
          </Link>
          <Link
            href={segmentHref("high")}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
              segment === "high"
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"
            }`}
          >
            <span className={`font-bold ${segment === "high" ? "text-white" : "text-[var(--ink)]"}`}>{withManyJobs}</span> high activity
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SearchToggle basePath="/clients" defaultValue={filters.q} placeholder="Search by name, phone, email…" preserve={{ segment: filters.segment !== "all" ? filters.segment : undefined }} />
          {(user.role === "ADMIN" || user.role === "OPS") ? (
            <Link
              href={showCreate ? "/clients" : "/clients?create=1"}
              className={`rounded-lg border px-3 py-1.5 text-[12px] font-bold transition ${
                showCreate
                  ? "border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  : "border-[var(--accent)]/40 bg-[var(--accent)] text-white shadow-sm hover:bg-[var(--accent)]/90"
              }`}
            >
              {showCreate ? "✕ Cancel" : "+ New Client"}
            </Link>
          ) : null}
        </div>
      </div>

      {/* ── New Client form (shown only when ?create=1) ── */}
      {showCreate && (user.role === "ADMIN" || user.role === "OPS") ? (
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">New Client</p>
          <form action={createClientAction} noValidate>
            {filters.createError ? (
              <p className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-400">
                {filters.createError}
              </p>
            ) : null}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input name="fullName" placeholder="Full name *" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15" />
              <input name="phone" placeholder="Phone *" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15" />
              <input name="email" placeholder="Email" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15" />
              <input name="organization" placeholder="Organization" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15" />
            </div>
            <div className="mt-2">
              <button className="btn-premium rounded-lg px-4 py-2 text-[13px] text-white">
                Create Client
              </button>
            </div>
          </form>
        </div>
      ) : null}

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

          {/* Table header bar with count + pagination */}
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
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
                <div
                  key={client.id}
                  className="relative border-b border-[var(--line)] bg-[var(--panel)] last:border-b-0 transition-colors hover:bg-[var(--panel-strong)]/40"
                >
                  <span
                    className={`absolute inset-y-0 left-0 w-[5px] ${
                      client._count.jobs >= 3
                        ? "bg-[var(--accent)]"
                        : client._count.jobs > 0
                          ? "bg-blue-400"
                          : "bg-slate-200"
                    }`}
                    aria-hidden="true"
                  />
                  {/* Full-bleed tap target */}
                  <Link href={`/clients/${client.id}`} className="absolute inset-0 z-0" aria-label={`Open ${client.fullName}`} />

                  <div className="pointer-events-none relative z-10 px-4 py-3 pl-6">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-medium tracking-wide text-[var(--ink-muted)]/50">
                        {client._count.jobs} {client._count.jobs === 1 ? "job" : "jobs"}
                      </span>
                      {user.role === "ADMIN" && client._count.jobs === 0 ? (
                        <form action={deleteClientAction} className="pointer-events-auto">
                          <input type="hidden" name="id" value={client.id} />
                          <button className="text-[10px] font-medium uppercase tracking-wide text-[var(--ink-muted)]/50 transition hover:text-red-500">
                            ✕
                          </button>
                        </form>
                      ) : (
                        <svg viewBox="0 0 6 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-1.5 shrink-0 text-[var(--ink-muted)]/25" aria-hidden="true">
                          <path d="M1 1l4 4-4 4"/>
                        </svg>
                      )}
                    </div>
                    <p className="text-[15px] font-bold leading-snug tracking-tight text-[var(--ink)]">{client.fullName}</p>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--ink-muted)]">
                      <span>{client.phone}</span>
                      {client.organization ? (
                        <>
                          <span className="opacity-40">·</span>
                          <span className="truncate">{client.organization}</span>
                        </>
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
              <thead className="bg-[var(--panel-strong)]/50 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
                <tr className="border-b border-[var(--line)]">
                  <th className="w-[3px] p-0" aria-hidden="true" />
                  <th className="px-4 py-2.5">Client</th>
                  <th className="px-4 py-2.5">Phone</th>
                  <th className="hidden px-4 py-2.5 2xl:table-cell">Email</th>
                  <th className="hidden px-4 py-2.5 2xl:table-cell">Organization</th>
                  <th className="px-4 py-2.5">Jobs</th>
                  <th className="px-4 py-2.5">Updated</th>
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
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        client._count.jobs >= 3
                          ? "border border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[#9A7A00]"
                          : client._count.jobs > 0
                            ? "border border-blue-200 bg-blue-50 text-blue-700"
                            : "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"
                      }`}>
                        {client._count.jobs}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle text-[var(--ink-muted)]">
                      {formatEATDate(client.updatedAt)}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/clients/${client.id}`}
                          className="whitespace-nowrap rounded-lg border border-[var(--line)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/8 hover:text-[var(--accent)]"
                        >
                          Open
                        </Link>
                        {user.role === "ADMIN" ? (
                          <form action={deleteClientAction} className="inline">
                            <input type="hidden" name="id" value={client.id} />
                            <button
                              disabled={client._count.jobs > 0}
                              className="whitespace-nowrap rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-500 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
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
