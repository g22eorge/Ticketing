import type { OrgPlan } from "@prisma/client";

import { InvoiceDocument } from "@/lib/pdf/InvoiceDocument";
import { InvoiceDocumentV2 } from "@/lib/pdf/InvoiceDocumentV2";
import { JobCardDocument } from "@/lib/pdf/JobCardDocument";
import { QuotationDocument } from "@/lib/pdf/QuotationDocument";
import { QuotationDocumentMinimal } from "@/lib/pdf/QuotationDocumentMinimal";
import { SaleReceiptDocument } from "@/lib/pdf/SaleReceiptDocument";

export type DocKind = "INVOICE" | "QUOTATION" | "JOB_CARD" | "RECEIPT";

export type TemplateKey =
  | "invoice_classic"
  | "invoice_green"
  | "invoice_minimal"
  | "quote_classic"
  | "quote_minimal"
  | "job_card_classic"
  | "job_card_minimal"
  | "receipt_classic";

export type TemplateDef = {
  kind: DocKind;
  key: TemplateKey;
  label: string;
  minPlan: OrgPlan;
};

const PLAN_ORDER: Record<OrgPlan, number> = {
  STARTER: 1,
  GROWTH: 2,
  ENTERPRISE: 3,
};

function planAllows(current: OrgPlan, minPlan: OrgPlan) {
  return PLAN_ORDER[current] >= PLAN_ORDER[minPlan];
}

export const DOC_TEMPLATES: TemplateDef[] = [
  // Starter gets exactly one option per document kind (the default).
  { kind: "INVOICE", key: "invoice_classic", label: "Default", minPlan: "STARTER" },
  // Growth unlocks extra styles.
  { kind: "INVOICE", key: "invoice_green", label: "Premium (Green)", minPlan: "GROWTH" },
  // Enterprise unlocks the full catalog.
  { kind: "INVOICE", key: "invoice_minimal", label: "Minimal", minPlan: "ENTERPRISE" },

  { kind: "QUOTATION", key: "quote_classic", label: "Default", minPlan: "STARTER" },
  { kind: "QUOTATION", key: "quote_minimal", label: "Minimal", minPlan: "GROWTH" },

  { kind: "JOB_CARD", key: "job_card_classic", label: "Default", minPlan: "STARTER" },
  { kind: "JOB_CARD", key: "job_card_minimal", label: "Minimal", minPlan: "ENTERPRISE" },

  { kind: "RECEIPT", key: "receipt_classic", label: "Default", minPlan: "STARTER" },
];

export function templatesFor(kind: DocKind, plan: OrgPlan) {
  return DOC_TEMPLATES.filter((t) => t.kind === kind && planAllows(plan, t.minPlan));
}

export function templatesForAll(kind: DocKind) {
  return DOC_TEMPLATES.filter((t) => t.kind === kind);
}

export function splitTemplatesByPlan(kind: DocKind, plan: OrgPlan) {
  const all = templatesForAll(kind);
  const allowed = all.filter((t) => planAllows(plan, t.minPlan));
  const locked = all.filter((t) => !planAllows(plan, t.minPlan));
  return { allowed, locked };
}

export function planLabel(plan: OrgPlan) {
  if (plan === "STARTER") return "Starter";
  if (plan === "GROWTH") return "Growth";
  return "Enterprise";
}

export function resolveTemplateKey(params: {
  kind: DocKind;
  requestedKey: string | null | undefined;
  plan: OrgPlan;
}): TemplateKey {
  const allowed = templatesFor(params.kind, params.plan);
  const requested = params.requestedKey as TemplateKey;
  if (allowed.some((t) => t.key === requested)) return requested;
  return allowed[0]?.key ?? (fallbackKeyForKind(params.kind) as TemplateKey);
}

function fallbackKeyForKind(kind: DocKind) {
  if (kind === "INVOICE") return "invoice_classic";
  if (kind === "QUOTATION") return "quote_classic";
  if (kind === "JOB_CARD") return "job_card_classic";
  return "receipt_classic";
}

export function InvoiceTemplateComponent(key: TemplateKey) {
  if (key === "invoice_green") return InvoiceDocumentV2;
  if (key === "invoice_minimal") return InvoiceDocument;
  return InvoiceDocument;
}

export function QuotationTemplateComponent(key: TemplateKey) {
  if (key === "quote_minimal") return QuotationDocumentMinimal;
  return QuotationDocument;
}

export function JobCardTemplateComponent(_key: TemplateKey) {
  if (_key === "job_card_minimal") return JobCardDocument;
  return JobCardDocument;
}

export function ReceiptTemplateComponent(_key: TemplateKey) {
  return SaleReceiptDocument;
}
