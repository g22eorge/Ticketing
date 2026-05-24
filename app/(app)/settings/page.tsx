import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import path from "node:path";
import { planLabel } from "@/lib/plan-labels";
import { getEffectivePlanPrices } from "@/lib/plan-prices";
import { access, stat } from "node:fs/promises";

import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getUserPreferences } from "@/lib/notifications/index";
import { getDocumentBrandingSettings } from "@/lib/document-branding";
import { whatsappConfigSummary, whatsappHealthCheck } from "@/lib/notifications/whatsapp";
import { orgDb, prisma } from "@/lib/prisma";
import { runDataHeal } from "@/lib/data-heal";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { NotificationPrefsForm } from "@/components/settings/NotificationPrefsForm";
import { UserDetailsForm } from "@/components/settings/UserDetailsForm";
import { UserPasswordResetForm } from "@/components/settings/UserPasswordResetForm";
import { UserAccessControlPanel } from "@/components/settings/UserAccessControlPanel";
import { WhatsAppTestPanel } from "@/components/settings/WhatsAppTestPanel";
import { TemplateSubmitPanel, type TemplateDefinition } from "./notifications/whatsapp/meta-templates/TemplateSubmitPanel";
import {
  createUser,
  saveAccessChanges,
  updateUserDetails,
  resetUserPassword,
} from "./users/actions";
import {
  uploadLogoAction,
  saveBrandingAction,
} from "./branding/actions";
import {
  runDry,
  runApply,
} from "./data-heal/actions";
import { OutboxSection, type OutboxFilters } from "./notifications/outbox/OutboxSection";
import { TemplatesSection } from "./notifications/templates/TemplatesSection";
import { TargetsSection } from "../targets/TargetsSection";

export const dynamic = "force-dynamic";

type SearchParams = {
  section?: string;
  userId?: string;
  q?: string;
  // data-heal feedback
  mode?: string;
  checked?: string;
  fixed?: string;
  pending?: string;
  at?: string;
  // templates / outbox feedback
  saved?: string;
  error?: string;
  // outbox filters
  channel?: string;
  status?: string;
  // targets filters
  period?: string;
  label?: string;
};

// ── nav types ──────────────────────────────────────────────────────────────────

type NavItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  opsPlus?: boolean;
  /** If set, clicking this nav item navigates directly to this URL (opens a real page). */
  externalHref?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

// ── outline icon helper ────────────────────────────────────────────────────────
// Uses stroke-based SVG to match the reference's outline icon style.

function OIcon({ d, d2 }: { d: string; d2?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[15px] w-[15px] shrink-0"
      aria-hidden
    >
      <path d={d} />
      {d2 && <path d={d2} />}
    </svg>
  );
}

const ICONS = {
  profile:    <OIcon d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" d2="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
  bell:       <OIcon d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />,
  users:      <OIcon d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" d2="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
  branding:   <OIcon d="M12 2L2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5" />,
  billing:    <OIcon d="M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2ZM1 10h22" />,
  whatsapp:   <OIcon d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />,
  templates:  <OIcon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M16 13H8M16 17H8M10 9H8" />,
  outbox:     <OIcon d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z" />,
  targets:    <OIcon d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />,
  branch:     <OIcon d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 17.5a3.5 3.5 0 0 0 7 0V14H3v3.5ZM6.5 3v4M17.5 3v4M17.5 14v4M14 17.5h4" />,
  groups:     <OIcon d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
  audit:      <OIcon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M12 18v-4M12 14l-2 2M12 14l2 2" />,
  dataheal:   <OIcon d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  gear:       <OIcon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />,
  // Finance config icons
  taxrates:   <OIcon d="M9 14l6-6M9.5 9a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zM14.5 14a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zM19 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />,
  accounts:   <OIcon d="M4 4h16v4H4zM4 12h4v8H4zM12 12h4v8h-4zM20 12h0v8h0" />,
  journal:    <OIcon d="M3 6h18M3 12h18M3 18h18M3 6v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" />,
  recurring:  <OIcon d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />,
  // Inventory config icons
  locations:  <OIcon d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" d2="M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
  suppliers:  <OIcon d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2M8 3h13l-3 7H8V3zM8 10v11" />,
};

// ── nav groups ─────────────────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Account",
    items: [
      { key: "profile",       label: "My Profile",    icon: ICONS.profile },
      { key: "notifications", label: "Notifications", icon: ICONS.bell },
    ],
  },
  {
    label: "Workspace",
    items: [
      { key: "users",    label: "Members",  icon: ICONS.users,    adminOnly: true },
      { key: "branding", label: "Branding", icon: ICONS.branding, adminOnly: true },
      { key: "billing",  label: "Billing",  icon: ICONS.billing,  adminOnly: true },
    ],
  },
  {
    label: "Communications",
    items: [
      { key: "whatsapp",  label: "WhatsApp",       icon: ICONS.whatsapp,  adminOnly: true },
      { key: "meta",      label: "Meta Templates", icon: ICONS.templates, adminOnly: true },
      { key: "templates", label: "Msg Templates",  icon: ICONS.templates, opsPlus: true },
      { key: "outbox",    label: "Outbox",         icon: ICONS.outbox,    opsPlus: true },
    ],
  },
  {
    // Finance config: link-only items that navigate to their real pages
    label: "Finance Config",
    items: [
      { key: "fin-taxrates",  label: "Tax Rates",         icon: ICONS.taxrates,  adminOnly: true, externalHref: "/finance/tax-rates" },
      { key: "fin-accounts",  label: "Chart of Accounts", icon: ICONS.accounts,  adminOnly: true, externalHref: "/finance/accounts" },
      { key: "fin-journal",   label: "Journal Entries",   icon: ICONS.journal,   adminOnly: true, externalHref: "/finance/journal" },
      { key: "fin-recurring", label: "Recurring",         icon: ICONS.recurring, opsPlus: true,   externalHref: "/finance/recurring" },
    ],
  },
  {
    // Inventory config: link-only items
    label: "Inventory Config",
    items: [
      { key: "inv-locations", label: "Locations", icon: ICONS.locations, adminOnly: true, externalHref: "/inventory/locations" },
      { key: "inv-suppliers", label: "Suppliers", icon: ICONS.suppliers, adminOnly: true, externalHref: "/inventory/suppliers" },
    ],
  },
  {
    label: "Admin",
    items: [
      { key: "targets",  label: "Sales Targets", icon: ICONS.targets,  adminOnly: true },
      { key: "branches", label: "Branches",      icon: ICONS.branch,   adminOnly: true },
      { key: "groups",   label: "Groups",        icon: ICONS.groups,   adminOnly: true },
      { key: "audit",    label: "Audit Log",     icon: ICONS.audit,    adminOnly: true },
      { key: "dataheal", label: "Data Heal",     icon: ICONS.dataheal, adminOnly: true },
    ],
  },
];

