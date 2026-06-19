"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

export function RegisterForm() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const confirm = String(data.get("confirmPassword") ?? "");

    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setIsPending(true);
    try {
      const { error } = await authClient.signUp.email({
        name,
        email,
        password,
        callbackURL: "/onboarding",
      });

      if (error) {
        toast.error(error.message ?? "Registration failed. Please try again.");
        return;
      }

      router.replace("/onboarding");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Full name */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-[0.12em] text-white/40" htmlFor="name">
          Full name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          placeholder="Jane Doe"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#E6C65C]/50 focus:bg-white/8 focus:ring-2 focus:ring-[#E6C65C]/15"
        />
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-[0.12em] text-white/40" htmlFor="email">
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@yourbusiness.com"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#E6C65C]/50 focus:bg-white/8 focus:ring-2 focus:ring-[#E6C65C]/15"
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
            autoComplete="new-password"
            placeholder="Min. 8 characters"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-20 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#E6C65C]/50 focus:bg-white/8 focus:ring-2 focus:ring-[#E6C65C]/15"
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

      {/* Confirm password */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-[0.12em] text-white/40" htmlFor="confirmPassword">
          Confirm password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type={showPassword ? "text" : "password"}
          required
          autoComplete="new-password"
          placeholder="Repeat password"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#E6C65C]/50 focus:bg-white/8 focus:ring-2 focus:ring-[#E6C65C]/15"
        />
      </div>

      {/* Submit */}
      <button
        disabled={isPending}
        type="submit"
        className="mt-2 w-full rounded-xl bg-[#E6C65C] py-3 text-sm font-semibold text-black transition hover:bg-[#c9a430] disabled:opacity-50"
      >
        {isPending ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-[13px] text-white/20">
        By signing up you agree to our terms of service.
      </p>
    </form>
  );
}
