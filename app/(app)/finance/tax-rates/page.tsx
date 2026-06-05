import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { assertOrgCanMutate } from "@/lib/org-write";
import { writeSystemAuditEvent } from "@/lib/commercial/audit";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
import { RowActionsMenu, MenuSection, MenuDestructiveRow } from "@/components/shared/RowActionsMenu";

export const dynamic = "force-dynamic";

export default async function TaxRatesPage() {
  const { user, orgId } = await requireOrgSession();
  if (!["ADMIN", "MANAGER"].includes(user.role)) redirect("/dashboard");

  const taxRates = await prisma.taxRate.findMany({
    where: { orgId },
    orderBy: [{ isDefault: "desc" }, { code: "asc" }],
  });

  async function createTaxRateAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!["ADMIN", "MANAGER"].includes(user.role)) redirect("/dashboard");
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const name = String(formData.get("name") ?? "").trim();
    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    const rateRaw = Number(String(formData.get("rate") ?? "").trim());
    const isDefault = formData.get("isDefault") === "on";
    const appliesToSales = formData.get("appliesToSales") === "on";
    const appliesToPurchases = formData.get("appliesToPurchases") === "on";

    if (!name || !code || !Number.isFinite(rateRaw) || rateRaw < 0) return;

    const existing = await prisma.taxRate.findFirst({ where: { orgId, code } });
    if (existing) return;

    if (isDefault) {
      await prisma.taxRate.updateMany({ where: { orgId, isDefault: true }, data: { isDefault: false } });
    }

    const taxRate = await prisma.taxRate.create({
      data: { orgId, name, code, rate: rateRaw, isDefault, appliesToSales, appliesToPurchases },
    });

    await writeSystemAuditEvent({
      orgId,
      entityType: "TaxRate",
      entityId: taxRate.id,
      action: "TAX_RATE_CREATED",
      summary: `${code} — ${name} — ${rateRaw}%`,
      actorUserId: user.id,
    });

    revalidatePath("/finance/tax-rates");
    redirect("/finance/tax-rates");
  }

  async function toggleTaxRateAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!["ADMIN", "MANAGER"].includes(user.role)) redirect("/dashboard");
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const taxRateId = String(formData.get("taxRateId") ?? "").trim();
    const action = String(formData.get("action") ?? "").trim();
    if (!taxRateId) return;

    const rate = await prisma.taxRate.findFirst({ where: { id: taxRateId, orgId } });
    if (!rate) return;

    if (action === "setDefault") {
      await prisma.taxRate.updateMany({ where: { orgId, isDefault: true }, data: { isDefault: false } });
      await prisma.taxRate.update({ where: { id: taxRateId }, data: { isDefault: true, isActive: true } });
    } else {
      await prisma.taxRate.update({ where: { id: taxRateId }, data: { isActive: !rate.isActive } });
    }

    revalidatePath("/finance/tax-rates");
    redirect("/finance/tax-rates");
  }

  async function deleteTaxRateAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!["ADMIN"].includes(user.role)) redirect("/dashboard");
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const taxRateId = String(formData.get("taxRateId") ?? "").trim();
    if (!taxRateId) return;

    const rate = await prisma.taxRate.findFirst({ where: { id: taxRateId, orgId }, select: { code: true, name: true } });
    if (!rate) return;

    await prisma.taxRate.delete({ where: { id: taxRateId } });

    await writeSystemAuditEvent({
      orgId,
      entityType: "TaxRate",
      entityId: taxRateId,
      action: "TAX_RATE_DELETED",
      summary: `Deleted ${rate.code} — ${rate.name}`,
      actorUserId: user.id,
    });

    revalidatePath("/finance/tax-rates");
    redirect("/finance/tax-rates");
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="panel-shadow flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <div>
          <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Finance</p>
          <p className="text-[13px] font-bold text-[var(--ink)]">
            Tax Rates{" "}
            <span className="font-normal text-[var(--ink-muted)]">· {taxRates.length} configured</span>
          </p>
          <p className="text-[13px] text-[var(--ink-muted)]">
            VAT, WHT, and other tax codes applied to invoices and purchases.
          </p>
        </div>
        <details className="group relative">
          <summary className="btn-premium cursor-pointer list-none rounded-lg px-3 py-1.5 text-[12px]">
            + Add Tax Rate
          </summary>
          <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-xl">
            <p className="mb-3 text-[12px] font-bold text-[var(--ink)]">New Tax Rate</p>
            <form action={createTaxRateAction} className="space-y-3">
              <div>
                <label className="mb-1 block text-[13px] font-semibold text-[var(--ink-muted)]">Name *</label>
                <input name="name" required placeholder="e.g. Value Added Tax" className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[13px] font-semibold text-[var(--ink-muted)]">Code *</label>
                  <input name="code" required placeholder="VAT" className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px] uppercase" />
                </div>
                <div>
                  <label className="mb-1 block text-[13px] font-semibold text-[var(--ink-muted)]">Rate % *</label>
                  <input name="rate" type="number" min="0" max="100" step="0.01" required placeholder="18" className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-[12px] text-[var(--ink)]">
                  <input type="checkbox" name="appliesToSales" defaultChecked className="rounded" />
                  Applies to sales / invoices
                </label>
                <label className="flex items-center gap-2 text-[12px] text-[var(--ink)]">
                  <input type="checkbox" name="appliesToPurchases" className="rounded" />
                  Applies to purchases
                </label>
                <label className="flex items-center gap-2 text-[12px] text-[var(--ink)]">
                  <input type="checkbox" name="isDefault" className="rounded" />
                  Set as default rate
                </label>
              </div>
              <button type="submit" className="btn-premium w-full rounded-lg py-2 text-[12px] font-semibold">
                Create Tax Rate
              </button>
            </form>
          </div>
        </details>
      </div>

      {/* Tax rate table */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="doc-list overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--panel-strong)] text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              <tr>
                <th className="px-4 py-2.5 text-left">Code</th>
                <th className="px-4 py-2.5 text-left">Name</th>
                <th className="px-4 py-2.5 text-right">Rate</th>
                <th className="hidden px-4 py-2.5 text-center md:table-cell">Sales</th>
                <th className="hidden px-4 py-2.5 text-center md:table-cell">Purchases</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {taxRates.map((rate) => (
                <tr key={rate.id} className="border-t border-[var(--line)] align-middle hover:bg-[var(--panel-strong)]/40">
                  <td className="px-4 py-3">
                    <span className="mono rounded-md bg-[var(--panel-strong)] px-2 py-1 text-[12px] font-bold text-[var(--ink)]">
                      {rate.code}
                    </span>
                    {rate.isDefault && (
                      <span className="ml-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[12px] font-semibold text-emerald-700">
                        Default
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-[var(--ink)]">{rate.name}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--ink)]">
                    {rate.rate}%
                  </td>
                  <td className="hidden px-4 py-3 text-center md:table-cell">
                    {rate.appliesToSales ? (
                      <span className="text-emerald-600">✓</span>
                    ) : (
                      <span className="text-[var(--ink-muted)]">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-center md:table-cell">
                    {rate.appliesToPurchases ? (
                      <span className="text-emerald-600">✓</span>
                    ) : (
                      <span className="text-[var(--ink-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[13px] font-semibold ${
                        rate.isActive
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-700"
                          : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"
                      }`}
                    >
                      {rate.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RowActionsMenu label="Rate actions">
                      <MenuSection label="Actions" />
                      <div className="px-3 py-1">
                        <form action={toggleTaxRateAction}>
                          <input type="hidden" name="taxRateId" value={rate.id} />
                          <input type="hidden" name="action" value="toggle" />
                          <button type="submit" className="w-full rounded py-1.5 text-left text-[12px] text-[var(--ink)] hover:text-[var(--accent)]">
                            {rate.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </form>
                        {!rate.isDefault && (
                          <form action={toggleTaxRateAction}>
                            <input type="hidden" name="taxRateId" value={rate.id} />
                            <input type="hidden" name="action" value="setDefault" />
                            <button type="submit" className="w-full rounded py-1.5 text-left text-[12px] text-[var(--ink)] hover:text-[var(--accent)]">
                              Set as Default
                            </button>
                          </form>
                        )}
                      </div>
                      <MenuDestructiveRow>
                        <form action={deleteTaxRateAction}>
                          <input type="hidden" name="taxRateId" value={rate.id} />
                          <ConfirmSubmitButton
                            message={`Delete tax rate ${rate.code}? This cannot be undone.`}
                            className="w-full text-left text-[12px] text-red-600"
                          >
                            Delete
                          </ConfirmSubmitButton>
                        </form>
                      </MenuDestructiveRow>
                    </RowActionsMenu>
                  </td>
                </tr>
              ))}
              {taxRates.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-[var(--ink-muted)]">
                    No tax rates configured. Add VAT, WHT, or other rates above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
