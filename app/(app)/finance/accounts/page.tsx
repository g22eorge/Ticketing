import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AccountType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { assertOrgCanMutate } from "@/lib/org-write";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
import { RowActionsMenu, MenuSection, MenuDestructiveRow } from "@/components/shared/RowActionsMenu";

const ACCOUNT_TYPES: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];

const TYPE_COLOR: Record<AccountType, string> = {
  ASSET:     "bg-blue-500/10 text-blue-600",
  LIABILITY: "bg-red-500/10 text-red-600",
  EQUITY:    "bg-purple-500/10 text-purple-600",
  REVENUE:   "bg-green-500/10 text-green-600",
  EXPENSE:   "bg-amber-500/10 text-amber-700",
};

export const dynamic = "force-dynamic";

export default async function ChartOfAccountsPage() {
  const { user, orgId } = await requireOrgSession();
  if (!["ADMIN", "MANAGER", "FINANCE"].includes(user.role)) redirect("/dashboard");

  async function createAccount(fd: FormData) {
    "use server";
    const { orgId: oid } = await requireOrgSession();
    await assertOrgCanMutate(oid);
    const code = fd.get("code") as string;
    const name = fd.get("name") as string;
    const type = fd.get("type") as AccountType;
    const parentId = (fd.get("parentId") as string) || null;
    const description = (fd.get("description") as string) || null;
    if (!code || !name || !type) return;
    await prisma.chartOfAccount.create({
      data: { orgId: oid, code: code.trim(), name: name.trim(), type, parentId, description },
    });
    revalidatePath("/finance/accounts");
  }

  async function toggleActive(fd: FormData) {
    "use server";
    const { orgId: oid } = await requireOrgSession();
    await assertOrgCanMutate(oid);
    const id = fd.get("id") as string;
    const acc = await prisma.chartOfAccount.findFirst({ where: { id, orgId: oid } });
    if (!acc || acc.isSystem) return;
    await prisma.chartOfAccount.update({ where: { id }, data: { isActive: !acc.isActive } });
    revalidatePath("/finance/accounts");
  }

  async function deleteAccount(fd: FormData) {
    "use server";
    const { orgId: oid } = await requireOrgSession();
    await assertOrgCanMutate(oid);
    const id = fd.get("id") as string;
    const acc = await prisma.chartOfAccount.findFirst({ where: { id, orgId: oid } });
    if (!acc || acc.isSystem) return;
    const hasLines = await prisma.journalLine.findFirst({ where: { accountId: id } });
    if (hasLines) return; // cannot delete account with transactions
    await prisma.chartOfAccount.delete({ where: { id } });
    revalidatePath("/finance/accounts");
  }

  const accounts = await prisma.chartOfAccount.findMany({
    where: { orgId },
    orderBy: [{ type: "asc" }, { code: "asc" }],
    include: { parent: { select: { code: true, name: true } } },
  });

  const byType = ACCOUNT_TYPES.map((t) => ({
    type: t,
    items: accounts.filter((a) => a.type === t),
  }));

  const totals: Record<AccountType, number> = { ASSET: 0, LIABILITY: 0, EQUITY: 0, REVENUE: 0, EXPENSE: 0 };
  for (const t of ACCOUNT_TYPES) totals[t] = accounts.filter((a) => a.type === t).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--ink)]">Chart of Accounts</h1>
        <p className="mt-0.5 text-sm text-[var(--ink-muted)]">Manage your double-entry accounting structure</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-5 gap-3">
        {ACCOUNT_TYPES.map((t) => (
          <div key={t} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">{t}</p>
            <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{totals[t]}</p>
          </div>
        ))}
      </div>

      {/* Create form */}
      <details className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-[var(--ink)]">+ Add Account</summary>
        <form action={createAccount} className="grid grid-cols-2 gap-4 border-t border-[var(--line)] p-5 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Code *</label>
            <input name="code" required placeholder="e.g. 1000" className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Name *</label>
            <input name="name" required placeholder="Cash & Bank" className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Type *</label>
            <select name="type" required className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
              {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Parent account</label>
            <select name="parentId" className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
              <option value="">— None —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code} {a.name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Description</label>
            <input name="description" placeholder="Optional" className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black">
              Create Account
            </button>
          </div>
        </form>
      </details>

      {/* Accounts by type */}
      {byType.map(({ type, items }) => (
        <div key={type}>
          <div className="mb-2 flex items-center gap-2">
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TYPE_COLOR[type]}`}>{type}</span>
            <span className="text-xs text-[var(--ink-muted)]">{items.length} account{items.length !== 1 ? "s" : ""}</span>
          </div>
          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--line)] px-4 py-3 text-sm text-[var(--ink-muted)]">No {type.toLowerCase()} accounts yet.</p>
          ) : (
            <div className="rounded-xl border border-[var(--line)] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--line)] bg-[var(--panel)]">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--ink-muted)]">Code</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--ink-muted)]">Name</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--ink-muted)]">Parent</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--ink-muted)]">Description</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--ink-muted)]">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)] bg-[var(--bg)]">
                  {items.map((acc) => (
                    <tr key={acc.id} className="hover:bg-[var(--panel)]">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-[var(--accent)]">{acc.code}</td>
                      <td className="px-4 py-3 font-medium text-[var(--ink)]">{acc.name}</td>
                      <td className="px-4 py-3 text-xs text-[var(--ink-muted)]">
                        {acc.parent ? `${acc.parent.code} ${acc.parent.name}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--ink-muted)] max-w-xs truncate">{acc.description || "—"}</td>
                      <td className="px-4 py-3">
                        {acc.isSystem ? (
                          <span className="text-xs text-[var(--ink-muted)]">System</span>
                        ) : acc.isActive ? (
                          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-700">Active</span>
                        ) : (
                          <span className="rounded-full bg-[var(--panel-strong)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-muted)]">Inactive</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {!acc.isSystem && (
                          <RowActionsMenu label="Account actions">
                            <MenuSection label="Actions">
                              <form action={toggleActive}>
                                <input type="hidden" name="id" value={acc.id} />
                                <button type="submit" className="w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--panel)]">
                                  {acc.isActive ? "Deactivate" : "Activate"}
                                </button>
                              </form>
                            </MenuSection>
                            <MenuDestructiveRow>
                              <form action={deleteAccount}>
                                <input type="hidden" name="id" value={acc.id} />
                                <ConfirmSubmitButton message="Delete this account? This cannot be undone if it has no transactions." className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50">
                                  Delete
                                </ConfirmSubmitButton>
                              </form>
                            </MenuDestructiveRow>
                          </RowActionsMenu>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
