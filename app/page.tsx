import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { RepairRequestForm } from "@/components/public/RepairRequestForm";
import { AppLogoDark } from "@/components/ui/AppLogo";

export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get("host")?.toLowerCase() ?? "";
  if (host.startsWith("app.eagleinfosolutions.com")) {
    return {
      title: "Duuka ProMax — AI-Powered Business Management SaaS",
      description:
        "Duuka ProMax is an AI-powered business management SaaS for repairs, sales, inventory, finance, documents, CRM, communications, and daily operations.",
      alternates: { canonical: "/" },
    };
  }

  return {
    title: "Eagle Info Solutions — Device Repair & Business Management",
    description:
      "Submit a device repair request online. Eagle Info Solutions repairs phones, laptops and tablets in Kampala — written quote, no-fix-no-fee, 30-day warranty. Powered by Dduuka ProMax.",
    alternates: { canonical: "/" },
  };
}

// ── Module definitions ─────────────────────────────────────────────────────────

const MODULES = [
  {
    group: "Service & Repairs",
    color: "from-blue-500/20 to-blue-500/5",
    border: "border-blue-500/20",
    accent: "text-blue-400",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
    items: ["Jobs & Repair Tracking", "Intake & Reception", "Field Visits", "Technician Management", "Complaints Handling"],
  },
  {
    group: "Stock & Supply",
    color: "from-amber-500/20 to-amber-500/5",
    border: "border-amber-500/20",
    accent: "text-amber-400",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
      </svg>
    ),
    items: ["Parts & Stock Levels", "Purchase Orders", "Goods Received", "Supplier Bills", "Stock Counts & Transfers"],
  },
  {
    group: "Customers & Sales",
    color: "from-emerald-500/20 to-emerald-500/5",
    border: "border-emerald-500/20",
    accent: "text-emerald-400",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    items: ["Client Directory", "Point of Sale (POS)", "Sales CRM & Leads", "Sales Visits", "Campaigns & Outreach"],
  },
  {
    group: "Documents",
    color: "from-purple-500/20 to-purple-500/5",
    border: "border-purple-500/20",
    accent: "text-purple-400",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
      </svg>
    ),
    items: ["Job Cards", "Invoices & Receipts", "Quotations", "Delivery Notes", "Credit Notes & Refunds"],
  },
  {
    group: "Finance",
    color: "from-[#D4AF37]/25 to-[#D4AF37]/5",
    border: "border-[#D4AF37]/25",
    accent: "text-[#D4AF37]",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    items: ["Expenses & Bank", "P&L, Balance Sheet", "Cash Flow Statements", "Aged Receivables"],
  },
  {
    group: "Reports & Analytics",
    color: "from-cyan-500/20 to-cyan-500/5",
    border: "border-cyan-500/20",
    accent: "text-cyan-400",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </svg>
    ),
    items: ["Tech Performance", "Operations Dashboard", "Inventory Value Report", "Customer Statements", "Revenue Analytics"],
  },
  {
    group: "Communications",
    color: "from-green-500/20 to-green-500/5",
    border: "border-green-500/20",
    accent: "text-green-400",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
      </svg>
    ),
    items: ["WhatsApp Notifications", "Message Templates", "Meta Business Integration", "Delivery Outbox", "Status Alerts"],
  },
  {
    group: "AI Assistance",
    color: "from-fuchsia-500/20 to-fuchsia-500/5",
    border: "border-fuchsia-500/20",
    accent: "text-fuchsia-300",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <path d="M12 3l1.6 4.9L18.5 9.5l-4.9 1.6L12 16l-1.6-4.9L5.5 9.5l4.9-1.6L12 3Z" />
        <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" />
        <path d="M5 15l.6 1.6L7 17l-1.4.4L5 19l-.6-1.6L3 17l1.4-.4L5 15Z" />
      </svg>
    ),
    items: ["Gemini Flash AI Guide", "Business Insights", "Management Copilot", "Risk & Action Suggestions", "System Help Assistant"],
  },
  {
    group: "Security & Admin",
    color: "from-rose-500/20 to-rose-500/5",
    border: "border-rose-500/20",
    accent: "text-rose-400",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      </svg>
    ),
    items: ["9 Role-Based Access Levels", "Full Audit Trail", "User Management", "Data Heal & Diagnostics"],
  },
];