// ── section metadata ───────────────────────────────────────────────────────────

const SECTION_META: Record<string, { label: string; description: string; href?: string }> = {
  // Finance & Inventory config keys — descriptions for the section header when navigated to
  "fin-taxrates":  { label: "Tax Rates",          description: "Define VAT and other tax rates used on documents.", href: "/finance/tax-rates" },
  "fin-accounts":  { label: "Chart of Accounts",  description: "Manage ledger accounts and the accounting hierarchy.",  href: "/finance/accounts" },
  "fin-journal":   { label: "Journal Entries",    description: "Manual debit/credit journal entries.",  href: "/finance/journal" },
  "fin-recurring": { label: "Recurring",          description: "Scheduled recurring invoices and bills.",  href: "/finance/recurring" },
  "inv-locations": { label: "Locations",          description: "Manage warehouse and storage locations.",  href: "/inventory/locations" },
  "inv-suppliers": { label: "Suppliers",          description: "Manage supplier profiles and contacts.",  href: "/inventory/suppliers" },
  profile:      { label: "My Profile",        description: "Your name, email address, and phone number." },
  notifications:{ label: "Notifications",     description: "Control which alerts reach you via WhatsApp and email." },
  users:        { label: "Members",           description: "Add staff, assign roles, and manage access." },
  branding:     { label: "Branding",          description: "Company name, logo, and document headers." },
  billing:      { label: "Billing",           description: "Plan details, trial status, and renewal." },
  whatsapp:     { label: "WhatsApp",          description: "Provider credentials and test sends." },
  meta:         { label: "Meta Templates",    description: "Submit and sync WhatsApp message templates to Facebook." },
  templates:    { label: "Msg Templates",     description: "Edit WhatsApp and email message content." },
  outbox:       { label: "Outbox",            description: "Delivery status and full message history." },
  targets:      { label: "Sales Targets",     description: "Set monthly revenue and job targets." },
  branches:     { label: "Branches",          description: "Manage locations and branch rules." },
  groups:       { label: "Groups",            description: "Configure permission groups and staff membership." },
  audit:        { label: "Audit Log",         description: "Full workspace activity history." },
  dataheal:     { label: "Data Heal",         description: "Diagnostics and data repair tools." },
};

