import { redirect } from "next/navigation";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { AppLogoDark } from "@/components/ui/AppLogo";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export default async function LoginPage() {
  const session = await getSession();
  const validUser = session?.user
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, isActive: true },
      })
    : null;

  if (validUser?.isActive) {
    redirect("/dashboard");
  }

  return (
    <main className="theme-blackgold min-h-dvh bg-[#0a0a0a]">
      {/* Subtle ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-[#D4AF37]/8 blur-[120px]" />
      </div>

      <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[1fr_1fr]">

        {/* ── Left: branding panel (desktop only) ── */}
        <section className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(150deg,#0d0d0d_0%,#161616_50%,#1a1500_100%)] p-12 lg:flex">
          <div className="pointer-events-none absolute -left-16 top-1/3 h-80 w-80 rounded-full bg-[#D4AF37]/10 blur-[80px]" />
          <div className="pointer-events-none absolute -right-10 bottom-20 h-60 w-60 rounded-full bg-[#D4AF37]/6 blur-[60px]" />

          <div className="relative">
            <AppLogoDark height={52} priority />
          </div>

          <div className="relative space-y-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D4AF37]/70">All-in-one Business OS</p>
              <h1 className="mt-2 text-2xl font-semibold leading-snug text-white xl:text-3xl">
                Every module your<br />business needs
              </h1>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/50">
                From repair jobs to finance — all roles, one platform.
              </p>
            </div>

            {/* Module grid */}
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  label: "Repair & Service", desc: "Jobs · diagnosis · status",
                  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
                },
                {
                  label: "Stock & Inventory", desc: "Parts · suppliers · stock",
                  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/></svg>,
                },
                {
                  label: "Clients & Sales", desc: "CRM · leads · follow-ups",
                  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
                },
                {
                  label: "Documents", desc: "Quotes · invoices · receipts",
                  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>,
                },
                {
                  label: "Finance", desc: "Payments · expenses · P&L",
                  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
                },
                {
                  label: "Reports", desc: "Analytics · KPIs · exports",
                  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>,
                },
                {
                  label: "Communications", desc: "WhatsApp · SMS · notes",
                  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
                },
                {
                  label: "Security & Admin", desc: "Roles · audit trail · users",
                  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>,
                },
              ].map((m) => (
                <div
                  key={m.label}
                  className="flex items-start gap-2 rounded-lg border border-white/6 bg-white/3 px-3 py-2.5"
                >
                  <span className="mt-0.5 text-[#D4AF37]/50">{m.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-white/80 leading-tight">{m.label}</p>
                    <p className="text-[12px] text-white/35 leading-tight mt-0.5">{m.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Role strip */}
            <div>
              <p className="text-[12px] uppercase tracking-widest text-white/30 mb-2">9 role-isolated access levels</p>
              <div className="flex flex-wrap gap-1.5">
                {["Admin", "Tech Manager", "Sales Manager", "Operations", "Technician", "Sales", "Front Desk", "Cashier", "External Tech"].map((r) => (
                  <span key={r} className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/6 px-2.5 py-0.5 text-[12px] font-medium text-[#D4AF37]/70">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="relative flex items-center justify-between">
            <p className="text-[13px] text-white/25">© {new Date().getFullYear()} Duuka Pro Max</p>
            <a
              href="https://app.eagleinfosolutions.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-[#D4AF37]/50 hover:text-[#D4AF37] transition-colors"
            >
              app.eagleinfosolutions.com →
            </a>
          </div>
        </section>

        {/* ── Right: login form ── */}
        <section className="flex min-h-dvh items-center justify-center px-5 py-10 lg:min-h-0 lg:bg-[#0d0d0d] lg:px-12">
          <div className="w-full max-w-sm">

            {/* Mobile-only logo */}
            <div className="mb-8 flex justify-center lg:hidden">
              <AppLogoDark height={64} priority />
            </div>

            {/* Desktop logo row */}
            <div className="mb-8 hidden lg:flex">
              <AppLogoDark height={48} priority />
            </div>

            <h2 className="text-2xl font-semibold text-white">Sign in</h2>
            <p className="mt-1.5 text-sm text-white/40">Enter your credentials to continue</p>

            <div className="mt-8">
              <LoginForm />
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
