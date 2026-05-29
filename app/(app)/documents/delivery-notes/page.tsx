import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { DeliveryMethod } from "@prisma/client";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { requireModule, OrgModule } from "@/lib/module-access";
import { assertOrgCanMutate } from "@/lib/org-write";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
import { writeSystemAuditEvent } from "@/lib/commercial/audit";
import { RowActionsMenu, MenuSection, MenuDestructiveRow } from "@/components/shared/RowActionsMenu";
import { nextDocumentNumber } from "@/lib/commercial/document-workflow";

const DELIVERY_METHODS: DeliveryMethod[] = ["PICKUP", "DELIVERY", "COURIER"];

export default async function DeliveryNotesPage() {
  const { user, orgId } = await requireOrgSession();
  if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) {
    redirect("/dashboard");
  }
  await requireModule(OrgModule.INVOICING);

  async function createDeliveryNoteAction(formData: FormData) {
    "use server";
    const { user, orgId, org, session } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS"].includes(user.role))) redirect("/dashboard");
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    const deliveredByName = String(formData.get("deliveredByName") ?? "").trim();
    const receivedByName = String(formData.get("receivedByName") ?? "").trim();
    const methodRaw = String(formData.get("deliveryMethod") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    if (!invoiceId || !deliveredByName || !receivedByName) return;

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, orgId, status: { not: "VOID" } },
      select: { id: true, invoiceNumber: true, paidAmount: true, totalAmount: true, subject: true, job: { select: { jobNumber: true, brand: true, model: true } } },
    });
    if (!invoice || invoice.paidAmount < invoice.totalAmount) return;

    const deliveryMethod = DELIVERY_METHODS.includes(methodRaw as DeliveryMethod) ? (methodRaw as DeliveryMethod) : null;
    const description = invoice.job
      ? `Repair handover for ${invoice.job.jobNumber} (${invoice.job.brand} ${invoice.job.model})`
      : invoice.subject ?? invoice.invoiceNumber;

    const noteRecord = await prisma.$transaction(async (tx) => {
      const deliveryNoteNumber = await nextDocumentNumber(tx, "DN", "deliveryNote");
      return tx.deliveryNote.create({
        data: {
          orgId,
          invoiceId: invoice.id,
          deliveryNoteNumber,
          deliveryMethod,
          deliveredByName,
          receivedByName,
          note: note || null,
          createdById: session.user.id,
          items: { create: [{ description, quantity: 1 }] },
        },
      });
    });
    await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "DeliveryNote", entityId: noteRecord.id, action: "DELIVERY_NOTE_CREATED", summary: `${noteRecord.deliveryNoteNumber} generated from ${invoice.invoiceNumber}` });
    revalidatePath("/documents/delivery-notes");
    revalidatePath("/documents/invoices");
  }

  async function updateDeliveryNoteAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS"].includes(user.role))) redirect("/dashboard");
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
    invoice?: { id: string; invoiceNumber: string; job: { id: string; jobNumber: string; client: { fullName: string } } | null } | null;
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
  const invoiceOptions = await prisma.invoice.findMany({
    where: { orgId, status: { not: "VOID" } },
    orderBy: { issuedAt: "desc" },
    take: 80,
    select: { id: true, invoiceNumber: true, totalAmount: true, paidAmount: true, job: { select: { jobNumber: true, client: { select: { fullName: true } } } }, client: { select: { fullName: true } } },
  }).then((rows) => rows.filter((invoice) => invoice.paidAmount >= invoice.totalAmount));

  return (
    <section className="space-y-4">
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Documents</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">Delivery Notes</p>
          </div>
          <Link href="/documents/invoices" className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">Create Delivery Note</Link>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line)] sm:grid-cols-3 sm:divide-y-0">
          <div className="px-4 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Total Notes</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{notes.length}</p>
          </div>
          <div className="px-4 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">This Month</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{thisMonth}</p>
          </div>
          <div className="px-4 py-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]/60">Unique Sources</p>
            <p className="text-[15px] font-black tabular-nums leading-tight text-[var(--ink)]">{uniqueSources}</p>
          </div>
        </div>
      </div>

      {invoiceOptions.length > 0 ? (
        <details className="group rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <summary className="cursor-pointer select-none px-4 py-2.5 text-[12px] font-semibold text-[var(--ink)] group-open:border-b group-open:border-[var(--line)]">
            Create Delivery Note from paid invoice
          </summary>
          <form action={createDeliveryNoteAction} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <select name="invoiceId" required className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm sm:col-span-2">
              <option value="">Select paid invoice...</option>
              {invoiceOptions.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} - {invoice.job?.jobNumber ?? invoice.client?.fullName ?? "Invoice"}</option>
              ))}
            </select>
            <input name="deliveredByName" required placeholder="Delivered by" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm" />
            <input name="receivedByName" required placeholder="Received by" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm" />
            <select name="deliveryMethod" defaultValue="" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm">
              <option value="">No method</option>
              {DELIVERY_METHODS.map((method) => <option key={method} value={method}>{method.replaceAll("_", " ")}</option>)}
            </select>
            <input name="note" placeholder="Optional note" className="h-9 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm" />
            <button type="submit" className="btn-premium h-9 rounded-lg px-5 text-sm font-semibold">Create Delivery Note</button>
          </form>
        </details>
      ) : null}

      <div className="doc-list overflow-x-auto rounded-xl border border-[var(--line)]">
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
                  {/* Client + source visible on mobile (those columns hidden at md/lg) */}
                  <p className="mt-0.5 text-[11px] font-medium text-[var(--ink)] lg:hidden">
                    {n.invoice?.job?.client.fullName ?? n.sale?.client?.fullName ?? ""}
                  </p>
                </td>
                <td className="hidden px-3 py-2.5 md:table-cell">
                  {n.invoice ? (
                    <Link className="mono font-semibold text-[var(--ink)] transition hover:text-[var(--accent)]" href={n.invoice.job ? `/jobs/${n.invoice.job.id}` : "/documents/invoices"}>
                      {n.invoice.invoiceNumber}{n.invoice.job ? ` / ${n.invoice.job.jobNumber}` : ""}
                    </Link>
                  ) : n.sale ? (
                    <Link className="mono font-semibold text-[var(--ink)] transition hover:text-[var(--accent)]" href={`/pos/${n.sale.id}`}>
                      {n.sale.invoiceNumber ?? n.sale.saleNumber}
                    </Link>
                  ) : "-"}
                </td>
                <td className="hidden px-3 py-2.5 text-[var(--ink-muted)] lg:table-cell">{n.invoice?.job?.client.fullName ?? n.sale?.client?.fullName ?? "-"}</td>
                <td className="px-3 py-2.5 text-[var(--ink-muted)]">{n.deliveredAt.toLocaleDateString()}<br /><span className="text-[10px]">{n.deliveredAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></td>
                <td className="hidden px-3 py-2.5 lg:table-cell">
                  {n.deliveryMethod ? (
                    <span className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-muted)]">
                      {n.deliveryMethod.replaceAll("_", " ")}
                    </span>
                  ) : "-"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link href={n.invoice?.job ? `/jobs/${n.invoice.job.id}` : n.sale ? `/pos/${n.sale.id}` : "/documents/delivery-notes"} title="View source" className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                    </Link>
                    <a href={`/api/delivery-notes/${n.id}`} target="_blank" rel="noreferrer" title="Download PDF" className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] transition hover:bg-[var(--accent)]/20">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                    </a>
                    <RowActionsMenu label="Delivery note actions">
                      <MenuSection label="Edit Delivery Note" />
                      <form action={updateDeliveryNoteAction} className="space-y-2 p-3">
                        <input type="hidden" name="deliveryNoteId" value={n.id} />
                        <input name="deliveredByName" defaultValue={n.deliveredByName} placeholder="Delivered by" className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                        <input name="receivedByName" defaultValue={n.receivedByName} placeholder="Received by" className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                        <input name="receivedBySignatureText" defaultValue={n.receivedBySignatureText ?? ""} placeholder="Signature text" className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                        <select name="deliveryMethod" defaultValue={n.deliveryMethod ?? ""} className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50">
                          <option value="">No method</option>
                          {DELIVERY_METHODS.map((m) => <option key={m} value={m}>{m.replaceAll("_", " ")}</option>)}
                        </select>
                        <textarea name="note" defaultValue={n.note ?? ""} placeholder="Note" className="min-h-14 w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]/50" />
                        <button type="submit" className="btn-premium w-full rounded-lg px-3 py-1.5 text-xs font-semibold">Save</button>
                      </form>
                      <MenuDestructiveRow>
                        <form action={deleteDeliveryNoteAction}>
                          <input type="hidden" name="deliveryNoteId" value={n.id} />
                          <ConfirmSubmitButton message="Delete this delivery note? This cannot be undone." className="text-xs font-semibold text-red-600 transition hover:text-red-700">Delete Delivery Note</ConfirmSubmitButton>
                        </form>
                      </MenuDestructiveRow>
                    </RowActionsMenu>
                  </div>
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
