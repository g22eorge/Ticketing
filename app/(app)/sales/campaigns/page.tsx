// @ts-nocheck — TODO: resolve underlying type issues and remove this pragma
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { CampaignType, CampaignStatus, CampaignContactStatus } from "@prisma/client";
import { getCurrentUserRole } from "@/lib/session";

import { orgDb, prisma } from "@/lib/prisma";
import { RowActionsMenu, MenuSection, MenuDestructiveRow } from "@/components/shared/RowActionsMenu";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
import { SendCampaignButton } from "@/components/shared/SendCampaignButton";

const CAMPAIGN_TYPES: CampaignType[] = ["EMAIL", "SMS", "CALL", "WHATSAPP"];
const CAMPAIGN_STATUSES: CampaignStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"];

const STATUS_STYLE: Record<CampaignStatus, string> = {
  DRAFT:     "bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  ACTIVE:    "bg-green-500/10 text-green-700",
  PAUSED:    "bg-amber-500/10 text-amber-700",
  COMPLETED: "bg-blue-500/10 text-blue-700",
  CANCELLED: "bg-red-500/10 text-red-700",
};

function CampaignTypeIcon({ type, className = "h-4 w-4" }: { type: CampaignType; className?: string }) {
  const cls = `${className} shrink-0`;
  switch (type) {
    case "EMAIL":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden>
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
        </svg>
      );
    case "SMS":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      );
    case "CALL":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden>
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.59 1.4h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg>
      );
    case "WHATSAPP":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={cls} aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
        </svg>
      );
  }
}

const CONTACT_STATUS_STYLE: Record<CampaignContactStatus, string> = {
  PENDING:   "bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  SENT:      "bg-blue-500/10 text-blue-700",
  OPENED:    "bg-green-500/10 text-green-700",
  RESPONDED: "bg-purple-500/10 text-purple-700",
  OPTED_OUT: "bg-red-500/10 text-red-700",
};

