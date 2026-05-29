"use client";

/**
 * NewJournalEntryForm
 *
 * Client component that renders the new-entry form with a standard template
 * picker above it.  When the user selects one of the 12 pre-defined templates
 * the form is pre-populated with:
 *   • the canonical narration text
 *   • the Dr / Cr account lines (best-match from their COA, or blank)
 *   • the line memos (role label, e.g. "Rent Expense")
 *
 * The user still enters the amount(s) before saving as Draft.
 */

import { useState, useTransition } from "react";
import { JOURNAL_TEMPLATES, type JournalTemplate } from "@/lib/journal-templates";

// Minimal shape needed from the COA query
type Account = { id: string; code: string; name: string; type: string };

type Line = {
  accountId: string;
  debit: string;
  credit: string;
  description: string;
};

const EMPTY_LINE: Line = { accountId: "", debit: "", credit: "", description: "" };

function emptyLines(n = 6): Line[] {
  return Array.from({ length: n }, () => ({ ...EMPTY_LINE }));
}

/** Try to find the best matching account for a template line. */
function matchAccount(accounts: Account[], hints: string[], types: string[]): string {
  const lower = (s: string) => s.toLowerCase();
  for (const hint of hints) {
    for (const type of types) {
      const match = accounts.find(
        (a) => a.type === type && lower(a.name).includes(lower(hint)),
      );
      if (match) return match.id;
    }
  }
  // Fallback: first account of any matching type
  return accounts.find((a) => types.includes(a.type))?.id ?? "";
}

// ── Category order for the picker grid ─────────────────────────────────────

const CATEGORY_ORDER = [
  "Equity",
  "Trading",
  "Expenses",
  "Assets",
  "Receivables",
  "Payables",
  "Financing",
  "Adjustments",
];

function groupedTemplates() {
  const map = new Map<string, JournalTemplate[]>();
  for (const t of JOURNAL_TEMPLATES) {
    const arr = map.get(t.category) ?? [];
    arr.push(t);
    map.set(t.category, arr);
  }
  return CATEGORY_ORDER.flatMap((cat) =>
    map.has(cat) ? [{ category: cat, templates: map.get(cat)! }] : [],
  );
}

// ── Component ───────────────────────────────────────────────────────────────

type Props = {
  accounts: Account[];
  /** Server action – returns { ok: true } on success or { error: string } on failure. */
  createEntry: (fd: FormData) => Promise<{ ok?: boolean; error?: string } | undefined | void>;
};

