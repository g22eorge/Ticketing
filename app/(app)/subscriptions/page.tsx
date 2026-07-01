import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ClientSubscriptionStatus, SLACycle } from "@prisma/client";

import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = new Set(["ADMIN", "MANAGER", "OPS", "FRONT_DESK"]);

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function renewalFrom(startDate: Date, cycle: SLACycle) {
  return addMonths(startDate, cycle === "MONTHLY" ? 1 : 12);
}

function reminderDates(renewalDate: Date) {
  return [
    { type: "TWO_MONTHS" as const, remindAt: addMonths(renewalDate, -2), label: "2 months before" },
    { type: "ONE_MONTH" as const, remindAt: addMonths(renewalDate, -1), label: "1 month before" },
    { type: "TWO_WEEKS" as const, remindAt: new Date(renewalDate.getTime() - 14 * 24 * 60 * 60 * 1000), label: "2 weeks before" },
  ];
}

function fmtDate(date: Date) {
  return new Intl.DateTimeFormat("en-UG", { dateStyle: "medium" }).format(date);
}

async function createSubscriptionAction(formData: FormData) {
  "use server";
  const { user, orgId, org } = await requireOrgSession();
  if (!MANAGE_ROLES.has(user.role)) redirect("/subscriptions");

  const clientId = String(formData.get("clientId") ?? "");
  const cycle = String(formData.get("cycle") ?? "ANNUAL") === "MONTHLY" ? "MONTHLY" : "ANNUAL";
  const startDate = new Date(String(formData.get("startDate") ?? ""));
  const amountPaid = Number(formData.get("amountPaid") ?? 0);
  const status = String(formData.get("status") ?? "ACTIVE") as ClientSubscriptionStatus;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!clientId || Number.isNaN(startDate.getTime())) return;

  const renewalDate = renewalFrom(startDate, cycle);
  await prisma.$transaction(async (tx) => {
    const sub = await tx.clientSubscription.create({
      data: {
        orgId,
        clientId,
        cycle,
        startDate,
        renewalDate,
        amountPaid: Number.isFinite(amountPaid) ? amountPaid : 0,
        currency: org.baseCurrency || "UGX",
        status,
        notes,
        reminders: {
          create: reminderDates(renewalDate).map((r) => ({
            type: r.type,
            remindAt: r.remindAt,
            emailEnabled: true,
            whatsappEnabled: true,
          })),
        },
      },
      select: { id: true },
    });

    await tx.client.update({
      where: { id: clientId },
      data: {
        isSLACovered: status === "ACTIVE",
        slaStartDate: startDate,
        slaEndDate: renewalDate,
        slaBillingCycle: cycle,
        slaAmountPaid: Number.isFinite(amountPaid) ? amountPaid : 0,
        slaStatus: status,
      },
    });

    await tx.clientSubscriptionRenewal.create({
      data: {
        subscriptionId: sub.id,
        nextRenewalDate: renewalDate,
        amountPaid: Number.isFinite(amountPaid) ? amountPaid : 0,
        currency: org.baseCurrency || "UGX",
        note: "Initial subscription record",
      },
    });
  });

  revalidatePath("/subscriptions");
  revalidatePath("/clients");
}

async function renewSubscriptionAction(formData: FormData) {
  "use server";
  const { user, orgId, org } = await requireOrgSession();
  if (!MANAGE_ROLES.has(user.role)) redirect("/subscriptions");

  const id = String(formData.get("subscriptionId") ?? "");
  const amountPaid = Number(formData.get("amountPaid") ?? 0);
  const subscription = await prisma.clientSubscription.findFirst({
    where: { id, orgId },
    select: { id: true, clientId: true, cycle: true, renewalDate: true },
  });
  if (!subscription) return;

  const nextRenewalDate = renewalFrom(subscription.renewalDate, subscription.cycle);
  await prisma.$transaction(async (tx) => {
    await tx.clientSubscription.update({
      where: { id },
      data: {
        renewalDate: nextRenewalDate,
        amountPaid: Number.isFinite(amountPaid) ? amountPaid : 0,
        status: "ACTIVE",
        reminders: {
          create: reminderDates(nextRenewalDate).map((r) => ({
            type: r.type,
            remindAt: r.remindAt,
            emailEnabled: true,
            whatsappEnabled: true,
          })),
        },
      },
    });
    await tx.clientSubscriptionRenewal.create({
      data: {
        subscriptionId: id,
        previousRenewalDate: subscription.renewalDate,
        nextRenewalDate,
        amountPaid: Number.isFinite(amountPaid) ? amountPaid : 0,
        currency: org.baseCurrency || "UGX",
      },
    });
    await tx.client.update({
      where: { id: subscription.clientId },
      data: {
        isSLACovered: true,
        slaEndDate: nextRenewalDate,
        slaStatus: "ACTIVE",
        slaAmountPaid: Number.isFinite(amountPaid) ? amountPaid : 0,
      },
    });
  });

  revalidatePath("/subscriptions");
  revalidatePath("/clients");
}

