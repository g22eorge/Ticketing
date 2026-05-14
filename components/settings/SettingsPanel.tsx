"use client";

import Link from "next/link";
import { useEffect, useRef, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateProfileAction, type UpdateProfileState } from "@/app/(app)/settings/profile/actions";

type QuickLink = {
  label: string;
  href: string;
  icon: React.ReactNode;
  desc: string;
};

function SaveBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-premium rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const adminLinks: QuickLink[] = [
  {
    label: "Branding & Documents",
    href: "/settings/branding",
    desc: "Logo, invoice layout, VAT, terms",
    icon: <Icon d="M4 6h16M4 12h16M4 18h7" />,
  },
  {
    label: "WhatsApp Notifications",
    href: "/settings/notifications/whatsapp",
    desc: "Provider credentials, test sends",
    icon: <Icon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  },
  {
    label: "Message Templates",
    href: "/settings/notifications/templates",
    desc: "Per-status notification messages",
    icon: <Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8" />,
  },
  {
    label: "Users",
    href: "/settings/users",
    desc: "Roles, invite, deactivate",
    icon: <Icon d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75" />,
  },
  {
    label: "Billing",
    href: "/settings/billing",
    desc: "Plan, payments, invoices",
    icon: <Icon d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />,
  },
];

const opsLinks: QuickLink[] = [
  {
    label: "Message Templates",
    href: "/settings/notifications/templates",
    desc: "Per-status notification messages",
    icon: <Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8" />,
  },
];

const sharedLinks: QuickLink[] = [
  {
    label: "Notification Preferences",
    href: "/settings/notifications",
    desc: "Channels, timing, what you receive",
    icon: <Icon d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0" />,
  },
];

function fieldClass(extra = "") {
  return `w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14 ${extra}`;
}

export function SettingsPanel({
  open,
  onClose,
  userName,
  userEmail,
  userPhone,
  userRole,
  role,
}: {
  open: boolean;
  onClose: () => void;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  userRole: string;
  role: string;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const initialState: UpdateProfileState = {};
  const [state, formAction] = useActionState(updateProfileAction, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success("Profile updated");
      router.refresh();
    }
    if (state.error) toast.error(state.error);
  }, [state, router]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isAdmin = role === "ADMIN";
  const isOps = role === "OPS";
  const quickLinks = [
    ...(isAdmin ? adminLinks : isOps ? opsLinks : []),
    ...sharedLinks,
  ];

  return (
    <>
      {/* Backdrop */}
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          aria-hidden="true"
          onClick={onClose}
        />
      ) : null}

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-[var(--line)] bg-[var(--panel)] shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 text-[var(--ink-muted)]" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
            <span className="text-sm font-semibold text-[var(--ink)]">Settings</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--ink-muted)] transition hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]"
            aria-label="Close settings"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Profile section */}
          <div className="border-b border-[var(--line)] p-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Your Profile</p>
            <form action={formAction} className="space-y-3">
              <div>
                <label htmlFor="sp-name" className="mb-1 block text-xs text-[var(--ink-muted)]">Name</label>
                <input id="sp-name" name="name" defaultValue={userName} required minLength={2} maxLength={80} className={fieldClass()} />
              </div>
              <div>
                <label htmlFor="sp-phone" className="mb-1 block text-xs text-[var(--ink-muted)]">Phone</label>
                <input id="sp-phone" name="phone" defaultValue={userPhone ?? ""} maxLength={30} placeholder="+256…" className={fieldClass()} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">Email</p>
                  <p className="mt-0.5 truncate text-xs font-medium text-[var(--ink)]">{userEmail}</p>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">Role</p>
                  <p className="mt-0.5 text-xs font-medium text-[var(--ink)]">{userRole}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <SaveBtn />
                <Link
                  href="/settings/profile"
                  onClick={onClose}
                  className="text-[11px] text-[var(--accent)] underline-offset-2 hover:underline"
                >
                  Change password →
                </Link>
              </div>
            </form>
          </div>

          {/* Quick links */}
          {quickLinks.length > 0 ? (
            <div className="border-b border-[var(--line)] p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                {isAdmin ? "Workspace" : "Notifications"}
              </p>
              <div className="flex flex-col gap-1">
                {quickLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-lg p-2.5 text-left transition hover:bg-[var(--panel-strong)]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]">
                      {link.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[var(--ink)]">{link.label}</p>
                      <p className="text-[10px] text-[var(--ink-muted)]">{link.desc}</p>
                    </div>
                    <svg viewBox="0 0 16 16" fill="currentColor" className="ml-auto h-3 w-3 shrink-0 text-[var(--ink-muted)]/50" aria-hidden="true">
                      <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L9.19 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--line)] px-4 py-3">
          <Link
            href="/settings"
            onClick={onClose}
            className="flex w-full items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm font-medium text-[var(--ink)] transition hover:border-[var(--accent)]/30 hover:text-[var(--accent)]"
          >
            All settings
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L9.19 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>
      </div>
    </>
  );
}
