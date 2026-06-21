import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Eye, Lock, CheckCircle2 } from "lucide-react";

import { getDocumentBrandingSettings } from "@/lib/document-branding";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import {
  type DocKind,
  planLabel,
  resolveTemplateKey,
  templatesFor,
  templatesForAll,
  type TemplateKey,
} from "@/lib/pdf/templates";
import type { OrgPlan } from "@prisma/client";

export const dynamic = "force-dynamic";

// ── Plan badge colours ────────────────────────────────────────────────────────

function planBadgeClass(plan: OrgPlan): string {
  if (plan === "STARTER")    return "bg-[var(--panel-strong)] text-[var(--ink-muted)] border border-[var(--line)]";
  if (plan === "STANDARD")   return "bg-blue-500/15 text-blue-400 border border-blue-500/20";
  if (plan === "GROWTH")     return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20";
  if (plan === "PREMIUM")    return "bg-amber-500/15 text-amber-400 border border-amber-500/20";
  if (plan === "ENTERPRISE") return "bg-violet-500/15 text-violet-400 border border-violet-500/20";
  return "bg-[var(--panel-strong)] text-[var(--ink-muted)]";
}

// ── Kind display helpers ──────────────────────────────────────────────────────

const KIND_LABELS: Record<DocKind, string> = {
  INVOICE:    "Invoice Templates",
  QUOTATION:  "Quotation Templates",
  JOB_CARD:   "Job Card Templates",
  RECEIPT:    "Receipt Templates",
};

const KINDS: DocKind[] = ["INVOICE", "QUOTATION", "JOB_CARD", "RECEIPT"];

