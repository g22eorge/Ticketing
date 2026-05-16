"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.replace("/login");
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-sm text-[var(--ink-muted)] transition hover:text-red-500"
    >
      Sign out
    </button>
  );
}
