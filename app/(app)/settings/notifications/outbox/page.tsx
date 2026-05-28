import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";

import { SearchToggle } from "@/components/shared/SearchToggle";

import { Prisma, OutboundMessageChannel, OutboundMessageStatus, OutboundMessageType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { deliverOutboundMessageForOrg, getOutboxRetryLimit, retryDueOutboundMessages } from "@/lib/notifications/whatsapp-outbox";

export const dynamic = "force-dynamic";

type SearchParams = {
  channel?: string;
  status?: string;
  type?: string;
  q?: string;
};

const CHANNELS = Object.values(OutboundMessageChannel);
const STATUSES = Object.values(OutboundMessageStatus);
const TYPES = Object.values(OutboundMessageType);

const STATUS_STYLES: Record<string, string> = {
  SENT:    "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  PENDING: "border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  FAILED:  "border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-400",
  DEAD:    "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
};

const CHANNEL_STYLES: Record<string, string> = {
  WHATSAPP: "border-[#25D366]/30 bg-[#25D366]/8 text-[#128C42]",
  EMAIL:    "border-blue-400/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
};

function shortId(id: string) {
  return id.slice(0, 8) + "…";
}

function shortWamid(wamid: string | null) {
  if (!wamid) return null;
  return wamid.slice(0, 20) + "…";
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return null;
  return new Intl.DateTimeFormat("en-UG", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(d));
}

export default async function OutboxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, orgId } = await requireOrgSession();
  if (!(user.role === "ADMIN" || user.role === "OPS")) {
    redirect("/dashboard");
  }

  const filters = await searchParams;
  const channel = CHANNELS.includes(filters.channel as OutboundMessageChannel)
    ? (filters.channel as OutboundMessageChannel)
    : null;
  const status = STATUSES.includes(filters.status as OutboundMessageStatus)
    ? (filters.status as OutboundMessageStatus)
    : null;
  const type = TYPES.includes(filters.type as OutboundMessageType)
    ? (filters.type as OutboundMessageType)
    : null;
  const q = typeof filters.q === "string" ? filters.q.trim() : "";

  const where: Prisma.OutboundMessageWhereInput = {
    orgId,
    ...(channel ? { channel } : {}),
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(q
      ? {
          OR: [
            { id: { contains: q } },
            { to: { contains: q } },
            { providerMessageId: { contains: q } },
            { lastError: { contains: q } },
          ],
        }
      : {}),
  };

  const [rows, counts] = await Promise.all([
    prisma.outboundMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        channel: true,
        type: true,
        status: true,
        to: true,
        attemptCount: true,
        lastAttemptAt: true,
        nextAttemptAt: true,
        sentAt: true,
        createdAt: true,
        provider: true,
        providerMessageId: true,
        providerDeliveryStatus: true,
        providerDeliveryAt: true,
        providerDeliveryErrorCode: true,
        providerDeliveryError: true,
        lastErrorCode: true,
        lastError: true,
        metaTemplateName: true,
      },
    }),
    prisma.outboundMessage.groupBy({
      by: ["status"],
      _count: { status: true },
      where: { orgId },
    }),
  ]);

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count.status]));

  async function retryNowAction() {
    "use server";
    const { user, orgId } = await requireOrgSession();
    if (!(user.role === "ADMIN" || user.role === "OPS")) redirect("/dashboard");
    await retryDueOutboundMessages(getOutboxRetryLimit(25), { orgId });
    revalidatePath("/settings/notifications/outbox");
  }

  async function retryOneAction(formData: FormData) {
    "use server";
    const { user, orgId } = await requireOrgSession();
    if (!(user.role === "ADMIN" || user.role === "OPS")) redirect("/dashboard");
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deliverOutboundMessageForOrg(id, orgId);
    revalidatePath("/settings/notifications/outbox");
  }

  async function markDeadAction(formData: FormData) {
    "use server";
    const { user, orgId } = await requireOrgSession();
    if (!(user.role === "ADMIN" || user.role === "OPS")) redirect("/dashboard");
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await prisma.outboundMessage.updateMany({
      where: { id, orgId },
      data: { status: "DEAD", nextAttemptAt: new Date(0), lockedAt: null },
    });
    revalidatePath("/settings/notifications/outbox");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/settings/notifications"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Notifications
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link href="/settings/notifications/templates" className="btn-premium-secondary rounded-lg px-3 py-1.5 text-sm">
            Templates
          </Link>
          {user.role === "ADMIN" ? (
            <Link href="/settings/notifications/whatsapp" className="btn-premium-secondary rounded-lg px-3 py-1.5 text-sm">
              WhatsApp
            </Link>
          ) : null}
        </div>
      </div>

      {/* Summary + filter bar */}
      <div className="panel-shadow flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        {/* Status chips */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {[
            { label: "All", key: "" },
            { label: "Sent", key: "SENT" },
            { label: "Pending", key: "PENDING" },
            { label: "Failed", key: "FAILED" },
            { label: "Dead", key: "DEAD" },
          ].map(({ label, key }) => {
            const active = (status ?? "") === key;
            const href = `/settings/notifications/outbox?${new URLSearchParams({ ...(channel ? { channel } : {}), ...(q ? { q } : {}), ...(key ? { status: key } : {}) }).toString()}`;
            return (
              <Link
                key={key || "all"}
                href={href}
                className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                  active ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/30"
                }`}
              >
                {label}{key ? ` · ${byStatus[key] ?? 0}` : ""}
              </Link>
            );
          })}
        </div>
        {/* Right actions */}
        <div className="flex shrink-0 items-center gap-2">
          <SearchToggle
            basePath="/settings/notifications/outbox"
            defaultValue={q}
            placeholder="Search recipient / error / ID"
            preserve={{ channel: channel ?? undefined, status: status ?? undefined }}
          />
          <form action={retryNowAction}>
            <button type="submit" className="btn-premium rounded-lg px-3 py-1.5 text-[13px]">Run Retry</button>
          </form>
        </div>
      </div>

      {/* Table */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-[var(--ink-muted)]">
            No messages match these filters.
          </div>
        ) : (
          <>
            {/* Mobile outbox cards */}
            <div className="divide-y divide-[var(--line)] lg:hidden">
              {rows.map((r) => (
                <div key={`m-${r.id}`} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[r.status] ?? STATUS_STYLES.DEAD}`}>{r.status}</span>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${CHANNEL_STYLES[r.channel] ?? ""}`}>{r.channel}</span>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {r.status !== "SENT" && (
                        <form action={retryOneAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="rounded border border-[var(--line)] px-2 py-0.5 text-[11px] font-medium hover:bg-[var(--panel-strong)]">Retry</button>
                        </form>
                      )}
                      {r.status !== "DEAD" && r.status !== "SENT" && (
                        <form action={markDeadAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="rounded border border-[var(--line)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-muted)] hover:border-red-200 hover:bg-red-50 hover:text-red-700">Discard</button>
                        </form>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 font-mono text-sm font-medium text-[var(--ink)]">{r.to}</p>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-[var(--ink-muted)]">
                    <span>{r.type.replaceAll("_", " ").toLowerCase()}</span>
                    {r.sentAt && <span>{fmtDate(r.sentAt)}</span>}
                    {r.attemptCount > 0 && <span>{r.attemptCount} attempt{r.attemptCount !== 1 ? "s" : ""}</span>}
                  </div>
                  {r.providerDeliveryStatus && (
                    <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${r.providerDeliveryStatus === "delivered" || r.providerDeliveryStatus === "read" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"}`}>{r.providerDeliveryStatus}</span>
                  )}
                  {r.lastError && (
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-red-600">{r.lastErrorCode ? `[${r.lastErrorCode}] ` : ""}{r.lastError}</p>
                  )}
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--panel-strong)]/60">
                    {["Status", "Channel / Type", "Recipient", "Sent / Scheduled", "Delivery", "Error", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {rows.map((r) => (
                    <tr key={r.id} className="group align-top transition-colors hover:bg-[var(--panel-strong)]/40">

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[r.status] ?? STATUS_STYLES.DEAD}`}>
                        {r.status}
                      </span>
                    </td>

                    {/* Channel + Type */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${CHANNEL_STYLES[r.channel] ?? ""}`}>
                        {r.channel}
                      </span>
                      <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                        {r.type.replaceAll("_", " ").toLowerCase()}
                      </p>
                      {r.metaTemplateName ? (
                        <p className="mt-0.5 font-mono text-[10px] text-[var(--accent)]/70">
                          tpl: {r.metaTemplateName}
                        </p>
                      ) : null}
                    </td>

                    {/* Recipient */}
                    <td className="px-4 py-3">
                      <p className="font-mono text-sm font-medium text-[var(--ink)]">{r.to}</p>
                      <p className="mt-0.5 text-[10px] text-[var(--ink-muted)]">{shortId(r.id)}</p>
                    </td>

                    {/* Sent / Scheduled */}
                    <td className="px-4 py-3">
                      {r.sentAt ? (
                        <p className="text-xs font-medium text-[var(--ink)]">{fmtDate(r.sentAt)}</p>
                      ) : r.nextAttemptAt && r.nextAttemptAt > new Date() ? (
                        <p className="text-[11px] text-amber-600">Due {fmtDate(r.nextAttemptAt)}</p>
                      ) : (
                        <p className="text-[11px] text-[var(--ink-muted)]">—</p>
                      )}
                      <p className="mt-0.5 text-[10px] text-[var(--ink-muted)]">
                        {r.attemptCount} attempt{r.attemptCount !== 1 ? "s" : ""}
                      </p>
                    </td>

                    {/* Delivery */}
                    <td className="px-4 py-3">
                      {r.providerDeliveryStatus ? (
                        <>
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${r.providerDeliveryStatus === "delivered" || r.providerDeliveryStatus === "read" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"}`}>
                            {r.providerDeliveryStatus}
                          </span>
                          {r.providerDeliveryAt ? (
                            <p className="mt-0.5 text-[10px] text-[var(--ink-muted)]">{fmtDate(r.providerDeliveryAt)}</p>
                          ) : null}
                        </>
                      ) : r.providerMessageId ? (
                        <p className="font-mono text-[10px] text-[var(--ink-muted)]" title={r.providerMessageId}>
                          {shortWamid(r.providerMessageId)}
                        </p>
                      ) : (
                        <span className="text-[11px] text-[var(--ink-muted)]">—</span>
                      )}
                    </td>

                    {/* Error */}
                    <td className="px-4 py-3 max-w-[200px]">
                      {r.lastError ? (
                        <>
                          {r.lastErrorCode ? (
                            <span className="font-mono text-[10px] font-semibold text-red-600">{r.lastErrorCode}</span>
                          ) : null}
                          <p className="mt-0.5 line-clamp-3 text-[11px] text-[var(--ink-muted)]" title={r.lastError}>
                            {r.lastError}
                          </p>
                        </>
                      ) : (
                        <span className="text-[11px] text-[var(--ink-muted)]">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1.5">
                        {r.status !== "SENT" ? (
                          <form action={retryOneAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <button type="submit" className="btn-premium-secondary w-full rounded-lg px-3 py-1.5 text-xs">
                              Retry
                            </button>
                          </form>
                        ) : null}
                        {r.status !== "DEAD" && r.status !== "SENT" ? (
                          <form action={markDeadAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <button type="submit" className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700">
                              Discard
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
