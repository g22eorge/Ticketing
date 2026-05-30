"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname } from "next/navigation";

// ── Icons ─────────────────────────────────────────────────────────────────────

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

function IconX({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
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

function IconLoader({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`animate-spin ${className}`} aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

// ── Markdown-lite renderer ────────────────────────────────────────────────────

function renderText(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("### ")) { nodes.push(<p key={i} className="font-semibold text-sm mt-2 mb-0.5">{line.slice(4)}</p>); }
    else if (line.startsWith("## ")) { nodes.push(<p key={i} className="font-bold text-sm mt-3 mb-1">{line.slice(3)}</p>); }
    else if (line.startsWith("- ") || line.startsWith("• ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("• "))) {
        items.push(lines[i].slice(2)); i++;
      }
      nodes.push(<ul key={`ul-${i}`} className="list-disc pl-4 space-y-0.5 my-1">{items.map((it, j) => <li key={j}>{inlineFormat(it)}</li>)}</ul>);
      continue;
    } else if (line.trim() === "") { nodes.push(<br key={i} />); }
    else { nodes.push(<p key={i} className="mb-0.5">{inlineFormat(line)}</p>); }
    i++;
  }
  return nodes;
}

function inlineFormat(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`")) return <code key={i} className="rounded bg-black/10 px-1 py-0.5 text-[11px] font-mono">{p.slice(1, -1)}</code>;
    return p;
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Message = {
  id: string;
  role: "user" | "model";
  text: string;
  streaming?: boolean;
  question?: string;
  feedback?: "up" | "down";
};

// ── Drag position persistence ─────────────────────────────────────────────────

const BUBBLE_SIZE = 52;
const MARGIN = 16;
const STORAGE_KEY = "ai-bubble-pos";

function getDefaultPos() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as { x: number; y: number };
  } catch { /**/ }
  return {
    x: window.innerWidth  - BUBBLE_SIZE - MARGIN,
    y: window.innerHeight - BUBBLE_SIZE - 88,
  };
}

function clamp(x: number, y: number) {
  return {
    x: Math.max(MARGIN, Math.min(x, window.innerWidth  - BUBBLE_SIZE - MARGIN)),
    y: Math.max(MARGIN, Math.min(y, window.innerHeight - BUBBLE_SIZE - MARGIN)),
  };
}

const SUGGESTIONS = [
  "How do I create a new job?",
  "What does REFERRED status mean?",
  "How do I generate an invoice?",
  "How do I add inventory items?",
];

// ── Main component ────────────────────────────────────────────────────────────

export function AiGuideBubble() {
  const pathname = usePathname();
  const [open, setOpen]             = useState(false);
  const [minimised, setMinimised]   = useState(false);
  const [messages, setMessages]     = useState<Message[]>([{
    id: "welcome", role: "model",
    text: "Hi! I'm your Duuka ProMax guide. Ask me anything about using the system — creating jobs, managing inventory, finance reports, and more.",
  }]);
  const [inputValue, setInputValue] = useState("");
  const [busy, setBusy]             = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);

  // ── Drag ──────────────────────────────────────────────────────────────────
  const [pos, setPos]   = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const didDrag = useRef(false);

  useEffect(() => { setPos(getDefaultPos()); }, []);

  const onPtrDown = useCallback((e: React.PointerEvent) => {
    if (open) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, ox: pos?.x ?? 0, oy: pos?.y ?? 0 };
    didDrag.current = false;
  }, [open, pos]);

  const onPtrMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.sx;
    const dy = e.clientY - drag.current.sy;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDrag.current = true;
    setPos(clamp(drag.current.ox + dx, drag.current.oy + dy));
  }, []);

  const onPtrUp = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    if (!didDrag.current) {
      setOpen(true); setMinimised(false);
    } else {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch { /**/ }
    }
  }, [pos]);

  // Close panel on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send ──────────────────────────────────────────────────────────────────
  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInputValue("");
    setBusy(true);
    const userMsg: Message = { id: Date.now().toString(), role: "user", text: q };
    const aiMsg: Message   = { id: `ai-${Date.now()}`, role: "model", text: "", streaming: true, question: q };
    setMessages((p) => [...p, userMsg, aiMsg]);
    try {
      const res = await fetch("/api/ai-guide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: q, history: messages.map((m) => ({ role: m.role, text: m.text })) }),
      });
      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let   full   = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value);
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const d = JSON.parse(line.slice(6));
              if (d.text) { full += d.text; setMessages((p) => p.map((m) => m.id === aiMsg.id ? { ...m, text: full, streaming: true } : m)); }
            } catch { /**/ }
          }
        }
      }
      setMessages((p) => p.map((m) => m.id === aiMsg.id ? { ...m, text: full, streaming: false } : m));
    } catch {
      setMessages((p) => p.map((m) => m.id === aiMsg.id ? { ...m, text: "Sorry, something went wrong. Please try again.", streaming: false } : m));
    } finally {
      setBusy(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(inputValue); }
  }

  // Compute panel position relative to bubble
  const panelPos = pos ? (() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = Math.min(360, vw - MARGIN * 2);
    const ph = minimised ? 56 : Math.min(500, vh * 0.72);
    const left = Math.max(MARGIN, Math.min(pos.x + BUBBLE_SIZE / 2 - pw / 2, vw - pw - MARGIN));
    const spaceBelow = vh - (pos.y + BUBBLE_SIZE + 8);
    const top = spaceBelow >= ph
      ? pos.y + BUBBLE_SIZE + 8
      : Math.max(MARGIN, pos.y - ph - 8);
    return { left, top, width: pw };
  })() : null;

  if (!pos) return null;

  return (
    <div ref={wrapRef} className="lg:hidden">

      {/* ── Bubble button — always visible, transforms when open ── */}
      <button
        onPointerDown={onPtrDown}
        onPointerMove={onPtrMove}
        onPointerUp={onPtrUp}
        aria-label={open ? "Close AI Guide" : "Open AI Guide"}
        aria-expanded={open}
        className="touch-none select-none fixed z-[60] flex h-[52px] w-[52px] items-center justify-center rounded-full shadow-[0_0_0_6px_rgba(212,175,55,0.12),0_12px_32px_rgba(0,0,0,0.4)] transition-transform duration-150 active:scale-95"
        style={{
          left: pos.x, top: pos.y,
          background: "var(--accent)",
        }}
      >
        {/* Icon morphs: sparkles → X */}
        <span className={`absolute transition-all duration-200 ${open ? "opacity-0 scale-50 rotate-90" : "opacity-100 scale-100 rotate-0"}`}>
          <IconSparkles className="h-[22px] w-[22px] text-black" />
        </span>
        <span className={`absolute transition-all duration-200 ${open ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-50 -rotate-90"}`}>
          <IconX className="h-[22px] w-[22px] text-black" />
        </span>
      </button>

      {/* ── Chat panel — slides in from bubble position ── */}
      {panelPos && (
        <div
          style={{
            position: "fixed",
            left: panelPos.left,
            top: panelPos.top,
            width: panelPos.width,
            zIndex: 59,
            // Slide in animation
            animation: open ? "aiBubbleIn 200ms cubic-bezier(0.34,1.56,0.64,1) both" : undefined,
            pointerEvents: open ? "auto" : "none",
            opacity: open ? 1 : 0,
            transform: open ? "scale(1) translateY(0)" : "scale(0.85) translateY(12px)",
            transition: "opacity 180ms ease, transform 180ms ease",
            transformOrigin: "bottom center",
          }}
          className="flex flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-2xl"
        >
          {/* Header */}
          <div
            className="flex shrink-0 cursor-pointer items-center gap-2.5 px-4 py-3"
            style={{ background: "var(--accent)" }}
            onClick={() => setMinimised((v) => !v)}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/20">
              <IconBot className="h-4 w-4 text-black" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-black leading-tight text-black">Duuka AI Guide</p>
              <p className="truncate text-[10px] font-medium text-black/60">
                {minimised ? "Tap to expand" : "Ask me anything"}
              </p>
            </div>
            {/* Chevron indicates minimise/expand */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`shrink-0 opacity-60 transition-transform duration-200 ${minimised ? "rotate-180" : "rotate-0"}`} aria-hidden>
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>

          {/* Body */}
          <div className={`flex flex-col overflow-hidden transition-[max-height] duration-300 ease-in-out ${minimised ? "max-h-0" : "max-h-[440px]"}`}>

            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto p-4 text-[13px]" style={{ maxHeight: 320 }}>
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "model" && (
                    <div className="mr-2 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15">
                      <IconBot className="h-3.5 w-3.5 text-[var(--accent)]" />
                    </div>
                  )}
                  <div className={`max-w-[82%] rounded-2xl px-3 py-2 leading-relaxed ${
                    msg.role === "user"
                      ? "rounded-br-sm bg-[var(--accent)] text-black"
                      : "rounded-bl-sm bg-[var(--panel-strong)] text-[var(--ink)]"
                  }`}>
                    {msg.role === "model" ? (
                      <>
                        {renderText(msg.text)}
                        {msg.streaming && <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-current opacity-50" />}
                      </>
                    ) : <p>{msg.text}</p>}
                  </div>
                </div>
              ))}
              {busy && messages[messages.length - 1]?.streaming !== true && (
                <div className="flex justify-start">
                  <div className="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15">
                    <IconLoader className="h-3.5 w-3.5 text-[var(--accent)]" />
                  </div>
                  <div className="rounded-2xl rounded-bl-sm bg-[var(--panel-strong)] px-3 py-2 text-[var(--ink-muted)]">…</div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Suggestions — only when no user messages yet */}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-1.5 px-4 pb-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}
                    className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-2.5 py-1 text-[11px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/15">
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="border-t border-[var(--line)] px-3 py-2.5 flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask anything…"
                rows={1}
                className="min-h-[36px] flex-1 resize-none rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)] focus:border-[var(--accent)]/50"
                style={{ maxHeight: 80 }}
              />
              <button
                onClick={() => send(inputValue)}
                disabled={busy || !inputValue.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-black transition disabled:opacity-40 active:scale-95"
                aria-label="Send"
              >
                {busy ? <IconLoader className="h-4 w-4" /> : <IconSend className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes aiBubbleIn {
          from { opacity: 0; transform: scale(0.8) translateY(16px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
