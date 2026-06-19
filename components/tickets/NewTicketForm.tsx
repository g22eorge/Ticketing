"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import { createJobAction } from "@/app/(app)/jobs/new/actions";

const deviceTypes = [
  { value: "PHONE_ANDROID", label: "Android Phone" },
  { value: "PHONE_IPHONE", label: "iPhone" },
  { value: "TABLET", label: "Tablet" },
  { value: "WINDOWS_PC", label: "Windows PC" },
  { value: "MAC", label: "Mac" },
  { value: "OTHER", label: "Other" },
] as const;

const inputCls =
  "w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-400/60 focus:ring-2 focus:ring-amber-200/40 placeholder:text-stone-400";
const selectCls =
  "w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-400/60 focus:ring-2 focus:ring-amber-200/40 appearance-none";

export function NewTicketForm({ receivedByName: _receivedByName }: { receivedByName: string }) {
  const router = useRouter();
  const [actionResult, submitAction, isPending] = useActionState(createJobAction, { error: null });

  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [issue, setIssue] = useState("");
  const [accessories, setAccessories] = useState("");

  const canSubmit = clientName.trim().length >= 2 && phone.trim().length >= 3 && deviceType && brand.trim() && model.trim() && issue.trim().length >= 5;

  const devicesJson = JSON.stringify([
    {
      deviceType,
      brand,
      model,
      serialOrImei: serial,
      accessories,
      physicalNotes: "",
      serviceType: "HARDWARE",
      softwareOsInstall: false,
      softwareDriversUpdates: false,
      softwareDataBackupRestore: false,
      softwareAccountSetup: false,
      softwarePerformanceTune: false,
      softwareThirdPartyApps: false,
      softwareRequestedNotes: "",
      softwareLicenseAttested: false,
      softwareInstallerSource: "",
      softwareInstallerSourceNote: "",
      issueDescription: issue,
    },
  ]);

  return (
    <form action={submitAction} className="mx-auto max-w-xl space-y-8">
      <input type="hidden" name="fullName" value={clientName} />
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="organization" value="" />
      <input type="hidden" name="devicesJson" value={devicesJson} />
      <input type="hidden" name="receivedAt" value="" />

      {/* ── Client ── */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide text-stone-800 uppercase">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white">1</span>
          Client
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-500">Full name *</label>
            <input className={inputCls} placeholder="John Doe" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-500">Phone *</label>
            <input className={inputCls} placeholder="+254 7XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-stone-500">Email</label>
          <input className={inputCls} placeholder="client@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </section>

      {/* ── Device ── */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide text-stone-800 uppercase">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white">2</span>
          Device
        </h2>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-stone-500">Type *</label>
          <select className={selectCls} value={deviceType} onChange={(e) => setDeviceType(e.target.value)}>
            <option value="">Select device type</option>
            {deviceTypes.map((dt) => (
              <option key={dt.value} value={dt.value}>{dt.label}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-500">Brand *</label>
            <input className={inputCls} placeholder="Samsung" value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-500">Model *</label>
            <input className={inputCls} placeholder="Galaxy S24" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-500">Serial / IMEI</label>
            <input className={inputCls} placeholder="Optional" value={serial} onChange={(e) => setSerial(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-500">Accessories</label>
            <input className={inputCls} placeholder="Charger, case..." value={accessories} onChange={(e) => setAccessories(e.target.value)} />
          </div>
        </div>
      </section>

      {/* ── Issue ── */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide text-stone-800 uppercase">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white">3</span>
          Issue
        </h2>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-stone-500">Describe the issue *</label>
          <textarea
            className={`${inputCls} min-h-[100px] resize-y`}
            placeholder="Screen cracked, won't power on..."
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
          />
        </div>
      </section>

      {/* ── Error ── */}
      {actionResult.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {actionResult.error}
        </div>
      ) : null}

      {/* ── Submit ── */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={!canSubmit || isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
              Creating...
            </>
          ) : (
            "Create Ticket"
          )}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-xl border border-stone-200 px-5 py-3 text-sm font-semibold text-stone-500 transition hover:border-stone-300 hover:text-stone-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
