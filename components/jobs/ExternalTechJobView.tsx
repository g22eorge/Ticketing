"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateJobAction } from "@/app/(app)/jobs/[id]/actions";
import { formatEATDateTime } from "@/lib/date-eat";

type ExternalJob = {
  id: string;
  jobNumber: string;
  status: string;
  updatedAt: string;
  clientApproved: boolean | null;
  approvalDate: string | null;
  deviceType: string;
  brand: string;
  model: string;
  serialOrImei: string | null;
  accessories: string | null;
  externalDiagnosis: string | null;
  partsNeeded: string | null;
  externalTechBill: number | null;
  repairTimeline: string | null;
  timelineMinMinutes: number | null;
  timelineMaxMinutes: number | null;
  timelineConfidence: "FIRM" | "ESTIMATED" | "PARTS_DEPENDENT" | null;
  timelineNote: string | null;
};

type Unit = "HOUR" | "DAY" | "WEEK";

function fromMinutes(value: number | null, unit: Unit) {
  if (!value) return "";
  const divisor = unit === "HOUR" ? 60 : unit === "DAY" ? 60 * 24 : 60 * 24 * 7;
  return String(Number((value / divisor).toFixed(2)));
}

export function ExternalTechJobView({
  job,
  returnTo,
}: {
  job: ExternalJob;
  returnTo: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [unit, setUnit] = useState<Unit>("HOUR");
  const [minValue, setMinValue] = useState(fromMinutes(job.timelineMinMinutes, "HOUR"));
  const [maxValue, setMaxValue] = useState(fromMinutes(job.timelineMaxMinutes, "HOUR"));

  const timelinePreview = useMemo(() => {
    if (!minValue && !maxValue) return "No timeline selected";
    const min = minValue || maxValue;
    const max = maxValue || minValue;
    const label = unit.toLowerCase() + ((Number(max) > 1 || Number(min) > 1) ? "s" : "");
    return min === max ? `${min} ${label}` : `${min}-${max} ${label}`;
  }, [maxValue, minValue, unit]);

  const quickChips: Array<{ label: string; min: string; max: string; unit: Unit }> = [
    { label: "1-2h", min: "1", max: "2", unit: "HOUR" },
    { label: "3-4h", min: "3", max: "4", unit: "HOUR" },
    { label: "Same day", min: "1", max: "1", unit: "DAY" },
    { label: "1-2d", min: "1", max: "2", unit: "DAY" },
    { label: "3-5d", min: "3", max: "5", unit: "DAY" },
  ];
  const fieldClass =
    "w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14";

  return (
    <div className="min-w-0 space-y-4">
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="mb-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">External Work Brief</p>
          <p className="mt-1 text-sm text-[var(--ink)]">Update diagnosis, required parts, and ETA only. Client identity remains hidden in this workspace.</p>
        </div>
        <h2 className="text-lg font-semibold">{job.jobNumber}</h2>
        {job.status === "IN_REPAIR" && job.clientApproved ? (
          <div className="mt-2 rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-sm text-[var(--accent)]">
            Client approved. You can proceed with repair now.
            {job.approvalDate ? ` Approved on ${formatEATDateTime(job.approvalDate)}.` : ""}
          </div>
        ) : null}
        {job.status === "AWAITING_APPROVAL" ? (
          <div className="mt-2 rounded-md border border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-2 text-sm text-[var(--accent)]">
            Awaiting client approval. Hold repair work until approval is confirmed.
          </div>
        ) : null}
        <p className="text-sm text-[var(--ink-muted)] [overflow-wrap:anywhere]">
          {job.deviceType}{[job.brand, job.model].filter(v => v && v !== "Unknown").length > 0 ? " / " + [job.brand, job.model].filter(v => v && v !== "Unknown").join(" ") : ""}
        </p>
        <p className="mt-1 text-sm text-[var(--ink-muted)] [overflow-wrap:anywhere]">Serial/IMEI: {job.serialOrImei ?? "-"}</p>
        <p className="text-sm text-[var(--ink-muted)] [overflow-wrap:anywhere]">Accessories: {job.accessories ?? "-"}</p>
      </div>

      <form
        action={(formData) => {
          formData.set("jobId", job.id);
          formData.set("expectedUpdatedAt", job.updatedAt);
          startTransition(async () => {
            const res = await updateJobAction(formData);
            if (res.error) {
              toast.error(res.error);
              return;
            }
            toast.success("External diagnosis updated");
            router.push(returnTo);
            router.refresh();
          });
        }}
        className="panel-shadow space-y-3 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 [&_*]:min-w-0"
      >
        <h3 className="font-semibold">External Diagnosis</h3>
        <textarea
          name="externalDiagnosis"
          defaultValue={job.externalDiagnosis ?? ""}
          placeholder="Diagnosis summary"
          className="min-h-24 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
        />
        <textarea
          name="partsNeeded"
          defaultValue={job.partsNeeded ?? ""}
          placeholder="Parts needed"
          className="min-h-24 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
        />
        <input
          name="externalTechBill"
          type="number"
          step="0.01"
          defaultValue={job.externalTechBill ?? undefined}
          placeholder="External tech bill"
          className={fieldClass}
        />

        <div className="space-y-2 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
          <p className="text-sm font-medium">Timeline Builder</p>
          <div className="flex flex-wrap gap-2">
            {quickChips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => {
                  setUnit(chip.unit);
                  setMinValue(chip.min);
                  setMaxValue(chip.max);
                }}
                className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1 text-xs transition hover:border-[var(--accent)]/50"
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <input
              name="timelineMinValue"
              type="number"
              step="0.1"
              min="0"
              value={minValue}
              onChange={(event) => setMinValue(event.target.value)}
              placeholder="Min"
              className={fieldClass}
            />
            <input
              name="timelineMaxValue"
              type="number"
              step="0.1"
              min="0"
              value={maxValue}
              onChange={(event) => setMaxValue(event.target.value)}
              placeholder="Max"
              className={fieldClass}
            />
            <select
              name="timelineUnit"
              value={unit}
              onChange={(event) => setUnit(event.target.value as Unit)}
              className={fieldClass}
            >
              <option value="HOUR">Hours</option>
              <option value="DAY">Days</option>
              <option value="WEEK">Weeks</option>
            </select>
          </div>

            <select
              name="timelineConfidence"
              defaultValue={job.timelineConfidence ?? "ESTIMATED"}
              className={fieldClass}
            >
            <option value="FIRM">Firm</option>
            <option value="ESTIMATED">Estimated</option>
            <option value="PARTS_DEPENDENT">Parts dependent</option>
          </select>

            <textarea
              name="timelineNote"
              defaultValue={job.timelineNote ?? ""}
              placeholder="Delay reason (optional)"
              className="min-h-20 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14"
            />

            <input type="hidden" name="repairTimeline" value={timelinePreview === "No timeline selected" ? "" : timelinePreview} />
            <p className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)]">
              ETA Preview: <span className="font-medium">{timelinePreview}</span>
            </p>
          {job.repairTimeline ? (
            <p className="text-xs text-[var(--ink-muted)]">Current saved ETA: {job.repairTimeline}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            disabled={isPending}
            className="btn-premium w-full whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] sm:w-auto sm:py-2 sm:text-sm"
          >
            {isPending ? "Saving..." : "Save"}
          </button>
          {job.status === "IN_EXTERNAL_REPAIR" || job.status === "REFERRED" ? (
            <button
              type="submit"
              name="nextStatus"
              value="AWAITING_APPROVAL"
              disabled={isPending}
              className="btn-premium-success w-full whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] disabled:opacity-60 sm:w-auto sm:py-2 sm:text-sm"
            >
              Submit Estimate
            </button>
          ) : null}
          <a
            href={returnTo}
            className="btn-premium-secondary inline-flex w-full items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] sm:w-auto sm:py-2 sm:text-sm"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
