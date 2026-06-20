import { redirect } from "next/navigation";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const WA_PATH = "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.-378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z";

function NeutralMark({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14 text-lg" : "h-11 w-11 text-base";
  return (
    <div className="flex items-center gap-3">
      <span className={`flex ${box} items-center justify-center rounded-2xl bg-[#4F8EF7] font-black text-black`}>
        OS
      </span>
      <span>
        <span className="block text-sm font-bold text-white">Business OS</span>
        <span className="block text-[12px] text-white/40">Operations</span>
      </span>
    </div>
  );
}

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
    <main className="theme-blackgold min-h-dvh bg-[#0a1628]">
      {/* Subtle ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-[#4F8EF7]/8 blur-[120px]" />
      </div>

      <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[1fr_1fr]">

        {/* ── Left: branding panel (desktop only) ── */}
        <section className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(150deg,#0a1628_0%,#0f1f3a_50%,#0a1628_100%)] p-12 lg:flex">
          <div className="pointer-events-none absolute -left-16 top-1/3 h-80 w-80 rounded-full bg-[#4F8EF7]/10 blur-[80px]" />
          <div className="pointer-events-none absolute -right-10 bottom-20 h-60 w-60 rounded-full bg-[#4F8EF7]/6 blur-[60px]" />

          <div className="relative">
            <NeutralMark />
          </div>

          <div className="relative space-y-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4F8EF7]/70">All-in-one Business OS</p>
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
                  label: "Stock & Inventory", desc: "Items · suppliers · stock",
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
                  <span className="mt-0.5 text-[#4F8EF7]/50">{m.icon}</span>
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
                  <span key={r} className="rounded-full border border-[#4F8EF7]/20 bg-[#4F8EF7]/6 px-2.5 py-0.5 text-[12px] font-medium text-[#4F8EF7]/70">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="relative flex items-center justify-between">
            <p className="text-[13px] text-white/25">© {new Date().getFullYear()} Business OS</p>
            <a
              href="https://wa.me/256772006344"
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#25D366] transition hover:opacity-80"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden><path d={WA_PATH}/></svg>
              +256 772 006 344
            </a>
          </div>
        </section>

        {/* ── Right: login form ── */}
        <section className="flex min-h-dvh items-center justify-center px-5 py-10 lg:min-h-0 lg:bg-[#0f1f3a] lg:px-12">
          <div className="w-full max-w-sm">

            {/* Mobile-only logo */}
            <div className="mb-8 flex justify-center lg:hidden">
              <NeutralMark size="lg" />
            </div>

            {/* Desktop logo row */}
            <div className="mb-8 hidden lg:flex">
              <NeutralMark />
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
