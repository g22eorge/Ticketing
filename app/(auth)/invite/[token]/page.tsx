import { AppLogoDark } from "@/components/ui/AppLogo";
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
    <main className="theme-blackgold min-h-dvh bg-[#05080f]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-[#E6C65C]/8 blur-[120px]" />
      </div>

      <div className="flex min-h-dvh items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm space-y-8">

          {/* Logo */}
          <div className="flex justify-center">
            <AppLogoDark height={60} priority />
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
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E6C65C]/70">
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