const KIND_FIELD_MAP: Record<DocKind, string> = {
  INVOICE:   "invoiceTemplateKey",
  QUOTATION: "quotationTemplateKey",
  JOB_CARD:  "jobCardTemplateKey",
  RECEIPT:   "receiptTemplateKey",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DocumentTemplatesPage() {
  const { user, orgId } = await requireOrgSession();

  // Restrict to ADMIN, MANAGER, and OPS roles
  if (!can.manageUsers(user) && user.role !== "MANAGER" && user.role !== "OPS") {
    redirect("/dashboard");
  }

  const org = await prisma.organization
    .findUnique({ where: { id: orgId }, select: { plan: true } })
    .catch(() => null);
  const plan: OrgPlan = (org?.plan as OrgPlan) ?? "STARTER";

  // ADMIN and MANAGER can access all templates regardless of plan tier.
  const bypassPlanGate = user.role === "ADMIN" || user.role === "MANAGER";

  const settings = await getDocumentBrandingSettings(orgId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = settings as any;
  const currentKeys: Record<DocKind, TemplateKey> = {
    INVOICE:   resolveTemplateKey({ kind: "INVOICE",   requestedKey: s.invoiceTemplateKey,   plan }),
    QUOTATION: resolveTemplateKey({ kind: "QUOTATION", requestedKey: s.quotationTemplateKey, plan }),
    JOB_CARD:  resolveTemplateKey({ kind: "JOB_CARD",  requestedKey: s.jobCardTemplateKey,   plan }),
    RECEIPT:   resolveTemplateKey({ kind: "RECEIPT",   requestedKey: s.receiptTemplateKey,   plan }),
  };

  // ── Server action ───────────────────────────────────────────────────────────

  async function setTemplateAction(formData: FormData) {
    "use server";
    const { user: actionUser, orgId: actionOrgId } = await requireOrgSession();
    if (!can.manageUsers(actionUser) && actionUser.role !== "MANAGER" && actionUser.role !== "OPS") {
      return;
    }

    const key  = (formData.get("key")  as string | null)?.trim();
    const kind = (formData.get("kind") as string | null)?.trim() as DocKind | undefined;

    if (!key || !kind || !KIND_FIELD_MAP[kind]) return;

    const orgRow = await prisma.organization
      .findUnique({ where: { id: actionOrgId }, select: { plan: true } })
      .catch(() => null);
    const actionPlan: OrgPlan = (orgRow?.plan as OrgPlan) ?? "STARTER";

    // ADMIN and MANAGER bypass plan tier restrictions
    const isAdminBypass = actionUser.role === "ADMIN" || actionUser.role === "MANAGER";
    if (!isAdminBypass) {
      const allowed = templatesFor(kind, actionPlan);
      if (!allowed.some((t) => t.key === key)) return;
    }

    const field = KIND_FIELD_MAP[kind];

    // Use raw SQL to stay compatible with both Prisma-delegate and raw table modes.
    // The document-branding module exposes saveDocumentBrandingSettings but requires
    // a full settings object. A targeted update is simpler and safer here.
    try {
      // Try Prisma delegate first (multi-tenant production path).
      const delegate = (
        prisma as unknown as {
          documentBrandingSettings?: {
            upsert: (args: {
              where: { orgId: string };
              create: Record<string, unknown>;
              update: Record<string, unknown>;
            }) => Promise<unknown>;
          };
        }
      ).documentBrandingSettings;

      if (delegate) {
        await delegate.upsert({
          where: { orgId: actionOrgId },
          create: { orgId: actionOrgId, [field]: key },
          update: { [field]: key },
        });
      } else {
        // Raw SQLite fallback.
        await prisma.$executeRawUnsafe(
          `UPDATE "DocumentBrandingSettings" SET "${field}" = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = 'singleton'`,
          key,
        );
      }
    } catch {
      // Silently ignore — next page load will show the unchanged state.
    }

    revalidatePath("/documents/templates");
    revalidatePath("/settings/branding");
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-w-0 space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-[var(--ink)]">Document Templates</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Choose your default template for each document type. Available templates depend on your plan
          ({" "}
          <span className="font-medium text-[var(--ink)]">{planLabel(plan)}</span>
          ).
        </p>
      </div>

      {KINDS.map((kind) => {
        const allTemplates = templatesForAll(kind);
        const currentKey  = currentKeys[kind];

        return (
          <section key={kind} className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <div className="border-b border-[var(--line)] px-4 py-3">
              <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]/70">
                {KIND_LABELS[kind]}
              </p>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {allTemplates.map((t) => {
                  const isAllowed  = bypassPlanGate || templatesFor(kind, plan).some((d) => d.key === t.key);
                  const isCurrent  = t.key === currentKey;

                  return (
                    <div
                      key={t.key}
                      className={[
                        "relative flex min-w-0 flex-col overflow-hidden rounded-xl border transition-all",
                        isCurrent
                          ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/20"
                          : "border-[var(--line)]",
                        !isAllowed ? "opacity-60" : "",
                        "bg-[var(--panel)]",
                      ].join(" ")}
                    >
                      {/* Colour swatch */}
                      <div className={`h-1.5 w-full rounded-t ${t.previewColor}`} />

                      {/* Card body */}
                      <div className="flex flex-1 flex-col gap-1.5 p-3">
                        {/* Top row: number badge + status badges */}
                        <div className="flex items-center justify-between gap-1">
                          <span className="rounded bg-[var(--panel-strong)] px-1.5 py-0.5 text-[12px] font-bold tabular-nums text-[var(--ink-muted)]">
                            T-{String(t.templateNumber).padStart(2, "0")}
                          </span>
                          <div className="flex items-center gap-1">
                            {t.templateNumber === 1 && !isCurrent && (
                              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[13px] font-bold text-emerald-600">
                                ★ Recommended
                              </span>
                            )}
                            {isCurrent ? (
                              <span className="rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[12px] font-bold text-[var(--accent)]">
                                Current
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {/* Label */}
                        <p className="text-[13px] font-semibold leading-tight text-[var(--ink)]">
                          {t.label}
                        </p>

                        {/* Description */}
                        <p className="text-[13px] leading-snug text-[var(--ink-muted)]">
                          {t.description}
                        </p>

                        {/* Plan badge */}
                        <span className={`mt-0.5 inline-flex w-fit items-center rounded-full px-1.5 py-0.5 text-[12px] font-semibold ${planBadgeClass(t.minPlan)}`}>
                          {planLabel(t.minPlan)}
                        </span>
                      </div>

                      {/* Action row */}
                      <div className="border-t border-[var(--line)] px-3 py-2 space-y-1.5">
                        {/* Preview — always available */}
                        <a
                          href={`/api/templates/preview?key=${t.key}&kind=${kind}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex w-full items-center justify-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1 text-[13px] font-medium text-[var(--ink-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"
                        >
                          <Eye className="h-3 w-3" aria-hidden="true" />
                          Preview PDF
                        </a>

                        {/* Set as default / locked / active */}
                        {isAllowed ? (
                          isCurrent ? (
                            <span className="inline-flex items-center gap-1 text-center text-[13px] text-[var(--ink-muted)]"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" aria-hidden="true" /> Active</span>
                          ) : (
                            <form action={setTemplateAction}>
                              <input type="hidden" name="key"  value={t.key} />
                              <input type="hidden" name="kind" value={kind}  />
                              <button
                                type="submit"
                                className="btn-premium w-full rounded-lg px-2 py-1 text-[13px]"
                              >
                                Set as default
                              </button>
                            </form>
                          )
                        ) : (
                          <p className="text-center text-[13px] text-[var(--ink-muted)]">
                            Requires {planLabel(t.minPlan)}
                          </p>
                        )}
                      </div>

                      {/* Lock overlay for locked templates */}
                      {!isAllowed ? (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-[var(--panel)]/60">
                          <Lock className="h-6 w-6 text-[var(--ink-muted)]/50" aria-hidden="true" />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}

      {/* Footer link back to full branding settings */}
      <p className="text-xs text-[var(--ink-muted)]">
        To update company info, colors, and document content,{" "}
        <a href="/settings/branding" className="underline underline-offset-2 hover:text-[var(--ink)]">
          visit Branding Settings
        </a>
        .
      </p>
    </div>
  );
}
