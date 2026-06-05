"use client";

import { FormEvent, useState, useTransition, useEffect, useRef } from "react";

type Message = {
  role: "user" | "assistant";
  text: string;
  question?: string;
  feedback?: "HELPFUL" | "NOT_HELPFUL";
};

const SUGGESTED = [
  "What should I focus on today?",
  "Daily owner briefing — risks and actions.",
  "Which repairs are blocked or overdue?",
  "What inventory risks need fixing first?",
  "Why might revenue be under pressure?",
  "Which receivables need urgent collection?",
  "How is the sales pipeline performing?",
];

/** Render AI text with basic formatting: bold **…**, section headers, numbered lists */
function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={key++} className="h-2" />);
      continue;
    }
    // Section header: ends with colon or is ALL CAPS with no period
    const isHeader =
      /^[A-Z][A-Za-z\s&/-]{2,40}:$/.test(trimmed) ||
      (/^[A-Z][A-Z\s/-]{3,}$/.test(trimmed) && !trimmed.includes("."));

    if (isHeader) {
      elements.push(
        <p key={key++} className="mt-3 mb-0.5 text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
          {trimmed.replace(/:$/, "")}
        </p>
      );
      continue;
    }
    // Numbered list item
    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      elements.push(
        <div key={key++} className="flex gap-2 text-[13px] leading-6 text-[var(--ink)]">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[12px] font-bold text-[var(--accent)]">
            {numMatch[1]}
          </span>
          <span>{numMatch[2]}</span>
        </div>
      );
      continue;
    }
    // Bullet
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      elements.push(
        <div key={key++} className="flex gap-2 text-[13px] leading-6 text-[var(--ink)]">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]/50" />
          <span>{trimmed.replace(/^[-•]\s+/, "")}</span>
        </div>
      );
      continue;
    }
    // Normal line — render **bold** inline
    const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
    elements.push(
      <p key={key++} className="text-[13px] leading-6 text-[var(--ink)]">
        {parts.map((part, i) =>
          part.startsWith("**") && part.endsWith("**")
            ? <strong key={i} className="font-semibold text-[var(--ink)]">{part.slice(2, -2)}</strong>
            : part
        )}
      </p>
    );
  }
  return <div className="space-y-0.5">{elements}</div>;
}

