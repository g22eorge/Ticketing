import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { FLW_PLAN_PRICES, FLW_CURRENCY } from "@/lib/flutterwave";
import { PLAN_LIMITS } from "@/lib/plan-limits";

export const metadata: Metadata = {
  title: "Repair Manager — Repair Shop Management for Uganda",
  description:
    "Run your repair business smarter. Job tracking, client management, technician workflows, invoicing, and billing — built for Ugandan repair shops.",
  alternates: { canonical: "/" },
};

// ── Static data ───────────────────────────────────────────────────────────────

const features = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    title: "Job tracking",
    body: "From intake to pickup — every status transition logged with a full audit trail.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
    title: "Role-based access",
    body: "Admins, ops, internal techs, and external techs — each sees only what they need.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    title: "Client portal & intake",
    body: "Public repair request form with WhatsApp notifications — no phone tag.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </svg>
    ),
    title: "Invoicing & payments",
    body: "Generate branded invoices and track external technician bills — all in one place.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    title: "Inventory management",
    body: "Parts catalogue with reorder alerts — never get caught out mid-repair.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
      </svg>
    ),
    title: "Reports & analytics",
    body: "Revenue trends, job volumes, device type breakdowns — understand your business.",
  },
];

const plans = [
  {
    key: "STARTER" as const,
    label: "Starter",
    price: null as number | null,
    desc: "Everything you need to get started, free forever.",
    features: [
      `Up to ${PLAN_LIMITS.STARTER.maxUsers} team members`,
      `${PLAN_LIMITS.STARTER.maxJobsPerMonth} jobs per month`,
      `${PLAN_LIMITS.STARTER.maxParts} inventory SKUs`,
      "Job tracking & audit trail",
      "Client management",
      "Public intake form",
      "WhatsApp notifications",
    ],
    cta: "Start free",
    highlight: false,
  },
  {
    key: "GROWTH" as const,
    label: "Growth",
    price: FLW_PLAN_PRICES.GROWTH,
    desc: "For growing shops that need more capacity and branding.",
    features: [
      `Up to ${PLAN_LIMITS.GROWTH.maxUsers} team members`,
      `${PLAN_LIMITS.GROWTH.maxJobsPerMonth} jobs per month`,
      `${PLAN_LIMITS.GROWTH.maxParts} inventory SKUs`,
      "Everything in Starter",
      "Custom branding on invoices",
      "Priority support",
    ],
    cta: "Start 14-day trial",
    highlight: true,
  },
  {
    key: "ENTERPRISE" as const,
    label: "Enterprise",
    price: FLW_PLAN_PRICES.ENTERPRISE,
    desc: "Unlimited scale for multi-location repair operations.",
    features: [
      "Unlimited team members",
      "Unlimited jobs",
      "Unlimited inventory",
      "Everything in Growth",
      "Dedicated support",
      "SLA agreement",
    ],
    cta: "Start 14-day trial",
    highlight: false,
  },
];

