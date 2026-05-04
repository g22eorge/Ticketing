import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import WhatsAppFloat from "@/components/shared/WhatsAppFloat";
import { eagleLogo } from "@/lib/eagle-logo";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": "https://care.eagleinfosolutions.com/#business",
  name: "Eagle Info Solutions SMC Limited",
  description:
    "Professional repair for phones, laptops, tablets and software in Kampala, Uganda. Transparent pricing, no-fix-no-fee guarantee, 30-day warranty.",
  url: "https://eagleinfosolutions.com",
  telephone: ["+256772006344", "+256754006344"],
  image: "https://care.eagleinfosolutions.com/eagle-info-logo.png",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Shop L28, Nalubega Complex",
    addressLocality: "Kampala",
    addressCountry: "UG",
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: 0.3476,
    longitude: 32.5825,
  },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "08:00",
      closes: "18:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Saturday"],
      opens: "09:00",
      closes: "15:00",
    },
  ],
  priceRange: "$$",
  sameAs: [
    "https://eagleinfosolutions.com",
    "https://www.linkedin.com/company/104326797/",
    "https://www.facebook.com/EagleInfoSolutions",
    "https://www.instagram.com/EagleInfo_UG",
    "https://www.tiktok.com/@EagleInfo_UG",
  ],
};

const features = [
  { title: "Written quote", body: "Approve before work begins." },
  { title: "Status updates", body: "Diagnosis, approval, and completion notifications." },
  { title: "Warranty record", body: "Keep your job reference for follow-ups." },
];

const deviceBrands = ["Apple", "Dell", "HP", "Lenovo"];
const softwareBrands = ["Microsoft", "Adobe", "Kaspersky", "AutoCAD", "ArchiCAD"];

const commitments = [
  { title: "Transparent pricing", body: "Written quote before work starts — no surprises." },
  { title: "No fix, no fee", body: "Can't repair it? You pay nothing for the attempt." },
  { title: "Your data stays yours", body: "We never access, copy, or store your files." },
  { title: "Quality parts", body: "Genuine or certified-equivalent, fully documented." },
  { title: "30-day warranty", body: "Same fault returns within 30 days — fixed free." },
  { title: "You're kept informed", body: "Updates at diagnosis, approval, and completion." },
];

const steps = [
  { title: "Request", body: "Submit your issue and device details online." },
  { title: "Approve", body: "Get a clear quote before work starts." },
  { title: "Collect", body: "Pickup with a recorded job history and warranty." },
];

