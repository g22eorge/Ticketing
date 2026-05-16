"use client";

import Link from "next/link";
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
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ email, password, callbackURL: "/dashboard", rememberMe }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
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
      {/* Email */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-[0.12em] text-white/40" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#D4AF37]/50 focus:bg-white/8 focus:ring-2 focus:ring-[#D4AF37]/15"
        />
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-[0.12em] text-white/40" htmlFor="password">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-20 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#D4AF37]/50 focus:bg-white/8 focus:ring-2 focus:ring-[#D4AF37]/15"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-medium text-white/30 transition hover:text-white/60"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {/* Remember / Forgot */}
      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-white/40 hover:text-white/60 transition">
          <input
            type="checkbox"
            name="rememberMe"
            className="h-3.5 w-3.5 rounded border border-white/20 bg-white/5 accent-[#D4AF37]"
          />
          Remember me
        </label>
        <button
          type="button"
          onClick={() => {
            const emailInput = formRef.current?.querySelector<HTMLInputElement>('input[name="email"]');
            const email = (emailInput?.value ?? "").trim();
            const waNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
            if (waNumber) {
              const message = `Hi Support, please reset my password. Email: ${email || "<your email>"}`;
              window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
            } else {
              alert("Please contact your administrator to reset your password.");
            }
          }}
          className="text-xs text-[#D4AF37]/60 transition hover:text-[#D4AF37]"
        >
          Forgot password?
        </button>
      </div>

      {/* Submit */}
      <button
        disabled={isPending}
        type="submit"
        className="mt-2 w-full rounded-xl bg-[#D4AF37] py-3 text-sm font-semibold text-black transition hover:bg-[#c9a430] disabled:opacity-50"
      >
        {isPending ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-center text-xs text-white/30">
        New here?{" "}
        <Link href="/register" className="text-[#D4AF37]/70 transition hover:text-[#D4AF37]">
          Create a free account
        </Link>
      </p>
    </form>
  );
}