export function NewJournalEntryForm({ accounts, createEntry }: Props) {
  const [showPicker, setShowPicker]   = useState(false);
  const [activeId,   setActiveId]     = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [date,        setDate]        = useState(new Date().toISOString().slice(0, 10));
  const [reference,   setReference]   = useState("");
  const [lines,       setLines]       = useState<Line[]>(emptyLines());
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending,   startTransition] = useTransition();

  // ── Template application ───────────────────────────────────────────────

  function applyTemplate(t: JournalTemplate) {
    setActiveId(t.id);
    setDescription(t.narration);
    setShowPicker(false);

    const next = emptyLines();
    t.lines.forEach((tl, i) => {
      if (i >= next.length) return;
      next[i] = {
        accountId:   matchAccount(accounts, tl.nameHints, tl.accountTypes),
        debit:       tl.side === "DR" ? "" : "",
        credit:      tl.side === "CR" ? "" : "",
        description: tl.role,
      };
    });
    setLines(next);
  }

  function clearTemplate() {
    setActiveId(null);
    setDescription("");
    setLines(emptyLines());
  }

  // ── Live balance totals ────────────────────────────────────────────────

  const totalDR = lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
  const totalCR = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = totalDR > 0 && Math.abs(totalDR - totalCR) < 0.01;
  const hasAmounts = totalDR > 0 || totalCR > 0;

  // ── Line helpers ───────────────────────────────────────────────────────

  function setLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  // ── Submit ─────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      setServerError(null);
      const result = await createEntry(fd);
      if (result && "error" in result && result.error) {
        setServerError(result.error);
        return; // keep the form intact so the user can fix it
      }
      // Reset only on confirmed success
      setActiveId(null);
      setDescription("");
      setDate(new Date().toISOString().slice(0, 10));
      setReference("");
      setLines(emptyLines());
    });
  }

  // ── Active template label ─────────────────────────────────────────────

  const activeTpl = activeId ? JOURNAL_TEMPLATES.find((t) => t.id === activeId) : null;
  const groups = groupedTemplates();

  return (
    <div className="border-t border-[var(--line)] p-5 space-y-5">

      {/* ── Template Picker toggle ──────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)]/40 px-3 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--panel-strong)] transition-colors"
          >
            <span className="text-base">📋</span>
            {showPicker ? "Hide standard templates" : "Use a standard template"}
            <span className="rounded bg-[var(--accent)]/10 px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent)]">
              12
            </span>
          </button>

          {activeTpl && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)]">
                <span>{activeTpl.icon}</span>
                {activeTpl.title}
              </span>
              <button
                type="button"
                onClick={clearTemplate}
                className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                title="Clear template"
              >
                ✕ clear
              </button>
            </div>
          )}
        </div>

        {/* ── Template grid ────────────────────────────────────────────── */}
        {showPicker && (
          <div className="mt-4 space-y-4">
            {groups.map(({ category, templates }) => (
              <div key={category}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                  {category}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className={`rounded-xl border p-3 text-left transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--panel)] ${
                        activeId === t.id
                          ? "border-[var(--accent)]/60 bg-[var(--accent)]/5"
                          : "border-[var(--line)] bg-[var(--bg)]"
                      }`}
                    >
                      <div className="text-xl mb-1.5">{t.icon}</div>
                      <p className="text-xs font-semibold text-[var(--ink)] leading-snug">
                        {t.title}
                      </p>
                      <div className="mt-2 space-y-0.5">
                        {t.lines.map((line, i) => (
                          <p key={i} className="flex items-start gap-1 text-[10px] leading-snug">
                            <span
                              className={`mt-px shrink-0 rounded px-1 py-px font-bold ${
                                line.side === "DR"
                                  ? "bg-sky-500/10 text-sky-600"
                                  : "bg-emerald-500/10 text-emerald-600"
                              }`}
                            >
                              {line.side}
                            </span>
                            <span className="text-[var(--ink-muted)]">{line.role}</span>
                          </p>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Entry Form ────────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Meta row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--ink-muted)]">
              Date *
            </label>
            <input
              name="date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--ink-muted)]">
              Description / Narration *
            </label>
            <input
              name="description"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Monthly rent — May 2025"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--ink-muted)]">
              Reference / Source Doc
            </label>
            <input
              name="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="INV-001, Receipt #42…"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Lines table */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
              Line Items — Σ Debits must equal Σ Credits
            </p>
            {hasAmounts && (
              <span
                className={`text-[11px] font-semibold tabular-nums ${
                  balanced ? "text-emerald-600" : "text-amber-600"
                }`}
              >
                {balanced ? "✓ Balanced" : `DR ${totalDR.toLocaleString()} · CR ${totalCR.toLocaleString()}`}
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--line)] bg-[var(--panel)]">
                <tr>
                  <th className="w-2/5 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                    Account *
                  </th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                    Memo
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-sky-600">
                    Debit (DR)
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-emerald-600">
                    Credit (CR)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)] bg-[var(--bg)]">
                {lines.map((line, i) => (
                  <tr key={i} className={line.accountId ? "" : "opacity-60 focus-within:opacity-100"}>
                    <td className="px-3 py-2">
                      <select
                        name={`lines[${i}][accountId]`}
                        value={line.accountId}
                        onChange={(e) => setLine(i, { accountId: e.target.value })}
                        className="w-full rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs"
                      >
                        <option value="">— Select account —</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} — {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        name={`lines[${i}][description]`}
                        value={line.description}
                        onChange={(e) => setLine(i, { description: e.target.value })}
                        placeholder="optional memo"
                        className="w-full rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        name={`lines[${i}][debit]`}
                        type="number"
                        min="0"
                        step="1"
                        value={line.debit}
                        onChange={(e) => setLine(i, { debit: e.target.value })}
                        placeholder="0"
                        className="w-28 rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        name={`lines[${i}][credit]`}
                        type="number"
                        min="0"
                        step="1"
                        value={line.credit}
                        onChange={(e) => setLine(i, { credit: e.target.value })}
                        placeholder="0"
                        className="w-28 rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs text-right"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Running totals footer */}
              {hasAmounts && (
                <tfoot className="border-t-2 border-[var(--line)] bg-[var(--panel)]">
                  <tr>
                    <td
                      colSpan={2}
                      className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]"
                    >
                      Totals
                    </td>
                    <td className={`px-3 py-2 text-right text-xs font-bold tabular-nums ${balanced ? "text-emerald-600" : "text-amber-600"}`}>
                      {totalDR.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 text-right text-xs font-bold tabular-nums ${balanced ? "text-emerald-600" : "text-amber-600"}`}>
                      {totalCR.toLocaleString()}
                    </td>
                  </tr>
                  {!balanced && hasAmounts && (
                    <tr>
                      <td colSpan={4} className="px-3 pb-2 text-right text-[10px] font-semibold text-amber-600">
                        Difference: {Math.abs(totalDR - totalCR).toLocaleString()} — entry will be rejected until balanced
                      </td>
                    </tr>
                  )}
                </tfoot>
              )}
            </table>
          </div>

          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-[var(--ink-muted)]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 h-3 w-3 shrink-0"
              aria-hidden
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            Saved as <strong>Draft</strong>. Entry is rejected server-side if Σ Debit ≠ Σ Credit.
            Post manually after review.
          </p>
        </div>

        {serverError && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {serverError}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="btn-premium rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save as Draft"}
          </button>
        </div>
      </form>
    </div>
  );
}
