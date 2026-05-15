import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

// ── Status display config ─────────────────────────────────────────────────────

const STATUS_STEPS = [
  { key: "RECEIVED",          label: "Received",          desc: "We have your device and it's in the queue." },
  { key: "DIAGNOSING",        label: "Diagnosing",         desc: "Our technician is assessing the fault." },
  { key: "AWAITING_APPROVAL", label: "Awaiting Approval",  desc: "We've sent you a quote — please approve to proceed." },
  { key: "IN_REPAIR",         label: "In Repair",          desc: "Repair work is underway." },
  { key: "READY_FOR_PICKUP",  label: "Ready for Pickup",   desc: "Your device is repaired and ready to collect." },
  { key: "COMPLETED",         label: "Completed",          desc: "Job complete. Thank you for your business." },
] as const;

// Statuses that map to a step above for progress display
const STATUS_STEP_INDEX: Record<string, number> = {
  RECEIVED: 0,
  DIAGNOSING: 1,
  REFERRED: 1,
  IN_EXTERNAL_REPAIR: 2,
  AWAITING_APPROVAL: 2,
  AWAITING_RESPONSE: 2,
  IN_REPAIR: 3,
  READY_FOR_PICKUP: 4,
  COMPLETED: 5,
  CLOSED: 5,
};

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Received",
  DIAGNOSING: "Diagnosing",
  REFERRED: "Referred to Specialist",
  IN_EXTERNAL_REPAIR: "With External Technician",
  AWAITING_APPROVAL: "Awaiting Your Approval",
  AWAITING_RESPONSE: "Awaiting Response",
  IN_REPAIR: "In Repair",
  READY_FOR_PICKUP: "Ready for Pickup",
  COMPLETED: "Completed",
  CLOSED: "Closed",
};

const STATUS_COLORS: Record<string, string> = {
  RECEIVED: "bg-slate-100 text-slate-700",
  DIAGNOSING: "bg-blue-100 text-blue-700",
  REFERRED: "bg-purple-100 text-purple-700",
  IN_EXTERNAL_REPAIR: "bg-purple-100 text-purple-700",
  AWAITING_APPROVAL: "bg-amber-100 text-amber-700",
  AWAITING_RESPONSE: "bg-amber-100 text-amber-700",
  IN_REPAIR: "bg-orange-100 text-orange-700",
  READY_FOR_PICKUP: "bg-green-100 text-green-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CLOSED: "bg-gray-100 text-gray-600",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ jobNumber: string }>;
}): Promise<Metadata> {
  const { jobNumber } = await params;
  return {
    title: `Repair Status — ${jobNumber}`,
    description: `Track the repair status of job ${jobNumber}.`,
  };
}

