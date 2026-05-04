"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { toast } from "sonner";

export function LoginForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const rememberMe = Boolean(data.get("rememberMe"));

    setIsPending(true);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          callbackURL: "/dashboard",
          rememberMe,
        }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
        toast.error(errorBody.message || "Invalid credentials");
        return;
      }

      router.replace("/dashboard");
    } catch {
      toast.error("Sign in failed. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          placeholder="you@eagleinfo.com"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="password">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 pr-24 text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            placeholder="Enter your password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--panel)]"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 text-[var(--ink-muted)]">
          <input type="checkbox" name="rememberMe" className="h-4 w-4 rounded border border-[var(--line)] text-[var(--accent)]" />
          Remember me
        </label>
        <button
          type="button"
          onClick={() => {
            const emailInput = formRef.current?.querySelector<HTMLInputElement>('input[name="email"]');
            const email = (emailInput?.value ?? "").trim();
            const message = `Hi Eagle Info Support, please reset my MRMS password. Email: ${email || "<your email>"}`;
            const url = `https://wa.me/256772006344?text=${encodeURIComponent(message)}`;
            window.open(url, "_blank", "noopener,noreferrer");
          }}
          className="text-[var(--accent)] hover:underline"
        >
          Forgot password?
        </button>
      </div>

      <button
        disabled={isPending}
        type="submit"
        className="btn-premium w-full rounded-lg px-3 py-2 text-white disabled:opacity-60"
      >
        {isPending ? "Signing in..." : "Sign in"}
      </button>

      <p className="text-center text-xs text-[var(--ink-muted)]">
        Need help accessing your account? Contact system support.
      </p>
    </form>
  );
}