export function BusinessCopilot() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Ask a management question about repairs, sales, finance, inventory, targets, receivables, or operational risks.\n\nI answer using your live business data only — no client PII, no invented numbers.",
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isPending]);

  function ask(nextQuestion?: string) {
    const text = (nextQuestion ?? question).trim();
    if (!text || isPending) return;
    setQuestion("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", text }]);

    startTransition(async () => {
      try {
        const res = await fetch("/api/ai-business-copilot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: text }),
        });
        const answer = await res.text();
        if (!res.ok) throw new Error(answer || "AI copilot failed.");
        setMessages((prev) => [...prev, { role: "assistant", text: answer, question: text }]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "AI copilot failed.";
        setError(msg);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: "I could not generate a live answer right now. Check AI configuration or try again shortly." },
        ]);
      }
    });
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    ask();
  }

  async function rate(index: number, message: Message, rating: "HELPFUL" | "NOT_HELPFUL") {
    if (!message.question || !message.text) return;
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, feedback: rating } : m)));
    await fetch("/api/ai-feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feature: "AI_BUSINESS_COPILOT", question: message.question, answer: message.text, rating }),
    }).catch(() => {});
  }

  return (
    <section className="panel-shadow flex flex-col rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--panel-strong)]/60 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/15">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500" aria-hidden>
              <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1H1a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
              <path d="M7.5 13.5c.83 0 1.5-.67 1.5-1.5S8.33 10.5 7.5 10.5 6 11.17 6 12s.67 1.5 1.5 1.5z"/>
              <path d="M16.5 13.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5S15 11.17 15 12s.67 1.5 1.5 1.5z"/>
            </svg>
          </span>
          <div>
            <p className="text-[13px] font-bold text-[var(--ink)]">AI Business Copilot</p>
            <p className="text-[12px] text-[var(--ink-muted)]">Live data · no client PII</p>
          </div>
        </div>
        <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-0.5 text-[12px] font-semibold text-violet-600 dark:text-violet-400">
          Aggregate only
        </span>
      </div>

      {/* Message thread */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
        style={{ minHeight: 240, maxHeight: 420 }}
      >
        {messages.map((msg, index) => (
          <div key={index} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
            {/* Bubble */}
            <div className={`max-w-[88%] rounded-2xl px-4 py-3 ${
              msg.role === "user"
                ? "rounded-br-sm bg-[var(--accent)] text-white text-[13px] leading-6"
                : "rounded-bl-sm border border-[var(--line)] bg-[var(--panel-strong)]"
            }`}>
              {msg.role === "user"
                ? <p className="text-[13px] leading-6">{msg.text}</p>
                : <FormattedText text={msg.text} />
              }
            </div>

            {/* Feedback row — only on assistant messages that had a question */}
            {msg.role === "assistant" && msg.question && (
              <div className="mt-1.5 flex items-center gap-1.5 px-1">
                <p className="text-[12px] text-[var(--ink-muted)]">Was this helpful?</p>
                <button
                  type="button"
                  onClick={() => rate(index, msg, "HELPFUL")}
                  className={`flex h-7 w-7 items-center justify-center rounded-full border text-base transition ${
                    msg.feedback === "HELPFUL"
                      ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-600"
                      : "border-[var(--line)] text-[var(--ink-muted)] hover:border-emerald-400/50 hover:text-emerald-600"
                  }`}
                  title="Helpful"
                  aria-label="Mark as helpful"
                >
                  👍
                </button>
                <button
                  type="button"
                  onClick={() => rate(index, msg, "NOT_HELPFUL")}
                  className={`flex h-7 w-7 items-center justify-center rounded-full border text-base transition ${
                    msg.feedback === "NOT_HELPFUL"
                      ? "border-amber-400/50 bg-amber-500/15 text-amber-600"
                      : "border-[var(--line)] text-[var(--ink-muted)] hover:border-amber-400/50 hover:text-amber-600"
                  }`}
                  title="Not helpful"
                  aria-label="Mark as not helpful"
                >
                  👎
                </button>
                {msg.feedback && (
                  <span className={`text-[12px] font-medium ${msg.feedback === "HELPFUL" ? "text-emerald-600" : "text-amber-600"}`}>
                    {msg.feedback === "HELPFUL" ? "Thanks!" : "Noted — we'll improve."}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Thinking indicator */}
        {isPending && (
          <div className="flex items-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-[var(--ink-muted)] animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
              <span className="text-[13px] text-[var(--ink-muted)]">Analysing your business data…</span>
            </div>
          </div>
        )}
      </div>

      {/* Suggested questions */}
      <div className="flex gap-2 overflow-x-auto border-t border-[var(--line)] px-4 py-2.5 scrollbar-none">
        {SUGGESTED.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => ask(q)}
            disabled={isPending}
            className="shrink-0 rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[12px] font-medium text-[var(--ink-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--ink)] disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-[var(--line)] px-4 py-3">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); }
          }}
          placeholder="Ask anything about your business… (Enter to send)"
          rows={2}
          maxLength={1200}
          className="flex-1 resize-none rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-[13px] text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-muted)] focus:border-[var(--accent)]/60 focus:ring-1 focus:ring-[var(--accent)]/20"
        />
        <button
          type="submit"
          disabled={isPending || !question.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Send"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z"/>
          </svg>
        </button>
      </form>

      {error && (
        <p className="border-t border-[var(--line)] px-4 py-2 text-[12px] text-amber-600">{error}</p>
      )}
    </section>
  );
}
