import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  generateComplaintNumber,
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_CATEGORIES,
  COMPLAINT_CHANNEL_WEB,
} from "@/lib/complaints";
import type { ComplaintCategory } from "@prisma/client";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "File a Complaint",
  description: "Submit a complaint using your ticket number. No login required.",
};

const CATEGORIES = COMPLAINT_CATEGORIES as unknown as ComplaintCategory[];

export default async function ComplaintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const ref = typeof params.ref === "string" ? params.ref.trim().toUpperCase() : "";
  const submitted = typeof params.submitted === "string" ? params.submitted : "";
  const error = typeof params.error === "string" ? params.error : "";

  let ticketInfo: {
    id: string;
    ticketNumber: string;
    orgId: string | null;
    subject: string;
    reporterName: string;
    reporterPhone: string;
    reporterEmail: string | null;
  } | null = null;

  if (ref) {
    ticketInfo = await prisma.ticket
      .findFirst({
        where: { ticketNumber: ref },
        select: {
          id: true,
          ticketNumber: true,
          orgId: true,
          subject: true,
          reporterName: true,
          reporterPhone: true,
          reporterEmail: true,
        },
      })
      .catch(() => null);
  }

  async function submitComplaintAction(formData: FormData) {
    "use server";
    const ticketRef = String(formData.get("ticketNumber") ?? "")
      .trim()
      .toUpperCase();
    const categoryRaw = String(formData.get("category") ?? "OTHER").trim();
    const description = String(formData.get("description") ?? "").trim();
    const expectedResolution = String(formData.get("expectedResolution") ?? "").trim();
    const clientName = String(formData.get("clientName") ?? "").trim();
    const clientPhone = String(formData.get("clientPhone") ?? "").trim();
    const clientEmail = String(formData.get("clientEmail") ?? "").trim();

    if (!ticketRef || !description || !clientName || !clientPhone) {
      redirect(
        `/complaint?ref=${encodeURIComponent(ticketRef)}&error=Please+fill+all+required+fields`,
      );
    }

    const ticket = await prisma.ticket.findFirst({
      where: { ticketNumber: ticketRef },
      select: { id: true, orgId: true },
    });

    if (!ticket || !ticket.orgId) {
      redirect(
        `/complaint?ref=${encodeURIComponent(ticketRef)}&error=Ticket+number+not+found.+Please+check+and+try+again.`,
      );
    }

    const category = CATEGORIES.includes(categoryRaw as ComplaintCategory)
      ? (categoryRaw as ComplaintCategory)
      : ("OTHER" as ComplaintCategory);

    const complaintNumber = await generateComplaintNumber(ticket.orgId);

    await prisma.complaint.create({
      data: {
        orgId: ticket.orgId,
        complaintNumber,
        category,
        channel: COMPLAINT_CHANNEL_WEB,
        ticketId: ticket.id,
        clientName,
        clientPhone,
        clientEmail: clientEmail || null,
        description,
        expectedResolution: expectedResolution || null,
      },
    });

    redirect(`/complaint?submitted=${encodeURIComponent(complaintNumber)}`);
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/20">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-lg font-bold text-emerald-400">
              Complaint Received
            </p>
            <p className="mt-1 text-sm text-emerald-300">
              Reference: <span className="font-mono font-bold">{submitted}</span>
            </p>
            <p className="mt-3 text-sm text-emerald-400/70">
              We will acknowledge your complaint within 24 hours and aim to resolve it within 3 business days.
            </p>
          </div>
          <p className="text-center text-xs text-white/30">
            Please keep your reference number for follow-up.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1628] p-4">
      <div className="mx-auto max-w-lg space-y-5 py-8">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-red-400">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-red-400/70">
            BusinessOS
          </p>
          <h1 className="mt-1 text-xl font-black text-white">File a Complaint</h1>
          <p className="mt-1 text-sm text-white/40">
            Enter your ticket number to verify your identity. No login required.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form action={submitComplaintAction} className="space-y-4">
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 space-y-3">
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-white/30">
              Your Ticket Reference
            </p>
            <input
              name="ticketNumber"
              defaultValue={ref}
              placeholder="e.g. TKT-2024-0001"
              required
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm font-mono text-white outline-none placeholder:text-white/20 focus:border-[#4F8EF7]/40"
            />
            {ticketInfo && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-3 py-2">
                <p className="text-xs font-semibold text-emerald-400">
                  {ticketInfo.subject} — {ticketInfo.reporterName}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 space-y-3">
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-white/30">
              Your Details
            </p>
            <input
              name="clientName"
              defaultValue={ticketInfo?.reporterName ?? ""}
              placeholder="Full name *"
              required
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#4F8EF7]/40"
            />
            <input
              name="clientPhone"
              defaultValue={ticketInfo?.reporterPhone ?? ""}
              placeholder="Phone number *"
              required
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#4F8EF7]/40"
            />
            <input
              name="clientEmail"
              defaultValue={ticketInfo?.reporterEmail ?? ""}
              placeholder="Email (optional)"
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#4F8EF7]/40"
            />
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 space-y-3">
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-white/30">
              Complaint Details
            </p>
            <select
              name="category"
              defaultValue="OTHER"
              className="w-full rounded-lg border border-white/10 bg-[#0f1f3a] px-3 py-2.5 text-sm text-white outline-none focus:border-[#4F8EF7]/40"
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
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#4F8EF7]/40 resize-none"
            />
            <textarea
              name="expectedResolution"
              placeholder="What resolution would you like? (optional)"
              rows={2}
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#4F8EF7]/40 resize-none"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl py-3 text-sm font-bold text-black shadow-[0_4px_20px_rgba(230,198,92,0.25)] transition hover:opacity-90"
            style={{ background: "linear-gradient(180deg,#60A5FA 0%,#3B82F6 100%)" }}
          >
            Submit Complaint
          </button>
          <p className="text-center text-[12px] text-white/25">
            You will receive a reference number. We handle complaints per ISO 10002:2018.
          </p>
        </form>
      </div>
    </div>
  );
}
