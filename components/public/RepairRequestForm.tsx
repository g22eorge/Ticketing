"use client";

import { useState } from "react";

const DEVICE_TYPES = [
  { value: "PHONE_ANDROID", label: "Android Phone" },
  { value: "PHONE_IPHONE",  label: "iPhone / iPad" },
  { value: "TABLET",        label: "Tablet" },
  { value: "WINDOWS_PC",    label: "Windows PC / Laptop" },
  { value: "MAC",           label: "MacBook / iMac" },
  { value: "OTHER",         label: "Other Device" },
];

const HANDOVER_OPTIONS = [
  {
    value: "SELF_DROPOFF",
    label: "Walk in / Drop off",
    desc: "Come to our shop",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    value: "SEND_WITH_DELIVERY_PERSON",
    label: "Send via delivery person",
    desc: "We receive from your courier",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden>
        <rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
      </svg>
    ),
  },
  {
    value: "REQUEST_PICKUP",
    label: "Request a pickup",
    desc: "We come to you in Kampala",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden>
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
      </svg>
    ),
  },
];

type Step = "form" | "success";

interface FormData {
  customer_name: string;
  phone: string;
  email: string;
  device_type: string;
  brand: string;
  model: string;
  problem_description: string;
  handover_method: string;
  preferred_dropoff_date: string;
  pickup_address: string;
  delivery_person_name: string;
  delivery_person_phone: string;
  _hp: string; // honeypot
}

const empty: FormData = {
  customer_name: "", phone: "", email: "",
  device_type: "", brand: "", model: "",
  problem_description: "", handover_method: "SELF_DROPOFF",
  preferred_dropoff_date: "", pickup_address: "",
  delivery_person_name: "", delivery_person_phone: "",
  _hp: "",
};

interface RepairRequestFormProps {
  /** Org slug to scope the request. Omit for the default EIS form. */
  orgSlug?: string;
  /** Company name shown in success message. Defaults to "Techserve ICT Solutions". */
  companyName?: string;
  /** WhatsApp number for the success CTA, e.g. "256756844448". */
  whatsappNumber?: string;
}

