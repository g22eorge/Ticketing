import Link from "next/link";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { JobStatusBadge, statusStripClass } from "@/components/jobs/JobStatusBadge";
import { UI_JOB_STATUSES, JobStatus, normalizeJobStatus } from "@/lib/job-status";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sanitizeOptionalText, sanitizeText } from "@/lib/sanitize";
import { requireOrgSession } from "@/lib/org-context";
import { formatEATDate, formatEATDateTime } from "@/lib/date-eat";

const updateClientSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().optional(),
  organization: z.string().optional(),
  notes: z.string().optional(),
});

const addNoteSchema = z.object({
  body: z.string().min(2),
});

const statusOptionLabel: Record<ReturnType<typeof normalizeJobStatus>, string> = {
  RECEIVED: "Received",
  DIAGNOSING: "Diagnosing",
  REFERRED: "Referred",
  AWAITING_APPROVAL: "Awaiting Approval",
  IN_REPAIR: "In Repair",
  READY_FOR_PICKUP: "Ready for Pickup",
  COMPLETED: "Completed",
  CLOSED: "Closed",
};

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { id } = await params;
  const filters = await searchParams;
  const { user, orgId } = await requireOrgSession();
  const canEdit = user.role === "ADMIN" || user.role === "OPS";

  if (!can.viewClientInfo(user)) {
    redirect("/dashboard");
  }

  let notesFeatureAvailable = true;
  let clientData: Awaited<ReturnType<typeof prisma.client.findUnique>>;

  try {
    clientData = await prisma.client.findUnique({
      where: { id, orgId },
      include: {
        jobs: {
          where: {
            ...(filters.status ? { status: filters.status as JobStatus } : {}),
            ...(filters.q
              ? {
                  OR: [
                    { jobNumber: { contains: filters.q } },
                    { brand: { contains: filters.q } },
                    { model: { contains: filters.q } },
                  ],
                }
              : {}),
          },
          orderBy: { receivedAt: "desc" },
        },
        notesEntries: {
          include: { author: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  } catch {
    notesFeatureAvailable = false;
    clientData = await prisma.client.findUnique({
      where: { id, orgId },
      include: {
        jobs: {
          where: {
            ...(filters.status ? { status: filters.status as JobStatus } : {}),
            ...(filters.q
              ? {
                  OR: [
                    { jobNumber: { contains: filters.q } },
                    { brand: { contains: filters.q } },
                    { model: { contains: filters.q } },
                  ],
                }
              : {}),
          },
          orderBy: { receivedAt: "desc" },
        },
      },
    });
  }

  if (!clientData) {
    notFound();
  }

  type ClientDetail = Prisma.ClientGetPayload<{
    include: {
      jobs: true;
      notesEntries: { include: { author: { select: { name: true } } } };
    };
  }>;

  const client = {
    ...(clientData as ClientDetail),
    notesEntries: notesFeatureAvailable ? (clientData as ClientDetail).notesEntries : [],
  } as ClientDetail;

  async function updateClient(formData: FormData) {
    "use server";
    const { user: currentUser, orgId: updateOrgId } = await requireOrgSession();
    if (!(currentUser.role === "ADMIN" || currentUser.role === "OPS")) {
      return;
    }

    const parsed = updateClientSchema.safeParse({
      fullName: String(formData.get("fullName") ?? ""),
      email: String(formData.get("email") ?? ""),
      organization: String(formData.get("organization") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    });
    if (!parsed.success) return;

    await prisma.client.update({
      where: { id, orgId: updateOrgId },
      data: {
        fullName: sanitizeText(parsed.data.fullName),
        email: sanitizeOptionalText(parsed.data.email),
        organization: sanitizeOptionalText(parsed.data.organization),
        notes: sanitizeOptionalText(parsed.data.notes),
      },
    });

    revalidatePath(`/clients/${id}`);
  }

  async function addClientNote(formData: FormData) {
    "use server";
    const { session, user: currentUser } = await requireOrgSession();
    if (!(currentUser.role === "ADMIN" || currentUser.role === "OPS")) {
      return;
    }

    const parsed = addNoteSchema.safeParse({
      body: String(formData.get("body") ?? ""),
    });
    if (!parsed.success) return;

    if (!notesFeatureAvailable) return;

    await prisma.clientNote.create({
      data: {
        clientId: id,
        authorId: session.user.id,
        body: sanitizeText(parsed.data.body),
      },
    });
    revalidatePath(`/clients/${id}`);
  }

  const totalJobs = client.jobs.length;
  const DONE_STATUSES = ["COMPLETED", "CLOSED", "DELIVERED"];
  const openJobs = client.jobs.filter((job: ClientDetail["jobs"][number]) => !DONE_STATUSES.includes(job.status)).length;
  const completedJobs = client.jobs.filter((job: ClientDetail["jobs"][number]) => DONE_STATUSES.includes(job.status)).length;
  const completionRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;
  const latestActivity = client.jobs[0]?.updatedAt ?? client.updatedAt;
  const hasHistoryFilters = Boolean(filters.q || filters.status);
  const clientBrief = hasHistoryFilters
    ? "Job history below is filtered. Use profile details for contact updates, then clear filters to review the full client timeline."
    : "Use this page as the single client workspace for profile updates, repair history review, and communication continuity.";
  const controlClass =
    "w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/20 disabled:opacity-70";

  return (
    <div className="space-y-5">
      <div>
        <Link href="/clients" className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ink-muted)] transition hover:text-[var(--ink)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          All clients
        </Link>
      </div>
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Client Brief</p>
          <p className="mt-1 text-sm text-[var(--ink)] [overflow-wrap:anywhere]">{clientBrief}</p>
        </div>
      </div>

      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">Client Detail</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{client.fullName}</h1>
            <p className="text-sm text-[var(--ink-muted)]">
              {client.phone} {client.email ? `• ${client.email}` : ""}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-xs text-[var(--ink-muted)]">
            Last activity: {formatEATDateTime(latestActivity)}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
            <p className="text-xs text-[var(--ink-muted)]">Total jobs</p>
            <p className="text-xl font-semibold">{totalJobs}</p>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
            <p className="text-xs text-[var(--ink-muted)]">Open jobs</p>
            <p className="text-xl font-semibold text-[var(--accent)]">{openJobs}</p>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
            <p className="text-xs text-[var(--ink-muted)]">Completed</p>
            <p className="text-xl font-semibold text-[var(--accent)]">{completedJobs}</p>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
            <p className="text-xs text-[var(--ink-muted)]">Completion rate</p>
            <p className="text-xl font-semibold">{completionRate.toFixed(0)}%</p>
          </div>
        </div>
      </div>

      <form action={updateClient} className="panel-shadow space-y-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">Client Profile</p>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Update basic contact details and internal notes.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-[var(--ink-muted)]">Full name</span>
            <input
              disabled={!canEdit}
              name="fullName"
              defaultValue={client.fullName}
              className={controlClass}
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-[var(--ink-muted)]">Email</span>
            <input
              disabled={!canEdit}
              name="email"
              defaultValue={client.email ?? ""}
              className={controlClass}
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-medium text-[var(--ink-muted)]">Organization</span>
            <input
              disabled={!canEdit}
              name="organization"
              defaultValue={client.organization ?? ""}
              className={controlClass}
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-medium text-[var(--ink-muted)]">Internal notes</span>
            <textarea
              disabled={!canEdit}
              name="notes"
              defaultValue={client.notes ?? ""}
              className="min-h-24 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/20 disabled:opacity-70"
            />
          </label>
        </div>

        {canEdit ? <button className="btn-premium rounded-lg px-3 py-2 text-white">Save Client</button> : null}
      </form>

      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Job History</h2>
          <form className="flex flex-wrap gap-2">
            <input name="q" defaultValue={filters.q} placeholder="Search job # / brand / model" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <select name="status" defaultValue={filters.status} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14">
              <option value="">All statuses</option>
              {UI_JOB_STATUSES.map((status) => (
                <option key={status} value={status}>{statusOptionLabel[status]}</option>
              ))}
            </select>
            <button className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">Filter</button>
          </form>
        </div>

        {client.jobs.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">No jobs match this filter.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            {client.jobs.map((job: ClientDetail["jobs"][number]) => {
              const strip = statusStripClass(job.status);
              const device = [job.brand, job.model].filter(v => v && v !== "Unknown").join(" ") || "Device";
              return (
                <div key={job.id} className="relative border-b border-[var(--line)] bg-[var(--panel)] last:border-b-0 transition-colors hover:bg-[var(--panel-strong)]/40">
                  <span className={`absolute inset-y-0 left-0 w-[5px] ${strip}`} aria-hidden="true" />
                  <Link href={`/jobs/${job.id}?returnTo=/clients/${client.id}&returnLabel=Client`} className="absolute inset-0 z-0" aria-label={`Open ${job.jobNumber}`} />
                  <div className="pointer-events-none relative z-10 px-4 py-3 pl-6">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="mono text-[10px] font-medium tracking-wide text-[var(--ink-muted)]/50">{job.jobNumber}</span>
                      <svg viewBox="0 0 6 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-1.5 shrink-0 text-[var(--ink-muted)]/25" aria-hidden="true"><path d="M1 1l4 4-4 4"/></svg>
                    </div>
                    <p className="text-[15px] font-bold leading-snug tracking-tight text-[var(--ink)]">{device}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <JobStatusBadge status={job.status} />
                      <span className="text-[11px] text-[var(--ink-muted)]">· {formatEATDate(job.receivedAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <h2 className="font-semibold">Client Notes</h2>
        <form action={addClientNote} className="mt-3 flex flex-col gap-2">
          <textarea name="body" required placeholder="Add note" className="min-h-24 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/20" />
          <button disabled={!notesFeatureAvailable} className="btn-premium self-start rounded-lg px-3 py-2 text-sm text-white disabled:opacity-60">Add Note</button>
        </form>

        {!notesFeatureAvailable ? (
          <p className="mt-2 text-xs text-[var(--ink-muted)]">Notes timeline needs latest DB migration. Run `bunx prisma migrate dev` and restart dev server.</p>
        ) : null}

        <div className="mt-4 space-y-2">
          {client.notesEntries.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">No timeline notes yet.</p>
          ) : (
            client.notesEntries.map((note: ClientDetail["notesEntries"][number]) => (
              <div key={note.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
                <p className="text-sm">{note.body}</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  {note.author.name} • {formatEATDateTime(note.createdAt)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
