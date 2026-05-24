import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { BankTransactionType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { assertOrgCanMutate } from "@/lib/org-write";
import { formatMoney } from "@/lib/currency";
import { RowActionsMenu, MenuSection, MenuDestructiveRow } from "@/components/shared/RowActionsMenu";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";

export const dynamic = "force-dynamic";

export default async function BankPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { user, orgId, org } = await requireOrgSession();
  if (!["ADMIN", "MANAGER", "FINANCE"].includes(user.role)) redirect("/dashboard");

  const sp = await searchParams;
  const selectedAccountId = sp.account ?? null;
  const currency = org.baseCurrency ?? "UGX";

  async function createBankAccount(fd: FormData) {
    "use server";
    const { user: u, orgId: oid, org } = await requireOrgSession();
    assertOrgCanMutate({ access: org.access, userRole: u.role, userAccessMode: u.accessMode, kind: "GENERAL" });
    const name          = fd.get("name") as string;
    const bankName      = fd.get("bankName") as string;
    const accountNumber = (fd.get("accountNumber") as string) || null;
    const openingBal    = parseFloat(fd.get("openingBalance") as string) || 0;
    if (!name || !bankName) return;
    await prisma.bankAccount.create({
      data: { orgId: oid, name, bankName, accountNumber, openingBalance: openingBal, currentBalance: openingBal },
    });
    revalidatePath("/finance/bank");
  }

  async function addTransaction(fd: FormData) {
    "use server";
    const { user: u, orgId: oid, org } = await requireOrgSession();
    assertOrgCanMutate({ access: org.access, userRole: u.role, userAccessMode: u.accessMode, kind: "GENERAL" });
    const bankAccountId = fd.get("bankAccountId") as string;
    const date          = fd.get("date") as string;
    const description   = fd.get("description") as string;
    const amount        = parseFloat(fd.get("amount") as string) || 0;
    const type          = fd.get("type") as BankTransactionType;
    const reference     = (fd.get("reference") as string) || null;
    if (!bankAccountId || !date || !description || amount <= 0) return;

    const balanceDelta = type === "CREDIT" ? amount : -amount;
    await prisma.$transaction([
      prisma.bankTransaction.create({
        data: { orgId: oid, bankAccountId, date: new Date(date), description, amount, type, reference },
      }),
      prisma.bankAccount.update({
        where: { id: bankAccountId },
        data: { currentBalance: { increment: balanceDelta } },
      }),
    ]);
    revalidatePath("/finance/bank");
  }

  async function reconcile(fd: FormData) {
    "use server";
    const { user: u, orgId: oid, org } = await requireOrgSession();
    assertOrgCanMutate({ access: org.access, userRole: u.role, userAccessMode: u.accessMode, kind: "GENERAL" });
    const id = fd.get("id") as string;
    const tx = await prisma.bankTransaction.findFirst({ where: { id, orgId: oid } });
    if (!tx) return;
    await prisma.bankTransaction.update({
      where: { id },
      data: { reconciledAt: tx.reconciledAt ? null : new Date() },
    });
    revalidatePath("/finance/bank");
  }

  async function deleteBankAccount(fd: FormData) {
    "use server";
    const { user: u, orgId: oid, org } = await requireOrgSession();
    assertOrgCanMutate({ access: org.access, userRole: u.role, userAccessMode: u.accessMode, kind: "GENERAL" });
    const id = fd.get("id") as string;
    await prisma.bankAccount.delete({ where: { id } });
    revalidatePath("/finance/bank");
  }

  const bankAccounts = await prisma.bankAccount.findMany({
    where: { orgId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { transactions: true } } },
  });

  const activeAccount = selectedAccountId
    ? bankAccounts.find((a) => a.id === selectedAccountId)
    : bankAccounts[0];

  const transactions = activeAccount
    ? await prisma.bankTransaction.findMany({
        where: { bankAccountId: activeAccount.id },
        orderBy: { date: "desc" },
        take: 100,
      })
    : [];

  const totalBalance = bankAccounts.filter((a) => a.isActive).reduce((s, a) => s + a.currentBalance, 0);
  const unreconciledCount = transactions.filter((t) => !t.reconciledAt).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-xl font-bold text-[var(--ink)]">Bank Accounts</h1>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Total Balance</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{formatMoney(totalBalance, currency)}</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Accounts</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{bankAccounts.length}</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Unreconciled</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{unreconciledCount}</p>
        </div>
      </div>

      {/* Add bank account */}
      <details className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold">+ Add Bank Account</summary>
        <form action={createBankAccount} className="grid grid-cols-2 gap-4 border-t border-[var(--line)] p-5 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Account Name *</label>
            <input name="name" required placeholder="Main Operations" className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Bank Name *</label>
            <input name="bankName" required placeholder="Stanbic Bank" className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Account Number</label>
            <input name="accountNumber" placeholder="9030012345" className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Opening Balance</label>
            <input name="openingBalance" type="number" min="0" step="0.01" placeholder="0.00" className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-4 flex justify-end">
            <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black">Create</button>
          </div>
        </form>
      </details>

      {bankAccounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] py-14 text-center text-sm text-[var(--ink-muted)]">
          Add your first bank account to start recording transactions.
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          {/* Account list sidebar */}
          <div className="col-span-4 space-y-2">
            {bankAccounts.map((acc) => (
              <a key={acc.id} href={`/finance/bank?account=${acc.id}`}
                className={`block rounded-xl border p-4 transition-colors ${activeAccount?.id === acc.id ? "border-[var(--accent)] bg-[var(--accent-muted)]" : "border-[var(--line)] bg-[var(--panel)] hover:bg-[var(--panel-strong)]"}`}>
                <p className="font-semibold text-sm text-[var(--ink)]">{acc.name}</p>
                <p className="text-xs text-[var(--ink-muted)]">{acc.bankName}</p>
                {acc.accountNumber && <p className="text-xs text-[var(--ink-muted)] font-mono">{acc.accountNumber}</p>}
                <p className="mt-2 text-base font-bold">{formatMoney(acc.currentBalance, currency)}</p>
                <p className="text-[10px] text-[var(--ink-muted)]">{acc._count.transactions} transactions</p>
              </a>
            ))}
          </div>

          {/* Transactions panel */}
          <div className="col-span-8 space-y-4">
            {activeAccount && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-[var(--ink)]">{activeAccount.name}</h2>
                    <p className="text-sm text-[var(--ink-muted)]">{activeAccount.bankName}</p>
                  </div>
                  <RowActionsMenu label="Account actions">
                    <MenuDestructiveRow>
                      <form action={deleteBankAccount}>
                        <input type="hidden" name="id" value={activeAccount.id} />
                        <ConfirmSubmitButton message="Delete this bank account and all its transactions?" className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50">
                          Delete Account
                        </ConfirmSubmitButton>
                      </form>
                    </MenuDestructiveRow>
                  </RowActionsMenu>
                </div>

                {/* Add transaction */}
                <details className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
                  <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold">+ Add Transaction</summary>
                  <form action={addTransaction} className="grid grid-cols-2 gap-3 border-t border-[var(--line)] p-4">
                    <input type="hidden" name="bankAccountId" value={activeAccount.id} />
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Date *</label>
                      <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Type *</label>
                      <select name="type" className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
                        <option value="CREDIT">Credit (Money In)</option>
                        <option value="DEBIT">Debit (Money Out)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Description *</label>
                      <input name="description" required placeholder="Payment received..." className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Amount *</label>
                      <input name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00" className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Reference</label>
                      <input name="reference" placeholder="Cheque #, transfer ref..." className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
                    </div>
                    <div className="flex items-end">
                      <button type="submit" className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black">Add</button>
                    </div>
                  </form>
                </details>

                {/* Transaction list */}
                {transactions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--line)] py-10 text-center text-sm text-[var(--ink-muted)]">No transactions yet.</div>
                ) : (
                  <div className="rounded-xl border border-[var(--line)] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="border-b border-[var(--line)] bg-[var(--panel)]">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--ink-muted)]">Date</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--ink-muted)]">Description</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-green-700">In</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-red-700">Out</th>
                          <th className="px-4 py-2.5 text-center text-xs font-semibold text-[var(--ink-muted)]">Reconciled</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--line)] bg-[var(--bg)]">
                        {transactions.map((tx) => (
                          <tr key={tx.id} className={`hover:bg-[var(--panel)] ${tx.reconciledAt ? "opacity-60" : ""}`}>
                            <td className="px-4 py-2.5 text-xs text-[var(--ink-muted)]">{new Date(tx.date).toLocaleDateString()}</td>
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-[var(--ink)]">{tx.description}</p>
                              {tx.reference && <p className="text-xs text-[var(--ink-muted)]">{tx.reference}</p>}
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium text-green-700">
                              {tx.type === "CREDIT" ? formatMoney(tx.amount, currency) : ""}
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium text-red-700">
                              {tx.type === "DEBIT" ? formatMoney(tx.amount, currency) : ""}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {tx.reconciledAt ? (
                                <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-700">✓ Done</span>
                              ) : (
                                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700">Pending</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <form action={reconcile}>
                                <input type="hidden" name="id" value={tx.id} />
                                <button type="submit" className="text-xs text-[var(--accent)] hover:underline">
                                  {tx.reconciledAt ? "Unmark" : "Reconcile"}
                                </button>
                              </form>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