export default async function PublicStatusPage({
  params,
}: {
  params: Promise<{ jobNumber: string }>;
}) {
  const { jobNumber } = await params;

  const job = await prisma.job.findUnique({
    where: { jobNumber },
    select: {
      jobNumber: true,
      status: true,
      deviceType: true,
      brand: true,
      model: true,
      serialOrImei: true,
      repairTimeline: true,
      timelineMinMinutes: true,
      timelineMaxMinutes: true,
      receivedAt: true,
      completedAt: true,
      statusNote: true,
      org: { select: { name: true, slug: true } },
    },
  });

  if (!job) notFound();

  const stepIndex = STATUS_STEP_INDEX[job.status] ?? 0;
  const isClosed = job.status === "CLOSED";
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });

  const timelineLabel = job.repairTimeline ??
    (job.timelineMinMinutes && job.timelineMaxMinutes
      ? formatMinutes(job.timelineMinMinutes, job.timelineMaxMinutes)
      : null);

  return (
    <div className="min-h-screen bg-[#fafaf9] px-4 py-10 font-sans">
      <div className="mx-auto max-w-lg space-y-6">

        {/* Brand bar */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-600">
              {job.org?.name ?? "Repair Shop"}
            </p>
            <p className="text-[11px] text-gray-400">Repair Status Tracker</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[job.status] ?? "bg-gray-100 text-gray-600"}`}>
            {STATUS_LABELS[job.status] ?? job.status}
          </span>
        </div>

        {/* Job card */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-amber-50 border-b border-amber-100 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Job Number</p>
            <p className="mt-0.5 text-2xl font-bold text-gray-900 tracking-tight">{job.jobNumber}</p>
          </div>

          {/* Device info */}
          <div className="px-5 py-4 space-y-1 border-b border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Device</p>
            <p className="font-semibold text-gray-800">{job.brand} {job.model}</p>
            <p className="text-sm text-gray-500">{formatDeviceType(job.deviceType)}</p>
            {job.serialOrImei && (
              <p className="text-xs text-gray-400 font-mono">S/N: {job.serialOrImei}</p>
            )}
          </div>

          {/* Dates & timeline */}
          <div className="px-5 py-4 grid grid-cols-2 gap-4 border-b border-gray-100">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Received</p>
              <p className="mt-0.5 text-sm font-medium text-gray-700">{fmt(job.receivedAt)}</p>
            </div>
            {job.completedAt && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Completed</p>
                <p className="mt-0.5 text-sm font-medium text-gray-700">{fmt(job.completedAt)}</p>
              </div>
            )}
            {timelineLabel && !job.completedAt && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Est. Time</p>
                <p className="mt-0.5 text-sm font-medium text-gray-700">{timelineLabel}</p>
              </div>
            )}
          </div>

          {/* Status note */}
          {job.statusNote && (
            <div className="px-5 py-4 border-b border-gray-100 bg-amber-50/50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Update from our team</p>
              <p className="mt-1 text-sm text-gray-700 leading-relaxed">{job.statusNote}</p>
            </div>
          )}

          {/* Progress stepper */}
          {!isClosed && (
            <div className="px-5 py-5">
              <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-gray-400">Progress</p>
              <div className="space-y-0">
                {STATUS_STEPS.map((step, i) => {
                  const done = i < stepIndex;
                  const active = i === stepIndex;
                  const future = i > stepIndex;
                  return (
                    <div key={step.key} className="flex gap-3">
                      {/* Line + dot column */}
                      <div className="flex flex-col items-center" style={{ width: 20 }}>
                        <div className={`h-5 w-0.5 ${i === 0 ? "opacity-0" : done || active ? "bg-amber-400" : "bg-gray-200"}`} />
                        <div className={`h-3 w-3 rounded-full border-2 flex-shrink-0 ${
                          active ? "border-amber-500 bg-amber-500" :
                          done   ? "border-amber-400 bg-amber-400" :
                                   "border-gray-300 bg-white"
                        }`} />
                        <div className={`flex-1 w-0.5 ${i === STATUS_STEPS.length - 1 ? "opacity-0" : done ? "bg-amber-400" : "bg-gray-200"}`} />
                      </div>
                      {/* Label */}
                      <div className={`pb-4 ${future ? "opacity-40" : ""}`}>
                        <p className={`text-sm font-semibold ${active ? "text-amber-600" : done ? "text-gray-700" : "text-gray-500"}`}>
                          {step.label}
                        </p>
                        {(active) && (
                          <p className="text-xs text-gray-500 mt-0.5">{step.desc}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Closed state */}
          {isClosed && (
            <div className="px-5 py-5">
              <p className="text-sm text-gray-500">
                This job has been closed. Please contact us if you have any questions.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2 text-center">
          <p className="text-xs text-gray-400">
            This page is publicly accessible via your job number only. No personal information is displayed.
          </p>
          <p className="text-xs text-gray-500">
            Not satisfied with your repair?{" "}
            <a
              href={`/feedback?ref=${jobNumber}`}
              className="font-medium text-amber-500 underline-offset-2 hover:underline"
            >
              Submit a complaint →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDeviceType(type: string): string {
  const map: Record<string, string> = {
    PHONE_ANDROID: "Android Phone",
    PHONE_IPHONE: "iPhone",
    TABLET: "Tablet",
    WINDOWS_PC: "Windows PC / Laptop",
    MAC: "Mac",
    OTHER: "Other Device",
  };
  return map[type] ?? type;
}

function formatMinutes(min: number, max: number): string {
  const fmt = (m: number) => {
    if (m < 60) return `${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.round(h / 24);
    return `${d} day${d !== 1 ? "s" : ""}`;
  };
  return `${fmt(min)} – ${fmt(max)}`;
}
