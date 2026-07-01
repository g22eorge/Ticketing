"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  job?: {
    id: string;
    jobNumber: string;
    client?: { fullName: string } | null;
  } | null;
}

function typeIcon(type: string) {
  switch (type) {
    case "APPROVAL_NEEDED":
      return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </span>
      );
    case "JOB_ASSIGNED":
      return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
        </span>
      );
    case "ESTIMATE_SUBMITTED":
      return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-500/15 text-purple-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>
          </svg>
        </span>
      );
    case "JOB_CREATED":
    case "REPAIR_REQUEST_RECEIVED":
      return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/>
          </svg>
        </span>
      );
    case "PAYMENT_RECEIVED":
      return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>
          </svg>
        </span>
      );
    case "PAYOUT_GENERATED":
      return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-500/15 text-purple-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
          </svg>
        </span>
      );
    case "QUOTATION_ACCEPTED":
      return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6 9 17l-5-5"/>
          </svg>
        </span>
      );
    case "QUOTATION_REJECTED":
      return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </span>
      );
    case "LEAD_WON":
      return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-yellow-500/15 text-yellow-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
          </svg>
        </span>
      );
    case "LEAD_LOST":
      return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-500/15 text-zinc-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
          </svg>
        </span>
      );
    case "PURCHASE_REQUEST_SUBMITTED":
    case "PURCHASE_REQUEST_APPROVED":
      return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
        </span>
      );
    case "STOCK_RECEIVED":
    case "STOCK_TRANSFER_UPDATED":
    case "STOCK_COUNT_APPROVED":
      return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-teal-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="M16.5 9.4 7.55 4.24"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/><polyline points="17 17 19 19 23 15"/>
          </svg>
        </span>
      );
    case "FIELD_VISIT_COMPLETED":
      return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
          </svg>
        </span>
      );
    case "CREDIT_NOTE_ISSUED":
    case "REFUND_ISSUED":
      return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-orange-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>
          </svg>
        </span>
      );
    case "STOCK_LOW":
      return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/>
            <path d="M16.5 9.4 7.55 4.24"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/>
            <circle cx="18.5" cy="15.5" r="2.5"/><path d="M20.27 17.27 22 19"/>
          </svg>
        </span>
      );
    case "STOCK_OUT":
      return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/>
            <path d="M16.5 9.4 7.55 4.24"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/>
            <line x1="17" y1="13" x2="22" y2="18"/><line x1="22" y1="13" x2="17" y2="18"/>
          </svg>
        </span>
      );
    default:
      return (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
          </svg>
        </span>
      );
  }
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  // Panel geometry — computed from the button's bounding rect on open
  const [rect, setRect] = useState<{ top: number; right: number; bottom: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?all=${showAll ? "true" : "false"}&limit=30`);
      if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) {
        setFetchError(true);
        return;
      }
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
      setFetchError(false);
    } catch {
      setFetchError(true);
    } finally {
      setIsLoading(false);
    }
  }, [showAll]);

   // Initial fetch + 30-second poll
   // eslint-disable-next-line react-hooks/set-state-in-effect
   useEffect(() => {
     // eslint-disable-next-line react-hooks/set-state-in-effect
     fetchNotifications();
     const id = setInterval(fetchNotifications, 30_000);
     return () => clearInterval(id);
   }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handle(e: MouseEvent) {
      const panel = document.getElementById("notif-panel");
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        panel && !panel.contains(e.target as Node)
      ) setIsOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [isOpen]);

  // Close on scroll
  useEffect(() => {
    if (!isOpen) return;
    const handle = () => setIsOpen(false);
    window.addEventListener("scroll", handle, true);
    return () => window.removeEventListener("scroll", handle, true);
  }, [isOpen]);

  function openPanel() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setRect({ top: r.bottom, right: window.innerWidth - r.right, bottom: r.bottom });
    }
    setIsOpen((v) => !v);
  }

  async function markRead(id: string) {
    setNotifications((prev) => (
      showAll
        ? prev.map((n) => n.id === id ? { ...n, isRead: true } : n)
        : prev.filter((n) => n.id !== id)
    ));
    setUnreadCount((c) => Math.max(0, c - 1));
    await fetch(`/api/notifications/${id}`, { method: "POST" }).catch(() => {});
  }

  // Mark all read → clear the entire list
  async function markAllRead() {
    setNotifications((prev) => showAll ? prev.map((n) => ({ ...n, isRead: true })) : []);
    setUnreadCount(0);
    await fetch("/api/notifications/read-all", { method: "POST" }).catch(() => {});
  }

  // Click a notification → mark it read, close panel, navigate if linked
  async function handleClick(n: Notification) {
    await markRead(n.id);
    setIsOpen(false);
    if (n.job?.id) {
      router.push(`/jobs/${n.job.id}`);
    } else if (n.type === "STOCK_LOW" || n.type === "STOCK_OUT") {
      // Extract partId embedded in message as [...partId...]
      const match = n.message.match(/\[([^\]]+)\]/);
      if (match) router.push(`/inventory/${match[1]}`);
      else router.push("/inventory");
    }
  }

  // ── Panel positioning ───────────────────────────────────────────────────────
  const panelStyle: React.CSSProperties = (() => {
    if (!rect || typeof window === "undefined") return { display: "none" };
    const vw = window.innerWidth;
    const isMobile = vw < 640;

    if (isMobile) {
      // Full-width minus 16px margins, anchored to viewport right edge
      const width = Math.min(340, vw - 16);
      return {
        position: "fixed",
        top: rect.bottom + 6,
        right: 8,
        width,
        maxHeight: `calc(100dvh - ${rect.bottom + 24}px)`,
        zIndex: 9999,
      };
    }

    // Desktop: align the panel's right edge with the button's right edge.
    const desiredWidth = Math.min(22 * 16, vw - 16);
    const safeRight = Math.max(8, rect.right);
    return {
      position: "fixed",
      top: rect.bottom + 6,
      right: safeRight,
      width: desiredWidth,
      maxHeight: `calc(100dvh - ${rect.bottom + 24}px)`,
      zIndex: 9999,
    };
  })();

  return (
    <>
      {/* ── Bell button ── */}
      <button
        ref={btnRef}
        type="button"
        onClick={openPanel}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] transition hover:border-[var(--accent)]/30 hover:bg-[var(--panel)] hover:text-[var(--ink)]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[13px] font-black text-black">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown panel (portalled to body) ── */}
      {isOpen && typeof document !== "undefined" && createPortal(
        <div
          id="notif-panel"
          role="dialog"
          aria-label="Notifications"
          style={{ ...panelStyle, animation: "notifPanelIn 120ms ease-out both" }}
          className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-2xl"
        >
          <style>{`
            @keyframes notifPanelIn {
              from { opacity: 0; transform: scale(0.97) translateY(-6px); }
              to   { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>

          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-semibold text-[var(--ink)]">Notifications</p>
              {unreadCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[12px] font-black text-black">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAll((v) => !v)}
                className="text-[13px] font-medium text-[var(--accent)] transition hover:underline"
              >
                {showAll ? "Unread" : "All"}
              </button>
              {notifications.some((n) => !n.isRead) && (
                <button
                  onClick={markAllRead}
                  className="text-[13px] font-medium text-[var(--accent)] transition hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: "calc(100% - 90px)" }}>
            {isLoading ? (
              <div>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3">
                    <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-[var(--panel-strong)]" />
                    <div className="flex-1 space-y-1.5 pt-0.5">
                      <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--panel-strong)]" />
                      <div className="h-2.5 w-full animate-pulse rounded bg-[var(--panel-strong)]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : fetchError ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="text-2xl opacity-40">⚠️</span>
                <p className="text-sm font-medium text-[var(--ink-muted)]">Couldn&apos;t load notifications</p>
                <p className="text-xs text-[var(--ink-muted)]/70">Check your connection — will retry shortly.</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="text-2xl opacity-30">🔔</span>
                <p className="text-sm font-medium text-[var(--ink-muted)]">
                  {showAll ? "No notifications yet" : "All caught up"}
                </p>
                <p className="text-xs text-[var(--ink-muted)]/70">
                  Alerts appear here when job statuses change, approvals are needed, or techs are assigned.
                </p>
              </div>
            ) : (
              notifications.map((n, i) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`group w-full border-b border-[var(--line)] px-4 py-3 text-left transition-colors last:border-0 hover:bg-[var(--panel-strong)] ${
                    n.isRead ? "bg-[var(--panel)]" : "bg-[var(--accent)]/5"
                  }`}
                  style={{ animationDelay: `${i * 20}ms` }}
                >
                  <div className="flex items-start gap-3">
                    {typeIcon(n.type)}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-semibold leading-tight text-[var(--ink)]">
                          {n.title}
                        </p>
                        {!n.isRead && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-[var(--ink-muted)]">
                        {n.message}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <p className="text-[12px] text-[var(--ink-muted)]/60">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </p>
                        {n.job?.jobNumber && (
                          <>
                            <span className="text-[var(--ink-muted)]/30">·</span>
                            <span className="text-[12px] font-medium text-[var(--accent)]/70 group-hover:text-[var(--accent)]">
                              {n.job.jobNumber}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] px-4 py-2.5">
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-[13px] font-medium text-[var(--accent)] transition hover:underline"
            >
              {showAll ? "Show unread" : "View all"}
            </button>
            <button
              onClick={() => { router.push("/settings/notifications"); setIsOpen(false); }}
              className="text-[13px] font-medium text-[var(--ink-muted)] transition hover:text-[var(--accent)]"
            >
              Settings
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
