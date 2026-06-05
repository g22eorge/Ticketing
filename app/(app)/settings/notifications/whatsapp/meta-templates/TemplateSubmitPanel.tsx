"use client";

import Link from "next/link";
import { useState } from "react";

export interface TemplateDefinition {
  metaName: string;
  systemKey: string;
  category: string;
  language: string;
  label: string;
  description: string;
  useCase: string;
  // Body uses {{n}} Meta placeholders — order must match varOrder below
  body: string;
  // Names of system variables in the SAME order as {{1}}, {{2}}…
  // (alphabetical by name — matches how renderCommunicationTemplate builds metaParamValues)
  varOrder: { n: number; name: string; systemKey: string; liveExample: string }[];
}

type SubmitStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; metaStatus: string; id: string; action?: "created" | "updated" }
  | { state: "error"; message: string };

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1 text-[13px] font-semibold transition hover:bg-[var(--panel)] active:scale-95 shrink-0"
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

function previewBody(body: string, varOrder: TemplateDefinition["varOrder"]) {
  let result = body;
  for (const v of varOrder) {
    result = result.replaceAll(`{{${v.n}}}`, v.liveExample);
  }
  return result;
}

export function TemplateSubmitPanel({ templates }: { templates: TemplateDefinition[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, SubmitStatus>>({});
  const [submitAll, setSubmitAll] = useState<"idle" | "running" | "done">("idle");
  const [syncDb, setSyncDb] = useState<"idle" | "running" | "done" | "error">("idle");

  async function handleSyncDb() {
    setSyncDb("running");
    try {
      const res = await fetch("/api/settings/whatsapp/sync-template-names", { method: "POST" });
      setSyncDb(res.ok ? "done" : "error");
    } catch {
      setSyncDb("error");
    }
  }

  async function submitOne(t: TemplateDefinition): Promise<SubmitStatus> {
    setStatuses((s) => ({ ...s, [t.metaName]: { state: "loading" } }));
    try {
      const res = await fetch("/api/settings/whatsapp/submit-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: t.metaName,
          category: t.category,
          language: t.language,
          bodyText: t.body,
          exampleValues: t.varOrder.map((v) => v.liveExample),
        }),
      });
      const data = await res.json() as { ok?: boolean; id?: string; status?: string; error?: string; action?: "created" | "updated"; raw?: unknown };
      if (!res.ok || !data.ok) {
        const rawDetail = data.raw ? `\n\nRaw: ${JSON.stringify(data.raw, null, 2)}` : "";
        const status: SubmitStatus = { state: "error", message: (data.error ?? "Unknown error") + rawDetail };
        setStatuses((s) => ({ ...s, [t.metaName]: status }));
        return status;
      }
      const status: SubmitStatus = { state: "ok", metaStatus: data.status ?? "PENDING", id: data.id ?? "", action: data.action };
      setStatuses((s) => ({ ...s, [t.metaName]: status }));
      return status;
    } catch (e) {
      const status: SubmitStatus = { state: "error", message: e instanceof Error ? e.message : "Network error" };
      setStatuses((s) => ({ ...s, [t.metaName]: status }));
      return status;
    }
  }

  async function handleSubmitAll() {
    setSubmitAll("running");
    for (const t of templates) await submitOne(t);
    setSubmitAll("done");
  }

  const allDone = templates.every((t) => {
    const s = statuses[t.metaName];
    return s?.state === "ok" || s?.state === "error";
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/settings/notifications/whatsapp"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            WhatsApp Settings
          </Link>
          <h1 className="mt-1 text-xl font-bold text-[var(--ink)]">Meta Template Submissions</h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Submit all {templates.length} templates to your Meta WABA — examples use real data from your system.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSyncDb}
            disabled={syncDb === "running"}
            title="Write the current _v2 meta names from code into the system DB so messages use the correct template names"
            className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--panel)] disabled:opacity-60 transition-colors flex items-center gap-1.5"
          >
            {syncDb === "running" ? (
              <><svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>Syncing…</>
            ) : syncDb === "done" ? "✓ DB synced" : syncDb === "error" ? "✕ Sync failed" : "↻ Sync names to DB"}
          </button>
          <button
            onClick={handleSubmitAll}
            disabled={submitAll === "running"}
            className="rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-[#20bc5a] disabled:opacity-60 transition-colors flex items-center gap-2"
          >
            {submitAll === "running" ? (
              <><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>Submitting…</>
            ) : submitAll === "done" ? "✓ Done" : (
              <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>{`Submit all ${templates.length} to Meta`}</>
            )}
          </button>
        </div>
      </div>

      {/* Requirements */}
      <div className="rounded-xl border border-blue-400/30 bg-blue-500/10 p-4 text-[13px] text-blue-900 dark:text-blue-300 space-y-1">
        <p className="font-semibold">Requirements</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li><code className="bg-blue-100 px-1 rounded font-mono text-xs">WHATSAPP_ACCESS_TOKEN</code> needs <strong>whatsapp_business_management</strong> permission</li>
          <li><code className="bg-blue-100 px-1 rounded font-mono text-xs">WHATSAPP_BUSINESS_ACCOUNT_ID</code> must be your WABA ID (not phone number ID)</li>
          <li>All templates are <strong>UTILITY</strong> — approved within minutes</li>
          <li>Once approved, the system sends with real customer data automatically — no further config</li>
        </ul>
      </div>

      {/* Cards */}
      <div className="space-y-2">
        {templates.map((t) => {
          const isOpen = open === t.metaName;
          const st = statuses[t.metaName] ?? { state: "idle" };

          return (
            <div key={t.metaName} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
              {/* Summary row */}
              <div className="flex items-center gap-3 px-5 py-3.5">
                <button type="button" onClick={() => setOpen(isOpen ? null : t.metaName)}
                  className="flex-1 flex items-start gap-3 text-left min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-[var(--ink)]">{t.metaName}</span>
                      <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[12px] font-bold uppercase text-blue-700">{t.category}</span>
                      <span className="rounded-full bg-[var(--panel-strong)] px-2 py-0.5 text-[12px] font-mono text-[var(--ink-muted)]">{t.language}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--ink-muted)] truncate">{t.label} — {t.description}</p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round"
                    className={`shrink-0 mt-1 transition-transform text-[var(--ink-muted)] ${isOpen ? "rotate-180" : ""}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className="shrink-0 flex items-center gap-2">
                  {st.state === "idle" && (
                    <button onClick={() => submitOne(t)}
                      className="rounded-lg border border-[#25D366]/40 bg-[#25D366]/10 px-3 py-1.5 text-xs font-semibold text-[#1a9e4a] hover:bg-[#25D366]/20 transition-colors">
                      Submit
                    </button>
                  )}
                  {st.state === "loading" && (
                    <span className="flex items-center gap-1.5 text-xs text-[var(--ink-muted)]">
                      <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                      Sending…
                    </span>
                  )}
                  {st.state === "ok" && (
                    <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-bold uppercase ${st.metaStatus === "APPROVED" ? "bg-green-500/10 text-green-700" : "bg-amber-500/10 text-amber-700"}`}>
                      {st.action === "updated"
                        ? `↻ Updated · ${st.metaStatus}`
                        : st.metaStatus === "APPROVED"
                          ? "✓ Approved"
                          : `· ${st.metaStatus}`}
                    </span>
                  )}
                  {st.state === "error" && (
                    <button onClick={() => submitOne(t)}
                      className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-[13px] font-bold text-red-700 hover:bg-red-500/20 transition-colors"
                      title={st.message}>
                      ✕ Failed — retry
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded */}
              {isOpen && (
                <div className="border-t border-[var(--line)] px-5 py-4 space-y-4 bg-[var(--bg)]">
                  {st.state === "error" && (
                    <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                      <span className="font-semibold">Error:</span> {st.message}
                    </div>
                  )}
                  {st.state === "ok" && (
                    <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                      {st.action === "updated" ? "↻ Updated existing template" : "✓ Submitted new template"} · Status: <strong>{st.metaStatus}</strong> · ID: <code className="font-mono">{st.id}</code>
                    </div>
                  )}

                  {/* Meta fields */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)] mb-1">Name</p>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-sm font-bold text-[var(--ink)]">{t.metaName}</code>
                        <CopyButton text={t.metaName} />
                      </div>
                    </div>
                    <div>
                      <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)] mb-1">Category</p>
                      <p className="text-sm font-semibold">{t.category}</p>
                    </div>
                    <div>
                      <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)] mb-1">Language</p>
                      <p className="font-mono text-sm font-semibold">{t.language}</p>
                    </div>
                  </div>

                  {/* Body */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Body — submit to Meta as-is</p>
                      <CopyButton text={t.body} />
                    </div>
                    <pre className="whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3.5 text-sm text-[var(--ink)] leading-relaxed font-sans">{t.body}</pre>
                  </div>

                  {/* Variable mapping */}
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)] mb-2">
                      Variable mapping — how the system fills each placeholder at send time
                    </p>
                    <div className="rounded-lg border border-[var(--line)] divide-y divide-[var(--line)] overflow-hidden">
                      {t.varOrder.map((v) => (
                        <div key={v.n} className="grid grid-cols-12 items-center gap-3 px-3 py-2.5 bg-[var(--panel)] text-xs">
                          <span className="col-span-2 font-mono font-bold text-[var(--accent)]">{`{{${v.n}}}`}</span>
                          <span className="col-span-3 font-mono text-[var(--ink-muted)]">{`{${v.systemKey}}`}</span>
                          <span className="col-span-3 text-[var(--ink)] font-medium">{v.name}</span>
                          <span className="col-span-4 font-mono text-[var(--ink-muted)] text-right truncate">{v.liveExample}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[13px] text-[var(--ink-muted)]">
                      Live example column shows real values from your database — this is exactly what will be sent to each customer.
                    </p>
                  </div>

                  {/* Preview */}
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)] mb-1.5">
                      Preview with live data
                    </p>
                    <pre className="whitespace-pre-wrap rounded-lg border border-[#25D366]/20 bg-[#25D366]/5 p-3.5 text-sm text-[var(--ink)] leading-relaxed font-sans">
                      {previewBody(t.body, t.varOrder)}
                    </pre>
                  </div>

                  {/* Trigger */}
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-xs">
                    <span className="font-semibold text-[var(--ink-muted)] uppercase tracking-wide text-[12px]">Trigger: </span>
                    <span className="text-[var(--ink)]">{t.useCase}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {allDone && submitAll === "done" && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-400">
          <p className="font-semibold mb-1">Submission complete</p>
          <p className="text-xs">
            PENDING templates are under review — UTILITY templates approve in minutes.
            Check{" "}
            <a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noreferrer"
              className="underline font-medium">Meta Business Manager</a>{" "}
            for final status. Once approved, messages send automatically with real customer data.
          </p>
        </div>
      )}
    </div>
  );
}