const STATS = [
  { value: "9+", label: "Modules" },
  { value: "9", label: "User Roles" },
  { value: "50+", label: "Features" },
  { value: "AI", label: "Powered" },
];

// WhatsApp SVG path shared across multiple links
const WA_PATH = "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z";

function DuukaSaasLanding() {
  return (
    <main className="theme-blackgold relative min-h-screen overflow-x-hidden bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[720px] w-[720px] -translate-x-1/2 rounded-full bg-[#D4AF37]/10 blur-[150px]" />
        <div className="absolute right-0 top-1/3 h-[460px] w-[460px] rounded-full bg-fuchsia-500/8 blur-[120px]" />
      </div>

      <nav className="sticky top-0 z-40 border-b border-white/6 bg-[#050505]/90 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AppLogoDark height={32} priority />
          </div>
          <div className="flex items-center gap-2">
            <Link href="/register" className="hidden rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-4 py-2 text-xs font-semibold text-[#D4AF37] transition hover:bg-[#D4AF37]/20 sm:inline-flex">
              Start Free
            </Link>
            <Link href="/login" className="rounded-lg border border-white/12 bg-white/5 px-4 py-2 text-xs font-semibold text-white/70 transition hover:border-white/20 hover:text-white">
              Login
            </Link>
          </div>
        </div>
      </nav>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/8 px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#D4AF37]">Business management, now with AI</span>
          </div>
          <h1 className="max-w-3xl text-4xl font-black leading-[0.95] tracking-tight text-white md:text-6xl">
            Run sales, stock, service, finance, and teams from one
            <span className="block bg-gradient-to-r from-[#E8C84A] via-[#D4AF37] to-fuchsia-300 bg-clip-text text-transparent">AI-powered workspace.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-white/58">
            Duuka ProMax is a hosted SaaS platform for growing businesses that need POS, inventory, repair jobs, CRM, invoicing, payments, finance reports, communications, and role-based operations in one place. Gemini Flash-powered AI helps users learn the system, ask operational questions, and surface management risks.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="rounded-xl px-6 py-3 text-sm font-bold text-black shadow-[0_4px_20px_rgba(212,175,55,0.3)] transition hover:opacity-90" style={{ background: "linear-gradient(180deg,#E8C84A 0%,#C9A020 100%)" }}>
              Create Workspace
            </Link>
            <a href="https://wa.me/256772006344?text=Hi%2C%20I%27m%20interested%20in%20Duuka%20ProMax%20SaaS.%20Please%20send%20pricing%20and%20setup%20details." target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white/70 transition hover:border-[#D4AF37]/30 hover:text-white">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden><path d={WA_PATH}/></svg>
              Talk to Sales
            </a>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#D4AF37]/15 blur-[70px]" />
          <div className="relative rounded-2xl border border-white/8 bg-[#0b0b0b] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#D4AF37]">Live Operations Command</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {STATS.map((s) => (
                <div key={s.label} className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-2xl font-extrabold text-white">{s.value}</p>
                  <p className="mt-1 text-[11px] text-white/40">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-fuchsia-400/20 bg-fuchsia-400/[0.06] p-4">
              <p className="text-sm font-bold text-fuchsia-100">Duuka AI Guide + Business Insights</p>
              <p className="mt-2 text-xs leading-5 text-white/50">Users can ask how to use the system, while managers get AI-assisted summaries of revenue, stock risks, overdue jobs, receivables, payables, and next actions.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-8 max-w-2xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#D4AF37]">Product Suite</p>
          <h2 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">Everything your business needs to operate daily</h2>
          <p className="mt-3 text-sm leading-6 text-white/48">Start with the modules you need, then expand into full operations, finance, reporting, communications, and AI decision support.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((mod) => (
            <div key={mod.group} className={`relative overflow-hidden rounded-2xl border bg-gradient-to-b p-5 ${mod.border} ${mod.color}`}>
              <div className={`mb-3 ${mod.accent}`}>{mod.icon}</div>
              <p className="text-sm font-bold text-white">{mod.group}</p>
              <ul className="mt-2 space-y-1">
                {mod.items.map((item) => (
                  <li key={item} className="text-[11px] leading-snug text-white/45">{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export default async function Page() {
  const session = await getSession();
  if (session?.user) redirect("/dashboard");
  const host = (await headers()).get("host")?.toLowerCase() ?? "";
  const isSaasLanding = host.startsWith("app.eagleinfosolutions.com");

  if (isSaasLanding) return <DuukaSaasLanding />;

  return (
    <main className="theme-blackgold relative min-h-screen overflow-x-hidden bg-[#050505] text-white">

      {/* ── Ambient background ── */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/4 top-0 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-[#D4AF37]/8 blur-[140px]" />
        <div className="absolute right-0 top-1/3 h-[400px] w-[400px] rounded-full bg-blue-500/6 blur-[120px]" />
      </div>

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-40 border-b border-white/6 bg-[#050505]/90 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">

          {/* Brand */}
          <div className="flex items-center gap-3">
            <AppLogoDark height={32} priority />
          </div>

          {/* Nav actions */}
          <div className="flex items-center gap-2">
            <a
              href="#repair-form"
              className="hidden items-center gap-1.5 rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-4 py-2 text-xs font-semibold text-[#D4AF37] transition hover:bg-[#D4AF37]/20 sm:flex"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
              Repair Request
            </a>
            <Link
              href="/complaint"
              className="hidden items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs font-semibold text-red-400/80 transition hover:bg-red-500/15 hover:text-red-400 md:flex"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              Complaint
            </Link>
            <a
              href="https://wa.me/256772006344?text=Hi%20Eagle%20Info%2C%20I%20have%20a%20device%20I%20need%20repaired."
              target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-[#25D366]/15 border border-[#25D366]/25 px-3 py-2 text-xs font-semibold text-[#25D366] transition hover:bg-[#25D366]/25"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden><path d={WA_PATH}/></svg>
              <span className="hidden sm:inline">WhatsApp</span>
            </a>
            <Link
              href="/login"
              className="rounded-lg border border-white/12 bg-white/5 px-4 py-2 text-xs font-semibold text-white/60 transition hover:border-white/20 hover:text-white"
            >
              Staff Login
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-4">

        {/* ══════════════════════════════════════════════════════════════
            HERO — Eagle Info Solutions repair service + inline form
        ══════════════════════════════════════════════════════════════ */}
        <section id="repair-form" className="py-12 md:py-16">

          {/* Two-column: left = copy, right = form */}
          <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-14">

            {/* ── Left: Company + service intro ── */}
            <div className="lg:max-w-sm lg:pt-2 lg:sticky lg:top-24">
              {/* Company badge */}
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-4 py-1.5">
                <AppLogoDark height={16} />
                <span className="text-[11px] font-semibold text-white/60">Eagle Info Solutions</span>
              </div>

              <h1 className="text-3xl font-extrabold leading-tight text-white xl:text-4xl">
                Device broken?<br />
                <span className="bg-gradient-to-r from-[#E8C84A] to-[#C9A020] bg-clip-text text-transparent">
                  We fix it fast.
                </span>
              </h1>

              <p className="mt-4 text-sm leading-relaxed text-white/50">
                Fill in the form to submit your repair request directly to Eagle Info Solutions.
                We&apos;ll review it and get back to you within a few hours with a quote and timeline.
              </p>

              {/* Trust badges */}
              <div className="mt-6 space-y-2.5">
                {[
                  {
                    label: "Written quote before any work begins",
                    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>,
                  },
                  {
                    label: "No fix, no fee — guaranteed",
                    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
                  },
                  {
                    label: "30-day warranty on all repairs",
                    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>,
                  },
                  {
                    label: "Shop L28, Nalubega Complex, Bombo Road, Kampala",
                    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>,
                  },
                  {
                    label: "Phones · Laptops · Tablets · PCs",
                    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
                  },
                ].map((t) => (
                  <div key={t.label} className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-[#D4AF37]/60">{t.icon}</span>
                    <p className="text-[13px] leading-tight text-white/55">{t.label}</p>
                  </div>
                ))}
              </div>

              {/* Alternative contact */}
              <div className="mt-7 flex flex-col gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/25">Or contact us directly</p>
                <a
                  href="https://wa.me/256772006344?text=Hi%20Eagle%20Info%2C%20I%20have%20a%20device%20I%20need%20repaired.%20Please%20help%20me."
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 rounded-lg bg-[#25D366]/12 border border-[#25D366]/25 px-4 py-2.5 text-sm font-semibold text-[#25D366] transition hover:bg-[#25D366]/20"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden><path d={WA_PATH}/></svg>
                  +256 772 006 344 on WhatsApp
                </a>
                <a
                  href="/address"
                  className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/3 px-4 py-2.5 text-sm text-white/45 transition hover:border-white/15 hover:text-white/65"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden>
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                  Get directions to our shop
                </a>
              </div>
            </div>

            {/* ── Right: The repair request form ── */}
            <div className="flex-1">
              <div
                className="relative overflow-hidden rounded-2xl border border-white/10 p-6 md:p-8"
                style={{
                  background: "linear-gradient(160deg,#111111 0%,#0d0d0d 100%)",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 20px 60px rgba(0,0,0,0.5)",
                }}
              >
                <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[#D4AF37]/6 blur-[60px]" />
                <div className="relative">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <p className="text-base font-bold text-white">Repair Request Form</p>
                      <p className="mt-0.5 text-xs text-white/35">All fields marked * are required</p>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-full border border-green-500/25 bg-green-500/8 px-3 py-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                      <span className="text-[10px] font-semibold text-green-400">Live</span>
                    </div>
                  </div>
                  <RepairRequestForm />
                </div>
              </div>
            </div>
          </div>

          {/* ── Complaint CTA strip ── */}
          <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-red-500/12 bg-red-500/[0.04] px-6 py-5 text-center sm:flex-row sm:text-left">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 text-red-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white/80">Had a bad experience?</p>
              <p className="mt-0.5 text-xs text-white/40">
                We take every complaint seriously. Tell us what went wrong and we&apos;ll make it right.
              </p>
            </div>
            <Link
              href="/complaint"
              className="flex shrink-0 items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-5 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/20"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              Submit a Complaint
            </Link>
          </div>
        </section>

        {/* ── Divider with Dduuka ProMax intro ── */}
        <div className="relative py-6">
          <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
          <div className="relative flex justify-center">
            <div className="flex items-center gap-3 rounded-full border border-white/8 bg-[#050505] px-5 py-2">
              <span className="text-[11px] text-white/30">Also available as a</span>
              <span className="text-[11px] font-bold text-[#D4AF37]/70">Dduuka ProMax</span>
              <span className="text-[11px] text-white/30">business system</span>
              <a href="#business-system" className="text-[11px] font-semibold text-[#D4AF37]/60 hover:text-[#D4AF37] transition-colors">
                Learn more ↓
              </a>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            SYSTEM SHOWCASE — Dduuka ProMax for business owners
        ══════════════════════════════════════════════════════════════ */}
        <section id="business-system" className="py-12">

          {/* Stats bar */}
          <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-xl border border-white/6 bg-white/[0.02] p-4 text-center">
                <p className="text-2xl font-extrabold text-[#D4AF37]">{s.value}</p>
                <p className="mt-0.5 text-[11px] text-white/40">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Heading */}
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/8 px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#D4AF37]/90">Dduuka ProMax — Business Management System</span>
          </div>
          <h2 className="mt-3 text-2xl font-extrabold text-white md:text-3xl">
            Manage your entire business like a pro
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/45">
            Dduuka ProMax is the complete business management system behind Eagle Info Solutions —
            covering sales, inventory, finance, repair service, CRM, documents, and daily operations.
            It also includes Gemini Flash-powered AI guidance and business insights to help teams learn the system faster and make better decisions.
          </p>

          {/* Module grid */}
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map((mod) => (
              <div
                key={mod.group}
                className={`relative overflow-hidden rounded-2xl border bg-gradient-to-b p-5 ${mod.border} ${mod.color}`}
              >
                <div className={`mb-3 ${mod.accent}`}>{mod.icon}</div>
                <p className="text-sm font-bold text-white">{mod.group}</p>
                <ul className="mt-2 space-y-1">
                  {mod.items.map((item) => (
                    <li key={item} className="text-[11px] text-white/45 leading-snug">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* ── Commercial CTA ── */}
          <div
            className="relative mt-10 overflow-hidden rounded-3xl border border-[#D4AF37]/25 p-8 md:p-12"
            style={{
              background: "linear-gradient(135deg,#1f1b0e 0%,#141006 40%,#0c0c0c 100%)",
              boxShadow: "0 0 0 1px rgba(212,175,55,0.12), 0 24px 60px rgba(0,0,0,0.5)",
            }}
          >
            <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-[#D4AF37]/12 blur-[80px]" />

            <div className="relative max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-4 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#D4AF37]">Get Dduuka ProMax for Your Business</span>
              </div>

              <h3 className="text-2xl font-extrabold leading-snug text-white md:text-3xl">
                Want this system for<br />your business?
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-white/55">
                Dduuka ProMax is a complete business management system — sales, inventory,
                invoicing, finance, CRM, repair service support, AI assistance, and daily operations.
                Available as a hosted deployment for businesses, service centres, and technology
                companies. Includes setup, data migration, staff training, and ongoing support.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="https://wa.me/256772006344?text=Hi%2C%20I%27m%20interested%20in%20Dduuka%20ProMax%20for%20my%20business.%20Please%20send%20me%20pricing%20and%20setup%20details."
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-black shadow-[0_4px_20px_rgba(212,175,55,0.3)] transition hover:opacity-90"
                  style={{ background: "linear-gradient(180deg,#E8C84A 0%,#C9A020 100%)" }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden><path d={WA_PATH}/></svg>
                  WhatsApp us now
                </a>
                <a
                  href="https://app.eagleinfosolutions.com"
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white/70 transition hover:border-[#D4AF37]/30 hover:text-white"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                    <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                  app.eagleinfosolutions.com
                </a>
                <a
                  href="tel:+256772006344"
                  className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white/70 transition hover:border-white/25 hover:text-white"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 3.07 9.8 19.79 19.79 0 0 1 2 1.18 2 2 0 0 1 4 .03h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 7.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 14.92z"/>
                  </svg>
                  +256 772 006 344
                </a>
              </div>
            </div>
          </div>
        </section>

      </div>

      {/* ── Footer ── */}
      <footer className="mt-8 border-t border-white/6 px-4 py-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AppLogoDark height={28} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {[
                { href: "https://www.facebook.com/EagleInfoSolutions", label: "Facebook", icon: <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" fill="currentColor"/> },
                { href: "https://www.instagram.com/EagleInfo_UG", label: "Instagram", icon: <><rect x="2" y="2" width="20" height="20" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/></> },
                { href: "https://www.tiktok.com/@EagleInfo_UG", label: "TikTok", icon: <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.78a4.85 4.85 0 01-1.01-.09z" fill="currentColor"/> },
                { href: "https://www.linkedin.com/company/104326797/", label: "LinkedIn", icon: <><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" fill="currentColor"/><circle cx="4" cy="4" r="2" fill="currentColor"/></> },
              ].map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/8 text-white/40 transition hover:border-[#D4AF37]/30 hover:text-[#D4AF37]">
                  <svg width="12" height="12" viewBox="0 0 24 24">{s.icon}</svg>
                </a>
              ))}
              <Link href="/complaint" className="text-xs font-semibold text-red-400/60 transition hover:text-red-400">Complaint</Link>
              <Link href="/login" className="text-xs font-semibold text-white/35 transition hover:text-[#D4AF37]">Staff Login</Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