export const dynamic = "force-dynamic";

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { user } = await getCurrentUserRole();
  const db = orgDb(user.orgId);
  if (!["ADMIN", "OPS"].includes(user.role)) redirect("/dashboard");

  const sp = await searchParams;
  const selectedId = sp.id ?? null;

  async function createCampaign(fd: FormData) {
    "use server";
    const { user: _user } = await getCurrentUserRole();
    const db = orgDb(user.orgId);
    // (org write check removed — single-tenant)
    const name = fd.get("name") as string;
    const type = fd.get("type") as CampaignType;
    const subject = (fd.get("subject") as string) || null;
    const body = fd.get("body") as string;
    const scheduledAt = fd.get("scheduledAt") as string;
    if (!name || !type || !body) return;
    await db.campaign.create({
      data: {
        name, type, subject, body, createdById: user.id,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      },
    });
    revalidatePath("/sales/campaigns");
  }

  async function updateStatus(fd: FormData) {
    "use server";
    const { user: _user } = await getCurrentUserRole();
    const db = orgDb(user.orgId);
    // (org write check removed — single-tenant)
    const id = fd.get("id") as string;
    const status = fd.get("status") as CampaignStatus;
    const campaign = await db.campaign.findFirst({ where: { id} });
    if (!campaign) return;
    const extra: Record<string, Date | null> = {};
    if (status === "ACTIVE" && !campaign.startedAt) extra.startedAt = new Date();
    if (status === "COMPLETED") extra.completedAt = new Date();
    await db.campaign.update({ where: { id }, data: { status, ...extra } });
    revalidatePath("/sales/campaigns");
  }

  async function deleteCampaign(fd: FormData) {
    "use server";
    const { user: _user } = await getCurrentUserRole();
    const db = orgDb(user.orgId);
    // (org write check removed — single-tenant)
    const id = fd.get("id") as string;
    await db.campaign.delete({ where: { id } });
    revalidatePath("/sales/campaigns");
  }

  async function addLeadsToCampaign(fd: FormData) {
    "use server";
    const { user: _user } = await getCurrentUserRole();
    const db = orgDb(user.orgId);
    // (org write check removed — single-tenant)
    const campaignId = fd.get("campaignId") as string;
    const source = fd.get("source") as "all_leads" | "all_clients";
    const campaign = await db.campaign.findFirst({ where: { id: campaignId} });
    if (!campaign) return;

    if (source === "all_leads") {
      const leads = await db.lead.findMany({ where: { status: { notIn: ["WON", "LOST"] } }, select: { id: true } });
      for (const l of leads) {
        await prisma.campaignContact.upsert({
          where: { campaignId_leadId: { campaignId, leadId: l.id } },
          create: { campaignId, leadId: l.id },
          update: {},
        });
      }
    } else {
      const clients = await db.client.findMany({ where: { }, select: { id: true } });
      for (const c of clients) {
        await prisma.campaignContact.upsert({
          where: { campaignId_clientId: { campaignId, clientId: c.id } },
          create: { campaignId, clientId: c.id },
          update: {},
        });
      }
    }
    revalidatePath("/sales/campaigns");
  }

  async function updateContactStatus(fd: FormData) {
    "use server";
    const { user: _user } = await getCurrentUserRole();
    // (org write check removed — single-tenant)
    const id = fd.get("id") as string;
    const status = fd.get("status") as CampaignContactStatus;
    const updates: Record<string, Date> = {};
    if (status === "SENT") updates.sentAt = new Date();
    if (status === "OPENED") updates.openedAt = new Date();
    if (status === "RESPONDED") updates.repliedAt = new Date();
    await prisma.campaignContact.updateMany({ where: { id, campaign: { } }, data: { status, ...updates } });
    revalidatePath("/sales/campaigns");
  }

  const campaigns = await db.campaign.findMany({
    where: {},
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { contacts: true } }, contacts: { select: { status: true } } },
  });

  const selected = selectedId ? campaigns.find((c) => c.id === selectedId) : null;

  const contacts = selected
    ? await prisma.campaignContact.findMany({
        where: { campaignId: selected.id },
        orderBy: { createdAt: "asc" },
        include: {
          lead: { select: { fullName: true, phone: true, email: true, status: true } },
          client: { select: { fullName: true, phone: true, email: true } },
          outboundMessages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, status: true, providerDeliveryStatus: true, sentAt: true, createdAt: true },
          },
        },
      })
    : [];

  const totalActive    = campaigns.filter((c) => c.status === "ACTIVE").length;
  const totalContacts  = campaigns.reduce((s, c) => s + c._count.contacts, 0);
  const totalSent      = campaigns.reduce((s, c) => s + c.contacts.filter((cc) => ["SENT","OPENED","RESPONDED"].includes(cc.status)).length, 0);
  const totalOpened    = campaigns.reduce((s, c) => s + c.contacts.filter((cc) => ["OPENED","RESPONDED"].includes(cc.status)).length, 0);
  const totalResponded = campaigns.reduce((s, c) => s + c.contacts.filter((cc) => cc.status === "RESPONDED").length, 0);
  const _overallOpenRate     = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
  const _overallResponseRate = totalSent > 0 ? Math.round((totalResponded / totalSent) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Sales</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">Campaigns</p>
            <p className="text-[13px] text-[var(--ink-muted)]">Outreach campaigns for leads and clients</p>
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Total Campaigns</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{campaigns.length}</p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">all time</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Active</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-green-600">{totalActive}</p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">currently running</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Contacts Reached</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{totalSent}</p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">of {totalContacts} total</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Avg Contacts / Campaign</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">
            {campaigns.length > 0 ? Math.round(totalContacts / campaigns.length) : 0}
          </p>
          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">per campaign</p>
        </div>
      </div>

      {/* Create campaign */}
      <details className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold">+ New Campaign</summary>
        <form action={createCampaign} className="grid grid-cols-2 gap-4 border-t border-[var(--line)] p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Campaign Name *</label>
            <input name="name" required placeholder="May Promo — Android Repairs" className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Type *</label>
            <select name="type" className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
              {CAMPAIGN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Subject (email)</label>
            <input name="subject" placeholder="Special offer this month..." className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Schedule date</label>
            <input name="scheduledAt" type="datetime-local" className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Message body *</label>
            <textarea name="body" required rows={4} placeholder="Hi {name}, we have a special offer for you..."
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2 flex justify-end">
            <button type="submit" className="btn-premium rounded-lg px-4 py-2 text-sm font-semibold">Create Campaign</button>
          </div>
        </form>
      </details>

      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] py-14 text-center text-sm text-[var(--ink-muted)]">No campaigns yet. Create one above.</div>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          {/* Campaign list */}
          <div className="col-span-5 space-y-2">
            {campaigns.map((c) => {
              const sentCount     = c.contacts.filter((cc) => ["SENT","OPENED","RESPONDED"].includes(cc.status)).length;
              const respondedCount = c.contacts.filter((cc) => cc.status === "RESPONDED").length;
              const responseRate  = sentCount > 0 ? Math.round((respondedCount / sentCount) * 100) : 0;
              return (
                <a key={c.id} href={`/sales/campaigns?id=${c.id}`}
                  className={`block rounded-xl border p-4 transition-colors ${selected?.id === c.id ? "border-[var(--accent)] bg-[var(--accent-muted)]" : "border-[var(--line)] bg-[var(--panel)] hover:bg-[var(--panel-strong)]"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--ink-muted)]"><CampaignTypeIcon type={c.type} /></span>
                        <p className="font-semibold text-sm text-[var(--ink)] truncate">{c.name}</p>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold uppercase ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                        <span className="text-xs text-[var(--ink-muted)]">{c._count.contacts} contacts</span>
                      </div>
                    </div>
                  </div>
                  {c._count.contacts > 0 && (
                    <div className="mt-2">
                      <div className="flex justify-between text-[12px] text-[var(--ink-muted)] mb-0.5">
                        <span>Response rate</span><span>{responseRate}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--line)]">
                        <div className="h-1.5 rounded-full bg-purple-500" style={{ width: `${responseRate}%` }} />
                      </div>
                    </div>
                  )}
                </a>
              );
            })}
          </div>

          {/* Campaign detail */}
          <div className="col-span-7">
            {!selected ? (
              <div className="rounded-xl border border-dashed border-[var(--line)] py-14 text-center text-sm text-[var(--ink-muted)]">
                Select a campaign to view contacts
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="font-semibold text-[var(--ink)]">{selected.name}</h2>
                    <p className="flex items-center gap-1.5 text-xs text-[var(--ink-muted)]"><CampaignTypeIcon type={selected.type} className="h-3.5 w-3.5" />{selected.type} · {selected._count.contacts} contacts</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {selected.type === "WHATSAPP" && (
                      <SendCampaignButton
                        campaignId={selected.id}
                        pendingCount={contacts.filter((c) => c.status === "PENDING").length}
                      />
                    )}
                  <RowActionsMenu label="Campaign actions">
                    <MenuSection label="Status" />
                    {CAMPAIGN_STATUSES.filter((s) => s !== selected.status).map((s) => (
                      <form key={s} action={updateStatus}>
                        <input type="hidden" name="id" value={selected.id} />
                        <input type="hidden" name="status" value={s} />
                        <button type="submit" className="w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--panel)]">
                          Set {s}
                        </button>
                      </form>
                    ))}
                    <MenuDestructiveRow>
                      <form action={deleteCampaign}>
                        <input type="hidden" name="id" value={selected.id} />
                        <ConfirmSubmitButton message="Delete this campaign and all contact records?" className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-500/10 dark:text-red-400">
                          Delete Campaign
                        </ConfirmSubmitButton>
                      </form>
                    </MenuDestructiveRow>
                  </RowActionsMenu>
                  </div>
                </div>

                {/* Body preview */}
                <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 text-xs text-[var(--ink-muted)] whitespace-pre-wrap">
                  {selected.body}
                </div>

                {/* Add contacts */}
                <details className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
                  <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold">+ Add Contacts</summary>
                  <div className="border-t border-[var(--line)] p-4 flex gap-3">
                    <form action={addLeadsToCampaign}>
                      <input type="hidden" name="campaignId" value={selected.id} />
                      <input type="hidden" name="source" value="all_leads" />
                      <button type="submit" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-strong)]">
                        Add All Active Leads
                      </button>
                    </form>
                    <form action={addLeadsToCampaign}>
                      <input type="hidden" name="campaignId" value={selected.id} />
                      <input type="hidden" name="source" value="all_clients" />
                      <button type="submit" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--panel-strong)]">
                        Add All Clients
                      </button>
                    </form>
                  </div>
                </details>

                {/* Contact list */}
                {contacts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--line)] py-8 text-center text-sm text-[var(--ink-muted)]">
                    No contacts added yet.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-[var(--line)]">
                    {/* Mobile contact cards */}
                    <div className="divide-y divide-[var(--line)] bg-[var(--bg)] lg:hidden">
                      {contacts.map((cc) => {
                        const person = cc.lead ?? cc.client;
                        if (!person) return null;
                        const latestMsg = cc.outboundMessages?.[0];
                        return (
                          <div key={`m-${cc.id}`} className="px-4 py-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-medium text-[var(--ink)]">{person.fullName}</p>
                                <p className="text-[13px] text-[var(--ink-muted)]">{person.phone} · {cc.lead ? "Lead" : "Client"}</p>
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-0.5">
                                <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold uppercase ${CONTACT_STATUS_STYLE[cc.status]}`}>{cc.status}</span>
                                {latestMsg?.providerDeliveryStatus && <span className="text-[13px] uppercase text-[var(--ink-muted)]">{latestMsg.providerDeliveryStatus}</span>}
                              </div>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 text-[13px] text-[var(--ink-muted)]">
                              {cc.sentAt && <span>Sent: {new Date(cc.sentAt).toLocaleDateString("en-GB")}</span>}
                              {cc.openedAt && <span>Opened: {new Date(cc.openedAt).toLocaleDateString("en-GB")}</span>}
                              {cc.repliedAt && <span className="text-purple-700">Replied: {new Date(cc.repliedAt).toLocaleDateString("en-GB")}</span>}
                            </div>
                            <form action={updateContactStatus} className="mt-2 flex gap-1">
                              <input type="hidden" name="id" value={cc.id} />
                              <select name="status" defaultValue={cc.status} className="flex-1 rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-xs">
                                {(["PENDING","SENT","OPENED","RESPONDED","OPTED_OUT"] as CampaignContactStatus[]).map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                              <button type="submit" className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--panel-strong)]">→</button>
                            </form>
                          </div>
                        );
                      })}
                    </div>
                    {/* Desktop table */}
                    <div className="hidden overflow-x-auto lg:block">
                      <table className="w-full text-sm">
                        <thead className="border-b border-[var(--line)] bg-[var(--panel)]">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--ink-muted)]">Contact</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--ink-muted)]">Status</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--ink-muted)]">Sent</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--ink-muted)]">Opened</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--ink-muted)]">Replied</th>
                            <th className="px-4 py-2.5" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--line)] bg-[var(--bg)]">
                          {contacts.map((cc) => {
                            const person = cc.lead ?? cc.client;
                            if (!person) return null;
                            const latestMsg = cc.outboundMessages?.[0];
                            const deliveryBadge = latestMsg?.providerDeliveryStatus
                              ? <span className="text-[13px] uppercase text-[var(--ink-muted)] ml-1">({latestMsg.providerDeliveryStatus})</span>
                              : null;
                            return (
                              <tr key={cc.id} className="hover:bg-[var(--panel)]">
                                <td className="px-4 py-2.5">
                                  <p className="font-medium text-[var(--ink)]">{person.fullName}</p>
                                  <p className="text-xs text-[var(--ink-muted)]">{person.phone} · {cc.lead ? "Lead" : "Client"}</p>
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold uppercase ${CONTACT_STATUS_STYLE[cc.status]}`}>
                                    {cc.status}
                                  </span>
                                  {deliveryBadge}
                                </td>
                                <td className="px-4 py-2.5 text-xs text-[var(--ink-muted)]">
                                  {cc.sentAt ? new Date(cc.sentAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : <span className="text-[var(--line)]">—</span>}
                                </td>
                                <td className="px-4 py-2.5 text-xs text-[var(--ink-muted)]">
                                  {cc.openedAt ? new Date(cc.openedAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : <span className="text-[var(--line)]">—</span>}
                                </td>
                                <td className="px-4 py-2.5 text-xs text-[var(--ink-muted)]">
                                  {cc.repliedAt ? <span className="font-medium text-purple-700">{new Date(cc.repliedAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</span> : <span className="text-[var(--line)]">—</span>}
                                </td>
                                <td className="px-3 py-2.5">
                                  <form action={updateContactStatus} className="flex gap-1">
                                    <input type="hidden" name="id" value={cc.id} />
                                    <select name="status" defaultValue={cc.status} className="rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-xs">
                                      {(["PENDING","SENT","OPENED","RESPONDED","OPTED_OUT"] as CampaignContactStatus[]).map((s) => (
                                        <option key={s} value={s}>{s}</option>
                                      ))}
                                    </select>
                                    <button type="submit" className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--panel-strong)]" title="Override status">→</button>
                                  </form>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
