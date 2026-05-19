import { redirect } from "next/navigation";
import Image from "next/image";

import { LoginForm } from "@/app/(auth)/login/login-form";
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
            <div className="flex items-center gap-3">
              <div className="overflow-hidden rounded-xl border border-white/10">
                <Image src="/eagle-info-logo.png" alt="Logo" width={36} height={36} className="h-9 w-9 object-cover" priority />
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/50">Nexus</span>
            </div>
          </div>

          <div className="relative space-y-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D4AF37]/70">Business OS</p>
              <h1 className="mt-3 text-3xl font-semibold leading-snug text-white xl:text-4xl">
                Every team,<br />one workspace
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/55">
                Finance, sales, operations, repairs, and field staff — each role sees exactly what they need, nothing more.
              </p>
            </div>

            <div className="space-y-3">
              {[
                { icon: "◈", text: "10 modules — pick only what your business needs" },
                { icon: "◈", text: "Role-based access with a full audit trail on every action" },
                { icon: "◈", text: "External vendors see job specs only — client data always protected" },
              ].map((item) => (
                <div key={item.text} className="flex items-start gap-3">
                  <span className="mt-0.5 text-[#D4AF37]/60 text-xs">{item.icon}</span>
                  <p className="text-sm text-white/55">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <p className="text-[11px] text-white/25">© {new Date().getFullYear()} Nexus</p>
          </div>
        </section>

        {/* ── Right: login form ── */}
        <section className="flex min-h-dvh items-center justify-center px-5 py-10 lg:min-h-0 lg:bg-[#0d0d0d] lg:px-12">
          <div className="w-full max-w-sm">

            {/* Mobile-only logo */}
            <div className="mb-8 flex flex-col items-center lg:hidden">
              <div className="overflow-hidden rounded-2xl border border-white/10 shadow-lg shadow-black/40">
                <Image src="/eagle-info-logo.png" alt="Logo" width={56} height={56} className="h-14 w-14 object-cover" priority />
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-white/40">Nexus</p>
            </div>

            {/* Desktop logo row */}
            <div className="mb-8 hidden items-center gap-3 lg:flex">
              <div className="overflow-hidden rounded-xl border border-white/10">
                <Image src="/eagle-info-logo.png" alt="Logo" width={36} height={36} className="h-9 w-9 object-cover" priority />
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">Nexus</span>
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
