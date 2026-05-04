"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // Force same-origin to avoid cookie issues when NEXT_PUBLIC_APP_URL
  // is set to a different domain than the one the user is visiting.
  baseURL: typeof window !== "undefined" ? window.location.origin : undefined,
});
