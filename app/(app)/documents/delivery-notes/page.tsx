import Link from "next/link";
import { redirect } from "next/navigation";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

export default async function DeliveryNotesPage() {
  const { user, orgId } = await requireOrgSession();
  if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) {
    redirect("/dashboard");
  }

  const notes = await prisma.deliveryNote.findMany({
    where: { orgId },
    orderBy: { deliveredAt: "desc" },
    take: 100,
    select: {
      id: true,
      deliveryNoteNumber: true,
      deliveredAt: true,
      deliveryMethod: true,
      deliveredByName: true,
      receivedByName: true,
      sale: {
        select: {
          id: true,
          saleNumber: true,
          invoiceNumber: true,
          client: { select: { fullName: true } },
        },
      },
    },
  });

  return (
    <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Documents</p>
      <h1 className="mt-1 text-lg font-semibold text-[var(--ink)]">Delivery Notes</h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        Proof of delivery for invoiced sales. Each note can represent a partial delivery.
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-strong)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
            <tr>
              <th className="px-3 py-2">Delivery Note</th>
              <th className="hidden px-3 py-2 md:table-cell">Sale</th>
              <th className="hidden px-3 py-2 lg:table-cell">Client</th>
              <th className="px-3 py-2">Delivered</th>
              <th className="hidden px-3 py-2 lg:table-cell">Method</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((n) => (
              <tr key={n.id} className="border-t border-[var(--line)]">
                <td className="px-3 py-2">
                  <p className="mono font-bold text-[var(--ink)]">{n.deliveryNoteNumber}</p>
                  <p className="text-xs text-[var(--ink-muted)]">Delivered by {n.deliveredByName} to {n.receivedByName}</p>
                </td>
                <td className="hidden px-3 py-2 md:table-cell">
                  <Link className="mono font-semibold text-[var(--ink)] transition hover:text-[var(--accent)]" href={`/pos/${n.sale.id}`}>
                    {n.sale.invoiceNumber ?? n.sale.saleNumber}
                  </Link>
                </td>
                <td className="hidden px-3 py-2 text-[var(--ink-muted)] lg:table-cell">{n.sale.client?.fullName ?? "-"}</td>
                <td className="px-3 py-2 text-[var(--ink-muted)]">{n.deliveredAt.toLocaleString()}</td>
                <td className="hidden px-3 py-2 text-[var(--ink-muted)] lg:table-cell">{n.deliveryMethod ?? "-"}</td>
                <td className="px-3 py-2">
                  <a
                    href={`/api/delivery-notes/${n.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-premium-secondary inline-flex rounded-md px-2.5 py-1.5 text-xs"
                  >
                    Download
                  </a>
                </td>
              </tr>
            ))}
            {notes.length === 0 ? (
              <tr className="border-t border-[var(--line)]">
                <td className="px-3 py-6 text-sm text-[var(--ink-muted)]" colSpan={6}>
                  No delivery notes yet. Create one from an invoiced sale.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
