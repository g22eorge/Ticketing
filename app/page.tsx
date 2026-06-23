import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { TicketForm } from "@/components/public/TicketForm";
import { AppLogoDark } from "@/components/ui/AppLogo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Techserve ICT Solutions — ICT Service Operations Platform",
    description:
      "Submit ICT support tickets and complaints. Techserve ICT Solutions is a customised platform for service operations, repairs, and ICT management.",
    alternates: { canonical: "/" },
  };
}

const WA_PATH = "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.-378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z";

// ── Icons ───────────────────────────────────────────────────────────────────

function TicketIcon({ className = "", size = 16 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" className={className} style={{ width: size, height: size }} aria-hidden>
      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 12h.01" />
    </svg>
  );
}

function AlertIcon({ className = "", size = 16 }: { className?: string; size?: number }) {
  return (
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" className={className} style={{ width: size, height: size }} aria-hidden>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function ShieldCheck({ className = "", size = 16 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" className={className} style={{ width: size, height: size }} aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function Headset({ className = "", size = 16 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" className={className} style={{ width: size, height: size }} aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="M12 8v4" /><path d="M12 12h.01" />
    </svg>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function Page() {
  const session = await getSession();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#0a1628] text-white">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/4 top-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-[#4F8EF7]/5 blur-[140px]" />
        <div className="absolute right-0 top-1/4 h-[400px] w-[400px] rounded-full bg-blue-500/4 blur-[120px]" />
      </div>

      {/* ── Topbar ── */}
      <nav className="sticky top-0 z-40 border-b border-white/5 bg-[#0a1628]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <AppLogoDark height={32} priority />
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              Staff Login
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="mx-auto max-w-5xl px-4 pt-16 pb-12 text-center md:pt-24 md:pb-16">
<div className="inline-flex items-center gap-2 rounded-full border border-[#4F8EF7]/20 bg-[#4F8EF7]/5 px-4 py-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-[#4F8EF7]" />
          <span className="text-[13px] font-semibold tracking-wide text-[#4F8EF7]">ICT Service Operations Platform</span>
        </div>

        <h1 className="mt-6 text-4xl font-black leading-[1.05] tracking-tight md:text-5xl">
          <span className="bg-gradient-to-r from-[#60A5FA] via-[#4F8EF7] to-[#3B82F6] bg-clip-text text-transparent">
            Helping Techserve ICT Solutions
          </span><br />
          Deliver ICT Services Better
        </h1>

        <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-white/45">
          A customised platform for managing service requests, jobs, clients, quotations, invoices, receipts, staff activity, and operational reports.
        </p>

        {/* Quick actions */}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href="#support-ticket"
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/8 px-5 py-2.5 text-sm font-semibold text-cyan-400 transition hover:bg-cyan-500/15"
          >
            <TicketIcon size={16} />
            Support Ticket
          </a>
          <Link
            href="/complaint"
            className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/8 px-5 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/15"
          >
            <AlertIcon size={16} />
            Complaint
          </Link>
        </div>
      </section>

      {/* ── Service Cards ── */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Card 1: Support Ticket */}
          <a
            href="#support-ticket"
            className="group relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] p-6 transition-all hover:border-cyan-500/30 hover:bg-white/[0.05]"
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
              <TicketIcon size={20} />
            </div>
            <h3 className="text-base font-bold text-white">ICT Support Ticket</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/40">
              Report hardware, software, network, or printer issues. No login required — we respond within 24 hours.
            </p>
            <div className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-cyan-400 transition group-hover:gap-2">
              Open a ticket <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </div>
          </a>

          {/* Card 2: Complaint */}
          <Link
            href="/complaint"
            className="group relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] p-6 transition-all hover:border-red-500/30 hover:bg-white/[0.05]"
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
              <AlertIcon size={20} />
            </div>
            <h3 className="text-base font-bold text-white">File a Complaint</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/40">
              Had a bad experience? Tell us what went wrong. We take every complaint seriously and aim to resolve within 72 hours.
            </p>
            <div className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-red-400 transition group-hover:gap-2">
              Submit complaint <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </div>
          </Link>
        </div>
      </section>

      {/* ── Support Ticket Form ── */}
      <section id="support-ticket" className="mx-auto max-w-5xl px-4 py-12">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
            <TicketIcon size={18} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">ICT Support Ticket</h2>
            <p className="text-[13px] text-white/40">Hardware, software, network, internet, email, or printer issues.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 md:p-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400/70">Submit a Support Ticket</p>
          <p className="mb-5 text-xs text-white/35">All fields marked * are required</p>
          <TicketForm companyName="ICT Support Team" />
        </div>
      </section>

      {/* ── Trust Badges ── */}
      <section className="mx-auto max-w-5xl px-4 py-12">
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 md:p-8">
          <div className="mb-6 text-center">
            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white/30">Why choose us</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { icon: <TicketIcon size={24} />, label: "24h Response", desc: "On all tickets" },
              { icon: <ShieldCheck size={24} />, label: "Secure", desc: "Data protected" },
              { icon: <Headset size={24} />, label: "Expert Support", desc: "Skilled team" },
              { icon: <AlertIcon size={24} />, label: "72h Resolution", desc: "For complaints" },
            ].map((t) => (
              <div key={t.label} className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center">
                <span className="text-cyan-400">{t.icon}</span>
                <span className="text-[13px] font-semibold text-white/70">{t.label}</span>
                <span className="text-[11px] text-white/30">{t.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── About / Powered By ── */}
      <section className="mx-auto max-w-5xl px-4 py-12">
        <div className="rounded-2xl border border-white/8 bg-gradient-to-br from-white/[0.04] to-transparent p-8 text-center md:p-12">
          <AppLogoDark height={48} className="mx-auto mb-4 justify-center" />
          <h3 className="text-lg font-bold text-white">Techserve ICT Solutions</h3>
          <p className="mx-auto mt-2 max-w-lg text-[13px] leading-relaxed text-white/45">
            A customised ICT service operations platform — managing service requests, jobs, clients, quotations, invoices, receipts, and operational reports.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href="https://wa.me/256756844448?text=Hi%2C%20I%27m%20interested%20in%20the%20Techserve%20ICT%20Solutions%20service%20operations%20platform."
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-black shadow-[0_4px_20px_rgba(230,198,92,0.25)] transition hover:opacity-90"
              style={{ background: "linear-gradient(180deg,#60A5FA 0%,#3B82F6 100%)" }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden><path d={WA_PATH}/></svg>
              Contact Techserve ICT Solutions
            </a>
            <a
              href="tel:+256756844448"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-semibold text-white/60 transition hover:text-white"
            >
              0756844448
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/6 px-4 py-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-3">
              <AppLogoDark height={28} />
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-4">
              <Link href="/complaint" className="text-xs font-semibold text-red-400/60 transition hover:text-red-400">Complaint</Link>
              <Link href="/login" className="text-xs font-semibold text-white/35 transition hover:text-[#4F8EF7]">Staff Login</Link>
              <a
                href="https://wa.me/256756844448"
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#25D366]"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden><path d={WA_PATH}/></svg>
                WhatsApp
              </a>
            </nav>
          </div>
          <p className="mt-4 text-center text-[11px] text-white/20">
            © {new Date().getFullYear()} Techserve Solutions Limited. All Rights Reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
