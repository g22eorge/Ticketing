import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { JobStatus, OutboundMessageChannel, OutboundMessageType, Prisma } from "@prisma/client";

import { requireOrgSession } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { extractTemplateVariables } from "@/lib/notifications/templates";
import { UI_JOB_STATUSES, normalizeJobStatus, type JobStatus as LegacyJobStatus } from "@/lib/job-status";
import { revalidatePath } from "next/cache";

function supportsCommsTemplates() {
  return Boolean(Prisma.dmmf.datamodel.models.find((m) => m.name === "CommunicationTemplate"));
}

function safeJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
}

const templateSchema = z.object({
  id: z.string().optional(),
  key: z.string().min(2).max(80),
  channel: z.nativeEnum(OutboundMessageChannel),
  label: z.string().min(2).max(120),
  subject: z.string().max(160).optional(),
  body: z.string().min(8).max(4000),
  metaTemplateName: z.string().max(120).optional(),
  metaLanguageCode: z.string().max(20).optional(),
  isActive: z.enum(["on"]).optional(),
});

const policySchema = z.object({
  status: z.nativeEnum(JobStatus),
  dashboardEnabled: z.enum(["on"]).optional(),
  whatsappEnabled: z.enum(["on"]).optional(),
  emailEnabled: z.enum(["on"]).optional(),
  templateKey: z.string().max(80).optional(),
  nudge1Hours: z.string().optional(),
  nudge2Hours: z.string().optional(),
});

