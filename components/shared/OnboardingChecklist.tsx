"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** One-time celebration banner after all setup steps are complete. */
export function OnboardingComplete({ orgId }: { orgId: string }) {
  const storageKey = `onboarding-complete-dismissed:${orgId}`;
  const [hydrated, setHydrated] = useState<{ mounted: boolean; dismissed: boolean }>({ mounted: false, dismissed: false });
  const { mounted, dismissed } = hydrated;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated({ mounted: true, dismissed: localStorage.getItem(storageKey) === "1" });
  }, [storageKey]);

  if (!mounted || dismissed) return null;

  return (
    <section className="panel-shadow flex items-center gap-4 rounded-2xl border border-[var(--gold)]/40 bg-gradient-to-r from-[var(--gold)]/10 to-transparent p-4">
      <span className="text-2xl">🎉</span>
      <div className="flex-1">
        <p className="font-semibold text-[var(--ink)]">Your workspace is fully set up!</p>
        <p className="text-sm text-[var(--ink-muted)]">You&apos;re ready to manage repairs like a pro.</p>
      </div>
      <button
        onClick={() => { localStorage.setItem(storageKey, "1"); setHydrated((h) => ({ ...h, dismissed: true })); }}
        className="shrink-0 rounded-lg p-1.5 text-[var(--ink-muted)] transition hover:bg-[var(--border)] hover:text-[var(--ink)]"
        aria-label="Dismiss"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
          <path d="M12.854 3.854a.5.5 0 0 0-.708-.708L8 7.293 3.854 3.146a.5.5 0 1 0-.708.708L7.293 8l-4.147 4.146a.5.5 0 0 0 .708.708L8 8.707l4.146 4.147a.5.5 0 0 0 .708-.708L8.707 8z" />
        </svg>
      </button>
    </section>
  );
}

import type { ChecklistStep } from "@/lib/onboarding-checklist";

type Props = {
  orgId: string;
  steps: ChecklistStep[];
  doneCount: number;
  totalCount: number;
};

export function OnboardingChecklist({ orgId, steps, doneCount, totalCount }: Props) {
  const storageKey = `onboarding-dismissed:${orgId}`;
  const [hydrated, setHydrated] = useState<{ mounted: boolean; dismissed: boolean }>({ mounted: false, dismissed: false });
  const { mounted, dismissed } = hydrated;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated({ mounted: true, dismissed: localStorage.getItem(storageKey) === "1" });
  }, [storageKey]);

  if (!mounted || dismissed) return null;

  const pct = Math.round((doneCount / totalCount) * 100);

  function dismiss() {
    localStorage.setItem(storageKey, "1");
    setHydrated((h) => ({ ...h, dismissed: true }));
  }

  return (
    <section className="panel-shadow rounded-2xl border border-[var(--gold)]/30 bg-gradient-to-br from-[var(--panel)] to-[var(--gold)]/5 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--gold)]">
            Getting started
          </p>
          <h2 className="mt-0.5 text-base font-bold text-[var(--ink)]">
            Set up your workspace
          </h2>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            {doneCount} of {totalCount} steps complete
          </p>
        </div>
        <button
          onClick={dismiss}
          className="mt-0.5 shrink-0 rounded-lg p-1.5 text-[var(--ink-muted)] transition hover:bg-[var(--border)] hover:text-[var(--ink)]"
          aria-label="Dismiss setup guide"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path d="M12.854 3.854a.5.5 0 0 0-.708-.708L8 7.293 3.854 3.146a.5.5 0 1 0-.708.708L7.293 8l-4.147 4.146a.5.5 0 0 0 .708.708L8 8.707l4.146 4.147a.5.5 0 0 0 .708-.708L8.707 8z" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="h-full rounded-full bg-[var(--gold)] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${
              step.done
                ? "border-[var(--border)] bg-[var(--border)]/40 opacity-60"
                : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--gold)]/40"
            }`}
          >
            {/* Tick / Circle */}
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
              step.done
                ? "border-[var(--gold)] bg-[var(--gold)]"
                : "border-[var(--line)]"
            }`}>
              {step.done && (
                <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3">
                  <path d="M2 6l3 3 5-5" stroke="black" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>

            {/* Text */}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${step.done ? "line-through text-[var(--ink-muted)]" : "text-[var(--ink)]"}`}>
                {step.title}
              </p>
              {!step.done && (
                <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{step.description}</p>
              )}
            </div>

            {/* CTA */}
            {!step.done && (
              <Link
                href={step.href}
                className="btn-premium shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
              >
                {step.cta} →
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