function formatPrice(n: number) {
  return n.toLocaleString("en-UG");
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function LandingPage() {
  const session = await getSession();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="theme-blackgold min-h-screen bg-[#050505] text-white">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#050505]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight text-white">Repair</span>
            <span className="rounded bg-[#D4AF37]/15 px-1.5 py-0.5 text-[11px] font-bold text-[#D4AF37]">Manager</span>
          </div>
          <nav className="hidden items-center gap-6 sm:flex">
            <a href="#features" className="text-sm text-white/50 transition-colors hover:text-white">Features</a>
            <a href="#pricing" className="text-sm text-white/50 transition-colors hover:text-white">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-3.5 py-1.5 text-sm font-medium text-white/60 transition-colors hover:text-white">
              Log in
            </Link>
            <Link
              href="/register"
              className="rounded-lg px-3.5 py-1.5 text-sm font-bold text-black shadow-[0_2px_10px_rgba(212,175,55,0.25)]"
              style={{ background: "linear-gradient(180deg,#E8C84A 0%,#C9A020 100%)" }}
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="relative overflow-hidden px-4 pb-24 pt-20 md:px-6 md:pb-32 md:pt-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_500px_at_50%_0%,rgba(212,175,55,0.13),transparent_65%)]" />
          <div className="relative mx-auto max-w-3xl text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/8 px-4 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
              <span className="text-[12px] font-semibold text-[#D4AF37]">Built for Ugandan repair businesses</span>
            </div>
            <h1 className="mb-5 font-[family-name:var(--font-display,sans-serif)] text-4xl font-bold leading-[1.08] tracking-tight text-white md:text-6xl">
              The OS for your<br />
              <span style={{ color: "#D4AF37" }}>repair shop</span>
            </h1>
            <p className="mx-auto mb-8 max-w-xl text-base leading-relaxed text-white/55 md:text-lg">
              Job tracking, technician workflows, client management, inventory, invoicing, and WhatsApp notifications — in one workspace.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/register"
                className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-[15px] font-bold text-black shadow-[0_4px_20px_rgba(212,175,55,0.3)] sm:w-auto"
                style={{ background: "linear-gradient(180deg,#E8C84A 0%,#C9A020 100%)" }}
              >
                Start free — no credit card
              </Link>
              <Link
                href="/login"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-6 py-3 text-[15px] font-semibold text-white/70 backdrop-blur-sm transition-colors hover:border-white/20 hover:text-white sm:w-auto"
              >
                Log in to your workspace
              </Link>
            </div>
            <p className="mt-4 text-[12px] text-white/30">14-day free trial on paid plans · Cancel anytime</p>
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="px-4 py-20 md:px-6 md:py-24">
          <div className="mx-auto max-w-6xl">
            <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-[#D4AF37]/70">Everything you need</p>
            <h2 className="mb-12 text-center text-2xl font-bold text-white md:text-3xl">
              Purpose-built for repair shops
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="rounded-2xl border border-white/8 bg-[#141414] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/14 hover:bg-[#181818]"
                >
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#D4AF37]/10 text-[#D4AF37]">
                    {f.icon}
                  </div>
                  <p className="mb-1 font-semibold text-white">{f.title}</p>
                  <p className="text-sm leading-relaxed text-white/50">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Data isolation callout ── */}
        <section className="px-4 py-16 md:px-6">
          <div className="mx-auto max-w-4xl">
            <div
              className="rounded-2xl border border-[#D4AF37]/25 p-8 md:p-10"
              style={{
                background: "linear-gradient(135deg,#1f1b0e 0%,#0c0c0c 100%)",
                boxShadow: "0 0 0 1px rgba(212,175,55,0.1), 0 24px 48px rgba(0,0,0,0.5)",
              }}
            >
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#D4AF37]/70">Strict data isolation</p>
              <h2 className="mb-3 text-2xl font-bold text-white">External techs never see client info</h2>
              <p className="mb-6 max-w-2xl text-sm leading-relaxed text-white/55">
                When you send a job to an outside technician, they see only the device specs and diagnosis notes.
                Client names, phone numbers, pricing history, and internal notes are hidden by design — enforced at the server, not just the UI.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "External tech sees", items: ["Device type & model", "Diagnosis summary", "Parts needed", "Their own estimate field"] },
                  { label: "External tech never sees", items: ["Client name", "Phone / email", "Pricing history", "Internal notes"] },
                  { label: "Full access: Admins & Ops", items: ["Complete job file", "Client history", "Financials & invoices", "Audit trail"] },
                ].map((col) => (
                  <div key={col.label} className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">{col.label}</p>
                    <ul className="space-y-1.5">
                      {col.items.map((item) => (
                        <li key={item} className="flex items-center gap-2 text-sm text-white/65">
                          <span className="h-1 w-1 flex-shrink-0 rounded-full bg-[#D4AF37]/60" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="pricing" className="px-4 py-20 md:px-6 md:py-24">
          <div className="mx-auto max-w-6xl">
            <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-[#D4AF37]/70">Simple pricing</p>
            <h2 className="mb-2 text-center text-2xl font-bold text-white md:text-3xl">Start free, scale when ready</h2>
            <p className="mb-12 text-center text-sm text-white/40">All paid plans include a 14-day free trial. Cancel any time.</p>

            <div className="grid gap-4 md:grid-cols-3">
              {plans.map((plan) => (
                <div
                  key={plan.key}
                  className={`relative flex flex-col rounded-2xl border p-6 transition-all duration-200 hover:-translate-y-0.5 ${
                    plan.highlight
                      ? "border-[#D4AF37]/40 shadow-[0_0_0_1px_rgba(212,175,55,0.15),0_24px_48px_rgba(0,0,0,0.5)]"
                      : "border-white/8 bg-[#141414]"
                  }`}
                  style={plan.highlight ? { background: "linear-gradient(160deg,#1f1b0e 0%,#0c0c0c 100%)" } : undefined}
                >
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="rounded-full border border-[#D4AF37]/40 bg-[#1a1600] px-3 py-1 text-[11px] font-bold text-[#D4AF37]">
                        Most popular
                      </span>
                    </div>
                  )}

                  <div className="mb-4">
                    <p className="text-sm font-bold text-white/70">{plan.label}</p>
                    <div className="mt-1 flex items-baseline gap-1">
                      {plan.price === null ? (
                        <span className="text-3xl font-bold text-white">Free</span>
                      ) : (
                        <>
                          <span className="text-base font-medium text-white/40">{FLW_CURRENCY}</span>
                          <span className="text-3xl font-bold text-white">{formatPrice(plan.price)}</span>
                          <span className="text-sm text-white/40">/ mo</span>
                        </>
                      )}
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">{plan.desc}</p>
                  </div>

                  <ul className="mb-6 flex-1 space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-sm text-white/65">
                        <svg className="h-3.5 w-3.5 flex-shrink-0 text-[#D4AF37]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/register"
                    className={`block rounded-xl py-2.5 text-center text-sm font-bold transition-all ${
                      plan.highlight
                        ? "text-black shadow-[0_3px_12px_rgba(212,175,55,0.25)]"
                        : "border border-white/12 bg-white/[0.05] text-white hover:border-white/20 hover:bg-white/[0.09]"
                    }`}
                    style={plan.highlight ? { background: "linear-gradient(180deg,#E8C84A 0%,#C9A020 100%)" } : undefined}
                  >
                    {plan.cta}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="px-4 pb-24 pt-8 md:px-6">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="mb-3 text-2xl font-bold text-white">Ready to run a tighter shop?</h2>
            <p className="mb-7 text-sm text-white/45">
              Set up your workspace in minutes. Free plan, no credit card required.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl px-8 py-3 text-[15px] font-bold text-black shadow-[0_4px_20px_rgba(212,175,55,0.3)]"
              style={{ background: "linear-gradient(180deg,#E8C84A 0%,#C9A020 100%)" }}
            >
              Create your workspace
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-white/8 px-4 py-8 md:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-white">Repair</span>
              <span className="rounded bg-[#D4AF37]/15 px-1.5 py-0.5 text-[11px] font-bold text-[#D4AF37]">Manager</span>
            </div>
            <nav className="flex flex-wrap gap-x-5 gap-y-2">
              <a href="#features" className="text-sm text-white/40 transition-colors hover:text-white">Features</a>
              <a href="#pricing" className="text-sm text-white/40 transition-colors hover:text-white">Pricing</a>
              <Link href="/login" className="text-sm text-white/40 transition-colors hover:text-white">Log in</Link>
              <Link href="/terms" className="text-sm text-white/40 transition-colors hover:text-white">Terms</Link>
              <Link href="/privacy" className="text-sm text-white/40 transition-colors hover:text-white">Privacy</Link>
            </nav>
          </div>
          <div className="border-t border-white/6 pt-5 text-[12px] text-white/25">
            © {new Date().getFullYear()} Repair Manager. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
