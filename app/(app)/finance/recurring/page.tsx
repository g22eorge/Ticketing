import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { InvoiceStatus, InvoiceType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { assertOrgCanMutate } from "@/lib/org-write";
import { writeSystemAuditEvent } from "@/lib/commercial/audit";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
import { RowActionsMenu, MenuSection, MenuDestructiveRow } from "@/components/shared/RowActionsMenu";

export const dynamic = "force-dynamic";

const FREQUENCIES = ["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"] as const;
type Frequency = (typeof FREQUENCIES)[number];

const FREQ_LABELS: Record<Frequency, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUAL: "Annual",
};

const INVOICE_TYPES = ["SERVICE", "MERCHANDISE", "CONTRACT", "OTHER"] as const;

const TYPE_LABELS: Record<string, string> = {
  SERVICE: "Service",
  MERCHANDISE: "Merchandise",
  CONTRACT: "Contract",
  OTHER: "Other",
};

const fmt = (d: Date | null) =>
  d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "—";

function nextDueDateFromFrequency(from: Date, freq: Frequency): Date {
  const d = new Date(from);
  switch (freq) {
    case "WEEKLY":    d.setDate(d.getDate() + 7); break;
    case "MONTHLY":   d.setMonth(d.getMonth() + 1); break;
    case "QUARTERLY": d.setMonth(d.getMonth() + 3); break;
    case "ANNUAL":    d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}

export default async function RecurringInvoicesPage() {
  const { user, orgId, org } = await requireOrgSession();
  if (!can.viewFinancials(user)) redirect("/dashboard");

  const [recurringInvoices, clients] = await Promise.all([
    prisma.recurringInvoice.findMany({
      where: { orgId },
      include: {
        client: { select: { id: true, fullName: true } },
        items: true,
        createdBy: { select: { name: true } },
      },
      orderBy: [{ isActive: "desc" }, { nextDueAt: "asc" }],
    }),
    prisma.client.findMany({
      where: { orgId },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }).catch(() => [] as { id: string; fullName: string }[]),
  ]);

  const currency = org.baseCurrency ?? "UGX";
  const now = new Date();

  async function createRecurringAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!can.viewFinancials(user)) redirect("/dashboard");
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const clientId = String(formData.get("clientId") ?? "").trim();
    const subject = String(formData.get("subject") ?? "").trim();
    const freqRaw = String(formData.get("frequency") ?? "MONTHLY").trim();
    const invoiceTypeRaw = String(formData.get("invoiceType") ?? "SERVICE").trim();
    const cur = String(formData.get("currency") ?? org.baseCurrency ?? "UGX").trim();
    const autoIssue = formData.get("autoIssue") === "on";
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const startDateRaw = String(formData.get("startDate") ?? "").trim();

    if (!clientId || !subject) return;

    const frequency = (FREQUENCIES as readonly string[]).includes(freqRaw) ? (freqRaw as Frequency) : "MONTHLY";
    const invoiceType = (INVOICE_TYPES as readonly string[]).includes(invoiceTypeRaw)
      ? (invoiceTypeRaw as InvoiceType)
      : "SERVICE" as InvoiceType;
    const nextDueAt = startDateRaw ? new Date(startDateRaw) : new Date();

    const descriptions = formData.getAll("itemDescription").map((v) => String(v).trim()).filter(Boolean);
    const quantities = formData.getAll("itemQty").map((v) => Number(String(v)));
    const unitPrices = formData.getAll("itemPrice").map((v) => Number(String(v)));
    const discounts = formData.getAll("itemDiscount").map((v) => Number(String(v)) || 0);

    if (descriptions.length === 0) return;

    const items = descriptions.map((desc, i) => {
      const qty = Number.isFinite(quantities[i]) && quantities[i] > 0 ? quantities[i] : 1;
      const price = Number.isFinite(unitPrices[i]) ? unitPrices[i] : 0;
      const discount = Number.isFinite(discounts[i]) ? discounts[i] : 0;
      return { description: desc, quantity: qty, unitPrice: price, discountAmount: discount, lineTotal: qty * price - discount };
    });

    const rec = await prisma.recurringInvoice.create({
      data: {
        orgId,
        clientId,
        subject,
        frequency,
        invoiceType,
        currency: cur,
        autoIssue,
        notes,
        nextDueAt,
        createdById: user.id,
        items: { create: items },
      },
    });

    await writeSystemAuditEvent({
      orgId,
      entityType: "RecurringInvoice",
      entityId: rec.id,
      action: "RECURRING_INVOICE_CREATED",
      summary: `${subject} — ${frequency} — client ${clientId}`,
      actorUserId: user.id,
    });

    revalidatePath("/finance/recurring");
  }

  async function toggleRecurringAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!can.viewFinancials(user)) redirect("/dashboard");
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const recurringId = String(formData.get("recurringId") ?? "").trim();
    if (!recurringId) return;

    const rec = await prisma.recurringInvoice.findFirst({ where: { id: recurringId, orgId } });
    if (!rec) return;

    await prisma.recurringInvoice.update({ where: { id: recurringId }, data: { isActive: !rec.isActive } });
    revalidatePath("/finance/recurring");
  }

  async function issueNowAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!can.viewFinancials(user)) redirect("/dashboard");
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const recurringId = String(formData.get("recurringId") ?? "").trim();
    if (!recurringId) return;

    const rec = await prisma.recurringInvoice.findFirst({
      where: { id: recurringId, orgId },
      include: { items: true },
    });
    if (!rec) return;

    const count = await prisma.invoice.count({ where: { orgId } });
    const year = new Date().getFullYear();
    const invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, "0")}`;
    const totalAmount = rec.items.reduce((s, item) => s + item.lineTotal, 0);
    const frequency = (FREQUENCIES as readonly string[]).includes(rec.frequency)
      ? (rec.frequency as Frequency)
      : "MONTHLY";
    const nextDue = nextDueDateFromFrequency(new Date(), frequency);

    await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          orgId,
          clientId: rec.clientId,
          invoiceType: rec.invoiceType,
          subject: rec.subject,
          invoiceNumber,
          currency: rec.currency,
          status: "ISSUED" as InvoiceStatus,
          totalAmount,
          notes: rec.notes ?? undefined,
          lines: {
            create: rec.items.map((item) => ({
              orgId,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountAmount: item.discountAmount,
              lineTotal: item.lineTotal,
            })),
          },
        },
      });

      await tx.recurringInvoice.update({
        where: { id: recurringId },
        data: { lastIssuedAt: new Date(), nextDueAt: nextDue },
      });

      await writeSystemAuditEvent({
        orgId,
        entityType: "Invoice",
        entityId: invoice.id,
        action: "RECURRING_INVOICE_ISSUED",
        summary: `Issued ${invoiceNumber} from recurring template — ${rec.subject}`,
        actorUserId: user.id,
      });
    });

    revalidatePath("/finance/recurring");
    revalidatePath("/documents/invoices");
  }

  async function deleteRecurringAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!["ADMIN", "MANAGER"].includes(user.role)) redirect("/dashboard");
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const recurringId = String(formData.get("recurringId") ?? "").trim();
    if (!recurringId) return;

    const rec = await prisma.recurringInvoice.findFirst({ where: { id: recurringId, orgId }, select: { subject: true } });
    if (!rec) return;

    await prisma.recurringInvoice.delete({ where: { id: recurringId } });

    await writeSystemAuditEvent({
      orgId,
      entityType: "RecurringInvoice",
      entityId: recurringId,
      action: "RECURRING_INVOICE_DELETED",
      summary: `Deleted recurring template — ${rec.subject}`,
      actorUserId: user.id,
    });

    revalidatePath("/finance/recurring");
  }

  const activeCount = recurringInvoices.filter((r) => r.isActive).length;
  const dueNow = recurringInvoices.filter((r) => r.isActive && r.nextDueAt <= now).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="panel-shadow flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Finance</p>
          <p className="text-[13px] font-bold text-[var(--ink)]">
            Recurring Invoices{" "}
            <span className="font-normal text-[var(--ink-muted)]">
              · {activeCount} active{dueNow > 0 ? ` · ${dueNow} due` : ""}
            </span>
          </p>
          <p className="text-[11px] text-[var(--ink-muted)]">
            Templates that auto-generate or remind you to issue invoices on schedule.
          </p>
        </div>
        <details className="group relative">
          <summary className="btn-premium cursor-pointer list-none rounded-lg px-3 py-1.5 text-[12px]">
            + New Template
          </summary>
          <div className="absolute right-0 top-full z-20 mt-2 w-[420px] rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-xl">
            <p className="mb-3 text-[12px] font-bold text-[var(--ink)]">New Recurring Invoice</p>
            <form action={createRecurringAction} className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]">Client *</label>
                <select name="clientId" required className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]">
                  <option value="">Select client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.fullName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]">Subject *</label>
                <input name="subject" required placeholder="e.g. Monthly maintenance contract" className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]">Frequency</label>
                  <select name="frequency" className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]">
                    {FREQUENCIES.map((f) => (
                      <option key={f} value={f}>{FREQ_LABELS[f]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]">Invoice Type</label>
                  <select name="invoiceType" className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]">
                    {INVOICE_TYPES.map((t) => (
                      <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]">Start / Next Due</label>
                  <input name="startDate" type="date" className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]">Currency</label>
                  <input name="currency" defaultValue={currency} className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]" />
                </div>
              </div>
              {/* Line items */}
              <div>
                <p className="mb-1.5 text-[11px] font-semibold text-[var(--ink-muted)]">Line Items *</p>
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[1fr_60px_80px] gap-1 text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                    <span>Description</span><span className="text-right">Qty</span><span className="text-right">Price</span>
                  </div>
                  {([0, 1, 2] as const).map((i) => (
                    <div key={i} className="grid grid-cols-[1fr_60px_80px] gap-1">
                      <input name="itemDescription" placeholder={i === 0 ? "Service description" : "Optional"} className="input-base rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-[12px]" />
                      <input name="itemQty" type="number" min="0.01" step="0.01" defaultValue={i === 0 ? "1" : ""} placeholder="1" className="input-base rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-[12px] text-right" />
                      <input name="itemPrice" type="number" min="0" step="0.01" placeholder="0.00" className="input-base rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-[12px] text-right" />
                      <input name="itemDiscount" type="hidden" defaultValue="0" />
                    </div>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-[12px] text-[var(--ink)]">
                <input type="checkbox" name="autoIssue" className="rounded" />
                Auto-issue invoice when due (requires scheduled job)
              </label>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]">Notes</label>
                <textarea name="notes" rows={2} className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]" />
              </div>
              <button type="submit" className="btn-premium w-full rounded-lg py-2 text-[12px] font-semibold">
                Create Template
              </button>
            </form>
          </div>
        </details>
      </div>

      {/* List */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              <tr>
                <th className="px-4 py-2.5 text-left">Subject</th>
                <th className="px-4 py-2.5 text-left">Client</th>
                <th className="hidden px-4 py-2.5 text-left md:table-cell">Frequency</th>
                <th className="hidden px-4 py-2.5 text-left md:table-cell">Type</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5 text-center">Next Due</th>
                <th className="hidden px-4 py-2.5 text-center sm:table-cell">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {recurringInvoices.map((rec) => {
                const total = rec.items.reduce((s, i) => s + i.lineTotal, 0);
                const isDue = rec.isActive && rec.nextDueAt <= now;
                return (
                  <tr key={rec.id} className="border-t border-[var(--line)] align-middle hover:bg-[var(--panel-strong)]/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--ink)]">{rec.subject}</p>
                      <p className="text-[11px] text-[var(--ink-muted)]">{rec.items.length} line{rec.items.length !== 1 ? "s" : ""}</p>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[var(--ink)]">{rec.client.fullName}</td>
                    <td className="hidden px-4 py-3 text-[12px] text-[var(--ink-muted)] md:table-cell">
                      {FREQ_LABELS[rec.frequency as Frequency] ?? rec.frequency}
                    </td>
                    <td className="hidden px-4 py-3 text-[12px] text-[var(--ink-muted)] md:table-cell">
                      {TYPE_LABELS[rec.invoiceType] ?? rec.invoiceType}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--ink)]">
                      {rec.currency} {total.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <p className={`text-[12px] font-medium ${isDue ? "text-amber-600" : "text-[var(--ink-muted)]"}`}>
                        {fmt(rec.nextDueAt)}
                      </p>
                      {isDue && (
                        <p className="text-[10px] font-bold uppercase text-amber-600">Due Now</p>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-center sm:table-cell">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${rec.isActive ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-700" : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"}`}>
                        {rec.isActive ? "Active" : "Paused"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RowActionsMenu label="Template actions">
                        <MenuSection label="Actions" />
                        <div className="px-3 py-1">
                          <form action={issueNowAction}>
                            <input type="hidden" name="recurringId" value={rec.id} />
                            <button type="submit" className="w-full rounded py-1.5 text-left text-[12px] text-[var(--ink)] hover:text-[var(--accent)]">
                              Issue Invoice Now
                            </button>
                          </form>
                          <form action={toggleRecurringAction}>
                            <input type="hidden" name="recurringId" value={rec.id} />
                            <button type="submit" className="w-full rounded py-1.5 text-left text-[12px] text-[var(--ink)] hover:text-[var(--accent)]">
                              {rec.isActive ? "Pause" : "Resume"}
                            </button>
                          </form>
                        </div>
                        <MenuDestructiveRow>
                          <form action={deleteRecurringAction}>
                            <input type="hidden" name="recurringId" value={rec.id} />
                            <ConfirmSubmitButton
                              message={`Delete recurring template "${rec.subject}"? This does not delete already-issued invoices.`}
                              className="w-full text-left text-[12px] text-red-600"
                            >
                              Delete Template
                            </ConfirmSubmitButton>
                          </form>
                        </MenuDestructiveRow>
                      </RowActionsMenu>
                    </td>
                  </tr>
                );
              })}
              {recurringInvoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-[var(--ink-muted)]">
                    No recurring invoice templates yet.
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
