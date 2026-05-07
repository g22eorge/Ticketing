import { access, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { defaultBranding, getDocumentBrandingSettings, saveDocumentBrandingSettings } from "@/lib/document-branding";
import { sanitizeOptionalText, sanitizeText } from "@/lib/sanitize";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";

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
    .replaceAll("{PREFIX}", prefix || "EIS")
    .replaceAll("{M}", String(month))
    .replaceAll("{MM}", String(month).padStart(2, "0"))
    .replaceAll("{YYYY}", String(year))
    .replaceAll("{SEQ}", sampleSeq);
}

async function resolveLogoPreview() {
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
  const { user, orgId } = await requireOrgSession();
  if (!can.manageUsers(user)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const preview = await resolveLogoPreview();
  const settings = await getDocumentBrandingSettings(orgId);
  const quotePreview = renderQuotePreview(
    settings.quotePrefix,
    settings.quoteFormat,
    settings.sequencePadLength,
  );

  async function uploadLogoAction(formData: FormData) {
    "use server";

    const { user: currentUser } = await requireOrgSession();
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
    const targetName = `eagle-info-logo.${ext}`;
    const targetPath = path.join(publicDir, targetName);

    for (const candidate of logoFiles.map((f) => path.join(publicDir, f.name))) {
      if (candidate === targetPath) continue;
      try {
        await unlink(candidate);
      } catch {
        // ignore if missing
      }
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(targetPath, bytes);

    revalidatePath("/settings/branding");
    redirect("/settings/branding?saved=1");
  }

  async function saveBrandingAction(formData: FormData) {
    "use server";

    const { user: currentUser, orgId: saveOrgId } = await requireOrgSession();
    if (currentUser.role !== "ADMIN") {
      redirect("/dashboard");
    }

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
      quoteValidityDays: formData.get("quoteValidityDays"),
      sequencePadLength: formData.get("sequencePadLength"),
      vatDefaultApplicable: String(formData.get("vatDefaultApplicable") ?? "true"),
      vatRatePercent: formData.get("vatRatePercent"),
      vatLabel: String(formData.get("vatLabel") ?? ""),
      termsText: String(formData.get("termsText") ?? ""),
      footerText: String(formData.get("footerText") ?? ""),
      signatureCompanyLabel: String(formData.get("signatureCompanyLabel") ?? ""),
      signatureClientLabel: String(formData.get("signatureClientLabel") ?? ""),
      primaryColor: String(formData.get("primaryColor") ?? "#000000"),
      secondaryColor: String(formData.get("secondaryColor") ?? "#666666"),
      accentColor: String(formData.get("accentColor") ?? "#333333"),
      backgroundColor: String(formData.get("backgroundColor") ?? "#FFFFFF"),
      surfaceColor: String(formData.get("surfaceColor") ?? "#F5F5F5"),
      borderColor: String(formData.get("borderColor") ?? "#E5E5E5"),
    });

    if (!parsed.success) {
      redirect("/settings/branding?error=Invalid+branding+input");
    }

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
    });

    revalidatePath("/settings/branding");
    redirect("/settings/branding?profileSaved=1");
  }

  return (
    <div className="min-w-0 space-y-4">
      {params.profileSaved || params.saved || params.error ? (
        <div className={`panel-shadow rounded-xl border px-4 py-3 text-sm ${params.error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {params.profileSaved ? "Document settings saved." : null}
          {params.saved ? "Logo updated successfully." : null}
          {params.error ? params.error.replaceAll("+", " ") : null}
        </div>
      ) : null}

      <form action={saveBrandingAction} className="panel-shadow space-y-3 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 [&_*]:min-w-0">
        <details className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3" open>
          <summary className="text-sm font-semibold text-[var(--ink)]">Company & Numbering</summary>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
          <input name="companyName" defaultValue={settings.companyName} placeholder="Company name" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          <input name="companyTagline" defaultValue={settings.companyTagline ?? ""} placeholder="Tagline" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          <input name="companyAddressLine1" defaultValue={settings.companyAddressLine1} placeholder="Address line 1" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          <input name="companyAddressLine2" defaultValue={settings.companyAddressLine2} placeholder="Address line 2" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          <input name="companyContacts" defaultValue={settings.companyContacts} placeholder="Contacts" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          <input name="companyEmail" defaultValue={settings.companyEmail ?? ""} placeholder="Company email" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          <input name="companyWebsite" defaultValue={settings.companyWebsite ?? ""} placeholder="Company website" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          <input name="documentTitle" defaultValue={settings.documentTitle} placeholder="Document title" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          <input name="quotePrefix" defaultValue={settings.quotePrefix} placeholder="Quote prefix" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          <input name="quoteFormat" defaultValue={settings.quoteFormat} placeholder="Quote format" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <p className="text-xs text-[var(--ink-muted)] [overflow-wrap:anywhere] lg:col-span-2">
            Preview: <span className="font-medium text-[var(--ink)]">{quotePreview}</span>
          </p>
          <input type="number" name="quoteValidityDays" defaultValue={settings.quoteValidityDays} placeholder="Validity days" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          <input type="number" name="sequencePadLength" defaultValue={settings.sequencePadLength} placeholder="Sequence pad length" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          </div>
        </details>

        <details className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
          <summary className="text-sm font-semibold text-[var(--ink)]">VAT & Sign-off</summary>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
          <select name="vatDefaultApplicable" defaultValue={settings.vatDefaultApplicable ? "true" : "false"} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14">
            <option value="true">VAT default: applicable</option>
            <option value="false">VAT default: not applicable</option>
          </select>
          <input type="number" step="0.01" name="vatRatePercent" defaultValue={settings.vatRatePercent} placeholder="VAT rate" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          <input name="vatLabel" defaultValue={settings.vatLabel} placeholder="VAT label" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <input name="signatureCompanyLabel" defaultValue={settings.signatureCompanyLabel} placeholder="Company signature label" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <input name="signatureClientLabel" defaultValue={settings.signatureClientLabel} placeholder="Client signature label" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          </div>
        </details>

        <details className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
          <summary className="text-sm font-semibold text-[var(--ink)]">Colors</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-center gap-2">
              <input type="color" name="primaryColor" defaultValue={settings.primaryColor} className="h-9 w-12 rounded border cursor-pointer" />
              <span className="text-xs text-[var(--ink-muted)]">Primary</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="color" name="secondaryColor" defaultValue={settings.secondaryColor} className="h-9 w-12 rounded border cursor-pointer" />
              <span className="text-xs text-[var(--ink-muted)]">Secondary</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="color" name="accentColor" defaultValue={settings.accentColor} className="h-9 w-12 rounded border cursor-pointer" />
              <span className="text-xs text-[var(--ink-muted)]">Accent</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="color" name="backgroundColor" defaultValue={settings.backgroundColor} className="h-9 w-12 rounded border cursor-pointer" />
              <span className="text-xs text-[var(--ink-muted)]">Background</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="color" name="surfaceColor" defaultValue={settings.surfaceColor} className="h-9 w-12 rounded border cursor-pointer" />
              <span className="text-xs text-[var(--ink-muted)]">Surface</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="color" name="borderColor" defaultValue={settings.borderColor} className="h-9 w-12 rounded border cursor-pointer" />
              <span className="text-xs text-[var(--ink-muted)]">Border</span>
            </div>
          </div>
        </details>

        <details className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
          <summary className="text-sm font-semibold text-[var(--ink)]">Terms & Footer</summary>
          <div className="mt-3 grid gap-2">
            <textarea name="termsText" defaultValue={settings.termsText} className="min-h-28 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <input name="footerText" defaultValue={settings.footerText} placeholder="Footer text" className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
          </div>
        </details>

        <button className="btn-premium w-full rounded-lg px-3 py-1.5 text-sm lg:w-auto">Save Document Settings</button>
      </form>

      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="mb-2 text-sm font-semibold">Invoice Logo</p>
        <p className="text-xs text-[var(--ink-muted)]">Accepted: PNG, JPEG, WEBP (max 5MB). Recommended wide aspect ratio.</p>

        <form action={uploadLogoAction} className="mt-3 grid gap-2 lg:flex lg:flex-wrap lg:items-end">
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp"
            className="w-full min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs sm:text-sm outline-none"
            required
          />
          <button className="btn-premium rounded-lg px-3 py-1.5 text-sm">Upload Logo</button>
        </form>

        <div className="mt-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Invoice logo preview" className="max-h-28 rounded border border-[var(--line)] bg-black" />
          ) : (
            <p className="text-sm text-[var(--ink-muted)]">No logo uploaded yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
