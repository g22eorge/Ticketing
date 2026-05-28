// @ts-nocheck
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { JournalEntryStatus } from "@prisma/client";
import { getCurrentUserRole } from "@/lib/session";

import { prisma } from "@/lib/prisma";
import { formatMoney, formatMoneyCompact } from "@/lib/currency";
import { RowActionsMenu, MenuSection, MenuDestructiveRow } from "@/components/shared/RowActionsMenu";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
import { can } from "@/lib/permissions";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const STATUSES: JournalEntryStatus[] = ["DRAFT", "POSTED", "VOID"];

const STATUS_STYLE: Record<JournalEntryStatus, string> = {
  DRAFT:  "bg-amber-500/10 text-amber-700",
  POSTED: "bg-green-500/10 text-green-700",
  VOID:   "bg-[var(--panel-strong)] text-[var(--ink-muted)]",
};

export const dynamic = "force-dynamic";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const { user } = await getCurrentUserRole();
  if (!can.viewFinancials(user)) redirect("/dashboard");

  const sp = await searchParams;
  const now    = new Date();
  const year   = parseInt(sp.year  ?? String(now.getFullYear()));
  const month  = parseInt(sp.month ?? "0"); // 0 = all months
  const statusFilter = sp.status ?? "all";
  const searchQ = (sp.q ?? "").trim();
  const currency = "UGX";

  // ── Date ranges ───────────────────────────────────────────────────────────
  const periodFilter =
    month > 0
      ? { gte: new Date(year, month - 1, 1), lte: new Date(year, month, 0, 23, 59, 59) }
      : { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31, 23, 59, 59) };

  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const ytdStart       = new Date(now.getFullYear(), 0, 1);

  // ── Server actions ────────────────────────────────────────────────────────
  async function createEntry(fd: FormData) {
    "use server";
    const { user: _u } = await getCurrentUserRole();
    const description = (fd.get("description") as string)?.trim();
    const dateStr     = fd.get("date") as string;
    const reference   = ((fd.get("reference") as string) || "").trim() || null;

    if (!description || !dateStr) return;

    const lines: { accountId: string; debit: number; credit: number; description: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const accountId = ((fd.get(`lines[${i}][accountId]`) as string) || "").trim();
      if (!accountId) continue;
      const debit  = parseFloat((fd.get(`lines[${i}][debit]`)  as string) || "0") || 0;
      const credit = parseFloat((fd.get(`lines[${i}][credit]`) as string) || "0") || 0;
      const desc   = ((fd.get(`lines[${i}][description]`) as string) || "").trim();
      if (debit > 0 || credit > 0) lines.push({ accountId, debit, credit, description: desc });
    }
    if (lines.length < 2) return;

    const totalDebit  = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) return;

    const count = await prisma.journalEntry.count({});
    const entryYear   = new Date(dateStr).getFullYear();
    const entryNumber = `JE-${entryYear}-${String(count + 1).padStart(4, "0")}`;

    await prisma.journalEntry.create({
      data: {
        entryNumber,
        date: new Date(dateStr),
        description,
        reference,
        status: "DRAFT",
        totalAmount: totalDebit,
        createdById: _u.id,
        lines: { create: lines },
      },
    });
    revalidatePath("/finance/journal");
  }

  async function postEntry(fd: FormData) {
    "use server";
    const id = fd.get("id") as string;
    const entry = await prisma.journalEntry.findFirst({ where: { id, status: "DRAFT" } });
    if (!entry) return;
    await prisma.journalEntry.update({ where: { id }, data: { status: "POSTED", postedAt: new Date() } });
    revalidatePath("/finance/journal");
  }

  async function voidEntry(fd: FormData) {
    "use server";
    const id = fd.get("id") as string;
    const entry = await prisma.journalEntry.findFirst({ where: { id, status: "POSTED" } });
    if (!entry) return;
    await prisma.journalEntry.update({ where: { id }, data: { status: "VOID" } });
    revalidatePath("/finance/journal");
  }

  async function deleteEntry(fd: FormData) {
    "use server";
    const id = fd.get("id") as string;
    const entry = await prisma.journalEntry.findFirst({ where: { id, status: "DRAFT" } });
    if (!entry) return;
    await prisma.journalEntry.delete({ where: { id } });
    revalidatePath("/finance/journal");
  }

  // ── Data fetch ────────────────────────────────────────────────────────────
  const searchWhere = searchQ
    ? {
        OR: [
          { description: { contains: searchQ } },
          { reference:   { contains: searchQ } },
          { entryNumber: { contains: searchQ } },
        ],
      }
    : {};

  const [
    entries,
    accounts,
    thisMonthStats,
    lastMonthStats,
    ytdStats,
    draftCount,
    voidCount,
  ] = await Promise.all([
    prisma.journalEntry.findMany({
      where: {
        ...(statusFilter !== "all" ? { status: statusFilter as JournalEntryStatus } : {}),
        date: periodFilter,
        ...searchWhere,
      },
      orderBy: { date: "desc" },
      take: 200,
      include: {
        lines: {
          include: { account: { select: { code: true, name: true } } },
          orderBy: { debit: "desc" }, // debits first for readability
        },
      },
    }),
    prisma.chartOfAccount.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    prisma.journalEntry.aggregate({
      where: { status: "POSTED", date: { gte: thisMonthStart } },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.journalEntry.aggregate({
      where: { status: "POSTED", date: { gte: lastMonthStart, lte: lastMonthEnd } },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.journalEntry.aggregate({
      where: { status: "POSTED", date: { gte: ytdStart } },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.journalEntry.count({ where: { status: "DRAFT" } }),
    prisma.journalEntry.count({ where: { status: "VOID" } }),
  ]);

  // ── KPI computations ──────────────────────────────────────────────────────
  const thisMonthAmt = thisMonthStats._sum.totalAmount ?? 0;
  const lastMonthAmt = lastMonthStats._sum.totalAmount ?? 0;
  const ytdAmt       = ytdStats._sum.totalAmount ?? 0;
  const ytdCount     = ytdStats._count;
  const avgEntryAmt  = ytdCount > 0 ? ytdAmt / ytdCount : 0;

  const momChange =
    lastMonthAmt > 0
      ? ((thisMonthAmt - lastMonthAmt) / lastMonthAmt) * 100
      : null;

  // Period label
  const periodLabel =
    month > 0
      ? `${MONTHS[month - 1]} ${year}`
      : `Year ${year}`;

  const availableYears = [now.getFullYear() - 1, now.getFullYear()];

  // Filtered summary
  const filteredPosted = entries.filter((e) => e.status === "POSTED");
  const filteredTotal  = filteredPosted.reduce((s, e) => s + e.totalAmount, 0);

  return (
    <div className="space-y-5 p-4 lg:p-6">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Finance</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">Journal Entries</p>
            <p className="text-[11px] text-[var(--ink-muted)]">Double-entry ledger — every entry&apos;s debits must equal its credits</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/finance/accounts"
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--panel-strong)]"
            >
              Chart of Accounts
            </Link>
            <Link
              href="/finance/reports/pl"
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--panel-strong)]"
            >
              P&amp;L →
            </Link>
          </div>
        </div>
      </div>

      {/* ── KPI TILES ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">

        {/* Posted this month */}
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
            Posted This Month
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--ink)]">
            {formatMoneyCompact(thisMonthAmt, currency)}
          </p>
          <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
            {thisMonthStats._count} entr{thisMonthStats._count === 1 ? "y" : "ies"}
            {momChange !== null && (
              <span className={`ml-1.5 font-semibold ${momChange >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {momChange >= 0 ? "+" : ""}{momChange.toFixed(1)}% vs last mo.
              </span>
            )}
          </p>
        </div>

        {/* YTD posted */}
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
            YTD Posted
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--ink)]">
            {formatMoneyCompact(ytdAmt, currency)}
          </p>
          <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
            {ytdCount} posted entr{ytdCount === 1 ? "y" : "ies"} in {now.getFullYear()}
          </p>
        </div>

        {/* Drafts pending */}
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
            Drafts Pending
          </p>
          <p
            className={`mt-1.5 text-2xl font-bold tabular-nums ${
              draftCount > 0 ? "text-amber-600" : "text-[var(--ink)]"
            }`}
          >
            {draftCount}
          </p>
          <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
            {draftCount > 0 ? "Need review & posting" : "All entries posted"}
          </p>
        </div>

        {/* Average entry */}
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
            Avg Entry (YTD)
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--ink)]">
            {formatMoneyCompact(avgEntryAmt, currency)}
          </p>
          <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
            {voidCount} voided entr{voidCount === 1 ? "y" : "ies"} this year
          </p>
        </div>
      </div>

      {/* ── NEW ENTRY FORM ─────────────────────────────────────────────────── */}
      {accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--ink-muted)]">
          Set up your{" "}
          <Link href="/finance/accounts" className="text-[var(--accent)] underline">
            chart of accounts
          </Link>{" "}
          before recording journal entries.
        </div>
      ) : (
        <details className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <summary className="cursor-pointer px-5 py-3.5 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--panel-strong)]/40 rounded-xl">
            + New Journal Entry
          </summary>
          <form action={createEntry} className="space-y-4 border-t border-[var(--line)] p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[var(--ink-muted)]">
                  Date *
                </label>
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[var(--ink-muted)]">
                  Description *
                </label>
                <input
                  name="description"
                  required
                  placeholder="e.g. Monthly rent — May 2025"
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[var(--ink-muted)]">
                  Reference / Source Doc
                </label>
                <input
                  name="reference"
                  placeholder="INV-001, Receipt #42…"
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Line items table */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                  Line Items — Σ Debits must equal Σ Credits
                </p>
                <p className="text-[11px] text-[var(--ink-muted)]">
                  6 rows — leave blank to skip
                </p>
              </div>
              <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
                <table className="w-full text-sm">
                  <thead className="border-b border-[var(--line)] bg-[var(--panel)]">
                    <tr>
                      <th className="w-2/5 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                        Account *
                      </th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                        Memo
                      </th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                        Debit (DR)
                      </th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                        Credit (CR)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)] bg-[var(--bg)]">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <tr key={i}>
                        <td className="px-3 py-2">
                          <select
                            name={`lines[${i}][accountId]`}
                            className="w-full rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs"
                          >
                            <option value="">— Select account —</option>
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.code} — {a.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            name={`lines[${i}][description]`}
                            placeholder="optional memo"
                            className="w-full rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            name={`lines[${i}][debit]`}
                            type="number"
                            min="0"
                            step="1"
                            placeholder="0"
                            className="w-28 rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs text-right"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            name={`lines[${i}][credit]`}
                            type="number"
                            min="0"
                            step="1"
                            placeholder="0"
                            className="w-28 rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs text-right"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-[var(--ink-muted)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-3 w-3 shrink-0" aria-hidden><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                Saved as <strong>Draft</strong>. Entry is rejected server-side if Σ Debit ≠ Σ Credit.
                Post manually after review.
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black"
              >
                Save as Draft
              </button>
            </div>
          </form>
        </details>
      )}

      {/* ── FILTERS ────────────────────────────────────────────────────────── */}
      <form method="GET" className="flex flex-wrap items-center gap-2">
        <select
          name="month"
          defaultValue={month}
          className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm"
        >
          <option value="0">All months</option>
          {MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          name="year"
          defaultValue={year}
          className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm"
        >
          {availableYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={statusFilter}
          className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search description, reference…"
          className="min-w-[180px] flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"
        >
          Filter
        </button>
        {(month > 0 || statusFilter !== "all" || searchQ) && (
          <Link
            href="/finance/journal"
            className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink-muted)] hover:bg-[var(--panel)]"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Period summary bar */}
      {entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-[var(--panel-strong)]/50 px-4 py-2.5">
          <span className="text-xs text-[var(--ink-muted)]">
            <span className="font-semibold text-[var(--ink)]">{entries.length}</span>{" "}
            {statusFilter === "all" ? "entries" : statusFilter.toLowerCase() + " entries"}{" "}
            in <span className="font-semibold">{periodLabel}</span>
          </span>
          {filteredTotal > 0 && (
            <span className="text-xs text-[var(--ink-muted)]">
              Posted total:{" "}
              <span className="font-semibold text-emerald-600">
                {formatMoney(filteredTotal, currency)}
              </span>
            </span>
          )}
          {draftCount > 0 && statusFilter !== "POSTED" && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0" aria-hidden><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              {draftCount} draft{draftCount !== 1 ? "s" : ""} awaiting posting
            </span>
          )}
        </div>
      )}

      {/* ── ENTRIES LIST ───────────────────────────────────────────────────── */}
      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] py-14 text-center">
          <p className="text-sm text-[var(--ink-muted)]">No journal entries found for this period.</p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            {searchQ
              ? "Try a different search term or clear the filter."
              : "Adjust the filters above or create a new entry."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const lineDebit  = entry.lines.reduce((s, l) => s + l.debit,  0);
            const lineCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
            const balanced   = Math.abs(lineDebit - lineCredit) < 0.01;
            return (
              <div
                key={entry.id}
                className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg)]"
              >
                {/* ── Entry header row ─────────────────────────── */}
                <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--panel)]/50 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-xs font-bold text-[var(--accent)]">
                      {entry.entryNumber}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[entry.status]}`}
                    >
                      {entry.status}
                    </span>
                    {!balanced && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5 shrink-0" aria-hidden><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        UNBALANCED
                      </span>
                    )}
                    <span className="text-xs text-[var(--ink-muted)]">
                      {new Date(entry.date).toLocaleDateString("en-UG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <p className="text-sm font-bold tabular-nums text-[var(--ink)]">
                      {formatMoney(entry.totalAmount, currency)}
                    </p>
                    <RowActionsMenu label="Entry actions">
                      <MenuSection label="Actions" />
                      {entry.status === "DRAFT" && (
                        <form action={postEntry}>
                          <input type="hidden" name="id" value={entry.id} />
                          <button
                            type="submit"
                            className="w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--panel)]"
                          >
                            ✓ Post Entry
                          </button>
                        </form>
                      )}
                      {entry.status === "POSTED" && (
                        <form action={voidEntry}>
                          <input type="hidden" name="id" value={entry.id} />
                          <button
                            type="submit"
                            className="w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--panel)]"
                          >
                            Void Entry
                          </button>
                        </form>
                      )}
                      {entry.status === "DRAFT" && (
                        <MenuDestructiveRow>
                          <form action={deleteEntry}>
                            <input type="hidden" name="id" value={entry.id} />
                            <ConfirmSubmitButton
                              message="Delete this draft entry? This cannot be undone."
                              className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                            >
                              Delete Draft
                            </ConfirmSubmitButton>
                          </form>
                        </MenuDestructiveRow>
                      )}
                    </RowActionsMenu>
                  </div>
                </div>

                {/* ── Description + reference ──────────────────── */}
                <div className="flex items-baseline gap-3 px-4 py-2.5">
                  <p className="text-sm font-medium text-[var(--ink)]">{entry.description}</p>
                  {entry.reference && (
                    <span className="rounded bg-[var(--panel-strong)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--ink-muted)]">
                      {entry.reference}
                    </span>
                  )}
                </div>

                {/* ── Lines table ──────────────────────────────── */}
                <div className="overflow-x-auto px-4 pb-3.5">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="pb-1 text-left text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                          Account
                        </th>
                        <th className="pb-1 pl-2 text-left text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                          Memo
                        </th>
                        <th className="pb-1 text-right text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                          Debit
                        </th>
                        <th className="pb-1 pl-4 text-right text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                          Credit
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]/40">
                      {entry.lines.map((line) => (
                        <tr key={line.id}>
                          <td className="py-1">
                            <span className="font-mono text-[var(--accent)]">{line.account.code}</span>
                            <span className="ml-1.5 text-[var(--ink-muted)]">{line.account.name}</span>
                          </td>
                          <td className="max-w-[200px] truncate py-1 pl-2 text-[var(--ink-muted)]">
                            {line.description || "—"}
                          </td>
                          <td className="py-1 text-right font-medium text-[var(--ink)]">
                            {line.debit > 0 ? formatMoney(line.debit, currency) : ""}
                          </td>
                          <td className="py-1 pl-4 text-right text-[var(--ink-muted)]">
                            {line.credit > 0 ? formatMoney(line.credit, currency) : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-[var(--line)]">
                      <tr>
                        <td
                          colSpan={2}
                          className="pt-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]"
                        >
                          Totals
                        </td>
                        <td className="pt-1.5 text-right font-semibold text-[var(--ink)]">
                          {formatMoney(lineDebit, currency)}
                        </td>
                        <td className="pt-1.5 pl-4 text-right font-semibold text-[var(--ink-muted)]">
                          {formatMoney(lineCredit, currency)}
                        </td>
                      </tr>
                      {!balanced && (
                        <tr>
                          <td colSpan={4} className="pt-0.5 text-right text-[10px] font-semibold text-red-500">
                            Imbalance: {formatMoney(Math.abs(lineDebit - lineCredit), currency)}
                          </td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── QUICK LINKS ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
        <Link
          href="/finance/accounts"
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--panel)]"
        >
          Chart of Accounts
        </Link>
        <Link
          href="/finance/reports/pl"
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--panel)]"
        >
          P&amp;L Report
        </Link>
        <Link
          href="/finance/reports/balance-sheet"
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--panel)]"
        >
          Balance Sheet
        </Link>
        <Link
          href="/finance/bank"
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--panel)]"
        >
          Bank Accounts
        </Link>
        <Link
          href="/finance/expenses"
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--panel)]"
        >
          Expenses
        </Link>
      </div>
    </div>
  );
}