export default async function NotificationTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { user, orgId } = await requireOrgSession();
  if (!["ADMIN", "OPS"].includes(user.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const saved = params.saved ? String(params.saved) : "";
  const error = params.error ? String(params.error) : "";

  async function bulkReplaceBrandName() {
    "use server";

    const { user: actor, orgId: replaceOrgId } = await requireOrgSession();
    if (actor.role !== "ADMIN") redirect("/dashboard");

    const branding = await prisma.documentBrandingSettings
      .findFirst({ where: { orgId: replaceOrgId }, select: { companyName: true } })
      .catch(() => null);
    const companyName = (branding?.companyName ?? "").trim();
    if (!companyName) {
      redirect("/settings/notifications/templates?error=Set+company+name+first+in+Settings+%E2%86%92+Branding");
    }

    const rows = await prisma.communicationTemplate.findMany({
      where: {
        orgId: replaceOrgId,
        OR: [
          { body: { contains: "Eagle Info Solutions" } },
          { body: { contains: "Your Repair Team" } },
          { subject: { contains: "Eagle Info Solutions" } },
          { subject: { contains: "Your Repair Team" } },
        ],
      },
      select: { id: true, body: true, subject: true },
    });

    let updated = 0;
    for (const t of rows) {
      const nextBody = t.body
        .replaceAll("Eagle Info Solutions", companyName)
        .replaceAll("Your Repair Team", companyName);
      const nextSubject = t.subject
        ? t.subject
            .replaceAll("Eagle Info Solutions", companyName)
            .replaceAll("Your Repair Team", companyName)
        : null;
      if (nextBody === t.body && nextSubject === t.subject) continue;
      await prisma.communicationTemplate.update({
        where: { id: t.id },
        data: { body: nextBody, subject: nextSubject },
      });
      updated += 1;
    }

    revalidatePath("/settings/notifications/templates");
    redirect(`/settings/notifications/templates?saved=${encodeURIComponent(`brand+replaced+(${updated})`)}`);
  }

  if (!supportsCommsTemplates()) {
    return (
      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="text-[13px] font-bold text-[var(--ink)]">Templates</p>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Templates are not available in this runtime (older database/client). Deploy the latest schema to enable them.
        </p>
      </section>
    );
  }

  // Top nav
  const topNav = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link
        href="/settings/notifications"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Notifications
      </Link>
      <div className="flex flex-wrap gap-2">
        {user.role === "ADMIN" ? (
          <form action={bulkReplaceBrandName}>
            <button
              className="btn-premium-secondary rounded-lg px-3 py-1.5 text-sm"
              type="submit"
              title='Replace "Eagle Info Solutions"/"Your Repair Team" with your company name'
            >
              Replace Brand Name
            </button>
          </form>
        ) : null}
        <Link href="/settings/notifications/outbox" className="btn-premium-secondary rounded-lg px-3 py-1.5 text-sm">
          Outbox
        </Link>
        {user.role === "ADMIN" ? (
          <Link href="/settings/notifications/whatsapp" className="btn-premium-secondary rounded-lg px-3 py-1.5 text-sm">
            WhatsApp
          </Link>
        ) : null}
      </div>
    </div>
  );

  // No default template seeding. Orgs define their own templates.

  async function createTemplate(formData: FormData) {
    "use server";
    const { user: actor, orgId: createOrgId } = await requireOrgSession();
    if (!["ADMIN", "OPS"].includes(actor.role)) redirect("/dashboard");

    const parsed = templateSchema.safeParse({
      key: String(formData.get("key") ?? "").trim(),
      channel: String(formData.get("channel") ?? "WHATSAPP"),
      label: String(formData.get("label") ?? "").trim(),
      subject: String(formData.get("subject") ?? "").trim(),
      body: String(formData.get("body") ?? "").trim(),
      metaTemplateName: String(formData.get("metaTemplateName") ?? "").trim() || undefined,
      metaLanguageCode: String(formData.get("metaLanguageCode") ?? "").trim() || undefined,
      isActive: formData.get("isActive") ? "on" : undefined,
    });

    if (!parsed.success) {
      redirect("/settings/notifications/templates?error=Invalid+template+input");
    }

    const vars = extractTemplateVariables(`${parsed.data.subject ?? ""}\n${parsed.data.body}`);

    try {
      await prisma.communicationTemplate.create({
        data: {
          orgId: createOrgId,
          key: parsed.data.key,
          channel: parsed.data.channel,
          label: parsed.data.label,
          subject: parsed.data.subject ? parsed.data.subject : null,
          body: parsed.data.body,
          variables: vars.length ? JSON.stringify(vars) : null,
          metaTemplateName: parsed.data.metaTemplateName ?? null,
          metaLanguageCode: parsed.data.metaTemplateName ? (parsed.data.metaLanguageCode || "en") : null,
          isActive: Boolean(parsed.data.isActive),
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Unique constraint") || msg.includes("P2002")) {
        redirect("/settings/notifications/templates?error=Template+key+already+exists+for+that+channel");
      }
      redirect("/settings/notifications/templates?error=Failed+to+create+template");
    }

    revalidatePath("/settings/notifications/templates");
    redirect("/settings/notifications/templates?saved=template");
  }

  async function updateTemplate(formData: FormData) {
    "use server";
    const { user: actor, orgId: updateOrgId } = await requireOrgSession();
    if (!["ADMIN", "OPS"].includes(actor.role)) redirect("/dashboard");

    const parsed = templateSchema.safeParse({
      id: String(formData.get("id") ?? "").trim(),
      key: String(formData.get("key") ?? "").trim(),
      channel: String(formData.get("channel") ?? "WHATSAPP"),
      label: String(formData.get("label") ?? "").trim(),
      subject: String(formData.get("subject") ?? "").trim(),
      body: String(formData.get("body") ?? "").trim(),
      metaTemplateName: String(formData.get("metaTemplateName") ?? "").trim() || undefined,
      metaLanguageCode: String(formData.get("metaLanguageCode") ?? "").trim() || undefined,
      isActive: formData.get("isActive") ? "on" : undefined,
    });

    if (!parsed.success || !parsed.data.id) {
      redirect("/settings/notifications/templates?error=Invalid+template+update");
    }

    const vars = extractTemplateVariables(`${parsed.data.subject ?? ""}\n${parsed.data.body}`);
    const metaName = parsed.data.metaTemplateName ?? null;
    const metaLang = metaName ? (parsed.data.metaLanguageCode || "en") : null;

    // Verify template belongs to this org
    const existing = await prisma.communicationTemplate.findFirst({
      where: { id: parsed.data.id, orgId: updateOrgId },
      select: { id: true },
    }).catch(() => null);
    if (!existing) {
      redirect("/settings/notifications/templates?error=Template+not+found");
    }

    // Try full update first; if meta columns are missing in DB, fall back to updating without them.
    let saved = false;
    try {
      await prisma.communicationTemplate.update({
        where: { id: parsed.data.id },
        data: {
          key: parsed.data.key,
          channel: parsed.data.channel,
          label: parsed.data.label,
          subject: parsed.data.subject ? parsed.data.subject : null,
          body: parsed.data.body,
          variables: vars.length ? JSON.stringify(vars) : null,
          metaTemplateName: metaName,
          metaLanguageCode: metaLang,
          isActive: Boolean(parsed.data.isActive),
        },
      });
      saved = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isMissingColumn = msg.includes("no such column") || msg.includes("unknown column") || msg.includes("has no column");
      if (isMissingColumn) {
        // Schema not migrated yet — update without meta fields, flag that migration is needed.
        try {
          await prisma.communicationTemplate.update({
            where: { id: parsed.data.id },
            data: {
              key: parsed.data.key,
              channel: parsed.data.channel,
              label: parsed.data.label,
              subject: parsed.data.subject ? parsed.data.subject : null,
              body: parsed.data.body,
              variables: vars.length ? JSON.stringify(vars) : null,
              isActive: Boolean(parsed.data.isActive),
            },
          });
        } catch {
          redirect("/settings/notifications/templates?error=Failed+to+update+template");
        }
        revalidatePath("/settings/notifications/templates");
        redirect("/settings/notifications/templates?error=Template+saved+but+meta+fields+need+DB+migration+-+click+Apply+Migration");
      }
      if (msg.includes("Unique constraint") || msg.includes("P2002")) {
        redirect("/settings/notifications/templates?error=Template+key+already+exists+for+that+channel");
      }
      redirect(`/settings/notifications/templates?error=${encodeURIComponent("Failed to update: " + msg.slice(0, 120))}`);
    }

    if (saved) {
      revalidatePath("/settings/notifications/templates");
      redirect("/settings/notifications/templates?saved=template");
    }
  }

  async function applyMetaMigration() {
    "use server";
    const { user: actor } = await requireOrgSession();
    if (actor.role !== "ADMIN") redirect("/dashboard");

    const statements = [
      `ALTER TABLE "CommunicationTemplate" ADD COLUMN "metaTemplateName" TEXT`,
      `ALTER TABLE "CommunicationTemplate" ADD COLUMN "metaLanguageCode" TEXT`,
      `ALTER TABLE "OutboundMessage" ADD COLUMN "metaTemplateName" TEXT`,
      `ALTER TABLE "OutboundMessage" ADD COLUMN "metaTemplateLanguage" TEXT`,
      `ALTER TABLE "OutboundMessage" ADD COLUMN "metaTemplateVars" TEXT`,
    ];

    let applied = 0;
    const errors: string[] = [];
    for (const sql of statements) {
      try {
        await prisma.$executeRawUnsafe(sql);
        applied++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // "duplicate column" means it already exists — that's fine.
        if (!msg.includes("duplicate column") && !msg.includes("already exists")) {
          errors.push(msg.slice(0, 80));
        }
      }
    }

    revalidatePath("/settings/notifications/templates");
    if (errors.length > 0) {
      redirect(`/settings/notifications/templates?error=${encodeURIComponent("Migration partial: " + errors.join("; "))}`);
    }
    redirect(`/settings/notifications/templates?saved=Migration+applied+(${applied}+columns+added)`);
  }

  async function deleteTemplate(formData: FormData) {
    "use server";
    const { user: actor, orgId: deleteOrgId } = await requireOrgSession();
    if (actor.role !== "ADMIN") redirect("/dashboard");
    const id = String(formData.get("id") ?? "").trim();
    if (!id) redirect("/settings/notifications/templates?error=Missing+template+id");

    await prisma.communicationTemplate.deleteMany({ where: { id, orgId: deleteOrgId } }).catch(() => null);
    revalidatePath("/settings/notifications/templates");
    redirect("/settings/notifications/templates?saved=deleted");
  }

  async function deduplicateTemplates() {
    "use server";
    const { user: actor, orgId: dedupeOrgId } = await requireOrgSession();
    if (actor.role !== "ADMIN") redirect("/dashboard");

    const all = await prisma.communicationTemplate.findMany({
      where: { orgId: dedupeOrgId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, key: true, channel: true },
    });

    const seen = new Set<string>();
    const toDelete: string[] = [];
    for (const t of all) {
      const k = `${t.key}::${t.channel}`;
      if (seen.has(k)) {
        toDelete.push(t.id);
      } else {
        seen.add(k);
      }
    }

    if (toDelete.length > 0) {
      await prisma.communicationTemplate.deleteMany({ where: { id: { in: toDelete }, orgId: dedupeOrgId } });
    }

    revalidatePath("/settings/notifications/templates");
    redirect(`/settings/notifications/templates?saved=Removed+${toDelete.length}+duplicate${toDelete.length !== 1 ? "s" : ""}`);
  }

  async function upsertPolicy(formData: FormData) {
    "use server";
    const { user: actor, orgId: policyOrgId } = await requireOrgSession();
    if (!["ADMIN", "OPS"].includes(actor.role)) redirect("/dashboard");

    const parsed = policySchema.safeParse({
      status: String(formData.get("status") ?? "").trim(),
      dashboardEnabled: formData.get("dashboardEnabled") ? "on" : undefined,
      whatsappEnabled: formData.get("whatsappEnabled") ? "on" : undefined,
      emailEnabled: formData.get("emailEnabled") ? "on" : undefined,
      templateKey: String(formData.get("templateKey") ?? "").trim(),
      nudge1Hours: String(formData.get("nudge1Hours") ?? "").trim(),
      nudge2Hours: String(formData.get("nudge2Hours") ?? "").trim(),
    });

    if (!parsed.success) {
      redirect("/settings/notifications/templates?error=Invalid+policy+input");
    }

    const toIntOrNull = (value: string) => {
      const n = Number(value);
      if (!value) return null;
      return Number.isFinite(n) ? Math.max(0, Math.min(720, Math.floor(n))) : null;
    };

    const normalizedStatus = normalizeJobStatus(parsed.data.status as unknown as LegacyJobStatus) as unknown as JobStatus;

    await prisma.communicationPolicy.upsert({
      where: { status_orgId: { status: normalizedStatus, orgId: policyOrgId } },
      create: {
        orgId: policyOrgId,
        status: normalizedStatus,
        dashboardEnabled: Boolean(parsed.data.dashboardEnabled),
        whatsappEnabled: Boolean(parsed.data.whatsappEnabled),
        emailEnabled: Boolean(parsed.data.emailEnabled),
        templateKey: parsed.data.templateKey ? parsed.data.templateKey : null,
        nudge1Hours: toIntOrNull(parsed.data.nudge1Hours ?? ""),
        nudge2Hours: toIntOrNull(parsed.data.nudge2Hours ?? ""),
      },
      update: {
        dashboardEnabled: Boolean(parsed.data.dashboardEnabled),
        whatsappEnabled: Boolean(parsed.data.whatsappEnabled),
        emailEnabled: Boolean(parsed.data.emailEnabled),
        templateKey: parsed.data.templateKey ? parsed.data.templateKey : null,
        nudge1Hours: toIntOrNull(parsed.data.nudge1Hours ?? ""),
        nudge2Hours: toIntOrNull(parsed.data.nudge2Hours ?? ""),
      },
    });

    revalidatePath("/settings/notifications/templates");
    redirect("/settings/notifications/templates?saved=policy");
  }

  let templates: Array<{
    id: string;
    key: string;
    channel: OutboundMessageChannel;
    label: string;
    subject: string | null;
    body: string;
    variables: string | null;
    metaTemplateName: string | null;
    metaLanguageCode: string | null;
    isActive: boolean;
    updatedAt: Date;
  }> = [];

  let policies: Array<{
    status: JobStatus;
    dashboardEnabled: boolean;
    whatsappEnabled: boolean;
    emailEnabled: boolean;
    templateKey: string | null;
    nudge1Hours: number | null;
    nudge2Hours: number | null;
  }> = [];

  try {
    templates = await prisma.communicationTemplate.findMany({
      where: { orgId },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        key: true,
        channel: true,
        label: true,
        subject: true,
        body: true,
        variables: true,
        metaTemplateName: true,
        metaLanguageCode: true,
        isActive: true,
        updatedAt: true,
      },
    });
  } catch {
    // Production DB may not have the new meta columns yet — fall back without them.
    try {
      const rows = await prisma.communicationTemplate.findMany({
        where: { orgId },
        orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          key: true,
          channel: true,
          label: true,
          subject: true,
          body: true,
          variables: true,
          isActive: true,
          updatedAt: true,
        },
      });
      templates = rows.map((r) => ({ ...r, metaTemplateName: null, metaLanguageCode: null }));
    } catch {
      templates = [];
    }
  }

  try {
    policies = await prisma.communicationPolicy.findMany({
      where: { orgId },
      select: {
        status: true,
        dashboardEnabled: true,
        whatsappEnabled: true,
        emailEnabled: true,
        templateKey: true,
        nudge1Hours: true,
        nudge2Hours: true,
      },
    });
  } catch {
    policies = [];
  }

  const policyByStatus = new Map<string, (typeof policies)[number]>(
    policies.map((p) => [normalizeJobStatus(p.status as unknown as LegacyJobStatus), p])
  );
  const knownKeys = [...new Set(Object.values(OutboundMessageType).map(String))].sort();
  const templateKeys = [...new Set(templates.map((t) => t.key))].sort();

  return (
    <div className="space-y-4">
      {topNav}
      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="text-[13px] font-bold text-[var(--ink)]">Templates</p>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Use <code>{"{customerName}"}</code> and <code>{"{jobNumber}"}</code>.
        </p>
        {saved ? <p className="mt-3 text-sm text-[var(--accent)]">Saved: {saved}</p> : null}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {user.role === "ADMIN" ? (
            <form action={deduplicateTemplates}>
              <button type="submit" className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-500/20 dark:text-red-400">
                Remove Duplicates
              </button>
            </form>
          ) : null}
          {user.role === "ADMIN" ? (
            <form action={applyMetaMigration}>
              <button type="submit" className="rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-500/20 dark:text-blue-400">
                Apply Migration
              </button>
            </form>
          ) : null}
        </div>
        {templates.length === 0 ? (
          <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
            No templates found. Click <strong>Create Default Templates</strong> to populate all 8 WhatsApp and email templates.
          </div>
        ) : null}
      </section>

      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Create Template</p>
        <form action={createTemplate} className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <div className="xl:col-span-2">
            <input
              name="key"
              required
              placeholder="Template key (e.g. JOB_CREATED)"
              list="template-keys"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
            />
            <datalist id="template-keys">
              {knownKeys.map((k) => <option key={k} value={k} />)}
            </datalist>
          </div>
          <select name="channel" defaultValue="WHATSAPP" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14">
            <option value="WHATSAPP">WhatsApp</option>
            <option value="EMAIL">Email</option>
          </select>
          <input
            name="label"
            required
            placeholder="Label"
            className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
          />
          <input
            name="subject"
            placeholder="Email subject (optional)"
            className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14 xl:col-span-2"
          />
          <label className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink-muted)]">
            <input type="checkbox" name="isActive" defaultChecked className="h-4 w-4 rounded border border-[var(--line)]" />
            Active
          </label>
          <textarea
            name="body"
            required
            placeholder="Message body. Use placeholders like {customerName}"
            className="min-h-[120px] rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14 md:col-span-2 xl:col-span-6"
          />
          <input
            name="metaTemplateName"
            placeholder="Meta template name (e.g. job_created)"
            className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14 md:col-span-1 xl:col-span-3"
          />
          <input
            name="metaLanguageCode"
            placeholder="Language (e.g. en)"
            defaultValue="en"
            className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14 md:col-span-1 xl:col-span-2"
          />
          <button type="submit" className="btn-premium rounded-lg px-3 py-2 text-sm text-white md:col-span-2 xl:col-span-1">Create</button>
        </form>
      </section>

      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Templates</p>
        {templates.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--ink-muted)]">No templates yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {templates.map((t) => {
              const vars = safeJsonArray(t.variables);
              return (
                <details key={t.id} className="group/details rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] p-3" open={false}>
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[13px] font-semibold ${t.isActive ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-[var(--line)] bg-[var(--panel)] text-[var(--ink-muted)]"}`}>
                        {t.isActive ? "Active" : "Inactive"}
                      </span>
                      <span className="font-mono text-[13px] text-[var(--ink)]">{t.key}</span>
                      <span className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-2 py-0.5 text-[13px] text-[var(--ink-muted)]">
                        {t.channel === "WHATSAPP" ? "WhatsApp" : "Email"}
                      </span>
                      <span className="text-sm font-semibold text-[var(--ink)]">{t.label}</span>
                      {t.metaTemplateName ? (
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[12px] font-mono text-emerald-700 dark:text-emerald-400">
                          meta: {t.metaTemplateName}
                        </span>
                      ) : (
                        <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[12px] font-semibold text-amber-700 dark:text-amber-400">
                          no meta name
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-2 text-[13px] text-[var(--ink-muted)]">
                        <span>Updated {t.updatedAt.toLocaleString()}</span>
                        <svg className="h-4 w-4 transition-transform group-open/details:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                      </span>
                    </div>
                  </summary>

                  {vars.length > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[12px] font-bold uppercase tracking-[0.13em] text-[var(--ink-muted)]">Variables:</span>
                      {vars.map((v, i) => (
                        <span key={v} className="flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--panel)] px-2 py-0.5 text-[13px] font-mono">
                          <span className="text-[var(--accent)] font-bold">{`{{${i + 1}}}`}</span>
                          <span className="text-[var(--ink-muted)]">=</span>
                          <span className="text-[var(--ink)]">{v}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[13px] text-[var(--ink-muted)]">No variables detected.</p>
                  )}

                  <form action={updateTemplate} className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
                    <input type="hidden" name="id" value={t.id} />
                    <div className="xl:col-span-2">
                      <input
                        name="key"
                        required
                        defaultValue={t.key}
                        className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
                      />
                    </div>
                    <select name="channel" defaultValue={t.channel} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14">
                      <option value="WHATSAPP">WhatsApp</option>
                      <option value="EMAIL">Email</option>
                    </select>
                    <input
                      name="label"
                      required
                      defaultValue={t.label}
                      className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
                    />
                    <input
                      name="subject"
                      defaultValue={t.subject ?? ""}
                      placeholder="Email subject"
                      className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14 xl:col-span-2"
                    />
                    <label className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink-muted)]">
                      <input type="checkbox" name="isActive" defaultChecked={t.isActive} className="h-4 w-4 rounded border border-[var(--line)]" />
                      Active
                    </label>
                    <textarea
                      name="body"
                      required
                      defaultValue={t.body}
                      className="min-h-[120px] rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14 md:col-span-2 xl:col-span-6"
                    />
                    {t.channel === "WHATSAPP" ? (
                      <div className="rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-3 md:col-span-2 xl:col-span-6">
                        <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]/80">
                          Meta Approved Template (optional)
                        </p>
                        <p className="mb-2 text-[13px] text-[var(--ink-muted)]">
                          Once your template is approved in Meta Business Manager, enter its name here.
                          Variables in the <code className="font-mono">variables</code> array above map positionally to{" "}
                          <code className="font-mono">{"{{1}}"}</code>,{" "}
                          <code className="font-mono">{"{{2}}"}</code>… in the approved template body.
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input
                            name="metaTemplateName"
                            defaultValue={t.metaTemplateName ?? ""}
                            placeholder="Template name (e.g. repair_status_update)"
                            className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
                          />
                          <input
                            name="metaLanguageCode"
                            defaultValue={t.metaLanguageCode ?? "en"}
                            placeholder="Language code (e.g. en)"
                            className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
                          />
                        </div>
                        {t.metaTemplateName ? (
                          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-emerald-600">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            Using template: <span className="font-mono">{t.metaTemplateName}</span> · lang: {t.metaLanguageCode ?? "en"}
                          </p>
                        ) : (
                          <p className="mt-1.5 text-[13px] text-[var(--ink-muted)]">
                            Not set — messages will send as free-form text (only delivers within 24-hour customer window).
                          </p>
                        )}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2 xl:col-span-6">
                      <button type="submit" className="btn-premium rounded-lg px-3 py-2 text-sm text-white">Save</button>
                    </div>
                  </form>

                  {user.role === "ADMIN" ? (
                    <form action={deleteTemplate} className="mt-2">
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">Delete Template</button>
                    </form>
                  ) : null}
                </details>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Status Policy</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">
          Controls which channels are enabled per job status and which template key is used. Nudges are in hours.
        </p>

        <div className="mt-3 space-y-2">
          {UI_JOB_STATUSES.map((status) => {
            const p = policyByStatus.get(status) ?? {
              status: status as unknown as JobStatus,
              dashboardEnabled: true,
              whatsappEnabled: false,
              emailEnabled: false,
              templateKey: null,
              nudge1Hours: null,
              nudge2Hours: null,
            };

            return (
              <form key={status} action={upsertPolicy} className="grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3 md:grid-cols-[1fr_auto_auto_auto_1fr_110px_110px_auto]">
                <input type="hidden" name="status" value={status} />
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">{status.replaceAll("_", " ")}</p>
                  <p className="text-[13px] text-[var(--ink-muted)]">Template key applies to both channels.</p>
                </div>
                <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
                  <input type="checkbox" name="dashboardEnabled" defaultChecked={p.dashboardEnabled} className="h-4 w-4 rounded border border-[var(--line)]" />
                  Dashboard
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
                  <input type="checkbox" name="whatsappEnabled" defaultChecked={p.whatsappEnabled} className="h-4 w-4 rounded border border-[var(--line)]" />
                  WhatsApp
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
                  <input type="checkbox" name="emailEnabled" defaultChecked={p.emailEnabled} className="h-4 w-4 rounded border border-[var(--line)]" />
                  Email
                </label>
                <select name="templateKey" defaultValue={p.templateKey ?? ""} className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50">
                  <option value="">(no template)</option>
                  {templateKeys.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
                <input
                  name="nudge1Hours"
                  defaultValue={p.nudge1Hours ?? ""}
                  placeholder="Nudge 1"
                  inputMode="numeric"
                  className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
                />
                <input
                  name="nudge2Hours"
                  defaultValue={p.nudge2Hours ?? ""}
                  placeholder="Nudge 2"
                  inputMode="numeric"
                  className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
                />
                <button type="submit" className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">Save</button>
              </form>
            );
          })}
        </div>
      </section>
    </div>
  );
}
