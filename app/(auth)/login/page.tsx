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
    <main className="theme-blackgold min-h-dvh bg-[var(--panel)]">
      <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
        <section className="order-2 relative overflow-hidden bg-[linear-gradient(140deg,#000000_0%,#1a1a1a_40%,#D4AF37_100%)] px-5 py-7 text-white sm:px-8 sm:py-10 lg:order-1 lg:px-12 lg:py-14">
          <div className="pointer-events-none absolute -left-20 -top-20 h-60 w-60 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-20 h-72 w-72 rounded-full bg-[var(--accent)]/20 blur-3xl" />

          <div className="relative mx-auto max-w-xl space-y-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/80">Eagle Info Solutions</p>
              <h1 className="mt-3 text-2xl font-semibold leading-tight sm:text-3xl lg:text-4xl">
                Repair jobs, without the chaos
              </h1>
              <p className="mt-4 max-w-prose text-sm leading-6 text-white/90">
                Staff access for intake, technicians, and operations. Clear status, clear accountability.
              </p>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {[
                "Role-based access keeps client data protected",
                "Statuses, approvals, and timelines stay auditable",
              ].map((item) => (
                <div key={item} className="rounded-xl border border-white/25 bg-white/10 p-3 backdrop-blur-sm">
                  <p className="text-sm text-white/95">{item}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-white/25 bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-sm font-semibold">Workflow promise</p>
              <p className="mt-1 text-sm text-white/90">Every change is logged. Every handoff is traceable.</p>
            </div>
          </div>
        </section>

        <section className="order-1 flex items-center justify-center bg-[var(--panel)] px-4 py-5 sm:px-6 sm:py-8 lg:order-2 lg:px-10">
          <div className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.45)] sm:p-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-sm">
                <Image
                  src="/eagle-info-logo.png"
                  alt="Eagle Info logo"
                  width={40}
                  height={40}
                  className="h-10 w-10 object-cover"
                  priority
                />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">MRMS</p>
                <p className="text-sm font-semibold text-[var(--ink)]">Eagle Info Solutions</p>
              </div>
            </div>
            <h2 className="mt-2 text-xl font-semibold text-[var(--ink)] sm:text-2xl">Machine Repair Management System</h2>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">Staff login to manage jobs, approvals, and updates.</p>

            <div className="mt-6">
              <LoginForm />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
