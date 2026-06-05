"use client";

import { Role } from "@prisma/client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { can } from "@/lib/permissions";

function pageMeta(pathname: string, role: Role) {
  const parts = pathname.split("/").filter(Boolean);

  if (pathname === "/dashboard") {
    if (role === "TECHNICIAN_EXTERNAL") {
      return { title: "Dashboard", description: "Track your assigned jobs and payout status in one view." };
    }
    if (role === "TECHNICIAN_INTERNAL") {
      return { title: "Dashboard", description: "Focus on your active queue: diagnosing, repair, and completed jobs." };
    }
    if (role === "OPS") {
      return { title: "Dashboard", description: "Manage referrals, billing visibility, client approvals, and handoff into active repair." };
    }
    if (role === "FRONT_DESK") {
      return { title: "Dashboard", description: "Capture new intake jobs and respond to client updates with read-only progress visibility." };
    }
    if (role === "ADMIN") {
      return { title: "Dashboard", description: "Unified operations and financial control for repair performance." };
    }
    return { title: "Dashboard", description: "Keep intake, diagnostics, approvals, and closure in one live queue." };
  }
  if (pathname === "/jobs") return { title: "Jobs", description: "Track intake, repair progress, and completion at a glance." };
  if (pathname === "/jobs/new") return { title: "New Job Intake", description: "Capture client, device, issue, and submission details." };
  if (parts[0] === "jobs" && parts[1] && parts[2] === "edit") {
    return { title: "Edit Job", subtitle: `Ref ${parts[1].slice(0, 8)}`, description: "Update job details and technician notes." };
  }
  if (parts[0] === "jobs" && parts[1]) {
    return { title: "Job Details", subtitle: `Ref ${parts[1].slice(0, 8)}`, description: "Review status, diagnosis, repair log, financials, and timeline." };
  }
  if (pathname === "/clients") return { title: "Clients", description: "Directory, engagement level, and quick access to client history." };
  if (parts[0] === "clients" && parts[1]) {
    return { title: "Client Details", subtitle: `Ref ${parts[1].slice(0, 8)}`, description: "View client profile, job history, and notes timeline." };
  }
  if (pathname === "/reports") return { title: "Reports", description: "Operational and financial insights for repair performance." };
  if (pathname === "/ai-insights") return { title: "AI Insights", description: "Decision support across repairs, sales, finance, inventory, and operational risk." };
  if (pathname === "/inventory") return { title: "Inventory", description: "Track parts stock, reservations, and reorder risk." };
  if (pathname === "/payout-followups") return { title: "Collections & Payouts", description: "Collect client payments, pay external techs, track supplier bills." };
  if (pathname === "/technicians") return { title: "Technician Portal", description: "Prioritized queue for assigned repair work." };
  if (pathname === "/technicians/payouts") return { title: "Technician Payouts", description: "Track paid and unpaid fees across your external assignments." };
  if (pathname === "/settings/users") return { title: "User Management", description: "Create users, assign roles, and manage active access." };
  if (pathname === "/documents/receipts") return { title: "Receipts", description: "Track payments, receipt PDFs, and collection history." };
  if (pathname === "/documents/invoices") return { title: "Invoices", description: "Issue, collect, and monitor customer invoices." };
  if (pathname === "/documents/job-cards") return { title: "Job Cards", description: "Generate intake documents and handoff cards." };
  if (pathname === "/documents/quotations") return { title: "Quotations", description: "Prepare repair and sales quotes for approval." };
  if (pathname === "/settings/branding") return { title: "Branding", description: "Manage invoice logo, company details, VAT defaults, and document colours." };
  if (pathname === "/settings/profile") return { title: "Profile", description: "Update your personal account details and contact info." };
  if (pathname === "/settings/notifications") return { title: "Notifications", description: "Choose which job events trigger alerts for your account." };
  if (pathname === "/settings/notifications/templates") return { title: "Comms Templates", description: "Manage message templates, nudge sequencing, and status-channel policy rules." };
  if (pathname === "/settings/notifications/outbox") return { title: "Outbox", description: "Delivery queue for outbound WhatsApp and email notifications." };
  if (pathname === "/intake") return { title: "Repair Requests", description: "Incoming website requests awaiting intake conversion." };
  return { title: "Workspace" };
}

