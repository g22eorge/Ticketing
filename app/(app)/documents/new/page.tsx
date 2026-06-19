export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";

const DOCUMENT_TYPES = [
  {
    key: "quotation",
    label: "Quotation",
    href: "/sales/quotations/new",
    listHref: "/documents/quotations",
    description: "Create a standalone customer quotation.",
    detail: "Start here, then continue to the focused quotation form.",
    cta: "Create quotation",
    allowed: (user: Awaited<ReturnType<typeof requireOrgSession>>["user"]) => can.createQuotations(user),
  },
  {
    key: "invoice",
    label: "Invoice",
    href: "/tickets",
    listHref: "/documents/invoices",
    description: "Create an invoice from a billable ticket.",
    detail: "Open a ticket, then use Create Invoice from the ticket actions.",
    cta: "Choose ticket",
    allowed: (user: Awaited<ReturnType<typeof requireOrgSession>>["user"]) => can.createInvoices(user),
  },
  {
    key: "receipt",
    label: "Receipt",
    href: "/documents/invoices",
    listHref: "/documents/receipts",
    description: "Record payment from an issued invoice.",
    detail: "Find the invoice or ticket payment action, then record payment.",
    cta: "Find invoice",
    allowed: (user: Awaited<ReturnType<typeof requireOrgSession>>["user"]) =>
      can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role),
  },
] as const;

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { user } = await requireOrgSession();
  const params = await searchParams;
  const selectedType = (params.type ?? "quotation").toLowerCase();
  const selected = DOCUMENT_TYPES.find((item) => item.key === selectedType) ?? DOCUMENT_TYPES[0];

  if (!selected.allowed(user)) {
    redirect("/documents");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">New Document</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">{selected.label}</h1>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">{selected.description}</p>
          </div>
          <Link href={selected.listHref} className="inline-flex items-center justify-center rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--ink-muted)] transition hover:text-[var(--ink)]">
            View {selected.label}s
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {DOCUMENT_TYPES.filter((item) => item.allowed(user)).map((item) => (
          <Link
            key={item.key}
            href={`/documents/new?type=${item.key}`}
            className={
              "panel-shadow rounded-xl border px-4 py-4 transition " +
              (item.key === selected.key
                ? "border-[var(--accent)] bg-[var(--accent)] text-black"
                : "border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] hover:border-[var(--accent)]/45")
            }
          >
            <span className="text-sm font-bold">{item.label}</span>
            <span className={item.key === selected.key ? "mt-1 block text-xs text-black/70" : "mt-1 block text-xs text-[var(--ink-muted)]"}>
              {item.description}
            </span>
          </Link>
        ))}
      </div>

      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-[var(--ink)]">Continue to {selected.label}</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">{selected.detail}</p>
          </div>
          <Link
            href={selected.href}
            className="btn-premium inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-bold"
          >
            {selected.cta}
          </Link>
        </div>
      </div>

      {selected.key === "quotation" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/sales/quotations/new"
            className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:border-[var(--accent)]/45"
          >
            <p className="text-sm font-bold text-[var(--ink)]">Standalone quotation</p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Use this when the quote is not tied to a ticket.</p>
          </Link>
          <Link
            href="/tickets"
            className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:border-[var(--accent)]/45"
          >
            <p className="text-sm font-bold text-[var(--ink)]">Ticket quotation</p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Open a ticket and create its quotation from ticket actions.</p>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