export function RepairRequestForm({ orgSlug, companyName = "Techserve ICT Solutions", whatsappNumber = "256756844448" }: RepairRequestFormProps) {
  const [step, setStep]       = useState<Step>("form");
  const [data, setData]       = useState<FormData>(empty);
  const [errors, setErrors]   = useState<string[]>([]);
  const [busy, setBusy]       = useState(false);
  const [requestNum, setRequestNum] = useState("");

  function set(field: keyof FormData, value: string) {
    setData((d) => ({ ...d, [field]: value }));
    setErrors([]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // honeypot filled → silently pretend success (bot)
    if (data._hp) { setStep("success"); setRequestNum("REQ-" + Date.now()); return; }

    setBusy(true);
    setErrors([]);
    try {
      const res = await fetch("/api/repair-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: data.customer_name,
          phone: data.phone,
          email: data.email || undefined,
          device_type: data.device_type,
          brand: data.brand,
          model: data.model || undefined,
          problem_description: data.problem_description,
          handover_method: data.handover_method,
          preferred_dropoff_date: data.handover_method === "SELF_DROPOFF" ? data.preferred_dropoff_date : undefined,
          pickup_address: data.handover_method === "REQUEST_PICKUP" ? data.pickup_address : undefined,
          delivery_person_name: data.handover_method === "SEND_WITH_DELIVERY_PERSON" ? data.delivery_person_name : undefined,
          delivery_person_phone: data.handover_method === "SEND_WITH_DELIVERY_PERSON" ? data.delivery_person_phone : undefined,
          ...(orgSlug ? { org_slug: orgSlug } : {}),
          _hp: "",
        }),
      });

      const json = await res.json();
      if (res.ok && json.success !== false) {
        setRequestNum(json.request_number ?? json.requestNumber ?? "");
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8" aria-hidden>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <div>
          <p className="text-lg font-bold text-white">Repair Request Received!</p>
          {requestNum && (
            <p className="mt-1 font-mono text-sm font-semibold text-green-400">{requestNum}</p>
          )}
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/55">
            Hello {data.customer_name || "Customer"}
            <br />
            <br />
            Thank you for submitting your repair request{requestNum ? ` (${requestNum})` : ""}.
            <br />
            <br />
            Your request has been received and logged successfully. Our team will contact you shortly with next steps, including device drop-off/pick-up guidance and the diagnosis timeline.
            <br />
            <br />
            Best regards,
            <br />
            {companyName}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <a
            href={`https://wa.me/${whatsappNumber}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl bg-[#25D366]/15 border border-[#25D366]/25 px-5 py-2.5 text-sm font-semibold text-[#25D366] transition hover:bg-[#25D366]/25"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
            </svg>
            Chat on WhatsApp
          </a>
          <button
            onClick={() => { setStep("form"); setData(empty); setRequestNum(""); }}
            className="rounded-xl border border-white/12 bg-white/5 px-5 py-2.5 text-sm font-medium text-white/60 transition hover:text-white"
          >
            Submit another request
          </button>
        </div>
      </div>
    );
  }

  const inputCls = "w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-[#4F8EF7]/50 focus:ring-1 focus:ring-[#4F8EF7]/25";
  const labelCls = "mb-1 block text-[13px] font-semibold uppercase tracking-wider text-white/40";

  return (
    <form onSubmit={submit} noValidate>
      {/* honeypot — hidden from users, visible to bots */}
      <input
        type="text" name="_hp" value={data._hp}
        onChange={(e) => set("_hp", e.target.value)}
        tabIndex={-1} aria-hidden="true"
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
        autoComplete="off"
      />

      {errors.length > 0 && (
        <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          {errors.map((e) => (
            <p key={e} className="text-sm text-red-400">{e}</p>
          ))}
        </div>
      )}

      {/* ── Row 1: Name + Phone ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Full Name *</label>
          <input
            required value={data.customer_name} onChange={(e) => set("customer_name", e.target.value)}
            placeholder="e.g. Sarah Namutebi" className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Phone Number *</label>
          <input
            required type="tel" value={data.phone} onChange={(e) => set("phone", e.target.value)}
            placeholder="07xx xxx xxx" className={inputCls}
          />
        </div>
      </div>

      {/* ── Row 2: Email ── */}
      <div className="mt-4">
        <label className={labelCls}>Email Address <span className="text-white/25 normal-case font-normal">(optional)</span></label>
        <input
          type="email" value={data.email} onChange={(e) => set("email", e.target.value)}
          placeholder="you@example.com" className={inputCls}
        />
      </div>

      {/* ── Row 3: Device Type + Brand ── */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Device Type *</label>
          <select
            required value={data.device_type} onChange={(e) => set("device_type", e.target.value)}
            className={inputCls + " cursor-pointer"}
          >
            <option value="" disabled>Select device type…</option>
            {DEVICE_TYPES.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Brand *</label>
          <input
            required value={data.brand} onChange={(e) => set("brand", e.target.value)}
            placeholder="e.g. Samsung, Apple, HP…" className={inputCls}
          />
        </div>
      </div>

      {/* ── Row 4: Model ── */}
      <div className="mt-4">
        <label className={labelCls}>Model <span className="text-white/25 normal-case font-normal">(optional but helpful)</span></label>
        <input
          value={data.model} onChange={(e) => set("model", e.target.value)}
          placeholder="e.g. Galaxy S21, iPhone 13, HP Pavilion…" className={inputCls}
        />
      </div>

      {/* ── Row 5: Problem Description ── */}
      <div className="mt-4">
        <label className={labelCls}>Describe the Problem *</label>
        <textarea
          required rows={3} value={data.problem_description}
          onChange={(e) => set("problem_description", e.target.value)}
          placeholder="Tell us what's wrong — screen cracked, won't turn on, battery issues, slow performance…"
          className={inputCls + " resize-none"}
        />
      </div>

      {/* ── Row 6: Handover Method ── */}
      <div className="mt-5">
        <label className={labelCls}>How will you bring / send the device?</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {HANDOVER_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3.5 py-3 transition ${
                data.handover_method === opt.value
                  ? "border-[#4F8EF7]/50 bg-[#4F8EF7]/8"
                  : "border-white/8 bg-white/3 hover:border-white/15"
              }`}
            >
              <input
                type="radio" name="handover_method" value={opt.value}
                checked={data.handover_method === opt.value}
                onChange={(e) => set("handover_method", e.target.value)}
                className="sr-only"
              />
              <span className={`mb-1 ${data.handover_method === opt.value ? "text-[#4F8EF7]/80" : "text-white/40"}`}>{opt.icon}</span>
              <span className="text-sm font-semibold text-white/80">{opt.label}</span>
              <span className="text-[13px] text-white/35">{opt.desc}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Conditional: self drop-off date ── */}
      {data.handover_method === "SELF_DROPOFF" && (
        <div className="mt-4">
          <label className={labelCls}>Preferred Drop-off Date *</label>
          <input
            required type="date" value={data.preferred_dropoff_date}
            min={new Date().toISOString().split("T")[0]}
            onChange={(e) => set("preferred_dropoff_date", e.target.value)}
            className={inputCls}
          />
        </div>
      )}

      {/* ── Conditional: pickup address ── */}
      {data.handover_method === "REQUEST_PICKUP" && (
        <div className="mt-4">
          <label className={labelCls}>Pickup Address *</label>
          <input
            required value={data.pickup_address}
            onChange={(e) => set("pickup_address", e.target.value)}
            placeholder="Your address or nearest landmark in Kampala"
            className={inputCls}
          />
        </div>
      )}

      {/* ── Conditional: delivery person details ── */}
      {data.handover_method === "SEND_WITH_DELIVERY_PERSON" && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Delivery Person Name *</label>
            <input
              required value={data.delivery_person_name}
              onChange={(e) => set("delivery_person_name", e.target.value)}
              placeholder="Name of person delivering" className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Delivery Person Phone *</label>
            <input
              required type="tel" value={data.delivery_person_phone}
              onChange={(e) => set("delivery_person_phone", e.target.value)}
              placeholder="07xx xxx xxx" className={inputCls}
            />
          </div>
        </div>
      )}

      {/* ── Submit ── */}
      <div className="mt-6">
        <button
          type="submit" disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-60"
          style={{ background: "linear-gradient(180deg,#60A5FA 0%,#3B82F6 100%)", boxShadow: "0 6px 24px rgba(230,198,92,0.30)" }}
        >
          {busy ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Submitting…
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
              Submit Repair Request
            </>
          )}
        </button>
        <p className="mt-2.5 text-center text-[13px] text-white/25">
          We&apos;ll confirm your request and send a quote via WhatsApp or call.
        </p>
      </div>
    </form>
  );
}
