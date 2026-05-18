import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { JournalEntryStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { assertOrgCanMutate } from "@/lib/org-write";
import { formatMoney } from "@/lib/currency";
import { RowActionsMenu, MenuSection, MenuDestructiveRow } from "@/components/shared/RowActionsMenu";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";

const STATUSES: JournalEntryStatus[] = ["DRAFT", "POSTED", "VOID"];

const STATUS_STYLE: Record<JournalEntryStatus, string> = {
  DRAFT:  "bg-amber-500/10 text-amber-700",
  POSTED: "bg-green-500/10 text-green-700",
  VOID:   "bg-[var(--panel-strong)] text-[var(--ink-muted)]",
};

function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d; }

export const dynamic = "force-dynamic";

export default async function JournalPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { user, orgId, org } = await requireOrgSession();
  if (!["ADMIN", "MANAGER", "FINANCE"].includes(user.role)) redirect("/dashboard");

  const sp = await searchParams;
  const statusFilter = sp.status ?? "all";
  const currency = org.baseCurrency ?? "UGX";

  async function createEntry(fd: FormData) {
    "use server";
    const { user: u, orgId: oid, org } = await requireOrgSession();
    assertOrgCanMutate({ access: org.access, userRole: u.role, userAccessMode: u.accessMode, kind: "GENERAL" });

    const description = fd.get("description") as string;
    const dateStr     = fd.get("date") as string;
    const reference   = (fd.get("reference") as string) || null;

    // Collect line rows — up to 10
    const lines: { accountId: string; debit: number; credit: number; description: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const accountId = fd.get(`lines[${i}][accountId]`) as string | null;
      if (!accountId) break;
      const debit  = parseFloat((fd.get(`lines[${i}][debit]`)  as string) || "0") || 0;
      const credit = parseFloat((fd.get(`lines[${i}][credit]`) as string) || "0") || 0;
      const desc   = (fd.get(`lines[${i}][description]`) as string) || "";
      if (accountId && (debit > 0 || credit > 0)) lines.push({ accountId, debit, credit, description: desc });
    }
    if (lines.length < 2) return;

    const totalDebit  = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) return; // must balance

    const count = await prisma.journalEntry.count({ where: { orgId: oid } });
    const year  = new Date().getFullYear();
    const entryNumber = `JE-${year}-${String(count + 1).padStart(4, "0")}`;

    await prisma.journalEntry.create({
      data: {
        orgId: oid,
        entryNumber,
        date: new Date(dateStr),
        description: description.trim(),
        reference,
        status: "DRAFT",
        totalAmount: totalDebit,
        createdById: u.id,
        lines: { create: lines },
      },
    });
    revalidatePath("/finance/journal");
  }

  async function postEntry(fd: FormData) {
    "use server";
    const { user: u, orgId: oid, org } = await requireOrgSession();
    assertOrgCanMutate({ access: org.access, userRole: u.role, userAccessMode: u.accessMode, kind: "GENERAL" });
    const id = fd.get("id") as string;
    const entry = await prisma.journalEntry.findFirst({ where: { id, orgId: oid, status: "DRAFT" } });
    if (!entry) return;
    await prisma.journalEntry.update({ where: { id }, data: { status: "POSTED", postedAt: new Date() } });
    revalidatePath("/finance/journal");
  }

  async function voidEntry(fd: FormData) {
    "use server";
    const { user: u, orgId: oid, org } = await requireOrgSession();
    assertOrgCanMutate({ access: org.access, userRole: u.role, userAccessMode: u.accessMode, kind: "GENERAL" });
    const id = fd.get("id") as string;
    const entry = await prisma.journalEntry.findFirst({ where: { id, orgId: oid, status: "POSTED" } });
    if (!entry) return;
    await prisma.journalEntry.update({ where: { id }, data: { status: "VOID" } });
    revalidatePath("/finance/journal");
  }

  async function deleteEntry(fd: FormData) {
    "use server";
    const { user: u, orgId: oid, org } = await requireOrgSession();
    assertOrgCanMutate({ access: org.access, userRole: u.role, userAccessMode: u.accessMode, kind: "GENERAL" });
    const id = fd.get("id") as string;
    const entry = await prisma.journalEntry.findFirst({ where: { id, orgId: oid, status: "DRAFT" } });
    if (!entry) return;
    await prisma.journalEntry.delete({ where: { id } });
    revalidatePath("/finance/journal");
  }

  const where = {
    orgId,
    ...(statusFilter !== "all" ? { status: statusFilter as JournalEntryStatus } : {}),
  };

  const [entries, accounts] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      orderBy: { date: "desc" },
      take: 100,
      include: { lines: { include: { account: { select: { code: true, name: true } } } } },
    }),
    prisma.chartOfAccount.findMany({ where: { orgId, isActive: true }, orderBy: { code: "asc" } }),
  ]);

  const totalPosted = entries.filter((e) => e.status === "POSTED").reduce((s, e) => s + e.totalAmount, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--ink)]">Journal Entries</h1>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">Double-entry bookkeeping — debits must equal credits</p>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        {(["DRAFT", "POSTED", "VOID"] as JournalEntryStatus[]).map((s) => (
          <div key={s} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">{s}</p>
            <p className="mt-1 text-2xl font-bold">{entries.filter((e) => e.status === s).length}</p>
            {s === "POSTED" && <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{formatMoney(totalPosted, currency)} total</p>}
          </div>
        ))}
      </div>

      {/* Create form */}
      {accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--ink-muted)]">
          Set up your <Link href="/finance/accounts" className="text-[var(--accent)] underline">chart of accounts</Link> before recording journal entries.
        </div>
      ) : (
        <details className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-[var(--ink)]">+ New Journal Entry</summary>
          <form action={createEntry} className="space-y-4 border-t border-[var(--line)] p-5">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Date *</label>
                <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Description *</label>
                <input name="description" required placeholder="e.g. Rent payment May"
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Reference</label>
                <input name="reference" placeholder="INV-001, receipt #..."
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
              </div>
            </div>

            {/* Line items */}
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wide">Lines (debits must equal credits)</p>
              <div className="rounded-lg border border-[var(--line)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--panel)] border-b border-[var(--line)]">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--ink-muted)]">Account *</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--ink-muted)]">Description</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Debit</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)] bg-[var(--bg)]">
                    {[0, 1, 2, 3].map((i) => (
                      <tr key={i}>
                        <td className="px-3 py-2">
                          <select name={`lines[${i}][accountId]`} className="w-full rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-xs">
                            <option value="">— Select —</option>
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input name={`lines[${i}][description]`} placeholder="memo" className="w-full rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-xs" />
                        </td>
                        <td className="px-3 py-2">
                          <input name={`lines[${i}][debit]`} type="number" min="0" step="0.01" placeholder="0.00" className="w-28 rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-xs text-right" />
                        </td>
                        <td className="px-3 py-2">
                          <input name={`lines[${i}][credit]`} type="number" min="0" step="0.01" placeholder="0.00" className="w-28 rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-xs text-right" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black">
                Save as Draft
              </button>
            </div>
          </form>
        </details>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {["all", ...STATUSES].map((s) => (
          <Link key={s} href={s === "all" ? "/finance/journal" : `/finance/journal?status=${s}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${statusFilter === s ? "bg-[var(--accent)] text-black" : "bg-[var(--panel)] text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}>
            {s === "all" ? "All" : s}
          </Link>
        ))}
      </div>

      {/* Entries list */}
      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] py-12 text-center text-sm text-[var(--ink-muted)]">No journal entries yet.</div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const totalDebit  = entry.lines.reduce((s, l) => s + l.debit, 0);
            const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
            const balanced    = Math.abs(totalDebit - totalCredit) < 0.01;
            return (
              <div key={entry.id} className="rounded-xl border border-[var(--line)] bg-[var(--bg)]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-[var(--accent)]">{entry.entryNumber}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[entry.status]}`}>{entry.status}</span>
                    {!balanced && <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600">UNBALANCED</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs font-semibold">{formatMoney(entry.totalAmount, currency)}</p>
                      <p className="text-[10px] text-[var(--ink-muted)]">{new Date(entry.date).toLocaleDateString()}</p>
                    </div>
                    <RowActionsMenu label="Entry actions">
                      <MenuSection label="Actions" />
                      {entry.status === "DRAFT" && (
                        <form action={postEntry}>
                          <input type="hidden" name="id" value={entry.id} />
                          <button type="submit" className="w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--panel)]">Post Entry</button>
                        </form>
                      )}
                      {entry.status === "POSTED" && (
                        <form action={voidEntry}>
                          <input type="hidden" name="id" value={entry.id} />
                          <button type="submit" className="w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--panel)]">Void Entry</button>
                        </form>
                      )}
                      {entry.status === "DRAFT" && (
                        <MenuDestructiveRow>
                          <form action={deleteEntry}>
                            <input type="hidden" name="id" value={entry.id} />
                            <ConfirmSubmitButton message="Delete this draft entry?" className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50">
                              Delete Draft
                            </ConfirmSubmitButton>
                          </form>
                        </MenuDestructiveRow>
                      )}
                    </RowActionsMenu>
                  </div>
                </div>
                <div className="px-4 py-2">
                  <p className="text-sm font-medium text-[var(--ink)]">{entry.description}</p>
                  {entry.reference && <p className="text-xs text-[var(--ink-muted)]">Ref: {entry.reference}</p>}
                </div>
                <div className="px-4 pb-3">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-[var(--line)]/50">
                      {entry.lines.map((line) => (
                        <tr key={line.id}>
                          <td className="py-1 font-mono text-[var(--accent)]">{line.account.code}</td>
                          <td className="py-1 pl-2 text-[var(--ink-muted)]">{line.account.name}</td>
                          <td className="py-1 pl-2 text-[var(--ink-muted)] truncate max-w-[180px]">{line.description}</td>
                          <td className="py-1 text-right font-medium">{line.debit > 0 ? formatMoney(line.debit, currency) : ""}</td>
                          <td className="py-1 pl-4 text-right text-[var(--ink-muted)]">{line.credit > 0 ? formatMoney(line.credit, currency) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-[var(--line)] font-semibold">
                      <tr>
                        <td colSpan={3} className="pt-1.5 text-[var(--ink-muted)]">Totals</td>
                        <td className="pt-1.5 text-right">{formatMoney(totalDebit, currency)}</td>
                        <td className="pt-1.5 pl-4 text-right">{formatMoney(totalCredit, currency)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
