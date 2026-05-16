import Image from "next/image";

import { prisma } from "@/lib/prisma";
import { AcceptForm } from "./AcceptForm";

type Props = { params: Promise<{ token: string }> };

export default async function AcceptInvitePage({ params }: Props) {
  const { token } = await params;

  const invite = await prisma.userInvite.findUnique({
    where: { token },
    include: { org: { select: { name: true } } },
  });

  const isExpired = invite && invite.expiresAt < new Date();
  const isUsed = invite?.usedAt != null;
  const isInvalid = !invite || isExpired || isUsed;

  return (
    <main className="theme-blackgold min-h-dvh bg-[#0a0a0a]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-[#D4AF37]/8 blur-[120px]" />
      </div>

      <div className="flex min-h-dvh items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm space-y-8">

          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <div className="overflow-hidden rounded-2xl border border-white/10 shadow-lg shadow-black/40">
              <Image src="/eagle-info-logo.png" alt="Logo" width={52} height={52} className="h-13 w-13 object-cover" priority />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">Repair Manager</p>
          </div>

          {isInvalid ? (
            /* ── Invalid / expired / used ── */
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center space-y-3">
              <p className="text-2xl">⚠️</p>
              <h2 className="text-lg font-semibold text-white">
                {isUsed ? "Invite already used" : isExpired ? "Invite expired" : "Invalid invite link"}
              </h2>
              <p className="text-sm text-white/40">
                {isUsed
                  ? "This invite link has already been accepted. Try signing in instead."
                  : isExpired
                  ? "This invite link expired after 7 days. Ask your admin to send a new one."
                  : "This invite link is not valid. Check the link or ask your admin for a new one."}
              </p>
            </div>
          ) : (
            /* ── Accept form ── */
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D4AF37]/70">
                  You&apos;ve been invited
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Join {invite.org.name}
                </h2>
                <p className="mt-1.5 text-sm text-white/40">
                  Set up your account to get started as{" "}
                  <span className="text-white/60 font-medium">
                    {invite.role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                  </span>
                </p>
              </div>

              <AcceptForm token={token} email={invite.email} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
