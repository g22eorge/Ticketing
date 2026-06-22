import { access, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { defaultBranding, getDocumentBrandingSettings, saveDocumentBrandingSettings } from "@/lib/document-branding";
import { sanitizeOptionalText, sanitizeText } from "@/lib/sanitize";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { planLabel, resolveTemplateKey, splitTemplatesByPlan, templatesForAll, type DocKind } from "@/lib/pdf/templates";
import type { OrgPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type SearchParams = {
  saved?: string;
  error?: string;
  profileSaved?: string;
};

const logoFiles = [
  { name: "eagle-info-logo.png", type: "image/png" },
  { name: "eagle-info-logo.jpg", type: "image/jpeg" },
  { name: "eagle-info-logo.jpeg", type: "image/jpeg" },
  { name: "eagle-info-logo.webp", type: "image/webp" },
];

const DOC_KIND_LABELS: Record<DocKind, string> = {
  INVOICE:   "Invoice",
  QUOTATION: "Quotation",
  JOB_CARD:  "Job Card",
  RECEIPT:   "Receipt",
};

const DOC_KIND_TEMPLATE_FIELD: Record<DocKind, string> = {
  INVOICE:   "invoiceTemplateKey",
  QUOTATION: "quotationTemplateKey",
  JOB_CARD:  "jobCardTemplateKey",
  RECEIPT:   "receiptTemplateKey",
};

const brandingSchema = z.object({
  companyName: z.string().min(2).max(120),
  companyTagline: z.string().max(120).optional(),
  companyAddressLine1: z.string().min(3).max(180),
  companyAddressLine2: z.string().min(3).max(180),
  companyContacts: z.string().min(3).max(180),
  companyEmail: z.string().email().optional(),
  companyWebsite: z.string().max(200).optional(),
  documentTitle: z.string().min(2).max(60),
  quotePrefix: z.string().min(2).max(12),
  quoteFormat: z.string().min(8).max(80),
  quoteValidityDays: z.coerce.number().int().min(1).max(365),
  sequencePadLength: z.coerce.number().int().min(2).max(8),
  vatDefaultApplicable: z.enum(["true", "false"]),
  vatRatePercent: z.coerce.number().min(0).max(100),
  vatLabel: z.string().min(2).max(30),
  termsText: z.string().min(10).max(2000),
  footerText: z.string().min(6).max(180),
  signatureCompanyLabel: z.string().min(2).max(120),
  signatureClientLabel: z.string().min(2).max(120),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#000000"),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#666666"),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#333333"),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#FFFFFF"),
  surfaceColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#F5F5F5"),
  borderColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#E5E5E5"),

  invoiceTemplateKey: z.string().optional(),
  quotationTemplateKey: z.string().optional(),
  jobCardTemplateKey: z.string().optional(),
  receiptTemplateKey: z.string().optional(),
});

function normalizeOptionalEmail(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : undefined;
}

function normalizeOptionalWebsite(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  return text.replace(/^https?:\/\//, "");
}

function renderQuotePreview(prefix: string, format: string, padLength: number) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const sampleSeq = String(2).padStart(Math.max(1, padLength), "0");
  return format
    .replaceAll("{PREFIX}", prefix || "DOC")
    .replaceAll("{M}", String(month))
    .replaceAll("{MM}", String(month).padStart(2, "0"))
    .replaceAll("{YYYY}", String(year))
    .replaceAll("{SEQ}", sampleSeq);
}

async function resolveLogoPreview(companyLogoUrl?: string) {
  if (companyLogoUrl) {
    const filePath = path.join(process.cwd(), "public", companyLogoUrl.replace(/^\//, "").split("?")[0]);
    try {
      const info = await stat(filePath);
      return `${companyLogoUrl.split("?")[0]}?v=${info.mtimeMs}`;
    } catch {
      // fall through
    }
  }
  for (const file of logoFiles) {
    const filePath = path.join(process.cwd(), "public", file.name);
    try {
      await access(filePath);
      const info = await stat(filePath);
      return `/${file.name}?v=${info.mtimeMs}`;
    } catch {
      // continue
    }
  }
  return null;
}

function extensionFromMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return null;
}

export default async function BrandingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  let sessionUser: Awaited<ReturnType<typeof requireOrgSession>>["user"] | null = null;
  let orgId: string | null = null;
  try {
    const { user, orgId: sid } = await requireOrgSession();
    sessionUser = user;
    orgId = sid;
  } catch {
    redirect("/login");
  }
  if (!sessionUser || !orgId || !can.manageUsers(sessionUser)) {
    redirect("/dashboard");
  }

  const params = await searchParams;

  // ── Everything below is wrapped in a top-level try/catch ──
  // Any crash here falls through to the safe fallback UI.
  let fallbackError: string | null = null;
  let settings = defaultBranding;
  let preview: string | null = null;
  let plan: OrgPlan = "STARTER";
  let invoiceTemplates: { allowed: import("@/lib/pdf/templates").TemplateDef[]; locked: import("@/lib/pdf/templates").TemplateDef[] } = { allowed: [], locked: [] };
  let quotationTemplates: typeof invoiceTemplates = { allowed: [], locked: [] };
  let jobCardTemplates: typeof invoiceTemplates = { allowed: [], locked: [] };
  let receiptTemplates: typeof invoiceTemplates = { allowed: [], locked: [] };
  let selectedInvoiceKey = "invoice_classic";
  let selectedQuoteKey = "quote_classic";
  let selectedJobCardKey = "job_card_classic";
  let selectedReceiptKey = "receipt_classic";
  let quotePreview = "DOC 06/2026/01";
  let settingsLoaded = false;
  let _opErrors: string[] = [];

  try {
    try {
      settings = await getDocumentBrandingSettings(orgId);
    } catch (err) {
      const msg = `branding: ${err instanceof Error ? err.message : String(err)}`;
      _opErrors.push(msg);
      console.error("[branding/page] getDocumentBrandingSettings failed:", err);
      settings = defaultBranding;
    }
    try {
      preview = await resolveLogoPreview(settings.companyLogoUrl);
    } catch {
      preview = null;
    }
    try {
      const orgRow = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } });
      plan = orgRow?.plan ?? "STARTER";
    } catch (err) {
      _opErrors.push(`org: ${err instanceof Error ? err.message : String(err)}`);
      plan = "STARTER";
    }

    try {
      invoiceTemplates = splitTemplatesByPlan("INVOICE", plan);
      quotationTemplates = splitTemplatesByPlan("QUOTATION", plan);
      jobCardTemplates = splitTemplatesByPlan("JOB_CARD", plan);
      receiptTemplates = splitTemplatesByPlan("RECEIPT", plan);
      selectedInvoiceKey = resolveTemplateKey({ kind: "INVOICE", requestedKey: (settings as unknown as { invoiceTemplateKey?: string | null }).invoiceTemplateKey, plan });
      selectedQuoteKey = resolveTemplateKey({ kind: "QUOTATION", requestedKey: (settings as unknown as { quotationTemplateKey?: string | null }).quotationTemplateKey, plan });
      selectedJobCardKey = resolveTemplateKey({ kind: "JOB_CARD", requestedKey: (settings as unknown as { jobCardTemplateKey?: string | null }).jobCardTemplateKey, plan });
      selectedReceiptKey = resolveTemplateKey({ kind: "RECEIPT", requestedKey: (settings as unknown as { receiptTemplateKey?: string | null }).receiptTemplateKey, plan });
    } catch (err) {
      _opErrors.push(`templates: ${err instanceof Error ? err.message : String(err)}`);
      invoiceTemplates = { allowed: templatesForAll("INVOICE"), locked: [] };
      quotationTemplates = { allowed: templatesForAll("QUOTATION"), locked: [] };
      jobCardTemplates = { allowed: templatesForAll("JOB_CARD"), locked: [] };
      receiptTemplates = { allowed: templatesForAll("RECEIPT"), locked: [] };
      selectedInvoiceKey = "invoice_classic";
      selectedQuoteKey = "quote_classic";
      selectedJobCardKey = "job_card_classic";
      selectedReceiptKey = "receipt_classic";
    }

    quotePreview = renderQuotePreview(settings.quotePrefix, settings.quoteFormat, settings.sequencePadLength);
    settingsLoaded = true;
  } catch (err) {
    const msg = `outer: ${err instanceof Error ? err.message : String(err)}`;
    _opErrors.push(msg);
    console.error("[branding/page] outer catch:", err);
  }

  fallbackError = _opErrors.length > 0 ? _opErrors.join(" | ") : fallbackError;

  if (!settingsLoaded) {
    return (
      <div className="min-w-0 space-y-4">
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <p className="font-semibold">Failed to load branding settings.</p>
          <p className="mt-1 text-xs opacity-80">{fallbackError}</p>
        </div>
        <a href="/dashboard" className="inline-block rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-1.5 text-sm hover:bg-[var(--surface)]">
          Back to dashboard
        </a>
      </div>
    );
  }

  async function uploadLogoAction(formData: FormData) {
    "use server";

    const { user: currentUser, orgId: uploadOrgId } = await requireOrgSession();
    if (currentUser.role !== "ADMIN") {
      redirect("/dashboard");
    }

    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) {
      redirect("/settings/branding?error=Select+a+logo+file");
    }

    if (file.size > 5 * 1024 * 1024) {
      redirect("/settings/branding?error=Logo+must+be+5MB+or+less");
    }

    const ext = extensionFromMime(file.type);
    if (!ext) {
      redirect("/settings/branding?error=Use+PNG,+JPEG,+or+WEBP");
    }

    const publicDir = path.join(process.cwd(), "public");

    const existingSettings = await getDocumentBrandingSettings(uploadOrgId);
    const existingUrl = existingSettings.companyLogoUrl;
    if (existingUrl) {
      const existingName = existingUrl.replace(/^\//, "").split("?")[0];
      const existingPath = path.join(publicDir, existingName);
      try {
        await unlink(existingPath);
      } catch {
        // ignore
      }
    }

    const targetName = `company-logo-${uploadOrgId}.${ext}`;
    const targetPath = path.join(publicDir, targetName);
    const logoUrl = `/${targetName}`;

    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      await writeFile(targetPath, bytes);
    } catch {
      redirect("/settings/branding?error=Could+not+save+logo+on+server");
    }

    await saveDocumentBrandingSettings(uploadOrgId, {
      ...existingSettings,
      companyLogoUrl: logoUrl,
    });

    revalidatePath("/settings/branding");
    redirect("/settings/branding?saved=1");
  }

  async function saveBrandingAction(formData: FormData) {
    "use server";

    const { user: currentUser, orgId: saveOrgId } = await requireOrgSession();
    if (currentUser.role !== "ADMIN") {
      redirect("/dashboard");
    }

    const orgRow = await prisma.organization.findUnique({ where: { id: saveOrgId }, select: { plan: true } }).catch(() => null);
    const actionPlan: OrgPlan = orgRow?.plan ?? "STARTER";

    const rawVatDefault = String(formData.get("vatDefaultApplicable") ?? "true");
    const rawVatPercent = formData.get("vatRatePercent");
    const rawQuoteDays = formData.get("quoteValidityDays");
    const rawSeqPad = formData.get("sequencePadLength");

    const parsed = brandingSchema.safeParse({
      companyName: String(formData.get("companyName") ?? ""),
      companyTagline: String(formData.get("companyTagline") ?? ""),
      companyAddressLine1: String(formData.get("companyAddressLine1") ?? ""),
      companyAddressLine2: String(formData.get("companyAddressLine2") ?? ""),
      companyContacts: String(formData.get("companyContacts") ?? ""),
      companyEmail: normalizeOptionalEmail(formData.get("companyEmail")),
      companyWebsite: normalizeOptionalWebsite(formData.get("companyWebsite")),
      documentTitle: String(formData.get("documentTitle") ?? ""),
      quotePrefix: String(formData.get("quotePrefix") ?? ""),
      quoteFormat: String(formData.get("quoteFormat") ?? ""),
      quoteValidityDays: rawQuoteDays != null && String(rawQuoteDays).trim() !== "" ? rawQuoteDays : "30",
      sequencePadLength: rawSeqPad != null && String(rawSeqPad).trim() !== "" ? rawSeqPad : "4",
      vatDefaultApplicable: (rawVatDefault === "true" || rawVatDefault === "false") ? rawVatDefault : "true",
      vatRatePercent: rawVatPercent != null && String(rawVatPercent).trim() !== "" ? rawVatPercent : "18",
      vatLabel: String(formData.get("vatLabel") ?? ""),
      termsText: String(formData.get("termsText") ?? ""),
      footerText: String(formData.get("footerText") ?? ""),
      signatureCompanyLabel: String(formData.get("signatureCompanyLabel") ?? ""),
      signatureClientLabel: String(formData.get("signatureClientLabel") ?? ""),
      primaryColor: String(formData.get("primaryColor") ?? "#000000").replace(/^$/, "#000000"),
      secondaryColor: String(formData.get("secondaryColor") ?? "#4F8EF7").replace(/^$/, "#4F8EF7"),
      accentColor: String(formData.get("accentColor") ?? "#333333").replace(/^$/, "#333333"),
      backgroundColor: String(formData.get("backgroundColor") ?? "#FFFFFF").replace(/^$/, "#FFFFFF"),
      surfaceColor: String(formData.get("surfaceColor") ?? "#F5F5F5").replace(/^$/, "#F5F5F5"),
      borderColor: String(formData.get("borderColor") ?? "#E5E5E5").replace(/^$/, "#E5E5E5"),

      invoiceTemplateKey: String(formData.get("invoiceTemplateKey") ?? ""),
      quotationTemplateKey: String(formData.get("quotationTemplateKey") ?? ""),
      jobCardTemplateKey: String(formData.get("jobCardTemplateKey") ?? ""),
      receiptTemplateKey: String(formData.get("receiptTemplateKey") ?? ""),
    });

    if (!parsed.success) {
      const fieldErrors = Object.keys(parsed.error.flatten().fieldErrors).join(",");
      redirect(`/settings/branding?error=Invalid+input:${encodeURIComponent(fieldErrors)}`);
    }

    const currentSettings = await getDocumentBrandingSettings(saveOrgId);

    await saveDocumentBrandingSettings(saveOrgId, {
      ...defaultBranding,
      id: "singleton",
      companyName: sanitizeText(parsed.data.companyName),
      companyTagline: sanitizeOptionalText(parsed.data.companyTagline) ?? "",
      companyAddressLine1: sanitizeText(parsed.data.companyAddressLine1),
      companyAddressLine2: sanitizeText(parsed.data.companyAddressLine2),
      companyContacts: sanitizeText(parsed.data.companyContacts),
      companyEmail: sanitizeOptionalText(parsed.data.companyEmail) ?? "",
      companyWebsite: sanitizeOptionalText(parsed.data.companyWebsite) ?? "",
      companyLogoUrl: currentSettings.companyLogoUrl ?? "",
      documentTitle: sanitizeText(parsed.data.documentTitle),
      quotePrefix: sanitizeText(parsed.data.quotePrefix),
      quoteFormat: sanitizeText(parsed.data.quoteFormat),
      quoteValidityDays: parsed.data.quoteValidityDays,
      sequencePadLength: parsed.data.sequencePadLength,
      vatDefaultApplicable: parsed.data.vatDefaultApplicable === "true",
      vatRatePercent: parsed.data.vatRatePercent,
      vatLabel: sanitizeText(parsed.data.vatLabel),
      termsText: sanitizeText(parsed.data.termsText),
      footerText: sanitizeText(parsed.data.footerText),
      signatureCompanyLabel: sanitizeText(parsed.data.signatureCompanyLabel),
      signatureClientLabel: sanitizeText(parsed.data.signatureClientLabel),
      primaryColor: parsed.data.primaryColor,
      secondaryColor: parsed.data.secondaryColor,
      accentColor: parsed.data.accentColor,
      backgroundColor: parsed.data.backgroundColor,
      surfaceColor: parsed.data.surfaceColor,
      borderColor: parsed.data.borderColor,

      invoiceTemplateKey: resolveTemplateKey({ kind: "INVOICE", requestedKey: parsed.data.invoiceTemplateKey, plan: actionPlan }),
      quotationTemplateKey: resolveTemplateKey({ kind: "QUOTATION", requestedKey: parsed.data.quotationTemplateKey, plan: actionPlan }),
      jobCardTemplateKey: resolveTemplateKey({ kind: "JOB_CARD", requestedKey: parsed.data.jobCardTemplateKey, plan: actionPlan }),
      receiptTemplateKey: resolveTemplateKey({ kind: "RECEIPT", requestedKey: parsed.data.receiptTemplateKey, plan: actionPlan }),
    });

    revalidatePath("/settings/branding");
    redirect("/settings/branding?profileSaved=1");
  }

  return (
    <div className="min-w-0 space-y-4">
      {params.profileSaved || params.saved || params.error ? (
        <div className={`panel-shadow rounded-xl border px-4 py-3 text-sm ${params.error ? "border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-400" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
          {params.profileSaved ? "Document settings saved." : null}
          {params.saved ? "Logo updated successfully." : null}
          {params.error ? params.error.replaceAll("+", " ") : null}
        </div>
      ) : null}

      <form action={saveBrandingAction} className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] [&_*]:min-w-0">
        <div className="border-b border-[var(--line)] p-4">
          <p className="text-[13px] font-bold text-[var(--ink)]">Document branding</p>
          <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
            Set the company details used on quotations, invoices, receipts, and ticket documents.
          </p>
        </div>

        <div className="border-b border-[var(--line)] p-4">
          <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Company details</p>
          <div className="grid gap-2 lg:grid-cols-2">
            <input name="companyName" defaultValue={settings.companyName} placeholder="Company name" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <input name="companyTagline" defaultValue={settings.companyTagline ?? ""} placeholder="Tagline" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <input name="companyAddressLine1" defaultValue={settings.companyAddressLine1} placeholder="Address line 1" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <input name="companyAddressLine2" defaultValue={settings.companyAddressLine2} placeholder="Address line 2" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <input name="companyContacts" defaultValue={settings.companyContacts} placeholder="Contacts" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <input name="companyEmail" defaultValue={settings.companyEmail ?? ""} placeholder="Company email" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <input name="companyWebsite" defaultValue={settings.companyWebsite ?? ""} placeholder="Company website" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          </div>
        </div>

        <div className="border-b border-[var(--line)] p-4">
          <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Numbering</p>
          <div className="grid gap-2 lg:grid-cols-2">
            <input name="documentTitle" defaultValue={settings.documentTitle} placeholder="Document title" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <input name="quotePrefix" defaultValue={settings.quotePrefix} placeholder="Document prefix" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <input name="quoteFormat" defaultValue={settings.quoteFormat} placeholder="Number format" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <p className="text-[13px] text-[var(--ink-muted)] [overflow-wrap:anywhere] lg:col-span-2">
              Preview: <span className="font-medium text-[var(--ink)]">{quotePreview}</span>
            </p>
            <input type="number" name="quoteValidityDays" defaultValue={settings.quoteValidityDays} placeholder="Validity days" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <input type="number" name="sequencePadLength" defaultValue={settings.sequencePadLength} placeholder="Sequence pad length" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          </div>
        </div>

        <div className="border-b border-[var(--line)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Document templates</p>
            <a href="/documents/templates" className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent)] hover:underline">
              Manage all templates <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true"><path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" /></svg>
            </a>
          </div>
          <p className="mb-4 text-[13px] text-[var(--ink-muted)]">Available templates depend on your plan ({planLabel(plan)}). Click <strong>Set as default</strong> to change the active template.</p>
          <div className="grid gap-5 lg:grid-cols-2">
            {([
              { docKind: "INVOICE" as DocKind, label: DOC_KIND_LABELS.INVOICE, field: DOC_KIND_TEMPLATE_FIELD.INVOICE, value: selectedInvoiceKey, templates: invoiceTemplates.allowed },
              { docKind: "QUOTATION" as DocKind, label: DOC_KIND_LABELS.QUOTATION, field: DOC_KIND_TEMPLATE_FIELD.QUOTATION, value: selectedQuoteKey, templates: quotationTemplates.allowed },
              { docKind: "JOB_CARD" as DocKind, label: DOC_KIND_LABELS.JOB_CARD, field: DOC_KIND_TEMPLATE_FIELD.JOB_CARD, value: selectedJobCardKey, templates: jobCardTemplates.allowed },
              { docKind: "RECEIPT" as DocKind, label: DOC_KIND_LABELS.RECEIPT, field: DOC_KIND_TEMPLATE_FIELD.RECEIPT, value: selectedReceiptKey, templates: receiptTemplates.allowed },
            ]).map(({ docKind, label, field, value, templates }) => {
              const active = templates.find((t) => t.key === value);
              return (
                <div key={docKind} className="space-y-2">
                  <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">{label}</p>
                  <select
                    name={field}
                    defaultValue={value}
                    className="w-full cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
                  >
                    {templates.map((t) => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </select>
                  <div className="flex flex-wrap gap-2">
                    {templates.map((t) => {
                      const isActive = t.key === value;
                      return (
                        <div
                          key={t.key}
                          className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ${isActive ? "bg-[var(--accent)]/12 font-semibold" : "opacity-50"}`}
                        >
                          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${t.previewColor}`} />
                          <span className={isActive ? "text-[var(--accent)]" : "text-[var(--ink-muted)]"}>{t.label}</span>
                          {isActive && <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-[var(--accent)]" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" /></svg>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-b border-[var(--line)] p-4">
          <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Tax and signatures</p>
          <div className="grid gap-2 lg:grid-cols-2">
            <select name="vatDefaultApplicable" defaultValue={settings.vatDefaultApplicable ? "true" : "false"} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14">
              <option value="true">VAT default: applicable</option>
              <option value="false">VAT default: not applicable</option>
            </select>
            <input type="number" step="0.01" name="vatRatePercent" defaultValue={settings.vatRatePercent} placeholder="VAT rate" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <input name="vatLabel" defaultValue={settings.vatLabel} placeholder="VAT label" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <input name="signatureCompanyLabel" defaultValue={settings.signatureCompanyLabel} placeholder="Company signature label" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <input name="signatureClientLabel" defaultValue={settings.signatureClientLabel} placeholder="Client signature label" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          </div>
        </div>

        <div className="border-b border-[var(--line)] p-4">
          <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Colors</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { name: "primaryColor", label: "Primary", value: settings.primaryColor },
              { name: "secondaryColor", label: "Secondary", value: settings.secondaryColor },
              { name: "accentColor", label: "Accent", value: settings.accentColor },
              { name: "backgroundColor", label: "Background", value: settings.backgroundColor },
              { name: "surfaceColor", label: "Surface", value: settings.surfaceColor },
              { name: "borderColor", label: "Border", value: settings.borderColor },
            ].map(({ name, label, value }) => (
              <div key={name} className="flex items-center gap-2">
                <input type="color" name={name} defaultValue={value} className="h-8 w-10 cursor-pointer rounded border" />
                <span className="text-[13px] text-[var(--ink-muted)]">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4">
          <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">Terms and footer</p>
          <div className="mt-3 grid gap-2">
            <textarea name="termsText" defaultValue={settings.termsText} className="min-h-28 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <input name="footerText" defaultValue={settings.footerText} placeholder="Footer text" className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          </div>
        </div>

        <div className="border-t border-[var(--line)] px-4 py-3">
          <button type="submit" className="btn-premium rounded-lg px-4 py-1.5 text-[13px]">Save branding</button>
        </div>
      </form>

      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
        <p className="mb-2 text-sm font-semibold">Document logo</p>
        <p className="text-xs text-[var(--ink-muted)]">Used on quotations, invoices, receipts, and ticket documents. PNG, JPEG, or WEBP up to 5MB.</p>

        <form action={uploadLogoAction} className="mt-3 grid gap-2 lg:flex lg:flex-wrap lg:items-end">
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp"
            className="w-full min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs sm:text-sm outline-none"
            required
          />
          <button type="submit" className="btn-premium rounded-lg px-3 py-1.5 text-sm">Upload logo</button>
        </form>

        <div className="mt-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Document logo preview" className="max-h-28 rounded border border-[var(--line)] bg-black" />
          ) : (
            <p className="text-sm text-[var(--ink-muted)]">No logo uploaded yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
