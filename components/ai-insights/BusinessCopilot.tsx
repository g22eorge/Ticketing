"use client";

import { FormEvent, useState, useTransition } from "react";

type Message = {
  role: "user" | "assistant";
  text: string;
  question?: string;
  feedback?: "HELPFUL" | "NOT_HELPFUL";
};

const suggestedQuestions = [
  "What should management focus on today?",
  "Give me a daily owner briefing with risks and actions.",
  "Which repair bottlenecks need action?",
  "What inventory risks should we fix first?",
  "Why might revenue or profit be under pressure?",
  "Which receivables and payables need attention?",
  "How are sales pipeline and targets performing?",
];

export function BusinessCopilot() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Ask a management question about repairs, sales, finance, inventory, targets, receivables, or operational risks. I will answer using tenant-scoped aggregate data only.",
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function ask(nextQuestion?: string) {
    const text = (nextQuestion ?? question).trim();
    if (!text || isPending) return;

    setQuestion("");
    setError(null);
    setMessages((current) => [...current, { role: "user", text }]);

    startTransition(async () => {
      try {
        const response = await fetch("/api/ai-business-copilot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: text }),
        });
        const answer = await response.text();
        if (!response.ok) throw new Error(answer || "AI business copilot failed.");
        setMessages((current) => [...current, { role: "assistant", text: answer, question: text }]);
      } catch (err) {
        const message = err instanceof Error ? err.message : "AI business copilot failed.";
        setError(message);
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            text: "I could not generate a live AI answer. Check the AI configuration and try again, or use the static insights on this page.",
          },
        ]);
      }
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask();
  }

  async function rate(index: number, message: Message, rating: "HELPFUL" | "NOT_HELPFUL") {
    if (!message.question || !message.text) return;
    setMessages((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, feedback: rating } : item)));
    await fetch("/api/ai-feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feature: "AI_BUSINESS_COPILOT", question: message.question, answer: message.text, rating }),
    }).catch(() => {});
  }

  return (
    <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Ask Your Business</p>
          <h2 className="mt-1 text-lg font-bold text-[var(--ink)]">AI Business Copilot</h2>
          <p className="mt-1 max-w-2xl text-xs text-[var(--ink-muted)]">
            Answers are grounded in aggregate repair, sales, finance, inventory, target, receivable, and payable metrics. Client PII and private job notes are not sent to the model.
          </p>
        </div>
        <span className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-text)]">
          Aggregate Data
        </span>
      </div>

      <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] p-3">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={message.role === "user" ? "ml-auto max-w-[88%]" : "mr-auto max-w-[92%]"}>
            <div
              className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-6 ${
                message.role === "user"
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--line)] bg-[var(--panel)] text-[var(--ink)]"
              }`}
            >
              {message.text}
            </div>
            {message.role === "assistant" && message.question ? (
              <div className="mt-1 flex gap-1">
                <button type="button" onClick={() => rate(index, message, "HELPFUL")} className={`rounded-full border px-2 py-0.5 text-[12px] ${message.feedback === "HELPFUL" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600" : "border-[var(--line)] text-[var(--ink-muted)]"}`}>Helpful</button>
                <button type="button" onClick={() => rate(index, message, "NOT_HELPFUL")} className={`rounded-full border px-2 py-0.5 text-[12px] ${message.feedback === "NOT_HELPFUL" ? "border-amber-500/40 bg-amber-500/10 text-amber-600" : "border-[var(--line)] text-[var(--ink-muted)]"}`}>Not helpful</button>
              </div>
            ) : null}
          </div>
        ))}
        {isPending ? (
          <div className="mr-auto max-w-[92%] rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink-muted)]">
            Analysing live business metrics...
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {suggestedQuestions.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => ask(item)}
            disabled={isPending}
            className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--ink)] disabled:opacity-60"
          >
            {item}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask: What needs management attention today and why?"
          className="min-h-11 flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-muted)] focus:border-[var(--accent)]/60"
          maxLength={1200}
        />
        <button
          type="submit"
          disabled={isPending || !question.trim()}
          className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Thinking..." : "Ask AI"}
        </button>
      </form>

      {error ? <p className="mt-2 text-xs text-amber-600">{error}</p> : null}
    </section>
  );
}
