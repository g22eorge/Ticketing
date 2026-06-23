import Link from "next/link";
import { redirect } from "next/navigation";

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
    <main className="theme-blackgold min-h-dvh bg-[#0a1628]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-[#4F8EF7]/8 blur-[120px]" />
      </div>

      <div className="flex min-h-dvh items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">

          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#4F8EF7] font-black text-white text-base">
                TI
              </span>
              <span>
                <span className="block text-sm font-bold text-white">Techserve ICT Solutions</span>
                <span className="block text-[12px] text-white/40">Service Desk</span>
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
            <h2 className="text-xl font-semibold text-white">Staff Login</h2>
            <p className="mt-1.5 text-sm text-white/40">Access your service desk and operations modules.</p>

            <div className="mt-6">
              <LoginForm />
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 flex items-center justify-center gap-4 text-[11px] text-white/20">
            <Link
              href="/"
              className="underline-offset-1 transition hover:text-white/40 hover:underline"
            >
              Home
            </Link>
            <span>·</span>
            <p>
              © {new Date().getFullYear()} Techserve Solutions Limited. All Rights Reserved.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}