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
  // Only unread notifications are shown — the list empties as you read them
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Panel geometry — computed from the button's bounding rect on open
  const [rect, setRect] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  // Fetch UNREAD only — after they're read they drop off the list
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?all=false&limit=30");
      if (!res.ok) return;
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch + 30-second poll
  useEffect(() => {
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
      setRect({ top: r.bottom, right: window.innerWidth - r.right });
    }
    setIsOpen((v) => !v);
  }

  // Mark a single notification as read → remove it from the list immediately
  async function markRead(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setUnreadCount((c) => Math.max(0, c - 1));
    await fetch(`/api/notifications/${id}`, { method: "POST" }).catch(() => {});
  }

  // Mark all read → clear the entire list
  async function markAllRead() {
    setNotifications([]);
    setUnreadCount(0);
    await fetch("/api/notifications/read-all", { method: "POST" }).catch(() => {});
  }

  // Click a notification → mark it read + navigate to the job
  async function handleClick(n: Notification) {
    await markRead(n.id);
    if (n.job?.id) {
      router.push(`/jobs/${n.job.id}`);
      setIsOpen(false);
    }
  }

  // ── Panel positioning ───────────────────────────────────────────────────────
  // Clamp so the LEFT edge never goes off-screen (≥8px from left viewport edge).
  const panelStyle: React.CSSProperties = (() => {
    if (!rect || typeof window === "undefined") return { display: "none" };
    const vw = window.innerWidth;
    const desiredWidth = Math.min(22 * 16, vw - 16); // max 352 or viewport-16
    // Right edge offset: how many px from the viewport's right edge
    const safeRight = Math.max(8, rect.right);
    // How much width fits before hitting the left margin (8px)
    const maxWidth = vw - safeRight - 8;
    const width = Math.min(desiredWidth, maxWidth);
    return {
      position: "fixed",
      top: rect.top + 8,
      right: safeRight,
      width,
      maxHeight: `calc(100dvh - ${rect.top + 24}px)`,
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
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[9px] font-black text-black">
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
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-black text-black">
                  {unreadCount}
                </span>
              )}
            </div>
            {notifications.length > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] font-medium text-[var(--accent)] transition hover:underline"
              >
                Clear all
              </button>
            )}
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
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="text-2xl opacity-30">🔔</span>
                <p className="text-sm font-medium text-[var(--ink-muted)]">All caught up</p>
                <p className="text-xs text-[var(--ink-muted)]/70">
                  Alerts appear here when job statuses change, approvals are needed, or techs are assigned.
                </p>
              </div>
            ) : (
              notifications.map((n, i) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className="group w-full border-b border-[var(--line)] bg-[var(--accent)]/5 px-4 py-3 text-left transition-colors last:border-0 hover:bg-[var(--panel-strong)]"
                  style={{ animationDelay: `${i * 20}ms` }}
                >
                  <div className="flex items-start gap-3">
                    {typeIcon(n.type)}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-semibold leading-tight text-[var(--ink)]">
                          {n.title}
                        </p>
                        {/* Unread dot */}
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-[var(--ink-muted)]">
                        {n.message}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <p className="text-[10px] text-[var(--ink-muted)]/60">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </p>
                        {n.job?.jobNumber && (
                          <>
                            <span className="text-[var(--ink-muted)]/30">·</span>
                            <span className="text-[10px] font-medium text-[var(--accent)]/70 group-hover:text-[var(--accent)]">
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
          <div className="border-t border-[var(--line)] px-4 py-2.5">
            <button
              onClick={() => { router.push("/settings/notifications"); setIsOpen(false); }}
              className="w-full text-center text-[11px] font-medium text-[var(--ink-muted)] transition hover:text-[var(--accent)]"
            >
              Notification settings →
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
