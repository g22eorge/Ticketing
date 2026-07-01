"use client";

import { useState, useRef, useEffect, useCallback, useTransition } from "react";
import { createPortal } from "react-dom";
import { Ban, CheckCircle2 } from "lucide-react";

export type DocAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  href?: string;
  external?: boolean;
  serverAction?: () => Promise<void>;
  tone?: "default" | "accent" | "success" | "danger";
  confirm?: string;
  divider?: boolean;
  pending?: boolean;
};

interface DocumentActionCellProps {
  quickActions: DocAction[];
  moreActions: DocAction[];
  label?: string;
}

const TONE_CLASSES: Record<string, string> = {
  default: "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--panel-strong)]",
  accent: "text-[var(--accent)] hover:bg-[var(--accent)]/10",
  success: "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10",
  danger: "text-red-600 dark:text-red-400 hover:bg-red-500/10",
};

const DROPDOWN_TONE: Record<string, string> = {
  default: "text-[var(--ink)]",
  accent: "text-[var(--accent)]",
  success: "text-emerald-700 dark:text-emerald-400",
  danger: "text-red-600 dark:text-red-400",
};

const CLOSE_EVENT = "doc-action:close-all";

function QuickButton({ action, onConfirm }: { action: DocAction; onConfirm: (a: DocAction) => void }) {
  const tone = action.tone ?? "default";
  const cls = TONE_CLASSES[tone] ?? TONE_CLASSES.default;
  const [isPending, startTransition] = useTransition();

  if (action.href) {
    return (
      <a
        href={action.href}
        target={action.external ? "_blank" : undefined}
        rel={action.external ? "noreferrer" : undefined}
        title={action.label}
        aria-label={action.label}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] transition ${cls}`}
      >
        {action.icon}
      </a>
    );
  }

  if (action.serverAction) {
    return (
      <button
        type="button"
        title={action.label}
        aria-label={action.label}
        disabled={isPending}
        onClick={() => {
          if (action.confirm) {
            onConfirm(action);
          } else {
            const fn = action.serverAction;
            if (fn) startTransition(fn);
          }
        }}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] transition ${isPending ? "opacity-50" : ""} ${cls}`}
      >
        {action.icon}
      </button>
    );
  }

  return (
    <button
      type="button"
      title={action.label}
      aria-label={action.label}
      onClick={() => onConfirm(action)}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] transition ${cls}`}
    >
      {action.icon}
    </button>
  );
}

export function DocumentActionCell({ quickActions, moreActions, label = "More actions" }: DocumentActionCellProps) {
  const [open, setOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<DocAction | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [isPending, startTransition] = useTransition();
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onMouse = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node) && popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    document.addEventListener(CLOSE_EVENT, close);
    return () => document.removeEventListener(CLOSE_EVENT, close);
  }, [close]);

  function toggle() {
    if (!open) {
      document.dispatchEvent(new Event(CLOSE_EVENT));
      if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    }
    setOpen((v) => !v);
  }

  function handleConfirm(action: DocAction) {
    if (action.confirm) {
      setConfirmAction(action);
} else if (action.serverAction) {
            startTransition(() => action.serverAction!());
    } else if (action.href) {
      window.open(action.href, action.external ? "_blank" : "_self");
    }
  }

  function confirmProceed() {
    if (!confirmAction) return;
    if (confirmAction.serverAction) {
      startTransition(() => confirmAction!.serverAction!());
    } else if (confirmAction.href) {
      window.open(confirmAction.href, confirmAction.external ? "_blank" : "_self");
    }
    setConfirmAction(null);
  }

  const hasMore = moreActions.length > 0;
  const spaceBelow = rect ? window.innerHeight - rect.bottom : 0;
  const openDown = spaceBelow > 200;

  const popupStyle: React.CSSProperties = rect
    ? {
        position: "fixed",
        right: Math.max(8, window.innerWidth - rect.right),
        ...(openDown ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
        zIndex: 9999,
        minWidth: 200,
        maxWidth: 280,
      }
    : {};

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {quickActions.map((action) => (
        <QuickButton key={action.key} action={action} onConfirm={handleConfirm} />
      ))}

      {hasMore && (
        <>
          <button
            ref={btnRef}
            type="button"
            onClick={toggle}
            aria-label={label}
            aria-expanded={open}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition ${
              open
                ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--panel-strong)]"
            }`}
          >
            <span className="flex h-4 w-4 items-center justify-center text-[13px] leading-none">
              ⋮
            </span>
          </button>

          {open && typeof document !== "undefined" && createPortal(
            <div
              ref={popupRef}
              className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] py-1"
              style={{ ...popupStyle, animation: "rowMenuIn 100ms ease-out both" }}
            >
              {moreActions.map((action, i) =>
                action.divider ? (
                  <div key={`div-${i}`} className="my-1 border-t border-[var(--line)]" />
                ) : action.href ? (
                  <a
                    key={action.key}
                    href={action.href}
                    target={action.external ? "_blank" : undefined}
                    rel={action.external ? "noreferrer" : undefined}
                    onClick={() => close()}
                    className={`flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition hover:bg-[var(--panel-strong)] ${DROPDOWN_TONE[action.tone ?? "default"] ?? DROPDOWN_TONE.default}`}
                  >
                    {action.icon}
                    <span className="min-w-0 flex-1">{action.label}</span>
                  </a>
                ) : action.serverAction ? (
                  <button
                    key={action.key}
                    type="button"
                    disabled={isPending}
                    onClick={() => { handleConfirm(action); close(); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium transition hover:bg-[var(--panel-strong)] ${isPending ? "opacity-50" : ""} ${DROPDOWN_TONE[action.tone ?? "default"] ?? DROPDOWN_TONE.default}`}
                  >
                    {action.icon}
                    <span className="min-w-0 flex-1">{action.label}</span>
                  </button>
                ) : (
                  <button
                    key={action.key}
                    type="button"
                    onClick={() => { handleConfirm(action); close(); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium transition hover:bg-[var(--panel-strong)] ${DROPDOWN_TONE[action.tone ?? "default"] ?? DROPDOWN_TONE.default}`}
                  >
                    {action.icon}
                    <span className="min-w-0 flex-1">{action.label}</span>
                  </button>
                )
              )}
              <style>{`
                @keyframes rowMenuIn {
                  from { opacity: 0; transform: scale(0.96) translateY(${openDown ? "-4px" : "4px"}); }
                  to   { opacity: 1; transform: scale(1)    translateY(0); }
                }
              `}</style>
            </div>,
            document.body,
          )}
        </>
      )}

      {confirmAction && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50" onClick={() => setConfirmAction(null)}>
          <div
            className="mx-4 w-full max-w-sm rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-[var(--ink)]">{confirmAction.confirm}</p>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">{confirmAction.label}</p>
            <div className="mt-4 flex items-center justify-end gap-2">
                <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-[13px] font-medium text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
              >
                <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={confirmProceed}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-bold text-white transition ${
                  confirmAction.tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-[var(--accent)] hover:brightness-110"
                } ${isPending ? "opacity-50" : ""}`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Confirm
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
