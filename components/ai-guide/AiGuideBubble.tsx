"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// ── Inline SVG icons (no external icon library required) ──────────────────────

function IconBot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <circle cx="8" cy="16" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconSparkles({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5Z" />
      <path d="M19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75Z" />
      <path d="M5 17l.5 1.5L7 19l-1.5.5L5 21l-.5-1.5L3 19l1.5-.5Z" />
    </svg>
  );
}

function IconMinimize({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="10" y1="14" x2="3" y2="21" />
      <line x1="21" y1="3" x2="14" y2="10" />
    </svg>
  );
}

function IconSend({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function IconX({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconLoader({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = "user" | "model";

interface Message {
  id: string;
  role: Role;
  text: string;
  streaming?: boolean;
  question?: string;
  feedback?: "HELPFUL" | "NOT_HELPFUL";
}

type HistoryEntry = { role: Role; parts: [{ text: string }] };

// ── Helpers ───────────────────────────────────────────────────────────────────

function clientFallbackAnswer(text: string) {
  const message = text.toLowerCase();
  if (
    message.includes("management focus") ||
    message.includes("focus on today") ||
    message.includes("focus today") ||
    message.includes("business focus") ||
    message.includes("decision") ||
    message.includes("ai insights") ||
    message.includes("business copilot") ||
    message.includes("what should management") ||
    message.includes("what should i focus") ||
    message.includes("what needs attention")
  ) {
    return [
      "For management decision-making, use AI Insights rather than the general help guide:",
      "1. Open AI Insights from the sidebar, or go to /ai-insights.",
      "2. Review revenue signal, cash margin signal, open repair load, and inventory risk.",
      "3. Check risks for overdue jobs, stale jobs, awaiting approvals, low stock, overdue invoices, and overdue supplier bills.",
      "4. Use the AI Business Copilot there for live-number questions like: What should management focus on today?",
      "A good daily focus is: clear stuck repairs, follow up client approvals, collect overdue receivables, reorder critical low-stock parts, and review expenses if cash margin is weak.",
    ].join("\n");
  }
  if (
    message.includes("revenue") ||
    message.includes("profit") ||
    message.includes("cash flow") ||
    message.includes("cash margin") ||
    message.includes("receivables") ||
    message.includes("payables") ||
    message.includes("overdue invoice") ||
    message.includes("financial risk")
  ) {
    return [
      "For revenue, profit, cash flow, receivables, and payables analysis:",
      "1. Open AI Insights -> AI Business Copilot.",
      "2. Ask a focused question like: Why might revenue or profit be under pressure?",
      "3. The copilot uses aggregate numbers from repairs, POS, paid invoices, expenses, receivables, supplier bills, and targets.",
      "4. Open Finance -> Reports for formal P&L, Cash Flow, Aged Receivables, Balance Sheet, and Inventory Value reports.",
    ].join("\n");
  }
  if (message.includes("job") || message.includes("intake")) {
    return [
      "To create a job:",
      "1. Go to Jobs -> New Job.",
      "2. Enter the client details and search by phone first to avoid duplicates.",
      "3. Add device type, brand, model, serial/IMEI, accessories, and condition notes.",
      "4. Enter the customer's issue description clearly.",
      "5. Review and submit. The job starts as RECEIVED and appears in the job list.",
      "If it fails, check required fields and whether your role can create jobs.",
    ].join("\n");
  }
  if (message.includes("external") || message.includes("technician")) {
    return [
      "External technician access is restricted:",
      "1. They only see jobs assigned to them.",
      "2. They can see device details, diagnosis summary, parts needed, estimate, and timeline.",
      "3. They must not see client names, phone numbers, emails, invoices, or client pricing history.",
      "4. They can submit external diagnosis, estimate, and timeline updates.",
    ].join("\n");
  }
  if (message.includes("invoice") || message.includes("quote") || message.includes("quotation")) {
    return [
      "For quotations and invoices:",
      "1. Generate quotations after diagnosis when the client estimate is ready.",
      "2. Generate invoices when the job is completed or ready for billing.",
      "3. Use the job Documents tab or the Documents section.",
      "4. Only authorised admin/finance/OPS users should access client pricing documents.",
      "If generation fails, check job status, bill amount, permissions, and branding settings.",
    ].join("\n");
  }
  if (message.includes("part") && (message.includes("add") || message.includes("create") || message.includes("new"))) {
    return [
      "To add parts/items to inventory:",
      "1. Open Inventory -> Parts & Stock.",
      "2. Choose Add Part or New Item.",
      "3. Enter part name, SKU/code, manufacturer, unit cost, quantity on hand, and reorder level.",
      "4. Choose a stock location if your setup uses locations.",
      "5. Save. The part can then be used for repairs, sales, purchase orders, stock counts, and reorder alerts.",
      "6. If stock is coming from a supplier, use Purchase Orders -> Goods Received instead of manually changing quantity.",
    ].join("\n");
  }
  if (message.includes("inventory") || message.includes("stock") || message.includes("part") || message.includes("supplier") || message.includes("purchase")) {
    return [
      "Inventory workflow:",
      "1. Use Inventory -> Parts & Stock to manage items, quantities, costs, and reorder levels.",
      "2. Use Purchase Requests before buying stock internally.",
      "3. Use Purchase Orders for supplier orders.",
      "4. Use Goods Received when stock arrives.",
      "5. Use Stock Counts and Transfers to correct or move stock.",
    ].join("\n");
  }
  if (message.includes("pos") || message.includes("cashier") || message.includes("sale")) {
    return [
      "Sales/POS workflow:",
      "1. POS handles walk-in sales and payments.",
      "2. Cashier Shifts opens/closes cashier sessions and reconciles totals.",
      "3. Sales CRM manages leads, quotations, campaigns, visits, and targets.",
      "4. Documents provides invoices, receipts, delivery notes, credit notes, and refunds.",
    ].join("\n");
  }
  if (message.includes("finance") || message.includes("report") || message.includes("expense") || message.includes("bank")) {
    return [
      "Finance workflow:",
      "1. Expenses records business costs.",
      "2. Bank tracks accounts and transactions.",
      "4. Finance Reports includes P&L, Balance Sheet, Cash Flow, Customer Statements, Aged Receivables, and Inventory Value.",
    ].join("\n");
  }
  if (message.includes("company") || message.includes("organisation") || message.includes("organization") || message.includes("platform") || message.includes("tenant")) {
    return [
      "Platform/company workflow:",
      "1. Platform Admin -> Organisations lists all companies.",
      "2. Open a company to review users, jobs, plan, SMS usage, billing, and settings.",
      "3. Platform admin can activate/deactivate companies and change plans.",
      "4. Tenant admins only manage their own company workspace.",
    ].join("\n");
  }
  if (message.includes("page") || message.includes("menu") || message.includes("module") || message.includes("tour")) {
    return [
      "Duuka ProMax page tour:",
      "1. Dashboard: summary and shortcuts.",
      "2. Jobs: repair job tracking, assignments, photos, documents, and audit history.",
      "3. Intake: customer repair requests before job creation.",
      "4. Clients: customer records and job history for authorised users.",
      "5. Technicians: technician work, assignments, and payouts.",
      "6. Field Visits: onsite visit scheduling and sign-off.",
      "7. Inventory: stock, suppliers, purchase requests/orders, goods received, counts, and transfers.",
      "8. POS/Sales: counter sales, cashier shifts, CRM leads, campaigns, visits, and targets.",
      "9. Documents: job cards, invoices, quotations, receipts, delivery notes, credit notes, and refunds.",
      "10. Finance: expenses, bank, accounts, recurring billing, and reports.",
      "11. Settings: users, profile, branding, notifications, audit logs, and maintenance.",
      "12. Platform Admin: organisations, plans, billing, activation, audit, and platform settings.",
      "The pages a user sees depend on their role and permissions.",
    ].join("\n");
  }
  return "The online AI service is unavailable, but I can still help with Duuka ProMax system-wide workflows: repair jobs, clients, inventory, suppliers, POS, sales CRM, finance, reports, documents, WhatsApp/email, users, settings, and platform organisations. Ask about any module and I will give step-by-step guidance.";
}

function sanitizeAssistantText(text: string, prompt = "") {
  if (
    text.includes("AI assistant is temporarily unavailable")
    || text.includes("AI assistant is not configured")
    || text.includes("temporarily unavailable. Please try again")
  ) {
    return clientFallbackAnswer(prompt || text);
  }
  return text;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

/** Very small Markdown-like renderer: bold, inline code, numbered/bullet lists. */
function renderText(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={i} className="h-2" />);
      return;
    }

    // Ordered list
    const olMatch = /^(\d+)\.\s+(.+)/.exec(trimmed);
    if (olMatch) {
      elements.push(
        <div key={i} className="flex gap-1.5">
          <span className="shrink-0 font-semibold text-primary">{olMatch[1]}.</span>
          <span>{inlineFormat(olMatch[2])}</span>
        </div>,
      );
      return;
    }

    // Unordered list
    const ulMatch = /^[-*•]\s+(.+)/.exec(trimmed);
    if (ulMatch) {
      elements.push(
        <div key={i} className="flex gap-1.5">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <span>{inlineFormat(ulMatch[1])}</span>
        </div>,
      );
      return;
    }

    // Heading (##)
    if (trimmed.startsWith("## ")) {
      elements.push(
        <p key={i} className="mt-1 font-semibold text-foreground">
          {trimmed.slice(3)}
        </p>,
      );
      return;
    }

    elements.push(<p key={i}>{inlineFormat(trimmed)}</p>);
  });

  return elements;
}

/** Bold (**text**) and inline code (`code`) */
function inlineFormat(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

// ── Suggestion chips ──────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "How do I create a new job?",
  "What does REFERRED status mean?",
  "How do I generate an invoice?",
  "How do I add inventory items?",
];

// ── Main component ────────────────────────────────────────────────────────────

export function AiGuideBubble() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "model",
      text: "Hi! I'm your Duuka ProMax guide. Ask me anything about using the system — creating jobs, managing inventory, finance reports, and more.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Replace stale/raw backend errors that may already be in component state after deploys.
  useEffect(() => {
    setMessages((prev) => {
      let changed = false;
      const next = prev.map((message) => {
        if (message.role !== "model") return message;
        const text = sanitizeAssistantText(message.text);
        if (text === message.text) return message;
        changed = true;
        return { ...message, text, streaming: false };
      });
      return changed ? next : prev;
    });
  }, []);

  // Focus input when panel opens
  useEffect(() => {
    if (open && !minimised) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open, minimised]);

  // Build history array for API (exclude welcome message, exclude streaming placeholder)
  function buildHistory(): HistoryEntry[] {
    return messages
      .filter((m) => m.id !== "welcome" && !m.streaming)
      .map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  }

  async function send(text: string) {
    if (!text.trim() || busy) return;

    const userMsg: Message = { id: uid(), role: "user", text: text.trim() };
    const assistantId = uid();
    const assistantMsg: Message = { id: assistantId, role: "model", text: "", streaming: true, question: text.trim() };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setBusy(true);

    try {
      const history = buildHistory();
      const res = await fetch("/api/ai-guide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history, page: pathname }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "Unknown error");
        const displayText = res.status >= 500 ? clientFallbackAnswer(text) : sanitizeAssistantText(errText, text);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, text: displayText, streaming: false } : m,
          ),
        );
        return;
      }

      // Stream chunks into the assistant message
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const snapshot = accumulated;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, text: snapshot } : m,
          ),
        );
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, streaming: false } : m,
        ),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, text: "Connection error. Please try again.", streaming: false }
            : m,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function rate(message: Message, rating: "HELPFUL" | "NOT_HELPFUL") {
    if (!message.question || !message.text || message.streaming) return;
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, feedback: rating } : m)));
    await fetch("/api/ai-feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        feature: "AI_GUIDE",
        question: message.question,
        answer: message.text,
        rating,
      }),
    }).catch(() => {});
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setMinimised(false); }}
          className="fixed bottom-20 right-4 z-50 flex h-13 w-13 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95 md:bottom-6 md:right-6"
          aria-label="Open AI guide"
        >
          <IconSparkles className="h-5 w-5" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className={`fixed bottom-20 right-4 z-50 flex w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl transition-all md:bottom-6 md:right-6 md:w-[380px] ${minimised ? "h-14" : "h-[520px] max-h-[80dvh]"}`}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center gap-2.5 border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <IconBot className="h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">Duuka AI Guide</p>
              <p className="truncate text-[11px] opacity-80">Ask me how to use the system</p>
            </div>
            <button
              onClick={() => setMinimised((v) => !v)}
              className="rounded p-1 hover:bg-white/20"
              aria-label={minimised ? "Expand" : "Minimise"}
            >
              <IconMinimize className="h-4 w-4" />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1 hover:bg-white/20"
              aria-label="Close"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>

          {/* Body — hidden when minimised */}
          {!minimised && (
            <>
              {/* Messages */}
              <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "model" && (
                      <div className="mr-2 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <IconBot className="h-3.5 w-3.5 text-primary" />
                      </div>
                    )}
                    <div
                      className={`max-w-[82%] space-y-1 rounded-2xl px-3.5 py-2.5 leading-relaxed ${
                        msg.role === "user"
                          ? "rounded-br-sm bg-primary text-primary-foreground"
                          : "rounded-bl-sm bg-muted text-foreground"
                      }`}
                    >
                      {msg.role === "model" ? (
                        <>
                          {renderText(msg.text)}
                          {msg.streaming && (
                            <span className="inline-block h-3.5 w-0.5 animate-pulse bg-current opacity-60" />
                          )}
                        </>
                      ) : (
                        <p>{msg.text}</p>
                      )}
                    </div>
                    {msg.role === "model" && msg.id !== "welcome" && !msg.streaming && (
                      <div className="ml-2 mt-1 flex items-center gap-1 self-end">
                        <button
                          type="button"
                          onClick={() => rate(msg, "HELPFUL")}
                          className={`rounded-full border px-2 py-0.5 text-[10px] transition ${msg.feedback === "HELPFUL" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600" : "border-border text-muted-foreground hover:text-foreground"}`}
                          aria-label="Mark AI answer helpful"
                        >
                          Helpful
                        </button>
                        <button
                          type="button"
                          onClick={() => rate(msg, "NOT_HELPFUL")}
                          className={`rounded-full border px-2 py-0.5 text-[10px] transition ${msg.feedback === "NOT_HELPFUL" ? "border-amber-500/40 bg-amber-500/10 text-amber-600" : "border-border text-muted-foreground hover:text-foreground"}`}
                          aria-label="Mark AI answer not helpful"
                        >
                          Not helpful
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {/* Suggestion chips — only show after welcome, no conversation yet */}
                {messages.length === 1 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        disabled={busy}
                        className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="shrink-0 border-t border-border p-3">
                <div className="flex items-end gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Ask anything…"
                    rows={1}
                    disabled={busy}
                    className="max-h-32 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
                    style={{ minHeight: "1.5rem" }}
                  />
                  <button
                    onClick={() => send(input)}
                    disabled={busy || !input.trim()}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                    aria-label="Send"
                  >
                    {busy ? (
                      <IconLoader className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <IconSend className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                  Powered by Google Gemini · May make mistakes
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