async function fetchJobNumber(id: string) {
  const res = await fetch(`/api/meta/job/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  const data = (await res.json()) as { jobNumber?: string };
  return data.jobNumber ?? null;
}

async function fetchClientName(id: string) {
  const res = await fetch(`/api/meta/client/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  const data = (await res.json()) as { fullName?: string };
  return data.fullName ?? null;
}

function roleTag(role: Role) {
  if (role === "ADMIN") return "Admin";
  if (role === "TECHNICIAN_INTERNAL") return "Internal Tech";
  if (role === "TECHNICIAN_EXTERNAL") return "External Tech";
  if (role === "OPS") return "Operations";
  if (role === "FRONT_DESK") return "Front Desk";
  return "Operations";
}

function roleTagStyle(role: Role) {
  // Don't use --ink as a background: in dark theme it's near-white.
  if (role === "ADMIN") return "bg-[var(--accent)] text-black border border-[var(--accent)]/35";
  if (role === "OPS") return "bg-[var(--accent)]/15 text-[#9A7A00] border border-[var(--accent)]/30";
  if (role === "TECHNICIAN_INTERNAL") return "bg-blue-500/10 text-blue-700 border border-blue-400/30 dark:text-blue-400";
  if (role === "TECHNICIAN_EXTERNAL") return "bg-purple-500/10 text-purple-700 border border-purple-400/30 dark:text-purple-400";
  if (role === "FRONT_DESK") return "bg-emerald-500/10 text-emerald-700 border border-emerald-400/30 dark:text-emerald-400";
  return "bg-[var(--panel-strong)] text-[var(--ink-muted)]";
}

/**
 * PRIMARY_TABS — the 5 bottom-nav tabs that are "home" screens.
 * These have their own custom native headers on mobile, so:
 *   • PageThemeHeader is hidden (hideMobile = true)
 *   • No back button shown
 *
 * Every other page (even single-segment ones like /clients, /inventory,
 * /payout-followups) navigated to FROM somewhere — they all get a back arrow.
 */
const PRIMARY_TABS = new Set<string>([
  "/dashboard",           // Home tab
  "/jobs",                // Repairs tab
  "/documents/invoices",  // Invoices tab
  "/reports",             // Activity tab
  "/more",                // More tab
]);

function isPrimaryMobileTab(pathname: string, role: Role, permissions: string[]) {
  if (PRIMARY_TABS.has(pathname)) return true;
  if (pathname !== "/technicians") return false;
  return role === "TECHNICIAN_EXTERNAL" || !can.viewIntake({ role, permissions });
}

// On mobile, only the primary tab pages have their own native headers
function isMobileRootPage(pathname: string, role: Role, permissions: string[]) {
  return isPrimaryMobileTab(pathname, role, permissions);
}

export function PageThemeHeader({ role, permissions = [] }: { role: Role; permissions?: string[] }) {
  const pathname = usePathname();
  const meta = pageMeta(pathname, role);
  const [resolvedSubtitle, setResolvedSubtitle] = useState<{ path: string; text: string } | null>(null);
  const hideMobile = isMobileRootPage(pathname, role, permissions); // primary-tab pages have own native headers

  useEffect(() => {
    let cancelled = false;
    const parts = pathname.split("/").filter(Boolean);

    const load = async () => {
      if (parts[0] === "jobs" && parts[1]) {
        if (parts[1] === "new") return;
        const jobNumber = await fetchJobNumber(parts[1]);
        if (!cancelled && jobNumber) {
          setResolvedSubtitle({ path: pathname, text: jobNumber });
        }
        return;
      }
      if (parts[0] === "clients" && parts[1]) {
        const clientName = await fetchClientName(parts[1]);
        if (!cancelled && clientName) {
          setResolvedSubtitle({ path: pathname, text: clientName });
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const subtitle = resolvedSubtitle?.path === pathname ? resolvedSubtitle.text : meta.subtitle;

  return (
    <>
      {/* Mobile: hidden on primary-tab pages (own native headers).
          On all other pages: show page title only.
          Back button is now in the sticky Header bar above, not here. */}
      <div className={`flex items-center gap-2 sm:hidden ${hideMobile ? "hidden" : ""}`}>
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h1 className="text-[15px] font-bold tracking-tight text-[var(--ink)]">{meta.title}</h1>
          {subtitle ? (
            <span className="rounded border border-[var(--line)] bg-[var(--panel-strong)] px-1.5 py-0.5 font-mono text-[12px] font-medium text-[var(--ink-muted)]">
              {subtitle}
            </span>
          ) : null}
        </div>
      </div>

      {/* sm+: compact card with accent bar and role badge */}
      <section className="hidden sm:flex items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 panel-shadow">
        <div className="h-5 w-0.5 shrink-0 rounded-full bg-gradient-to-b from-[var(--accent)] to-[var(--accent)]/40" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-2">
            <h1 className="text-[13px] font-bold tracking-tight text-[var(--ink)]">{meta.title}</h1>
            {subtitle ? (
              <span className="rounded border border-[var(--line)] bg-[var(--panel-strong)] px-1.5 py-0.5 text-[12px] font-mono font-medium text-[var(--ink-muted)]">
                {subtitle}
              </span>
            ) : null}
            {meta.description ? (
              <span className="text-[13px] text-[var(--ink-muted)]">{meta.description}</span>
            ) : null}
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[13px] font-bold uppercase tracking-[0.1em] ${roleTagStyle(role)}`}>
            {roleTag(role)}
          </span>
        </div>
      </section>
    </>
  );
}
