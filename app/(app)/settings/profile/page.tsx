import { getCurrentUserRole } from "@/lib/session";
import { ProfileForm } from "@/components/settings/ProfileForm";

export default async function ProfilePage() {
  let user: {
    name: string;
    email: string;
    role: string;
    phone: string | null;
  } | null = null;

  let errorMessage: string | null = null;

  try {
    const result = await getCurrentUserRole();
    user = {
      name: result.user.name ?? "",
      email: result.user.email ?? "",
      role: result.user.role ?? "",
      phone: result.user.phone ?? null,
    };
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Failed to load profile";
  }

  if (errorMessage || !user) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <p className="font-semibold">Could not load profile</p>
          <p className="mt-1 text-xs opacity-80">{errorMessage ?? "Profile data is unavailable."}</p>
        </div>
        <a
          href="/settings/profile"
          className="inline-block rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-1.5 text-sm hover:bg-[var(--surface)]"
        >
          Retry
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProfileForm name={user.name} email={user.email} role={user.role} phone={user.phone} />
    </div>
  );
}