// ── page ───────────────────────────────────────────────────────────────────────

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { user } = await getCurrentUserRole();
  const params   = await searchParams;

  const allowed = ["ADMIN", "TECHNICAL_MANAGER", "SALES_MANAGER", "OPS", "SALES", "CASHIER", "FRONT_DESK", "TECHNICIAN_INTERNAL", "TECHNICIAN_EXTERNAL"];
  if (!allowed.includes(user.role)) redirect("/dashboard");

  const isAdmin   = user.role === "ADMIN";
  const isOpsTier = ["ADMIN", "TECHNICAL_MANAGER", "SALES_MANAGER", "OPS"].includes(user.role);

  const section = params.section ?? "profile";
  const userId  = params.userId;
  const q       = params.q ?? "";
  // data-heal feedback params (passed through from redirect)
  const dhFeedback = {
    mode:    params.mode,
    checked: params.checked,
    fixed:   params.fixed,
    pending: params.pending,
    at:      params.at,
  };
  // templates / outbox feedback
  const feedbackSaved = params.saved;
  const feedbackError = params.error;
  // outbox filters
  const outboxFilters: OutboxFilters = {
    channel: params.channel,
    status:  params.status,
    q:       params.q,
  };
  // targets filters
  const targetPeriod = params.period;
  const targetLabel  = params.label;

  const prefs = (section === "notifications" && can.viewNotifications(user))
    ? await getUserPreferences(user.id)
    : null;

  function canSeeItem(item: NavItem) {
    if (item.adminOnly && !isAdmin)   return false;
    if (item.opsPlus   && !isOpsTier) return false;
    if (item.key === "notifications"  && !can.viewNotifications(user)) return false;
    return true;
  }

  const meta = SECTION_META[section];

  // If the section resolves to an external-link item, redirect there immediately
  // so the settings page is never rendered for it (e.g. /settings?section=fin-taxrates → /finance/tax-rates).
  const externalItem = NAV_GROUPS.flatMap((g) => g.items).find(
    (item) => item.key === section && item.externalHref,
  );
  if (externalItem?.externalHref) redirect(externalItem.externalHref);

  // ── desktop left nav ──────────────────────────────────────────────────────
  const LeftNav = (
    <nav className="flex w-[218px] shrink-0 flex-col overflow-hidden">
      {/* Nav header — aligns with content header */}
      <div className="flex h-[58px] shrink-0 items-center border-b border-[var(--line)] px-5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent)]/15">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px]" aria-hidden>
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </div>
          <span className="text-[13px] font-semibold text-[var(--ink)]">Settings</span>
        </div>
      </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3">
        <div className="space-y-4">
          {NAV_GROUPS.map((group) => {
            const visible = group.items.filter(canSeeItem);
            if (!visible.length) return null;
            return (
              <div key={group.label}>
                <p className="mb-1 px-2.5 text-[9.5px] font-bold uppercase tracking-[0.16em] text-[var(--label-muted)]">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {visible.map((item) => {
                    const active = section === item.key;
                    const href = item.externalHref ?? `/settings?section=${item.key}`;
                    return (
                      <Link
                        key={item.key}
                        href={href}
                        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors ${
                          active
                            ? "bg-[var(--accent)] text-white shadow-sm"
                            : "text-[var(--ink-muted)] hover:bg-[var(--accent)]/8 hover:text-[var(--ink)]"
                        }`}
                      >
                        {item.icon}
                        {item.label}
                        {item.externalHref && (
                          <svg className="ml-auto h-3 w-3 shrink-0 text-[var(--ink-muted)]/50" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                            <path d="M4 16 L16 4 M9 4 h7 v7" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex h-full overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">

      {/* ── Left nav (desktop) ────────────────────────────── */}
      <div className="hidden shrink-0 lg:flex lg:flex-col lg:border-r lg:border-[var(--line)] lg:bg-[var(--panel-strong)]/20">
        {LeftNav}
      </div>

      {/* ── Right content ──────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* ── Section header ──────────────────────────────── */}
        <div className="flex h-[58px] shrink-0 items-center border-b border-[var(--line)] px-8">
          {meta ? (
            <div className="flex min-w-0 flex-1 items-center justify-between gap-6">
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-bold text-[var(--ink)]">{meta.label}</h1>
              </div>
              {meta.description && (
                <p className="hidden shrink-0 text-[12px] text-[var(--ink-muted)] xl:block">
                  {meta.description}
                </p>
              )}
            </div>
          ) : (
            <h1 className="text-[15px] font-bold text-[var(--ink)]">Settings</h1>
          )}
        </div>

        {/* ── Mobile pill nav ─────────────────────────────── */}
        <div className="flex gap-1 overflow-x-auto border-b border-[var(--line)] px-3 py-2 lg:hidden">
          {NAV_GROUPS.flatMap((g) => g.items.filter(canSeeItem)).map((item) => {
            const href = item.externalHref ?? `/settings?section=${item.key}`;
            const active = !item.externalHref && section === item.key;
            return (
              <Link
                key={item.key}
                href={href}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                  active
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--ink-muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]"
                }`}
              >
                {item.icon}
                {item.label}
                {item.externalHref && (
                  <svg className="h-2.5 w-2.5 shrink-0 opacity-50" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M4 16 L16 4 M9 4 h7 v7" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </Link>
            );
          })}
        </div>

        {/* ── Section body ────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-8 py-7">
          {!meta ? (
            <p className="text-sm text-[var(--ink-muted)]">Section not found.</p>
          ) : (
            <>
              {/* Description — only visible below xl (header shows it above xl) */}
              {meta.description && (
                <p className="mb-6 text-[13px] text-[var(--ink-muted)] xl:hidden">
                  {meta.description}
                </p>
              )}

              {/* Profile */}
              {section === "profile" && (
                <ProfileForm name={user.name} email={user.email} role={user.role} phone={user.phone} />
              )}

              {/* Notifications */}
              {section === "notifications" && prefs && (
                <NotificationPrefsForm prefs={prefs} />
              )}
              {section === "notifications" && !prefs && (
                <p className="text-sm text-[var(--ink-muted)]">Notifications are not available for your role.</p>
              )}

              {/* Members — inline */}
              {section === "users" && isAdmin && <UsersSection userId={userId} q={q} />}
              {section === "users" && !isAdmin && <p className="text-sm text-[var(--ink-muted)]">You do not have permission to manage members.</p>}

              {/* Branding — inline */}
              {section === "branding" && isAdmin && <BrandingSection />}
              {section === "branding" && !isAdmin && <p className="text-sm text-[var(--ink-muted)]">You do not have permission to manage branding.</p>}

              {/* WhatsApp — inline */}
              {section === "whatsapp" && isAdmin && <WhatsAppSection />}
              {section === "whatsapp" && !isAdmin && <p className="text-sm text-[var(--ink-muted)]">Admin access required.</p>}

              {/* Meta Templates — inline */}
              {section === "meta" && isAdmin && <MetaSection />}
              {section === "meta" && !isAdmin && <p className="text-sm text-[var(--ink-muted)]">Admin access required.</p>}

              {/* Data Heal — inline */}
              {section === "dataheal" && isAdmin && <DataHealSection feedback={dhFeedback} />}
              {section === "dataheal" && !isAdmin && <p className="text-sm text-[var(--ink-muted)]">Admin access required.</p>}

              {/* Outbox — inline */}
              {section === "outbox" && isOpsTier && <OutboxSection filters={outboxFilters} />}
              {section === "outbox" && !isOpsTier && <p className="text-sm text-[var(--ink-muted)]">Access restricted.</p>}

              {/* Msg Templates — inline */}
              {section === "templates" && isOpsTier && (
                <TemplatesSection
                  userRole={user.role}
                  returnBase="/settings?section=templates"
                  saved={feedbackSaved}
                  error={feedbackError}
                />
              )}
              {section === "templates" && !isOpsTier && <p className="text-sm text-[var(--ink-muted)]">Access restricted.</p>}

              {/* Billing — placeholder */}
              {section === "billing" && isAdmin && <BillingSection />}
              {section === "billing" && !isAdmin && <p className="text-sm text-[var(--ink-muted)]">Admin access required.</p>}

              {/* Targets — inline */}
              {section === "targets" && (
                <TargetsSection user={user} period={targetPeriod} label={targetLabel} />
              )}

              {/* Branches / Groups / Audit — placeholders */}
              {section === "branches" && <ComingSoonSection label="Branches" description="Branch management is coming soon." />}
              {section === "groups"   && <ComingSoonSection label="Groups" description="Permission group management is coming soon." />}
              {section === "audit"    && <ComingSoonSection label="Audit Log" description="Full workspace activity history is coming soon." />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── billing section ───────────────────────────────────────────────────────────

async function BillingSection() {
  const { user } = await getCurrentUserRole();

  // Fetch org plan
  let plan = "FREE";
  let isActive = false;
  try {
    const org = await prisma.organisation.findUnique({
      where: { id: user.orgId },
      select: { plan: true, isActive: true },
    });
    if (org) { plan = String(org.plan); isActive = org.isActive; }
  } catch { /* show defaults */ }

  const prices = await getEffectivePlanPrices();
  const price = prices[plan];
  const label = planLabel(plan);

  const CHIP: Record<string, string> = {
    FREE:         "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
    STARTER:      "border-sky-200 bg-sky-50 text-sky-700",
    PROFESSIONAL: "border-amber-200 bg-amber-50 text-amber-700",
    ENTERPRISE:   "border-purple-200 bg-purple-50 text-purple-700",
  };

  return (
    <div className="max-w-xl space-y-3">
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-4">
        {/* Plan header */}
        <div className="flex items-center justify-between gap-4">
          <p className="text-[13px] font-semibold text-[var(--ink)]">Current Plan</p>
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"}`}>
            {isActive ? "Active" : "Inactive"}
          </span>
        </div>

        {/* Plan tile */}
        <div className="flex items-center gap-4 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3">
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${CHIP[plan] ?? CHIP.FREE}`}>
            {label}
          </span>
          <div className="flex-1 min-w-0">
            {plan === "FREE" ? (
              <p className="text-sm font-semibold text-[var(--ink)]">Free tier</p>
            ) : (
              <p className="text-sm font-semibold text-[var(--ink)]">
                UGX {price ? new Intl.NumberFormat("en-UG").format(price) : "—"} / month
              </p>
            )}
            <p className="text-xs text-[var(--ink-muted)] mt-0.5">
              Contact your platform administrator to change or upgrade your plan.
            </p>
          </div>
        </div>

        {/* Upgrade prompt for free tier */}
        {plan === "FREE" && (
          <div className="rounded-lg border border-[var(--gold)]/25 bg-[var(--gold)]/5 px-4 py-3 flex items-start gap-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--gold)]" aria-hidden>
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            <p className="text-xs text-[var(--ink-muted)]">
              Unlock unlimited jobs, users and features by upgrading to <strong className="text-[var(--ink)]">Okutandika</strong> or higher.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── coming soon placeholder ───────────────────────────────────────────────────

function ComingSoonSection({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel-strong)]/40 py-16">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--panel)]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-[var(--ink-muted)]/60" aria-hidden>
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <p className="text-[13px] font-semibold text-[var(--ink)]">{label}</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">{description}</p>
      </div>
    </div>
  );
}

// ── UsersSection ──────────────────────────────────────────────────────────────

const HUB = "/settings?section=users";

function roleLabelShort(role: Role) {
  const map: Partial<Record<Role, string>> = {
    ADMIN:               "Admin",
    TECHNICAL_MANAGER:   "Technical Mgr",
    SALES_MANAGER:       "Sales Mgr",
    OPS:                 "Operations",
    SALES:               "Sales",
    CASHIER:             "Cashier",
    FRONT_DESK:          "Front Desk",
    INTAKE:              "Front Desk",
    TECHNICIAN_INTERNAL: "Internal Tech",
    TECHNICIAN_EXTERNAL: "External Tech",
  };
  return map[role] ?? role;
}

function searchMatches(u: { name: string; email: string; phone: string | null; role: Role }, query: string) {
  if (!query) return true;
  const haystack = [u.name, u.email, u.phone ?? "", u.role, roleLabelShort(u.role)].join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

const roleOptions: Array<{ value: Role; label: string; description: string }> = [
  { value: "ADMIN"               as Role, label: "Admin",               description: "Full platform control including user management and financial approvals." },
  { value: "TECHNICAL_MANAGER"   as Role, label: "Technical Manager",   description: "Oversees repair team, inventory, technicians, and technical operations." },
  { value: "SALES_MANAGER"       as Role, label: "Sales Manager",       description: "Oversees sales team, CRM, quotations, targets, and revenue." },
  { value: "OPS"                 as Role, label: "Operations",          description: "Coordinates workflow, billing, settlement, and daily operations." },
  { value: "SALES"               as Role, label: "Sales",               description: "CRM, quotations, POS, and customer-facing sales activity." },
  { value: "CASHIER"             as Role, label: "Cashier",             description: "POS, receipts, invoice view, cash reconciliation, and job lookup." },
  { value: "FRONT_DESK"          as Role, label: "Front Desk",          description: "Handles intake, customer details, job cards, and handover documents." },
  { value: "TECHNICIAN_INTERNAL" as Role, label: "Internal Technician", description: "Works diagnosis and in-house repair execution." },
  { value: "TECHNICIAN_EXTERNAL" as Role, label: "External Technician", description: "External workflow access without client identity or billing history." },
];

async function UsersSection({ userId, q }: { userId?: string; q: string }) {
  type UserRow = {
    id: string; name: string; email: string; phone: string | null; role: Role;
    isActive: boolean;
    sessions: Array<{ updatedAt: Date }>;
    auditLogs: Array<{ createdAt: Date }>;
    permissionGrants: Array<{ permission: string }>;
  };

  let allUsers: UserRow[] = [];
  let selectedUser: UserRow | null = null;
  let accessAudit: Array<{
    id: string; action: string; detail: string | null; createdAt: Date; actorUser: { name: string };
  }> = [];

  try {
    const raw = await prisma.user.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: {
        id: true, name: true, email: true, phone: true, role: true, isActive: true,
        sessions:  { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
        auditLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    });

    let permissionMap = new Map<string, string[]>();
    try {
      const rows = await prisma.$queryRaw<Array<{ userId: string; permission: string }>>`
        SELECT userId, permission FROM "UserPermission"
      `;
      for (const row of rows) {
        if (!permissionMap.has(row.userId)) permissionMap.set(row.userId, []);
        permissionMap.get(row.userId)!.push(row.permission);
      }
    } catch { permissionMap = new Map(); }

    allUsers = raw.map((u) => ({
      ...u,
      permissionGrants: (permissionMap.get(u.id) ?? []).map((permission) => ({ permission })),
    }));

    const filtered = allUsers.filter((u) => searchMatches(u, q));
    selectedUser = filtered.find((u) => u.id === userId) ?? filtered[0] ?? null;

    if (selectedUser) {
      try {
        accessAudit = await prisma.userAccessAudit.findMany({
          where:   { targetUserId: selectedUser.id },
          orderBy: { createdAt: "desc" },
          take: 12,
          select: { id: true, action: true, detail: true, createdAt: true, actorUser: { select: { name: true } } },
        });
      } catch { accessAudit = []; }
    }
  } catch (err) {
    console.error("[settings/users inline]", err);
    return <p className="text-sm text-[var(--ink-muted)]">Could not load members right now. Please refresh.</p>;
  }

  const filtered = allUsers.filter((u) => searchMatches(u, q));
  const inp = "w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14";

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">

      {/* ── Left: member list ───────────────────────────── */}
      <div className="w-full space-y-2.5 lg:w-[220px] lg:shrink-0">

        {/* New member */}
        <details className="group overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <summary className="flex cursor-pointer select-none list-none items-center justify-between px-3.5 py-2.5">
            <span className="flex items-center gap-2 text-[12px] font-semibold text-[var(--ink-muted)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              Add Member
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-[var(--ink-muted)] transition-transform group-open:rotate-180" aria-hidden>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </summary>
          <div className="border-t border-[var(--line)] bg-[var(--panel-strong)]/40 px-3.5 pb-3.5 pt-3">
            <form action={createUser} className="space-y-2">
              <input type="hidden" name="returnBase" value={HUB} />
              <input required name="name"     placeholder="Full name"           className={inp} />
              <input required type="email" name="email" placeholder="Email"     className={inp} />
              <input name="phone"             placeholder="Phone (optional)"     className={inp} />
              <input required minLength={8} type="password" name="password"
                     placeholder="Password (min 8 chars)"                        className={inp} />
              <select name="role" defaultValue="OPS" className={inp}>
                {roleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button className="btn-premium w-full rounded-lg py-1.5 text-sm">Create</button>
            </form>
          </div>
        </details>

        {/* Search */}
        <form method="GET" action="/settings" className="flex gap-1.5">
          <input type="hidden" name="section" value="users" />
          <input name="q" defaultValue={q} placeholder="Search members…" className={`${inp} text-xs`} />
          {q && (
            <Link href={HUB} className="shrink-0 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]">✕</Link>
          )}
        </form>

        {/* Member list */}
        <div className="space-y-1">
          {filtered.length === 0 && <p className="px-1 text-xs text-[var(--ink-muted)]">No members found.</p>}
          {filtered.map((item) => {
            const lastSeen = item.sessions[0]?.updatedAt ?? item.auditLogs[0]?.createdAt ?? null;
            const ps = new URLSearchParams(Object.fromEntries(
              [["userId", item.id], q ? ["q", q] : null].filter(Boolean) as [string,string][]
            ));
            const isSelected = selectedUser?.id === item.id;
            return (
              <Link
                key={item.id}
                href={`${HUB}&${ps}`}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-all ${
                  isSelected
                    ? "border-[var(--accent)]/50 bg-[var(--accent)]/8 shadow-sm"
                    : "border-transparent bg-[var(--panel)] hover:border-[var(--line)] hover:bg-[var(--panel-strong)]/50"
                }`}
              >
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  isSelected ? "bg-[var(--accent)] text-white" : "bg-[var(--accent)]/15 text-[var(--accent)]"
                }`}>
                  {item.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-[var(--ink)]">{item.name}</p>
                  <p className="truncate text-[10px] text-[var(--ink-muted)]">{roleLabelShort(item.role)}{lastSeen ? ` · ${lastSeen.toLocaleDateString()}` : ""}</p>
                </div>
                {!item.isActive && (
                  <span className="ml-auto shrink-0 rounded-full bg-[var(--panel-strong)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--ink-muted)]">Off</span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Right: editing panel ────────────────────────── */}
      <div className="min-w-0 flex-1 space-y-3">
        {selectedUser ? (
          <>
            {/* Header */}
            <div className="flex items-center gap-3.5 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-base font-bold text-white shadow-sm">
                {selectedUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-[var(--ink)]">{selectedUser.name}</p>
                <p className="text-[12px] text-[var(--ink-muted)]">
                  {selectedUser.email}{selectedUser.phone ? ` · ${selectedUser.phone}` : ""}
                </p>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                  selectedUser.isActive
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"
                }`}>
                  {selectedUser.isActive ? "Active" : "Inactive"}
                </span>
                <p className="text-[10px] text-[var(--ink-muted)]/60">
                  {selectedUser.sessions[0]?.updatedAt
                    ? `Last seen ${selectedUser.sessions[0].updatedAt.toLocaleDateString()}`
                    : "No sessions yet"}
                </p>
              </div>
            </div>

            {/* Profile */}
            <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
              <div className="border-b border-[var(--line)] bg-[var(--panel-strong)]/30 px-5 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-[var(--ink-muted)]/70">Profile</p>
              </div>
              <div className="p-5">
                <UserDetailsForm
                  id={selectedUser.id}
                  name={selectedUser.name}
                  email={selectedUser.email}
                  phone={selectedUser.phone}
                  action={updateUserDetails}
                />
              </div>
            </section>

            {/* Password */}
            <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
              <div className="border-b border-[var(--line)] bg-[var(--panel-strong)]/30 px-5 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-[var(--ink-muted)]/70">Password Reset</p>
              </div>
              <div className="p-5">
                <p className="mb-3 text-[12px] text-[var(--ink-muted)]">Resetting will immediately sign the user out of all devices.</p>
                <UserPasswordResetForm userId={selectedUser.id} action={resetUserPassword} />
              </div>
            </section>

            {/* Role & access */}
            <UserAccessControlPanel
              key={selectedUser.id}
              userId={selectedUser.id}
              queryText={q}
              initialRole={selectedUser.role}
              initialPermissions={selectedUser.permissionGrants.map((g) => g.permission)}
              roleOptions={roleOptions}
              returnBase={HUB}
              saveAction={saveAccessChanges}
            />

            {/* Audit trail */}
            {accessAudit.length > 0 && (
              <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
                <div className="border-b border-[var(--line)] bg-[var(--panel-strong)]/30 px-5 py-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-[var(--ink-muted)]/70">Access History</p>
                </div>
                <div className="divide-y divide-[var(--line)]">
                  {accessAudit.map((entry) => {
                    let detail = "";
                    try {
                      const parsed = entry.detail
                        ? JSON.parse(entry.detail) as { added?: string[]; removed?: string[]; fromRole?: string; toRole?: string }
                        : null;
                      const parts: string[] = [];
                      if (parsed?.fromRole && parsed.fromRole !== parsed.toRole) parts.push(`${parsed.fromRole} → ${parsed.toRole}`);
                      if (parsed?.added?.length)   parts.push(`+${parsed.added.length} added`);
                      if (parsed?.removed?.length) parts.push(`-${parsed.removed.length} removed`);
                      detail = parts.join(" · ");
                    } catch { detail = ""; }
                    return (
                      <div key={entry.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-xs">
                        <div>
                          <span className="font-semibold text-[var(--ink)]">{entry.actorUser.name}</span>
                          <span className="mx-1.5 text-[var(--ink-muted)]/40">·</span>
                          <span className="text-[var(--ink-muted)]">{entry.action.replace(/_/g, " ").toLowerCase()}</span>
                          {detail && <span className="ml-1.5 text-[var(--ink-muted)]/60">({detail})</span>}
                        </div>
                        <span className="shrink-0 text-[10px] text-[var(--ink-muted)]/50">{entry.createdAt.toLocaleDateString()}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        ) : (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-[var(--line)] text-sm text-[var(--ink-muted)]">
            ← Select a member to edit
          </div>
        )}
      </div>
    </div>
  );
}

// ── BrandingSection ───────────────────────────────────────────────────────────

const BRANDING_HUB = "/settings?section=branding";

const logoFiles = [
  "app-logo.png",
  "app-logo.jpg",
  "app-logo.jpeg",
  "app-logo.webp",
];

async function resolveLogoPreview() {
  for (const name of logoFiles) {
    const filePath = path.join(process.cwd(), "public", name);
    try {
      await access(filePath);
      const info = await stat(filePath);
      return `/${name}?v=${info.mtimeMs}`;
    } catch { /* continue */ }
  }
  return null;
}

function renderQuotePreview(prefix: string, format: string, padLength: number) {
  const now    = new Date();
  const month  = now.getMonth() + 1;
  const year   = now.getFullYear();
  const sample = String(2).padStart(Math.max(1, padLength), "0");
  return format
    .replaceAll("{PREFIX}", prefix || "EIS")
    .replaceAll("{M}",      String(month))
    .replaceAll("{MM}",     String(month).padStart(2, "0"))
    .replaceAll("{YYYY}",   String(year))
    .replaceAll("{SEQ}",    sample);
}

async function BrandingSection() {
  const [settings, preview] = await Promise.all([
    getDocumentBrandingSettings(),
    resolveLogoPreview(),
  ]);
  const quotePreview = renderQuotePreview(
    settings.quotePrefix,
    settings.quoteFormat,
    settings.sequencePadLength,
  );

  const inp = "w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14";

  return (
    <div className="space-y-4">

      {/* ── Main branding form ──────────────────────────── */}
      <form action={saveBrandingAction} className="space-y-3">
        <input type="hidden" name="returnBase" value={BRANDING_HUB} />

        {/* Company & Numbering */}
        <details className="rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] p-4" open>
          <summary className="cursor-pointer select-none text-sm font-semibold text-[var(--ink)]">
            Company &amp; Numbering
          </summary>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <input name="companyName"         defaultValue={settings.companyName}         placeholder="Company name"        className={inp} />
            <input name="companyTagline"      defaultValue={settings.companyTagline ?? ""}  placeholder="Tagline (optional)"  className={inp} />
            <input name="companyAddressLine1" defaultValue={settings.companyAddressLine1} placeholder="Address line 1"      className={inp} />
            <input name="companyAddressLine2" defaultValue={settings.companyAddressLine2} placeholder="Address line 2"      className={inp} />
            <input name="companyContacts"     defaultValue={settings.companyContacts}     placeholder="Phone / contacts"    className={inp} />
            <input name="companyEmail"        defaultValue={settings.companyEmail ?? ""}   placeholder="Company email"       className={inp} />
            <input name="companyWebsite"      defaultValue={settings.companyWebsite ?? ""} placeholder="Website"             className={inp} />
            <input name="documentTitle"       defaultValue={settings.documentTitle}       placeholder="Document title"      className={inp} />
            <input name="quotePrefix"         defaultValue={settings.quotePrefix}         placeholder="Quote prefix (e.g. EIS)" className={inp} />
            <input name="quoteFormat"         defaultValue={settings.quoteFormat}         placeholder="Quote format"        className={inp} />
            <p className="text-xs text-[var(--ink-muted)] sm:col-span-2">
              Preview: <span className="font-medium text-[var(--ink)]">{quotePreview}</span>
            </p>
            <input type="number" name="quoteValidityDays"  defaultValue={settings.quoteValidityDays}  placeholder="Validity (days)"         className={inp} />
            <input type="number" name="sequencePadLength"  defaultValue={settings.sequencePadLength}  placeholder="Sequence pad length"     className={inp} />
          </div>
        </details>

        {/* VAT & Sign-off */}
        <details className="rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] p-4">
          <summary className="cursor-pointer select-none text-sm font-semibold text-[var(--ink)]">
            VAT &amp; Sign-off
          </summary>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <select name="vatDefaultApplicable" defaultValue={settings.vatDefaultApplicable ? "true" : "false"} className={inp}>
              <option value="true">VAT default: applicable</option>
              <option value="false">VAT default: not applicable</option>
            </select>
            <input type="number" step="0.01" name="vatRatePercent"          defaultValue={settings.vatRatePercent}          placeholder="VAT rate %"               className={inp} />
            <input name="vatLabel"                                           defaultValue={settings.vatLabel}                placeholder="VAT label (e.g. VAT 18%)" className={inp} />
            <input name="signatureCompanyLabel"                              defaultValue={settings.signatureCompanyLabel}   placeholder="Company signature label"  className={inp} />
            <input name="signatureClientLabel"                               defaultValue={settings.signatureClientLabel}    placeholder="Client signature label"   className={inp} />
          </div>
        </details>

        {/* Colors */}
        <details className="rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] p-4">
          <summary className="cursor-pointer select-none text-sm font-semibold text-[var(--ink)]">
            Document Colors
          </summary>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { name: "primaryColor",    label: "Primary",    value: settings.primaryColor },
              { name: "secondaryColor",  label: "Secondary",  value: settings.secondaryColor },
              { name: "accentColor",     label: "Accent",     value: settings.accentColor },
              { name: "backgroundColor", label: "Background", value: settings.backgroundColor },
              { name: "surfaceColor",    label: "Surface",    value: settings.surfaceColor },
              { name: "borderColor",     label: "Border",     value: settings.borderColor },
            ].map((c) => (
              <div key={c.name} className="flex items-center gap-2.5">
                <input type="color" name={c.name} defaultValue={c.value}
                  className="h-8 w-10 cursor-pointer rounded border border-[var(--line)] bg-transparent" />
                <span className="text-xs text-[var(--ink-muted)]">{c.label}</span>
              </div>
            ))}
          </div>
        </details>

        {/* Terms & Footer */}
        <details className="rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] p-4">
          <summary className="cursor-pointer select-none text-sm font-semibold text-[var(--ink)]">
            Terms &amp; Footer
          </summary>
          <div className="mt-4 space-y-2.5">
            <textarea name="termsText" defaultValue={settings.termsText}
              className="min-h-28 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/14" />
            <input name="footerText" defaultValue={settings.footerText} placeholder="Footer text" className={inp} />
          </div>
        </details>

        <div className="flex justify-end">
          <button className="btn-premium rounded-lg px-5 py-2 text-sm">Save Document Settings</button>
        </div>
      </form>

      {/* ── Logo upload ─────────────────────────────────── */}
      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="text-sm font-semibold text-[var(--ink)]">Invoice Logo</p>
        <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
          PNG, JPEG, or WEBP · max 5 MB · wide aspect ratio recommended
        </p>

        <form action={uploadLogoAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="returnBase" value={BRANDING_HUB} />
          <input
            type="file" name="logo"
            accept="image/png,image/jpeg,image/webp"
            required
            className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs outline-none sm:text-sm"
          />
          <button className="btn-premium shrink-0 rounded-lg px-4 py-1.5 text-sm">Upload</button>
        </form>

        <div className="mt-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Logo preview" className="max-h-24 rounded border border-[var(--line)]" />
          ) : (
            <p className="text-sm text-[var(--ink-muted)]">No logo uploaded yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

// ── WhatsAppSection ───────────────────────────────────────────────────────────

async function WhatsAppSection() {
  const summary    = whatsappConfigSummary();
  const health     = summary.configured ? await whatsappHealthCheck() : null;
  const healthData = health as (typeof health & {
    display_phone_number?: string;
    verified_name?: string;
    code_verification_status?: string;
    quality_rating?: string;
  }) | null;

  return (
    <div className="space-y-4">
      {/* Status card */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--ink-muted)]">WhatsApp Business Account</p>
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">Messages sent via Meta Cloud API.</p>
          </div>
          {health?.ok ? (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Connected
            </span>
          ) : summary.configured ? (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Error
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-muted)]">
              Not configured
            </span>
          )}
        </div>

        {summary.configured ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Business Number", value: healthData?.display_phone_number ?? summary.businessNumber ?? "—" },
              { label: "Verified Name",   value: healthData?.verified_name ?? "—" },
              { label: "Verification",    value: healthData?.code_verification_status ?? "—" },
              { label: "Quality Rating",  value: healthData?.quality_rating ?? "—" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--ink-muted)]">{stat.label}</p>
                <p className="text-sm font-semibold text-[var(--ink)]">{stat.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            Set <code className="font-mono">WHATSAPP_ACCESS_TOKEN</code>,{" "}
            <code className="font-mono">WHATSAPP_PHONE_NUMBER_ID</code>, and{" "}
            <code className="font-mono">WHATSAPP_BUSINESS_NUMBER</code> in your environment.
          </div>
        )}

        {health && !health.ok && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            <span className="font-semibold">API error:</span> {health.error}
          </div>
        )}
      </div>

      {/* Test panel */}
      {summary.configured && (
        <WhatsAppTestPanel
          from={healthData?.display_phone_number ?? summary.businessNumber ?? ""}
          verifiedName={healthData?.verified_name ?? null}
        />
      )}

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <Link href="/settings?section=meta"    className="btn-premium rounded-lg px-3 py-1.5 text-sm">Meta Templates →</Link>
        <Link href="/settings?section=outbox"  className="btn-premium-secondary rounded-lg px-3 py-1.5 text-sm">Outbox →</Link>
        <Link href="/settings?section=templates" className="btn-premium-secondary rounded-lg px-3 py-1.5 text-sm">Msg Templates →</Link>
      </div>
    </div>
  );
}

// ── MetaSection ───────────────────────────────────────────────────────────────

async function MetaSection() {
  const { user } = await getCurrentUserRole();
  const db = orgDb(user.orgId);
  const [client, job, repairRequest] = await Promise.all([
    db.client.findFirst({ select: { fullName: true }, orderBy: { createdAt: "desc" } }),
    db.job.findFirst({ select: { jobNumber: true }, orderBy: { receivedAt: "desc" } }),
    db.repairRequest.findFirst({ select: { requestNumber: true }, orderBy: { createdAt: "desc" } }),
  ]);

  const liveCustomerName  = client?.fullName        ?? "Sample Customer";
  const liveJobNumber     = job?.jobNumber           ?? "EI-2025-0001";
  const liveRequestNumber = repairRequest?.requestNumber ?? "RR-2025-0001";

  const templates: TemplateDefinition[] = [
    {
      metaName: "repair_request_confirmation_v2",
      systemKey: "REPAIR_REQUEST_CONFIRMATION",
      category: "UTILITY",
      language: "en",
      label: "Repair request confirmation",
      description: "Sent when a customer submits an online repair request.",
      useCase: "Trigger: repair request submitted via intake form",
      body: `Hello {{1}},\n\nThank you for submitting your repair request ({{2}}).\n\nWe have received your details and will contact you shortly to confirm the diagnosis and timeline.\n\nBest regards,\nEagle Info Solutions`,
      varOrder: [
        { n: 1, name: "Customer Name", systemKey: "customerName", liveExample: liveCustomerName },
        { n: 2, name: "Request Number", systemKey: "requestNumber", liveExample: liveRequestNumber },
      ],
    },
    {
      metaName: "front_desk_approved_v2",
      systemKey: "FRONT_DESK_APPROVED",
      category: "UTILITY",
      language: "en",
      label: "Intake approved",
      description: "Sent when front desk approves a submitted repair request.",
      useCase: "Trigger: repair request status -> APPROVED",
      body: `Hello {{1}},\n\nYour repair request ({{2}}) has been approved. Please bring your device to our shop at your convenience.\n\nBest regards,\nEagle Info Solutions`,
      varOrder: [
        { n: 1, name: "Customer Name", systemKey: "customerName", liveExample: liveCustomerName },
        { n: 2, name: "Request Number", systemKey: "requestNumber", liveExample: liveRequestNumber },
      ],
    },
    {
      metaName: "front_desk_rejected_v2",
      systemKey: "FRONT_DESK_REJECTED",
      category: "UTILITY",
      language: "en",
      label: "Intake rejected",
      description: "Sent when a repair request cannot be processed.",
      useCase: "Trigger: repair request status -> REJECTED",
      body: `Hello {{1}},\n\nUnfortunately we are unable to process your repair request ({{2}}) at this time. Please contact us for more information.\n\nBest regards,\nEagle Info Solutions`,
      varOrder: [
        { n: 1, name: "Customer Name", systemKey: "customerName", liveExample: liveCustomerName },
        { n: 2, name: "Request Number", systemKey: "requestNumber", liveExample: liveRequestNumber },
      ],
    },
    {
      metaName: "job_created_v2",
      systemKey: "JOB_CREATED",
      category: "UTILITY",
      language: "en",
      label: "Job created",
      description: "Sent when a repair job is created and the device is booked in.",
      useCase: "Trigger: job status -> RECEIVED",
      body: `Hello {{1}},\n\nYour device has been registered as Job #{{2}}.\n\nWe will update you as the repair progresses.\n\nBest regards,\nEagle Info Solutions`,
      varOrder: [
        { n: 1, name: "Customer Name", systemKey: "customerName", liveExample: liveCustomerName },
        { n: 2, name: "Job Number", systemKey: "jobNumber", liveExample: liveJobNumber },
      ],
    },
    {
      metaName: "job_status_update_v2",
      systemKey: "JOB_STATUS_UPDATE",
      category: "UTILITY",
      language: "en",
      label: "Generic job status update",
      description: "General-purpose update sent on any job status change.",
      useCase: "Trigger: any job status change",
      body: `Hello {{1}},\n\nUpdate on Job #{{2}}:\nStatus: {{3}}\n\nBest regards,\nEagle Info Solutions`,
      varOrder: [
        { n: 1, name: "Customer Name", systemKey: "customerName", liveExample: liveCustomerName },
        { n: 2, name: "Job Number", systemKey: "jobNumber", liveExample: liveJobNumber },
        { n: 3, name: "New Status Label", systemKey: "newStatusLabel", liveExample: "In Repair" },
      ],
    },
    {
      metaName: "job_completed_v2",
      systemKey: "JOB_COMPLETED",
      category: "UTILITY",
      language: "en",
      label: "Job completed",
      description: "Sent when the repair is done and the device is ready for collection.",
      useCase: "Trigger: job status -> COMPLETED / READY_FOR_PICKUP",
      body: `Hello {{1}},\n\nGreat news! Your device (Job #{{2}}) is ready for pickup.\n\nPlease visit our shop to collect your device.\n\nBest regards,\nEagle Info Solutions`,
      varOrder: [
        { n: 1, name: "Customer Name", systemKey: "customerName", liveExample: liveCustomerName },
        { n: 2, name: "Job Number", systemKey: "jobNumber", liveExample: liveJobNumber },
      ],
    },
    {
      metaName: "ready_for_pickup_nudge_1_v2",
      systemKey: "READY_FOR_PICKUP_NUDGE_1",
      category: "UTILITY",
      language: "en",
      label: "Ready for pickup (nudge 1)",
      description: "First reminder sent 24 h after device became ready but not collected.",
      useCase: "Trigger: auto-nudge 24 h after READY_FOR_PICKUP",
      body: `Hello {{1}},\n\nReminder: your device for Job #{{2}} is ready for pickup. Please visit us to collect it.\n\nEagle Info Solutions`,
      varOrder: [
        { n: 1, name: "Customer Name", systemKey: "customerName", liveExample: liveCustomerName },
        { n: 2, name: "Job Number", systemKey: "jobNumber", liveExample: liveJobNumber },
      ],
    },
    {
      metaName: "ready_for_pickup_nudge_2_v2",
      systemKey: "READY_FOR_PICKUP_NUDGE_2",
      category: "UTILITY",
      language: "en",
      label: "Ready for pickup (nudge 2)",
      description: "Final reminder sent 72 h after device became ready.",
      useCase: "Trigger: auto-nudge 72 h after READY_FOR_PICKUP",
      body: `Hello {{1}},\n\nFinal reminder: Job #{{2}} is still ready for pickup. If you need delivery, please reply and we will advise.\n\nEagle Info Solutions`,
      varOrder: [
        { n: 1, name: "Customer Name", systemKey: "customerName", liveExample: liveCustomerName },
        { n: 2, name: "Job Number", systemKey: "jobNumber", liveExample: liveJobNumber },
      ],
    },
  ];

  return (
    <div className="max-w-2xl">
      <TemplateSubmitPanel templates={templates} />
    </div>
  );
}

// ── DataHealSection ───────────────────────────────────────────────────────────

const DH_HUB = "/settings?section=dataheal";

type DhFeedback = { mode?: string; checked?: string; fixed?: string; pending?: string; at?: string };

async function DataHealSection({ feedback }: { feedback: DhFeedback }) {
  const { user } = await getCurrentUserRole();
  const db = orgDb(user.orgId);
  const [unresolved, lastHealedAt, preview] = await Promise.all([
    db.job.count({
      where: { OR: [{ brand: "Unknown" }, { model: "Unknown" }, { deviceType: "OTHER" }] },
    }),
    db.auditLog.findFirst({
      where: { action: "DATA_HEAL_JOB_DEVICE_FIELDS" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    runDataHeal(db, { dryRun: true, limit: 25 }),
  ]);

  return (
    <div className="space-y-4">
      {/* Status */}
      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="text-sm font-semibold text-[var(--ink)]">Device Placeholder Recovery</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">
          Repairs jobs with placeholder values (&quot;Unknown&quot; / &quot;OTHER&quot;) using linked device and repair request data.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            unresolved > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}>
            {unresolved} unresolved
          </span>
          <span className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1 text-[11px] text-[var(--ink-muted)]">
            Last heal: {lastHealedAt ? new Date(lastHealedAt.createdAt).toLocaleString() : "Never"}
          </span>
        </div>
      </section>

      {/* Run controls */}
      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        {feedback.mode && (
          <div className="mb-3 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-xs text-[var(--ink)]">
            {feedback.mode === "dry" ? "Dry check complete" : "Heal run complete"}: checked {feedback.checked ?? "0"},
            fixable {feedback.fixed ?? "0"}, pending {feedback.pending ?? "0"}
            {feedback.at ? ` (${new Date(Number(feedback.at)).toLocaleTimeString()})` : ""}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <form action={runDry}>
            <input type="hidden" name="returnBase" value={DH_HUB} />
            <button className="btn-premium-secondary rounded-lg px-4 py-2 text-sm">Run Dry Check</button>
          </form>
          <form action={runApply}>
            <input type="hidden" name="returnBase" value={DH_HUB} />
            <button className="btn-premium rounded-lg px-4 py-2 text-sm">Run Heal Now</button>
          </form>
        </div>
      </section>

      {/* Preview table */}
      <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--ink)]">Dry-run Preview</p>
          <p className="text-xs text-[var(--ink-muted)]">Up to 25 rows that can be healed right now.</p>
        </div>
        {preview.changes.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--ink-muted)]">No healable placeholder rows found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--panel-strong)] text-xs uppercase tracking-wider text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Job #</th>
                  <th className="px-4 py-2 text-left font-medium">From</th>
                  <th className="px-4 py-2 text-left font-medium">To</th>
                </tr>
              </thead>
              <tbody>
                {preview.changes.map((change) => (
                  <tr key={change.id} className="border-t border-[var(--line)]">
                    <td className="px-4 py-2">
                      <Link href={`/jobs/${change.id}`} className="font-mono font-bold text-[var(--ink)] hover:text-[var(--accent)]">
                        {change.jobNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-[var(--ink-muted)]">{change.from.brand} / {change.from.model}</td>
                    <td className="px-4 py-2 text-[var(--ink)]">{change.to.brand} / {change.to.model}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
