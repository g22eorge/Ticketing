/**
 * onboarding-checklist.ts
 *
 * Derives onboarding step completion purely from existing data —
 * no extra DB table needed. Each step checks the actual state of the org.
 */

import { prisma } from "@/lib/prisma";

export type ChecklistStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  done: boolean;
};

export type OnboardingStatus = {
  show: boolean;       // false once all steps done or org is > 30 days old
  steps: ChecklistStep[];
  doneCount: number;
  totalCount: number;
};

export async function getOnboardingStatus(orgId: string): Promise<OnboardingStatus> {
  const [org, userCount, jobCount, branding] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { createdAt: true },
    }),
    prisma.user.count({ where: { orgId, isActive: true } }),
    prisma.job.count({ where: { orgId } }),
    prisma.documentBrandingSettings.findUnique({
      where: { orgId },
      select: { companyName: true, companyContacts: true },
    }),
  ]);

  if (!org) return { show: false, steps: [], doneCount: 0, totalCount: 0 };

  // Hide checklist for orgs older than 30 days.
  const ageMs = Date.now() - org.createdAt.getTime();
  const ageDays = ageMs / 86_400_000;

  const DEFAULT_COMPANY_NAME = "Eagle Info Solutions";
  const brandingConfigured =
    !!branding &&
    branding.companyName !== DEFAULT_COMPANY_NAME &&
    branding.companyName.trim().length > 0;

  const teamMemberAdded = userCount > 1;
  const firstJobCreated = jobCount > 0;

  const steps: ChecklistStep[] = [
    {
      id: "workspace",
      title: "Create your workspace",
      description: "Your workspace is live and ready.",
      href: "/dashboard",
      cta: "Done",
      done: true, // always true — they got here
    },
    {
      id: "branding",
      title: "Set up your branding",
      description: "Add your business name, contact details, and invoice colours.",
      href: "/settings/branding",
      cta: "Set up branding",
      done: brandingConfigured,
    },
    {
      id: "team",
      title: "Invite a team member",
      description: "Add a technician, front desk, or ops staff to your workspace.",
      href: "/settings/users",
      cta: "Invite team",
      done: teamMemberAdded,
    },
    {
      id: "first-job",
      title: "Create your first job",
      description: "Log your first repair job to see the full workflow in action.",
      href: "/jobs/new",
      cta: "Create job",
      done: firstJobCreated,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  return {
    show: !allDone && ageDays <= 30,
    steps,
    doneCount,
    totalCount: steps.length,
  };
}
