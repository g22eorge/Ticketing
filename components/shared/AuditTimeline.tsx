type AuditItem = {
  id: string;
  jobId?: string | null;
  action: string;
  detail: string | null;
  createdAt: Date;
  user: { name: string };
};

type ActionMeta = {
  icon: string;
  chipClass: string;
  panelClass: string;
};

function getActionMeta(action: string): ActionMeta {
  if (action.includes("CREATED")) {
    return {
      icon: "+",
      chipClass: "bg-[var(--accent)] text-white border-[var(--accent)]",
      panelClass: "border-[var(--accent)]",
    };
  }
  if (action.includes("STATUS") || action.includes("UPDATE")) {
    return {
      icon: "~",
      chipClass: "bg-[var(--panel-strong)] text-[var(--ink)] border-[var(--line)]",
      panelClass: "border-[var(--line)]",
    };
  }
  if (action.includes("PAY") || action.includes("BILL") || action.includes("INVOICE") || action.includes("COST")) {
    return {
      icon: "$",
      chipClass: "bg-[#0b0b0b] text-white/90 border-white/10",
      panelClass: "border-[var(--line)]",
    };
  }
  if (action.includes("CLOSED") || action.includes("DECLINED")) {
    return {
      icon: "x",
      chipClass: "bg-[var(--panel)] text-[var(--ink-muted)] border-[var(--line)]",
      panelClass: "border-[var(--line)]",
    };
  }
  return {
    icon: "i",
    chipClass: "bg-[var(--panel)] text-[var(--ink)] border-[var(--line)]",
    panelClass: "border-[var(--line)]",
  };
}

function formatActionLabel(action: string) {
  return action
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseDetail(detail: string | null): Record<string, unknown> | null {
  if (!detail) return null;
  try {
    const parsed = JSON.parse(detail) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function formatDetailKey(key: string) {
  if (key === "jobNumber") return "Job #";
  if (key === "seeded") return "Seeded";
  if (key === "training") return "Training";
  if (key === "note") return "Note";
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function formatDetailValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function getTrainingSummary(action: string, detailObject: Record<string, unknown> | null) {
  if (!detailObject) return null;
  const isSeeded = detailObject.seeded === true;
  const isTraining = detailObject.training === true;
  if (!isSeeded && !isTraining) return null;

  const jobNumber = typeof detailObject.jobNumber === "string" ? detailObject.jobNumber : null;
  if (action === "JOB_CREATED" && jobNumber) {
    return `Training seed created ${jobNumber}.`;
  }
  if (typeof detailObject.note === "string" && detailObject.note.trim().length > 0) {
    return detailObject.note;
  }
  return "Training dataset activity recorded.";
}

export function AuditTimeline({ items }: { items: AuditItem[] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const detailObject = parseDetail(item.detail);
        const trainingSummary = getTrainingSummary(item.action, detailObject);
        const detailEntries = detailObject ? Object.entries(detailObject) : [];
        const actionMeta = getActionMeta(item.action);

        const cardCls = `rounded-lg border bg-[var(--panel-strong)] p-3 ${actionMeta.panelClass}`;
        const inner = (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[11px] font-bold ${actionMeta.chipClass}`}>
                  {actionMeta.icon}
                </span>
                {formatActionLabel(item.action)}
              </p>
              <p className="text-xs text-[var(--ink-muted)]">{item.createdAt.toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })}</p>
            </div>
            <p className="text-xs text-[var(--ink-muted)]">by {item.user.name}</p>
            {trainingSummary ? (
              <p className="mt-2 rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2 py-1 text-xs text-[var(--accent)]">{trainingSummary}</p>
            ) : null}
            {detailEntries.length > 0 ? (
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                {detailEntries.map(([key, value]) => (
                  <div key={key} className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5">
                    <dt className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">{formatDetailKey(key)}</dt>
                    <dd className="mt-0.5 break-words text-xs font-medium text-[var(--ink)]">{formatDetailValue(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : item.detail ? (
              <pre className="mt-2 overflow-x-auto text-xs text-[var(--ink)]">{item.detail}</pre>
            ) : null}
            {item.jobId ? <p className="mt-2 text-[10px] font-semibold text-[var(--accent)]">View job →</p> : null}
          </>
        );

        return item.jobId ? (
          // Tappable row when jobId is present
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a key={item.id} href={`/jobs/${item.jobId}`} className={`block ${cardCls} active:opacity-70`}>
            {inner}
          </a>
        ) : (
          <div key={item.id} className={cardCls}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[11px] font-bold ${actionMeta.chipClass}`}>
                  {actionMeta.icon}
                </span>
                {formatActionLabel(item.action)}
              </p>
              <p className="text-xs text-[var(--ink-muted)]">{item.createdAt.toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })}</p>
            </div>
            <p className="text-xs text-[var(--ink-muted)]">by {item.user.name}</p>
            {trainingSummary ? (
              <p className="mt-2 rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2 py-1 text-xs text-[var(--accent)]">{trainingSummary}</p>
            ) : null}
            {inner}
          </div>
        );
      })}
    </div>
  );
}
