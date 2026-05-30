import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  generateComplaintNumber,
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_CATEGORIES,
  COMPLAINT_CHANNEL_WEB,
} from "@/lib/complaints";
import type { ComplaintCategory } from "@prisma/client";

export const dynamic = "force-dynamic";

const CATEGORIES = COMPLAINT_CATEGORIES as unknown as ComplaintCategory[];

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const ref = typeof params.ref === "string" ? params.ref.trim().toUpperCase() : "";
  const submitted = typeof params.submitted === "string" ? params.submitted : "";
  const error = typeof params.error === "string" ? params.error : "";

  // Look up job by job number
  let jobInfo: {
    id: string;
    jobNumber: string;
    orgId: string | null;
    brand: string;
    model: string;
    client: { fullName: string; phone: string; email: string | null };
  } | null = null;

  if (ref) {
    jobInfo = await prisma.job
      .findFirst({
        where: { jobNumber: ref },
        select: {
          id: true,
          jobNumber: true,
          orgId: true,
          brand: true,
          model: true,
          client: { select: { fullName: true, phone: true, email: true } },
        },
      })
      .catch(() => null);
  }

  async function submitComplaintAction(formData: FormData) {
    "use server";
    const jobNumber = String(formData.get("jobNumber") ?? "")
      .trim()
      .toUpperCase();
    const categoryRaw = String(formData.get("category") ?? "OTHER").trim();
    const description = String(formData.get("description") ?? "").trim();
    const expectedResolution = String(formData.get("expectedResolution") ?? "").trim();
    const clientName = String(formData.get("clientName") ?? "").trim();
    const clientPhone = String(formData.get("clientPhone") ?? "").trim();
    const clientEmail = String(formData.get("clientEmail") ?? "").trim();

    if (!jobNumber || !description || !clientName || !clientPhone) {
      redirect(
        `/feedback?ref=${encodeURIComponent(jobNumber)}&error=Please+fill+all+required+fields`,
      );
    }

    const job = await prisma.job.findFirst({
      where: { jobNumber },
      select: { id: true, orgId: true },
    });

    if (!job || !job.orgId) {
      redirect(
        `/feedback?ref=${encodeURIComponent(jobNumber)}&error=Job+number+not+found.+Please+check+and+try+again.`,
      );
    }

    const category = CATEGORIES.includes(categoryRaw as ComplaintCategory)
      ? (categoryRaw as ComplaintCategory)
      : ("OTHER" as ComplaintCategory);

    const complaintNumber = await generateComplaintNumber(job.orgId);

    await prisma.complaint.create({
      data: {
        orgId: job.orgId,
        complaintNumber,
        category,
        channel: COMPLAINT_CHANNEL_WEB,
        jobId: job.id,
        clientName,
        clientPhone,
        clientEmail: clientEmail || null,
        description,
        expectedResolution: expectedResolution || null,
      },
    });

    redirect(`/feedback?submitted=${encodeURIComponent(complaintNumber)}`);
  }

  // Confirmation screen
  if (submitted) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-emerald-600"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-lg font-bold text-emerald-800 dark:text-emerald-400">
              Complaint Received
            </p>
            <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
              Reference: <span className="font-mono font-bold">{submitted}</span>
            </p>
            <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">
              We will acknowledge your complaint within 24 hours and aim to resolve it within 3
              business days.
            </p>
          </div>
          <p className="text-center text-xs text-[var(--ink-muted)]">
            Please keep your reference number for follow-up.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] p-4">
      <div className="mx-auto max-w-lg space-y-4 py-8">
        <div className="text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]">
            Eagle Info Repair
          </p>
          <h1 className="mt-1 text-xl font-black text-[var(--ink)]">Submit a Complaint</h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Enter your repair job number to get started.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </div>
        )}

        <form action={submitComplaintAction} className="space-y-4">
          {/* Job number lookup */}
          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 space-y-3">
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]">
              Your Job Reference
            </p>
            <input
              name="jobNumber"
              defaultValue={ref}
              placeholder="e.g. EI-2024-0001"
              required
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent)]/50"
            />
            {jobInfo && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {jobInfo.brand} {jobInfo.model} — {jobInfo.client.fullName}
                </p>
              </div>
            )}
          </div>

          {/* Contact info */}
          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 space-y-3">
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]">
              Your Details
            </p>
            <input
              name="clientName"
              defaultValue={jobInfo?.client.fullName ?? ""}
              placeholder="Full name *"
              required
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
            />
            <input
              name="clientPhone"
              defaultValue={jobInfo?.client.phone ?? ""}
              placeholder="Phone number *"
              required
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
            />
            <input
              name="clientEmail"
              defaultValue={jobInfo?.client.email ?? ""}
              placeholder="Email (optional)"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
            />
          </div>

          {/* Complaint details */}
          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 space-y-3">
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ink-muted)]">
              Complaint Details
            </p>
            <select
              name="category"
              defaultValue="OTHER"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {COMPLAINT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <textarea
              name="description"
              placeholder="Describe your complaint in detail *"
              required
              rows={4}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 resize-none"
            />
            <textarea
              name="expectedResolution"
              placeholder="What resolution would you like? (optional)"
              rows={2}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 resize-none"
            />
          </div>

          <button className="btn-premium w-full rounded-xl py-3 text-sm font-bold">
            Submit Complaint
          </button>
          <p className="text-center text-[12px] text-[var(--ink-muted)]">
            You will receive a reference number. We handle complaints per ISO 10002:2018.
          </p>
        </form>
      </div>
    </div>
  );
}
