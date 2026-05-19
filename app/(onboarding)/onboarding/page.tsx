import { redirect } from "next/navigation";

import { OnboardingForm } from "./OnboardingForm";
import { getCurrentUserRole } from "@/lib/session";

export default async function OnboardingPage() {
  const { user } = await getCurrentUserRole();

  // Already onboarded — send to app.
  if (user?.orgId) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-2xl space-y-8">
        {/* Logo / wordmark */}
        <div className="space-y-2 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--gold)] text-black">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Set up your workspace</h1>
          <p className="text-sm text-[var(--ink-muted)]">
            Tell us about your business so we can set up the right tools and billing plan for you.
          </p>
        </div>

        <OnboardingForm />

        <p className="text-center text-xs text-[var(--ink-muted)]">
          Logged in as <span className="font-medium">{user?.email}</span>
        </p>
      </div>
    </div>
  );
}
