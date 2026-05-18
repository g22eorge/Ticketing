import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { CampaignType, CampaignStatus, CampaignContactStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { assertOrgCanMutate } from "@/lib/org-write";
import { RowActionsMenu, MenuSection, MenuDestructiveRow } from "@/components/shared/RowActionsMenu";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";

const CAMPAIGN_TYPES: CampaignType[] = ["EMAIL", "SMS", "CALL", "WHATSAPP"];
const CAMPAIGN_STATUSES: CampaignStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"];

const STATUS_STYLE: Record<CampaignStatus, string> = {
  DRAFT:     "bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  ACTIVE:    "bg-green-500/10 text-green-700",
  PAUSED:    "bg-amber-500/10 text-amber-700",
  COMPLETED: "bg-blue-500/10 text-blue-700",
  CANCELLED: "bg-red-500/10 text-red-700",
};

const TYPE_ICON: Record<CampaignType, string> = {
  EMAIL: "✉", SMS: "💬", CALL: "📞", WHATSAPP: "📱",
};

const CONTACT_STATUS_STYLE: Record<CampaignContactStatus, string> = {
  PENDING:   "bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  SENT:      "bg-blue-500/10 text-blue-700",
  OPENED:    "bg-green-500/10 text-green-700",
  RESPONDED: "bg-purple-500/10 text-purple-700",
  OPTED_OUT: "bg-red-500/10 text-red-700",
};

export const dynamic = "force-dynamic";

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { user, orgId } = await requireOrgSession();
  if (!["ADMIN", "MANAGER", "OPS", "SALES", "SALES_MANAGER"].includes(user.role)) redirect("/dashboard");

  const sp = await searchParams;
  const view = (sp.view ?? "list") as "list" | "contacts";
  const selectedId = sp.id ?? null;

  async function createCampaign(fd: FormData) {
    "use server";
    const { user: u, orgId: oid, org } = await requireOrgSession();
    assertOrgCanMutate({ access: org.access, userRole: u.role, userAccessMode: u.accessMode, kind: "GENERAL" });
    const name = fd.get("name") as string;
    const type = fd.get("type") as CampaignType;
    const subject = (fd.get("subject") as string) || null;
    const body = fd.get("body") as string;
    const scheduledAt = fd.get("scheduledAt") as string;
    if (!name || !type || !body) return;
    await prisma.campaign.create({
      data: {
        orgId: oid, name, type, subject, body, createdById: u.id,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      },
    });
    revalidatePath("/sales/campaigns");
  }

  async function updateStatus(fd: FormData) {
    "use server";
    const { user: u, orgId: oid, org } = await requireOrgSession();
    assertOrgCanMutate({ access: org.access, userRole: u.role, userAccessMode: u.accessMode, kind: "GENERAL" });
    const id = fd.get("id") as string;
    const status = fd.get("status") as CampaignStatus;
    const campaign = await prisma.campaign.findFirst({ where: { id, orgId: oid } });
    if (!campaign) return;
    const extra: Record<string, Date | null> = {};
    if (status === "ACTIVE" && !campaign.startedAt) extra.startedAt = new Date();
    if (status === "COMPLETED") extra.completedAt = new Date();
    await prisma.campaign.update({ where: { id }, data: { status, ...extra } });
    revalidatePath("/sales/campaigns");
  }

  async function deleteCampaign(fd: FormData) {
    "use server";
    const { user: u, orgId: oid, org } = await requireOrgSession();
    assertOrgCanMutate({ access: org.access, userRole: u.role, userAccessMode: u.accessMode, kind: "GENERAL" });
    const id = fd.get("id") as string;
    await prisma.campaign.delete({ where: { id } });
    revalidatePath("/sales/campaigns");
  }

  async function addLeadsToCampaign(fd: FormData) {
    "use server";
    const { user: u, orgId: oid, org } = await requireOrgSession();
    assertOrgCanMutate({ access: org.access, userRole: u.role, userAccessMode: u.accessMode, kind: "GENERAL" });
    const campaignId = fd.get("campaignId") as string;
    const source = fd.get("source") as "all_leads" | "all_clients";
    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId: oid } });
    if (!campaign) return;

    if (source === "all_leads") {
      const leads = await prisma.lead.findMany({ where: { orgId: oid, status: { notIn: ["WON", "LOST"] } }, select: { id: true } });
      for (const l of leads) {
        await prisma.campaignContact.upsert({
          where: { campaignId_leadId: { campaignId, leadId: l.id } },
          create: { campaignId, orgId: oid, leadId: l.id },
          update: {},
        });
      }
    } else {
      const clients = await prisma.client.findMany({ where: { orgId: oid }, select: { id: true } });
      for (const c of clients) {
        await prisma.campaignContact.upsert({
          where: { campaignId_clientId: { campaignId, clientId: c.id } },
          create: { campaignId, orgId: oid, clientId: c.id },
          update: {},
        });
      }
    }
    revalidatePath("/sales/campaigns");
  }

  async function updateContactStatus(fd: FormData) {
    "use server";
    const { user: u, orgId: oid, org } = await requireOrgSession();
    assertOrgCanMutate({ access: org.access, userRole: u.role, userAccessMode: u.accessMode, kind: "GENERAL" });
    const id = fd.get("id") as string;
    const status = fd.get("status") as CampaignContactStatus;
    const updates: Record<string, Date> = {};
    if (status === "SENT") updates.sentAt = new Date();
    if (status === "OPENED") updates.openedAt = new Date();
    if (status === "RESPONDED") updates.repliedAt = new Date();
    await prisma.campaignContact.updateMany({ where: { id, campaign: { orgId: oid } }, data: { status, ...updates } });
    revalidatePath("/sales/campaigns");
  }

  const campaigns = await prisma.campaign.findMany({
    where: { orgId },
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
        },
      })
    : [];

  const totalActive    = campaigns.filter((c) => c.status === "ACTIVE").length;
  const totalContacts  = campaigns.reduce((s, c) => s + c._count.contacts, 0);
  const totalResponded = campaigns.reduce((s, c) => s + c.contacts.filter((cc) => cc.status === "RESPONDED").length, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--ink)]">Campaigns</h1>
        <p className="mt-0.5 text-sm text-[var(--ink-muted)]">Manage outreach campaigns for leads and clients</p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Total</p>
          <p className="mt-1 text-2xl font-bold">{campaigns.length}</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Active</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{totalActive}</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Contacts</p>
          <p className="mt-1 text-2xl font-bold">{totalContacts}</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Responded</p>
          <p className="mt-1 text-2xl font-bold text-purple-600">{totalResponded}</p>
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
              {CAMPAIGN_TYPES.map((t) => <option key={t} value={t}>{TYPE_ICON[t]} {t}</option>)}
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
            <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black">Create Campaign</button>
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
                        <span className="text-base">{TYPE_ICON[c.type]}</span>
                        <p className="font-semibold text-sm text-[var(--ink)] truncate">{c.name}</p>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                        <span className="text-xs text-[var(--ink-muted)]">{c._count.contacts} contacts</span>
                      </div>
                    </div>
                  </div>
                  {c._count.contacts > 0 && (
                    <div className="mt-2">
                      <div className="flex justify-between text-[10px] text-[var(--ink-muted)] mb-0.5">
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
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-semibold text-[var(--ink)]">{selected.name}</h2>
                    <p className="text-xs text-[var(--ink-muted)]">{TYPE_ICON[selected.type]} {selected.type} · {selected._count.contacts} contacts</p>
                  </div>
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
                        <ConfirmSubmitButton message="Delete this campaign and all contact records?" className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50">
                          Delete Campaign
                        </ConfirmSubmitButton>
                      </form>
                    </MenuDestructiveRow>
                  </RowActionsMenu>
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
                  <div className="rounded-xl border border-[var(--line)] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="border-b border-[var(--line)] bg-[var(--panel)]">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--ink-muted)]">Contact</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--ink-muted)]">Type</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--ink-muted)]">Status</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--line)] bg-[var(--bg)]">
                        {contacts.map((cc) => {
                          const person = cc.lead ?? cc.client;
                          if (!person) return null;
                          return (
                            <tr key={cc.id} className="hover:bg-[var(--panel)]">
                              <td className="px-4 py-2.5">
                                <p className="font-medium text-[var(--ink)]">{person.fullName}</p>
                                <p className="text-xs text-[var(--ink-muted)]">{person.phone}</p>
                              </td>
                              <td className="px-4 py-2.5 text-xs text-[var(--ink-muted)]">
                                {cc.lead ? "Lead" : "Client"}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${CONTACT_STATUS_STYLE[cc.status]}`}>
                                  {cc.status}
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                <form action={updateContactStatus} className="flex gap-1">
                                  <input type="hidden" name="id" value={cc.id} />
                                  <select name="status" defaultValue={cc.status} className="rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-xs">
                                    {(["PENDING","SENT","OPENED","RESPONDED","OPTED_OUT"] as CampaignContactStatus[]).map((s) => (
                                      <option key={s} value={s}>{s}</option>
                                    ))}
                                  </select>
                                  <button type="submit" className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--panel-strong)]">→</button>
                                </form>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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