export default async function ClientSubscriptionsPage() {
  const { user, orgId, org } = await requireOrgSession();
  const canManage = MANAGE_ROLES.has(user.role);

  const [clients, subscriptions] = await Promise.all([
    prisma.client.findMany({
      where: { orgId },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, phone: true, isSLACovered: true },
      take: 300,
    }),
    prisma.clientSubscription.findMany({
      where: { orgId },
      orderBy: { renewalDate: "asc" },
      include: {
        client: { select: { id: true, fullName: true, phone: true, email: true } },
        renewals: { orderBy: { renewedAt: "desc" }, take: 3 },
        reminders: { orderBy: { remindAt: "asc" }, take: 3 },
      },
      take: 100,
    }),
  ]);

  const today = new Date();
  const upcomingReminders = subscriptions
    .flatMap((sub) =>
      sub.reminders
        .filter((r) => r.visible && !r.emailSentAt && !r.whatsappSentAt)
        .map((r) => ({ subscription: sub, reminder: r })),
    )
    .filter((entry) => entry.reminder.remindAt >= new Date(today.getTime() - 24 * 60 * 60 * 1000))
    .slice(0, 8);

  return (
    <div className="space-y-5">
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Client Subscriptions</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">SLA Renewal Tracker</h1>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Monthly and annual client SLA plans, anniversary dates, renewal history, and reminder visibility.
            </p>
          </div>
          <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-bold text-[var(--ink-muted)]">
            {subscriptions.length} records
          </span>
        </div>
      </div>

      {canManage ? (
        <form action={createSubscriptionAction} className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">New Subscription</p>
          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_130px_150px_140px_130px]">
            <select name="clientId" required className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)]">
              <option value="">Select client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.fullName} - {client.phone}</option>
              ))}
            </select>
            <select name="cycle" defaultValue="ANNUAL" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)]">
              <option value="MONTHLY">Monthly</option>
              <option value="ANNUAL">Annual</option>
            </select>
            <input name="startDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)]" />
            <input name="amountPaid" type="number" min="0" step="0.01" placeholder={`Amount (${org.baseCurrency || "UGX"})`} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)]" />
            <select name="status" defaultValue="ACTIVE" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)]">
              <option value="ACTIVE">Active</option>
              <option value="PENDING">Pending</option>
              <option value="EXPIRED">Expired</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <textarea name="notes" rows={2} placeholder="Notes" className="mt-3 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)]" />
          <div className="mt-3 flex justify-end">
            <button type="submit" className="btn-premium rounded-lg px-4 py-2 text-sm font-bold">Save subscription</button>
          </div>
        </form>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {subscriptions.map((sub) => {
            const daysLeft = Math.ceil((sub.renewalDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
            return (
              <section key={sub.id} className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <Link href={`/clients/${sub.client.id}`} className="text-base font-bold text-[var(--ink)] hover:text-[var(--accent)] hover:underline">{sub.client.fullName}</Link>
                    <p className="text-xs text-[var(--ink-muted)]">{sub.client.phone}{sub.client.email ? ` · ${sub.client.email}` : ""}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs font-bold text-[var(--ink-muted)]">{sub.cycle}</span>
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-700">{sub.status}</span>
                      <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs font-bold text-[var(--ink-muted)]">{daysLeft} days</span>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Renewal</p>
                    <p className="font-semibold text-[var(--ink)]">{fmtDate(sub.renewalDate)}</p>
                    <p className="text-sm font-bold text-[var(--ink)]">{formatMoney(sub.amountPaid, sub.currency)}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {sub.reminders.map((reminder) => (
                    <div key={reminder.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
                      <p className="text-xs font-bold text-[var(--ink)]">{reminder.type.replaceAll("_", " ")}</p>
                      <p className="text-xs text-[var(--ink-muted)]">{fmtDate(reminder.remindAt)}</p>
                      <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                        Email {reminder.emailEnabled ? "on" : "off"} · WhatsApp {reminder.whatsappEnabled ? "on" : "off"}
                      </p>
                    </div>
                  ))}
                </div>

                {canManage ? (
                  <form action={renewSubscriptionAction} className="mt-4 flex flex-col gap-2 border-t border-[var(--line)] pt-3 sm:flex-row sm:items-center sm:justify-end">
                    <input type="hidden" name="subscriptionId" value={sub.id} />
                    <input name="amountPaid" type="number" min="0" step="0.01" placeholder="Renewal amount" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)]" />
                    <button type="submit" className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-bold text-[var(--ink)] transition hover:border-[var(--accent)]/50">
                      Record renewal
                    </button>
                  </form>
                ) : null}
              </section>
            );
          })}

          {subscriptions.length === 0 ? (
            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-8 text-center">
              <p className="text-sm font-bold text-[var(--ink)]">No client subscriptions yet</p>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">Create a monthly or annual SLA subscription to start renewal tracking.</p>
            </div>
          ) : null}
        </div>

        <aside className="panel-shadow h-fit rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Upcoming Reminders</p>
          <div className="mt-4 space-y-3">
            {upcomingReminders.map(({ subscription, reminder }) => (
              <div key={reminder.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
                <Link href={`/clients/${subscription.client.id}`} className="text-sm font-bold text-[var(--ink)] hover:text-[var(--accent)] hover:underline">{subscription.client.fullName}</Link>
                <p className="text-xs text-[var(--ink-muted)]">{reminder.type.replaceAll("_", " ")} · {fmtDate(reminder.remindAt)}</p>
                <p className="mt-1 text-[11px] text-[var(--ink-muted)]">Supports email and WhatsApp notification.</p>
              </div>
            ))}
            {upcomingReminders.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">No upcoming renewal reminders.</p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
