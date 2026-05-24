"use client";

import { useEffect, useRef, useState } from "react";

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
}

type HistoryEntry = { role: Role; parts: [{ text: string }] };

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    const assistantMsg: Message = { id: assistantId, role: "model", text: "", streaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setBusy(true);

    try {
      const history = buildHistory();
      const res = await fetch("/api/ai-guide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "Unknown error");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, text: errText, streaming: false } : m,
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
