"use client";

import { useState } from "react";
import Link from "next/link";

interface FormState {
  orgName: string;
  adminName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const PLANS = [
  {
    id: "FREE",
    label: "Ekyenfuna",
    price: "UGX 0 / mo",
    desc: "Explore the platform — unlimited trial with no time limit.",
    features: ["1 workspace user", "20 jobs / month", "20 inventory items", "Basic reports"],
  },
  {
    id: "STARTER",
    label: "Okutandika",
    price: "UGX 35,000 / mo",
    desc: "Small shop just getting started.",
    features: ["5 users", "100 jobs / month", "100 inventory items", "Full reports", "WhatsApp notifications"],
  },
  {
    id: "PROFESSIONAL",
    label: "Enkola",
    price: "UGX 75,000 / mo",
    desc: "Growing team with multi-location needs.",
    features: ["15 users", "500 jobs / month", "300 inventory items", "Custom branding", "CRM & campaigns"],
  },
] as const;

type PlanId = (typeof PLANS)[number]["id"];

export function SignupForm() {
  const [form, setForm] = useState<FormState>({
    orgName: "",
    adminName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [plan, setPlan] = useState<PlanId>("FREE");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setState("loading");
    try {
      const res = await fetch("/api/org/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgName:   form.orgName,
          adminName: form.adminName,
          email:     form.email,
          password:  form.password,
          plan,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.issues) setFieldErrors(data.issues as Record<string, string[]>);
        setError(data.error ?? "Signup failed. Please try again.");
        setState("error");
        return;
      }
      setState("success");
    } catch {
      setError("Network error. Please check your connection.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-green-500/30 bg-green-500/10">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-green-400" aria-hidden>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-white">Your workspace is ready</h2>
        <p className="max-w-xs text-sm text-white/60">
          Account created for <span className="text-[#4F8EF7]">{form.email}</span>. Log in to access your workspace.
        </p>
        <Link
          href="/login"
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-[#4F8EF7] px-6 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
        >
          Log in to your workspace
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* ── Step 1: org info ── */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-white/40">Your organisation</h3>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-white/60">Business / Organisation name *</label>
          <input
            required
            value={form.orgName}
            onChange={set("orgName")}
            placeholder="Acme Repairs Ltd"
            className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-3 text-base text-white placeholder-white/25 outline-none ring-[#4F8EF7]/60 transition focus:border-[#4F8EF7]/40 focus:ring-1"
          />
          {fieldErrors.orgName && <p className="text-xs text-red-400">{fieldErrors.orgName[0]}</p>}
        </div>
      </div>

      {/* ── Step 2: admin user ── */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-white/40">Admin account</h3>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-white/60">Your full name *</label>
          <input
            required
            value={form.adminName}
            onChange={set("adminName")}
            placeholder="John Ssebagala"
            className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-3 text-base text-white placeholder-white/25 outline-none ring-[#4F8EF7]/60 transition focus:border-[#4F8EF7]/40 focus:ring-1"
          />
          {fieldErrors.adminName && <p className="text-xs text-red-400">{fieldErrors.adminName[0]}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-white/60">Work email *</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={set("email")}
            placeholder="john@acmerepairs.com"
            autoComplete="email"
            className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-3 text-base text-white placeholder-white/25 outline-none ring-[#4F8EF7]/60 transition focus:border-[#4F8EF7]/40 focus:ring-1"
          />
          {fieldErrors.email && <p className="text-xs text-red-400">{fieldErrors.email[0]}</p>}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-white/60">Password *</label>
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={set("password")}
              placeholder="min. 8 chars"
              autoComplete="new-password"
              className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-3 text-base text-white placeholder-white/25 outline-none ring-[#4F8EF7]/60 transition focus:border-[#4F8EF7]/40 focus:ring-1"
            />
            {fieldErrors.password && <p className="text-xs text-red-400">{fieldErrors.password[0]}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-white/60">Confirm *</label>
            <input
              type="password"
              required
              value={form.confirmPassword}
              onChange={set("confirmPassword")}
              placeholder="repeat password"
              autoComplete="new-password"
              className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-3 text-base text-white placeholder-white/25 outline-none ring-[#4F8EF7]/60 transition focus:border-[#4F8EF7]/40 focus:ring-1"
            />
          </div>
        </div>
      </div>

      {/* ── Step 3: plan selection ── */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-white/40">Choose a plan</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {PLANS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlan(p.id)}
              className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition ${
                plan === p.id
                  ? "border-[#4F8EF7]/60 bg-[#4F8EF7]/8"
                  : "border-white/8 bg-white/3 hover:border-white/16"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">{p.label}</span>
                {plan === p.id && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-[#4F8EF7]" aria-hidden>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>
              <span className="text-[13px] font-medium text-[#4F8EF7]/80">{p.price}</span>
              <span className="text-[13px] text-white/40">{p.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Error ── */}
      {(state === "error" || error) && error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* ── Submit ── */}
      <button
        type="submit"
        disabled={state === "loading"}
        className="flex items-center justify-center gap-2 rounded-lg bg-[#4F8EF7] py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {state === "loading" ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="3"/>
              <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
            </svg>
            Creating workspace…
          </>
        ) : (
          <>
            Create workspace
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </>
        )}
      </button>

      <p className="text-center text-xs text-white/30">
        Already have an account?{" "}
        <Link href="/login" className="text-[#4F8EF7]/70 hover:text-[#4F8EF7] transition-colors">
          Log in
        </Link>
      </p>
    </form>
  );
}