export default async function Page() {
  const session = await getSession();
  if (session?.user) redirect("/dashboard");

  return (
    <>
      <main className="theme-blackgold relative flex min-h-screen flex-col overflow-hidden bg-[#050505]">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(900px_450px_at_18%_18%,rgba(212,175,55,0.18),transparent_55%),radial-gradient(820px_520px_at_85%_72%,rgba(212,175,55,0.12),transparent_60%)]" />

        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pt-10 pb-6 md:pt-12 md:pb-8">
          {/* Wordmark */}
          <div className="fade-in mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 overflow-hidden rounded-full border border-[var(--accent)]/30 bg-white shadow-[0_0_12px_rgba(212,175,55,0.2)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={eagleLogo} alt="Eagle Info Solutions" className="h-full w-full object-cover" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight text-[var(--ink)]">Eagle Info Solutions</p>
              <p className="text-[11px] text-[var(--ink-muted)]">SMC Limited</p>
            </div>
          </div>

          {/* ── Hero — mobile ── */}
          <div className="sm:hidden">
            {/* Headline */}
            <h1 className="fade-in mb-2 font-[family-name:var(--font-display)] text-[38px] font-bold leading-[1.08] tracking-tight text-white">
              Device repair<br />
              <span style={{ color: "var(--accent)" }}>in Kampala.</span>
            </h1>
            <p className="fade-in mb-5 text-[13px] text-white/50">
              Written quotes · No fix, no fee · 30-day warranty
            </p>

            {/* Primary CTA */}
            <Link
              href="/repair"
              className="fade-in mb-3 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-bold text-black shadow-[0_6px_24px_rgba(212,175,55,0.35)]"
              style={{ background: "linear-gradient(180deg, #E8C84A 0%, #C9A020 100%)" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
              Request a Repair
            </Link>

            {/* Secondary — text link only */}
            <Link
              href="/address"
              className="fade-in mb-7 flex w-full items-center justify-center gap-1.5 py-1 text-[13px] font-semibold text-white/45 transition-colors hover:text-white/70"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              Find our shop
            </Link>

            {/* Divider */}
            <div className="mb-5 h-px bg-white/8" />

            {/* Steps */}
            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">How it works</p>
            <ol className="mb-5 space-y-1.5">
              {steps.map((step, index) => (
                <li key={step.title} className="flex items-center gap-3 rounded-xl border border-white/8 bg-[#141414] px-4 py-3">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[10px] font-bold text-[var(--accent)]">
                    {index + 1}
                  </span>
                  <p className="text-xs font-semibold text-[var(--ink)]">{step.title}</p>
                  <p className="ml-auto text-[11px] text-[var(--ink-muted)]">{step.body}</p>
                </li>
              ))}
            </ol>

            {/* Divider */}
            <div className="mb-5 h-px bg-white/8" />
          </div>

          {/* ── Hero — desktop (sm+) ── */}
          <div className="hidden sm:block">
            {/* Value prop */}
            <p className="fade-in mb-5 max-w-2xl text-balance text-[15px] font-semibold leading-snug text-white/85">
              Phone, laptop, tablet, and software repair in Kampala — written quotes, status updates, 30-day warranty.
            </p>
            {/* CTA row */}
            <div className="fade-in mb-6 flex flex-wrap gap-2.5">
              <Link
                href="/repair"
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-black shadow-[0_4px_18px_rgba(212,175,55,0.3)]"
                style={{ background: "linear-gradient(180deg, #E8C84A 0%, #C9A020 100%)" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                Request a Repair
              </Link>
              <Link
                href="/address"
                className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-5 py-2.5 text-sm font-semibold text-white/80 backdrop-blur-sm transition-colors hover:border-white/25 hover:bg-white/[0.09] hover:text-white"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                Find Us
              </Link>
            </div>
          </div>

          {/* ── Card grid — desktop only ── */}
          <div className="hidden sm:grid gap-4 md:grid-cols-2 md:items-stretch">
            <div
              className="fade-in relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_24px_48px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_28px_56px_rgba(0,0,0,0.55)]"
            >
              <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-[var(--accent)]/10 blur-2xl" />
              <p className="relative text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">How it works</p>
              <h1 className="relative mt-2 text-2xl font-extrabold leading-tight text-[var(--ink)] md:text-3xl">Fast repair workflow</h1>
              <p className="relative mt-2 hidden text-sm leading-5 text-[var(--ink-muted)] sm:block">Three steps, no confusion.</p>
              <ol className="relative mt-4 space-y-2">
                {steps.map((step, index) => (
                  <li key={step.title} className="flex items-start gap-3 rounded-xl border border-white/8 bg-[#141414] px-4 py-3">
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[10px] font-bold text-[var(--accent)]">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-[var(--ink)]">{step.title}</p>
                      <p className="mt-0.5 hidden text-[11px] leading-4 text-[var(--ink-muted)] sm:block">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="grid gap-3">
              <div
                className="fade-in relative overflow-hidden rounded-2xl border border-[var(--accent)]/35 p-5 text-white transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--accent)]/55 hover:shadow-[0_0_32px_rgba(212,175,55,0.12)]"
                style={{
                  background: "linear-gradient(135deg, #1f1b0e 0%, #141006 40%, #0c0c0c 100%)",
                  boxShadow: "0 0 0 1px rgba(212,175,55,0.15), 0 20px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(212,175,55,0.12)",
                }}
              >
                <div className="pointer-events-none absolute -right-6 -top-6 h-36 w-36 rounded-full bg-[var(--accent)]/15 blur-2xl" />
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/20 to-transparent" />
                <p className="relative text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]/70">Repair you can trust</p>
                <h2 className="relative mt-1.5 text-xl font-extrabold text-white">Clear quote. Clean handoff.</h2>
                <p className="relative mt-1 text-sm leading-5 text-white/65">
                  Your repair stays traceable from intake to pickup, with written approval before work starts.
                </p>
                <div className="relative mt-4 flex flex-wrap gap-2">
                  {["Written quote", "No fix, no fee", "30-day warranty"].map((item) => (
                    <span key={item} className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-white/80">
                      {item}
                    </span>
                  ))}
                </div>
                <p className="relative mt-3 hidden text-[11px] text-white/55 sm:block">Prefer to visit first? Use the Find Us button above for directions.</p>
              </div>

              <div
className="fade-in rounded-2xl border border-white/8 bg-[#1e1e1e] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/14 hover:bg-[#222]"
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">What you get</p>
                <div className="mt-2.5 grid gap-2 text-sm">
                  {features.map((f) => (
                    <div key={f.title} className="flex items-start gap-2.5">
                      <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--accent)]" />
                      <div>
                        <span className="font-semibold text-[var(--ink)]">{f.title}</span>
                        <span className="hidden text-[var(--ink-muted)] sm:inline"> — {f.body}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Brands */}
          <div className="fade-in my-5 flex-1">
            {/* Mobile: single merged chip cloud */}
            <div className="sm:hidden">
              <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">We service</p>
              <div className="flex flex-wrap justify-center gap-2">
                {[...deviceBrands, ...softwareBrands].map((brand) => (
                  <span key={brand} className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[11px] font-medium tracking-wide text-[var(--ink-muted)]">
                    {brand}
                  </span>
                ))}
              </div>
            </div>

            {/* Desktop: two labelled rows */}
            <div className="hidden sm:block">
              <div className="mb-3 flex items-center gap-3">
                <div className="h-px flex-1 bg-[var(--line)]" />
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">Devices we service</p>
                <div className="h-px flex-1 bg-[var(--line)]" />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {deviceBrands.map((brand) => (
                  <span key={brand} className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[11px] font-medium tracking-wide text-[var(--ink-muted)] transition-colors hover:border-[var(--accent)]/30 hover:text-[var(--accent)]/80">
                    {brand}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="text-[11px] font-semibold text-[var(--ink-muted)]">Software & licenses</span>
                <span className="h-px w-10 bg-[var(--line)]" />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {softwareBrands.map((brand) => (
                  <span key={brand} className="rounded-full border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-3 py-1 text-[11px] font-medium tracking-wide text-white/70 transition-colors hover:border-[var(--accent)]/35 hover:text-white">
                    {brand}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Commitments */}
          <div className="fade-in mt-5 hidden sm:block">
            <div className="mb-3 flex items-center gap-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">Our commitment to you</p>
              <div className="h-px flex-1 bg-[var(--line)]" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {commitments.map((c, i) => (
                <div key={c.title} className="flex min-h-[4rem] items-start gap-2.5 rounded-xl border border-white/8 bg-[#141414] px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/14 hover:bg-[#181818]">
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[10px] font-bold text-[var(--accent)]">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-[var(--ink)]">{c.title}</p>
                    <p className="mt-0.5 hidden text-[11px] leading-4 text-[var(--ink-muted)] sm:block">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--line)] px-4 py-5 text-center">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="text-[11px] text-[var(--ink-muted)]">© 2026 Eagle Info Solutions SMC Limited</span>
            <Link href="/login" className="text-[11px] font-semibold text-[var(--ink-muted)] transition-colors hover:text-[var(--accent)]">
              Staff login
            </Link>
            <a
              href="https://eagleinfosolutions.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1 text-[11px] font-semibold text-white/70 transition-all hover:border-[var(--accent)]/35 hover:text-[var(--accent)]"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              eagleinfosolutions.com
            </a>
          </div>
          <div className="mt-3 flex items-center justify-center gap-3">
            <a href="https://www.facebook.com/EagleInfoSolutions" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/50 transition-all hover:border-[var(--accent)]/40 hover:text-[var(--accent)]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>
            </a>
            <a href="https://www.instagram.com/EagleInfo_UG" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/50 transition-all hover:border-[var(--accent)]/40 hover:text-[var(--accent)]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>
            </a>
            <a href="https://www.tiktok.com/@EagleInfo_UG" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/50 transition-all hover:border-[var(--accent)]/40 hover:text-[var(--accent)]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.78a4.85 4.85 0 01-1.01-.09z"/></svg>
            </a>
            <a href="https://www.linkedin.com/company/104326797/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/50 transition-all hover:border-[var(--accent)]/40 hover:text-[var(--accent)]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>
            </a>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
            <a href="tel:+256772006344" className="flex items-center gap-1.5 text-[11px] text-[var(--ink-muted)] transition-colors hover:text-[var(--accent)]">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8 19.79 19.79 0 012 1.18 2 2 0 014 .03h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>
              +256 772 006 344
            </a>
            <span className="text-[11px] text-[var(--ink-muted)]/60">·</span>
            <a href="tel:+256754006344" className="text-[11px] text-[var(--ink-muted)] transition-colors hover:text-[var(--accent)]">+256 754 006 344</a>
            <span className="text-[11px] text-[var(--ink-muted)]/60">·</span>
            <a
              href="https://www.google.com/maps/search/?api=1&query=Eagle+Info+Solutions%2C+Shop+L28%2C+1st+Floor%2C+Nalubega+Complex%2C+Bombo+Road%2C+Kampala%2C+Uganda"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-[11px] text-[var(--ink-muted)] transition-colors hover:text-[var(--accent)]"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              Shop L28, Nalubega Complex, Kampala
            </a>
          </div>
        </div>
      </main>
      <WhatsAppFloat />
    </>
  );
}
