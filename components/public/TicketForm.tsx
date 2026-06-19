"use client";

import { useState } from "react";

const CATEGORIES = [
  { value: "HARDWARE", label: "Hardware" },
  { value: "SOFTWARE", label: "Software" },
  { value: "NETWORK", label: "Network" },
  { value: "INTERNET", label: "Internet / Connectivity" },
  { value: "EMAIL", label: "Email" },
  { value: "PRINTER", label: "Printer" },
  { value: "OTHER", label: "Other" },
];

const PRIORITIES = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

type Step = "form" | "success";

interface FormData {
  reporter_name: string;
  reporter_phone: string;
  reporter_email: string;
  reporter_company: string;
  subject: string;
  category: string;
  priority: string;
  device_info: string;
  description: string;
  _hp: string;
}

const empty: FormData = {
  reporter_name: "",
  reporter_phone: "",
  reporter_email: "",
  reporter_company: "",
  subject: "",
  category: "",
  priority: "MEDIUM",
  device_info: "",
  description: "",
  _hp: "",
};

interface TicketFormProps {
  orgSlug?: string;
  companyName?: string;
}

export function TicketForm({ orgSlug, companyName = "ICT Support" }: TicketFormProps) {
  const [step, setStep] = useState<Step>("form");
  const [data, setData] = useState<FormData>(empty);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [ticketNum, setTicketNum] = useState("");

  function setField(field: keyof FormData, value: string) {
    setData((d) => ({ ...d, [field]: value }));
    setErrors([]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (data._hp) { setStep("success"); setTicketNum("TKT-" + Date.now()); return; }

    setBusy(true);
    setErrors([]);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reporter_name: data.reporter_name,
          reporter_phone: data.reporter_phone,
          reporter_email: data.reporter_email || undefined,
          reporter_company: data.reporter_company || undefined,
          subject: data.subject,
          category: data.category,
          priority: data.priority,
          device_info: data.device_info || undefined,
          description: data.description,
          ...(orgSlug ? { org_slug: orgSlug } : {}),
          _hp: "",
        }),
      });

      const json = await res.json();
      if (res.ok && json.success !== false) {
        setTicketNum(json.ticket_number ?? "");
        setStep("success");
      } else {
        setErrors(json.errors ?? [json.error ?? "Something went wrong. Please try again."]);
      }
    } catch {
      setErrors(["Network error. Please check your connection and try again."]);
    } finally {
      setBusy(false);
    }
  }

  if (step === "success") {
    return (
      <div className="flex flex-col items-center gap-6 rounded-2xl border border-green-500/25 bg-green-500/5 px-8 py-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-green-500/30 bg-green-500/15 text-green-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8" aria-hidden="true">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <div>
          <p className="text-lg font-bold text-white">Ticket Submitted!</p>
          {ticketNum && <p className="mt-1 font-mono text-sm font-semibold text-green-400">{ticketNum}</p>}
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/55">
            Hello {data.reporter_name || "Customer"},<br /><br />
            Thank you for submitting your support request{ticketNum ? ` — ${ticketNum}` : ""}.<br /><br />
            Our team has been notified and will respond to you shortly.<br /><br />
            Best regards,<br />{companyName}
          </p>
        </div>
        <button
          onClick={() => { setStep("form"); setData(empty); setTicketNum(""); }}
          className="rounded-xl border border-white/12 bg-white/5 px-5 py-2.5 text-sm font-medium text-white/60 transition hover:text-white"
        >
          Submit another ticket
        </button>
      </div>
    );
  }

  const inputCls = "w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-[#4F8EF7]/50 focus:ring-1 focus:ring-[#4F8EF7]/25";
  const labelCls = "mb-1 block text-[13px] font-semibold uppercase tracking-wider text-white/40";

  return (
    <form onSubmit={submit} noValidate>
      <input type="text" name="_hp" value={data._hp} onChange={(e) => setField("_hp", e.target.value)} tabIndex={-1} aria-hidden="true"
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }} autoComplete="off" />

      {errors.length > 0 && (
        <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          {errors.map((e) => <p key={e} className="text-sm text-red-400">{e}</p>)}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Full Name *</label>
          <input required value={data.reporter_name} onChange={(e) => setField("reporter_name", e.target.value)}
            placeholder="e.g. Sarah Namutebi" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Phone Number *</label>
          <input required type="tel" value={data.reporter_phone} onChange={(e) => setField("reporter_phone", e.target.value)}
            placeholder="07xx xxx xxx" className={inputCls} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Email <span className="text-white/25 normal-case font-normal">(optional)</span></label>
          <input type="email" value={data.reporter_email} onChange={(e) => setField("reporter_email", e.target.value)}
            placeholder="you@example.com" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Company <span className="text-white/25 normal-case font-normal">(optional)</span></label>
          <input value={data.reporter_company} onChange={(e) => setField("reporter_company", e.target.value)}
            placeholder="Your company or department" className={inputCls} />
        </div>
      </div>

      <div className="mt-4">
        <label className={labelCls}>Subject *</label>
        <input required value={data.subject} onChange={(e) => setField("subject", e.target.value)}
          placeholder="Brief summary of the issue..." className={inputCls} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Category *</label>
          <select required value={data.category} onChange={(e) => setField("category", e.target.value)}
            className={inputCls + " cursor-pointer"}>
            <option value="" disabled>Select category...</option>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Priority *</label>
          <select required value={data.priority} onChange={(e) => setField("priority", e.target.value)}
            className={inputCls + " cursor-pointer"}>
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className={labelCls}>Device / Equipment <span className="text-white/25 normal-case font-normal">(optional)</span></label>
        <input value={data.device_info} onChange={(e) => setField("device_info", e.target.value)}
          placeholder="e.g. HP LaserJet Pro, Dell Latitude 5430..." className={inputCls} />
      </div>

      <div className="mt-4">
        <label className={labelCls}>Describe the Issue *</label>
        <textarea required rows={4} value={data.description} onChange={(e) => setField("description", e.target.value)}
          placeholder="Tell us what's wrong — be as specific as possible so we can help quickly"
          className={inputCls + " resize-none"} />
      </div>

      <div className="mt-6">
        <button type="submit" disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-60"
          style={{ background: "linear-gradient(180deg,#60A5FA 0%,#3B82F6 100%)", boxShadow: "0 6px 24px rgba(230,198,92,0.30)" }}>
          {busy ? (
            <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Submitting...</>
          ) : (
            <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>Submit Support Ticket</>
          )}
        </button>
        <p className="mt-2.5 text-center text-[13px] text-white/25">Our team will respond via phone or email as soon as possible.</p>
      </div>
    </form>
  );
}
