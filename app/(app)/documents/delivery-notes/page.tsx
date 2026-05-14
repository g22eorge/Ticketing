import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { DeliveryMethod } from "@prisma/client";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { assertOrgCanMutate } from "@/lib/org-write";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
import { writeSystemAuditEvent } from "@/lib/commercial/audit";

const DELIVERY_METHODS = Object.values(DeliveryMethod);

export default async function DeliveryNotesPage() {
  const { user, orgId } = await requireOrgSession();
  if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) {
    redirect("/dashboard");
  }

  async function updateDeliveryNoteAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS"].includes(user.role))) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const deliveryNoteId = String(formData.get("deliveryNoteId") ?? "").trim();
    const deliveredByName = String(formData.get("deliveredByName") ?? "").trim();
    const receivedByName = String(formData.get("receivedByName") ?? "").trim();
    const receivedBySignatureText = String(formData.get("receivedBySignatureText") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    const methodRaw = String(formData.get("deliveryMethod") ?? "").trim();
    if (!deliveryNoteId || !deliveredByName || !receivedByName) return;

    const deliveryMethod = DELIVERY_METHODS.includes(methodRaw as DeliveryMethod) ? (methodRaw as DeliveryMethod) : null;
    await prisma.deliveryNote.updateMany({
      where: { id: deliveryNoteId, orgId },
      data: {
        deliveredByName,
        receivedByName,
        receivedBySignatureText: receivedBySignatureText || null,
        deliveryMethod,
        note: note || null,
      },
    });
    await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "DeliveryNote", entityId: deliveryNoteId, action: "DELIVERY_NOTE_UPDATED", summary: "Delivery note updated" });

    revalidatePath("/documents/delivery-notes");
  }

  async function deleteDeliveryNoteAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!("ADMIN" === user.role || can.approveInvoices(user))) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const deliveryNoteId = String(formData.get("deliveryNoteId") ?? "").trim();
    if (!deliveryNoteId) return;

    await prisma.deliveryNote.deleteMany({ where: { id: deliveryNoteId, orgId } });
    await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "DeliveryNote", entityId: deliveryNoteId, action: "DELIVERY_NOTE_DELETED", summary: "Delivery note deleted" });
    revalidatePath("/documents/delivery-notes");
  }

  type DeliveryNoteRow = {
    id: string;
    deliveryNoteNumber: string;
    deliveredAt: Date;
    deliveryMethod: DeliveryMethod | null;
    deliveredByName: string;
    receivedByName: string;
    receivedBySignatureText: string | null;
    note: string | null;
    sale: { id: string; saleNumber: string; invoiceNumber: string | null; client: { fullName: string } | null } | null;
    invoice?: { id: string; invoiceNumber: string; job: { id: string; jobNumber: string; client: { fullName: string } } } | null;
  };

  let notes: DeliveryNoteRow[] = [];
  try {
    notes = await prisma.deliveryNote.findMany({
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
        receivedBySignatureText: true,
        note: true,
        sale: {
          select: {
            id: true,
            saleNumber: true,
            invoiceNumber: true,
            client: { select: { fullName: true } },
          },
        },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            job: { select: { id: true, jobNumber: true, client: { select: { fullName: true } } } },
          },
        },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("Unknown field `invoice`")) throw err;
    // Keep legacy deployments readable until their generated Prisma client includes DeliveryNote.invoice.
    notes = await prisma.deliveryNote.findMany({
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
        receivedBySignatureText: true,
        note: true,
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
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth = notes.filter((n) => n.deliveredAt >= monthStart).length;
  const uniqueSources = new Set(notes.map((n) => n.invoice?.id ?? n.sale?.id).filter(Boolean)).size;

  return (
    <section className="space-y-4">
      <div className="panel-shadow overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--accent)] text-xl font-black text-black">
              D
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-black text-[var(--ink)]">Delivery Notes</p>
              <p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]">Proof of device handover · linked to paid invoices · downloadable PDFs</p>
            </div>
          </div>
          <Link href="/documents/invoices" className="btn-premium rounded-full px-4 py-2 text-sm">Open Invoices</Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Total Notes</p>
          <p className="mt-2 text-2xl font-bold text-[var(--ink)]">{notes.length}</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">This Month</p>
          <p className="mt-2 text-2xl font-bold text-[var(--ink)]">{thisMonth}</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Unique Sources</p>
          <p className="mt-2 text-2xl font-bold text-[var(--ink)]">{uniqueSources}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            <tr>
              <th className="px-3 py-2.5">Delivery Note</th>
              <th className="hidden px-3 py-2.5 md:table-cell">Source</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Client</th>
              <th className="px-3 py-2.5">Delivered</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Method</th>
              <th className="px-3 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((n) => (
              <tr key={n.id} className="border-t border-[var(--line)] align-middle hover:bg-[var(--panel-strong)]/40">
                <td className="px-3 py-2.5">
                  <p className="mono font-bold text-[var(--ink)]">{n.deliveryNoteNumber}</p>
                  <p className="text-xs text-[var(--ink-muted)]">{n.deliveredByName} → {n.receivedByName}</p>
                </td>
                <td className="hidden px-3 py-2.5 md:table-cell">
                  {n.invoice ? (
                    <Link className="mono font-semibold text-[var(--ink)] transition hover:text-[var(--accent)]" href={`/jobs/${n.invoice.job.id}`}>
                      {n.invoice.invoiceNumber} / {n.invoice.job.jobNumber}
                    </Link>
                  ) : n.sale ? (
                    <Link className="mono font-semibold text-[var(--ink)] transition hover:text-[var(--accent)]" href={`/pos/${n.sale.id}`}>
                      {n.sale.invoiceNumber ?? n.sale.saleNumber}
                    </Link>
                  ) : "-"}
                </td>
                <td className="hidden px-3 py-2.5 text-[var(--ink-muted)] lg:table-cell">{n.invoice?.job.client.fullName ?? n.sale?.client?.fullName ?? "-"}</td>
                <td className="px-3 py-2.5 text-[var(--ink-muted)]">{n.deliveredAt.toLocaleDateString()}<br /><span className="text-[10px]">{n.deliveredAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></td>
                <td className="hidden px-3 py-2.5 lg:table-cell">
                  {n.deliveryMethod ? (
                    <span className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-muted)]">
                      {n.deliveryMethod.replaceAll("_", " ")}
                    </span>
                  ) : "-"}
                </td>
                <td className="px-3 py-2">
                  <details className="relative inline-block">
                    <summary className="inline-flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink)] transition hover:border-[var(--accent)]/40">
                      <span className="sr-only">Actions</span>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <circle cx="5" cy="12" r="1.8" />
                        <circle cx="12" cy="12" r="1.8" />
                        <circle cx="19" cy="12" r="1.8" />
                      </svg>
                    </summary>
                    <div className="panel-shadow absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
                      <div className="py-1">
                        <Link href={n.invoice ? `/jobs/${n.invoice.job.id}` : n.sale ? `/pos/${n.sale.id}` : "/documents/delivery-notes"} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
                          View
                        </Link>
                        <a href={`/api/delivery-notes/${n.id}`} target="_blank" rel="noreferrer" className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                          Download PDF
                        </a>
                        <details className="border-t border-[var(--line)]">
                          <summary className="flex w-full cursor-pointer list-none items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]">
                            Edit Delivery Note
                          </summary>
                          <form action={updateDeliveryNoteAction} className="space-y-2 px-4 pb-3">
                            <input type="hidden" name="deliveryNoteId" value={n.id} />
                            <input name="deliveredByName" defaultValue={n.deliveredByName} placeholder="Delivered by" className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                            <input name="receivedByName" defaultValue={n.receivedByName} placeholder="Received by" className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                            <input name="receivedBySignatureText" defaultValue={n.receivedBySignatureText ?? ""} placeholder="Signature text" className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                            <select name="deliveryMethod" defaultValue={n.deliveryMethod ?? ""} className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50">
                              <option value="">No method</option>
                              {DELIVERY_METHODS.map((m) => <option key={m} value={m}>{m.replaceAll("_", " ")}</option>)}
                            </select>
                            <textarea name="note" defaultValue={n.note ?? ""} placeholder="Delivery note" className="min-h-16 w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                            <button className="btn-premium w-full rounded-md px-2.5 py-1.5 text-xs text-white">Save</button>
                          </form>
                        </details>
                        <form action={deleteDeliveryNoteAction} className="border-t border-[var(--line)] px-4 py-3">
                          <input type="hidden" name="deliveryNoteId" value={n.id} />
                          <ConfirmSubmitButton message="Delete this delivery note? This cannot be undone." className="text-left text-sm font-semibold text-red-600 transition hover:text-red-700">Delete Delivery Note</ConfirmSubmitButton>
                        </form>
                      </div>
                    </div>
                  </details>
                </td>
              </tr>
            ))}
            {notes.length === 0 ? (
              <tr className="border-t border-[var(--line)]">
                <td className="px-3 py-8 text-sm text-[var(--ink-muted)]" colSpan={6}>
                  No delivery notes yet. Generate one from a paid invoice where delivery or handover proof is needed.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
