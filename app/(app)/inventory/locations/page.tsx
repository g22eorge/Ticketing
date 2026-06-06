import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { requireModule, OrgModule } from "@/lib/module-access";
import { can } from "@/lib/permissions";
import { RowActionsMenu } from "@/components/shared/RowActionsMenu";
import { createStockLocationAction, toggleStockLocationAction, updateStockLocationAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function StockLocationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule(OrgModule.INVENTORY);
  const { user, orgId } = await requireOrgSession();
  if (!can.manageInventory(user)) redirect("/inventory");

  const params = (((await searchParams?.catch(() => ({}))) ?? {}) as Record<string, string | string[] | undefined>);
  const created = String(params.created ?? "") === "1";
  const saved = String(params.saved ?? "") === "1";
  const error = typeof params.error === "string" ? params.error : "";

  const [locations, branches, stockRows] = await Promise.all([
    prisma.stockLocation.findMany({
      where: { orgId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }).catch(() => []),
    prisma.branch.findMany({
      where: { orgId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }).catch(() => []),
    prisma.partLocationStock.groupBy({
      by: ["locationId"],
      where: { orgId },
      _sum: { qtyOnHand: true, qtyReserved: true },
      _count: { partId: true },
    }).catch(() => []),
  ]);

  const stats = new Map(stockRows.map((row) => [row.locationId, row]));
  const branchName = new Map(branches.map((branch) => [branch.id, branch.name]));

  return (
    <div className="space-y-4">
      <div className="panel-shadow flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <p className="text-[13px] font-bold text-[var(--ink)]">
          Stock Locations · <span className="font-normal text-[var(--ink-muted)]">{locations.length}</span>
        </p>
        <div className="flex items-center gap-2">
          <Link href="/inventory" className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
            ← Inventory
          </Link>
        </div>
      </div>

      {created ? <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">Location created.</div> : null}
      {saved ? <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">Location updated.</div> : null}
      {error ? <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div> : null}

      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
        <p className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Add Location</p>
        <form action={createStockLocationAction} className="grid gap-2 md:grid-cols-[1.4fr_0.7fr_1fr_auto]">
          <input name="name" placeholder="Location name *" required className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60" />
          <input name="code" placeholder="Code" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] uppercase outline-none focus:border-[var(--accent)]/60" />
          <select name="branchId" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60">
            <option value="">No branch</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <button type="submit" className="btn-premium rounded-lg px-4 py-1.5 text-[13px] font-semibold">Create</button>
        </form>
      </div>

      <div className="rounded-xl border border-[var(--line)]">
        {locations.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--ink-muted)]">No stock locations yet. Create Main Stock, Store, Van, or Technician locations here.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--panel-strong)] text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-2.5 text-left">Location</th>
                  <th className="px-4 py-2.5 text-left">Code</th>
                  <th className="hidden px-4 py-2.5 text-left md:table-cell">Branch</th>
                  <th className="px-4 py-2.5 text-right">Parts</th>
                  <th className="px-4 py-2.5 text-right">On Hand</th>
                  <th className="hidden px-4 py-2.5 text-right md:table-cell">Reserved</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className="px-4 py-2.5 text-right">Edit</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((location) => {
                  const row = stats.get(location.id);
                  return (
                    <tr key={location.id} className="border-t border-[var(--line)] align-top hover:bg-[var(--panel-strong)]/40">
                      <td className="px-4 py-3 font-semibold text-[var(--ink)]">{location.name}</td>
                      <td className="px-4 py-3 font-mono text-[var(--ink-muted)]">{location.code ?? "—"}</td>
                      <td className="hidden px-4 py-3 text-[var(--ink-muted)] md:table-cell">{location.branchId ? branchName.get(location.branchId) ?? "Linked branch" : "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--ink-muted)]">{row?._count.partId ?? 0}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-[var(--ink)]">{row?._sum.qtyOnHand ?? 0}</td>
                      <td className="hidden px-4 py-3 text-right tabular-nums text-[var(--ink-muted)] md:table-cell">{row?._sum.qtyReserved ?? 0}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2.5 py-0.5 text-[13px] font-semibold ${location.isActive ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700" : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"}`}>
                          {location.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <RowActionsMenu label={`Location actions for ${location.name}`}>
                            <div className="w-72 p-3">
                              <form action={updateStockLocationAction} className="grid gap-2 text-left">
                                <input type="hidden" name="id" value={location.id} />
                                <input name="name" defaultValue={location.name} required className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60" />
                                <input name="code" defaultValue={location.code ?? ""} placeholder="Code" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] uppercase outline-none focus:border-[var(--accent)]/60" />
                                <select name="branchId" defaultValue={location.branchId ?? ""} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/60">
                                  <option value="">No branch</option>
                                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                                </select>
                                <label className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
                                  <input type="checkbox" name="isActive" value="1" defaultChecked={location.isActive} /> Active
                                </label>
                                <button type="submit" className="btn-premium rounded-lg px-3 py-1.5 text-xs font-semibold">Save Location</button>
                              </form>
                              <form action={toggleStockLocationAction} className="mt-2 border-t border-[var(--line)] pt-2">
                                <input type="hidden" name="id" value={location.id} />
                                <input type="hidden" name="isActive" value={location.isActive ? "0" : "1"} />
                                <button type="submit" className="text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]">
                                  {location.isActive ? "Deactivate" : "Activate"}
                                </button>
                              </form>
                            </div>
                          </RowActionsMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
