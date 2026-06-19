import Link from "next/link";
import { redirect } from "next/navigation";

import { RegisterForm } from "./register-form";
import { AppLogoDark } from "@/components/ui/AppLogo";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function RegisterPage() {
  const session = await getSession();
  const validUser = session?.user
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, isActive: true, orgId: true },
      })
    : null;

  // Already logged in and onboarded → go to app.
  if (validUser?.isActive && validUser.orgId) redirect("/dashboard");
  // Logged in but no org → finish onboarding.
  if (validUser?.isActive) redirect("/onboarding");

  return (
    <main className="theme-blackgold min-h-dvh bg-[#05080f]">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-[#4F8EF7]/8 blur-[120px]" />
      </div>

      <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[1fr_1fr]">

        {/* ── Left: branding panel ── */}
        <section className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(150deg,#0d0d0d_0%,#161616_50%,#1a1500_100%)] p-12 lg:flex">
          <div className="pointer-events-none absolute -left-16 top-1/3 h-80 w-80 rounded-full bg-[#4F8EF7]/10 blur-[80px]" />
          <div className="pointer-events-none absolute -right-10 bottom-20 h-60 w-60 rounded-full bg-[#4F8EF7]/6 blur-[60px]" />

          <div className="relative">
            <AppLogoDark height={52} priority />
          </div>

          <div className="relative space-y-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4F8EF7]/70">Business OS</p>
              <h1 className="mt-3 text-3xl font-semibold leading-snug text-white xl:text-4xl">
                Your operations,<br />fully organised
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/55">
                Set up your workspace in 60 seconds. Manage jobs, technicians, and clients — all in one place.
              </p>
            </div>

            <div className="space-y-3">
              {[
                { icon: "◈", text: "Role-based access for your whole team" },
                { icon: "◈", text: "Client data stays private from external techs" },
                { icon: "◈", text: "Full audit trail on every job and status change" },
              ].map((item) => (
                <div key={item.text} className="flex items-start gap-3">
                  <span className="mt-0.5 text-[#4F8EF7]/60 text-xs">{item.icon}</span>
                  <p className="text-sm text-white/55">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="relative text-[13px] text-white/25">© {new Date().getFullYear()} Nexus</p>
        </section>

        {/* ── Right: register form ── */}
        <section className="flex min-h-dvh items-center justify-center px-5 py-10 lg:min-h-0 lg:bg-[#0d0d0d] lg:px-12">
          <div className="w-full max-w-sm">

            {/* Mobile logo */}
            <div className="mb-8 flex justify-center lg:hidden">
              <AppLogoDark height={64} priority />
            </div>

            {/* Desktop logo row */}
            <div className="mb-8 hidden lg:flex">
              <AppLogoDark height={48} priority />
            </div>

            <h2 className="text-2xl font-semibold text-white">Create your account</h2>
            <p className="mt-1.5 text-sm text-white/40">Start managing your team in minutes — no credit card needed</p>

            <div className="mt-8">
              <RegisterForm />
            </div>

            <p className="mt-6 text-center text-xs text-white/30">
              Already have an account?{" "}
              <Link href="/login" className="text-[#4F8EF7]/70 transition hover:text-[#4F8EF7]">
                Sign in
              </Link>
            </p>
          </div>
        </section>

      </div>
    </main>
  );
}
