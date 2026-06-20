import Link from "next/link";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sanitizeOptionalText, sanitizeText } from "@/lib/sanitize";
import { requireOrgSession } from "@/lib/org-context";
import { formatEATDate, formatEATDateTime } from "@/lib/date-eat";

const updateClientSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().optional(),
  organization: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

const addNoteSchema = z.object({
  body: z.string().min(2),
});

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
        notesEntries: {
          include: { author: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  } catch {
    notesFeatureAvailable = false;
    clientData = await prisma.client.findUnique({
      where: { id, orgId },
    });
  }

  if (!clientData) {
    notFound();
  }

  type ClientDetail = Prisma.ClientGetPayload<{
    include: {
      notesEntries: { include: { author: { select: { id: true, name: true } } } };
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
      address: String(formData.get("address") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    });
    if (!parsed.success) return;

    await prisma.client.update({
      where: { id, orgId: updateOrgId },
      data: {
        fullName: sanitizeText(parsed.data.fullName),
        email: sanitizeOptionalText(parsed.data.email),
        organization: sanitizeOptionalText(parsed.data.organization),
        address: sanitizeOptionalText(parsed.data.address),
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

  const latestActivity = client.updatedAt;
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
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Client Brief</p>
          <p className="mt-1 text-sm text-[var(--ink)] [overflow-wrap:anywhere]">Use this page for profile updates and communication continuity.</p>
        </div>
      </div>

      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold text-[var(--ink)]">{client.fullName}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--ink-muted)]">
              <a href={`tel:${client.phone}`} className="transition hover:text-[var(--accent)]">{client.phone}</a>
              {client.email ? <><span className="opacity-40">·</span><span>{client.email}</span></> : null}
              {client.organization ? <><span className="opacity-40">·</span><span className="truncate">{client.organization}</span></> : null}
              {client.address ? <><span className="opacity-40">·</span><span className="truncate">{client.address}</span></> : null}
            </div>
            <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]/60">Joined {formatEATDate(client.createdAt)} · last activity {formatEATDateTime(latestActivity)}</p>
          </div>
          {canEdit ? (
            <Link href="/jobs/new" className="btn-premium shrink-0 rounded-lg px-3 py-1.5 text-[12px]">+ New Repair</Link>
          ) : null}
        </div>
      </div>

      <form action={updateClient} className="panel-shadow space-y-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">Client Profile</p>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Update contact details, address, and internal notes.</p>
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
            <span className="text-xs font-medium text-[var(--ink-muted)]">Address / location</span>
            <input
              disabled={!canEdit}
              name="address"
              defaultValue={client.address ?? ""}
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

        {canEdit ? <button type="submit" className="btn-premium rounded-lg px-3 py-2 text-white">Save Client</button> : null}
      </form>

      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] px-4 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Client Notes</p>
          <p className="text-[13px] text-[var(--ink-muted)]">Internal notes visible to your team only</p>
        </div>
        <form action={addClientNote} className="flex flex-col gap-2 p-4">
          <textarea name="body" required placeholder="Add note" className="min-h-24 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/20" />
          <button type="submit" disabled={!notesFeatureAvailable} className="btn-premium self-start rounded-lg px-3 py-2 text-sm text-white disabled:opacity-60">Add Note</button>
        </form>

        <div className="space-y-2 px-4 pb-4">
          {!notesFeatureAvailable ? (
            <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">Notes timeline needs the latest DB migration — run <code className="font-mono">bunx prisma migrate dev</code> and restart.</p>
          ) : null}

          {client.notesEntries.length === 0 ? (
            <p className="text-[12px] text-[var(--ink-muted)]">No notes yet.</p>
          ) : (
            client.notesEntries.map((note: ClientDetail["notesEntries"][number]) => (
              <div key={note.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
                <p className="text-sm leading-relaxed">{note.body}</p>
                <p className="mt-1.5 text-[12px] text-[var(--ink-muted)]">
                  <Link href={`/users/${note.author.id}`} className="hover:text-[var(--accent)] hover:underline">{note.author.name}</Link> · {formatEATDateTime(note.createdAt)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
