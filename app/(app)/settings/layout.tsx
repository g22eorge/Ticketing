import type { ReactNode } from "react";

import { SettingsShell, type SettingsNavGroup } from "@/components/settings/SettingsShell";
import { requireOrgSession } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const { user, orgId } = await requireOrgSession();

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  }).catch(() => null);

  const groups: SettingsNavGroup[] = [
    {
      title: "Settings",
      items: [
        {
          href: "/settings/profile",
          label: "Profile",
          description: "Your account details",
          icon: <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true"><path fillRule="evenodd" d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM7 9a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM3 9a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm10.75 6.5a.75.75 0 0 0-1.5 0v1.258a32.987 32.987 0 0 0-3.599.278c.502-.802.834-1.948.834-3.305 0-2.168-1.245-3.702-3.164-4.362A4.44 4.44 0 0 0 4.823 9H4a1 1 0 1 1 0-2h2a1 1 0 0 1 .984.82A4.43 4.43 0 0 0 6.5 6.5 4.443 4.443 0 0 0 6.5 11c.79 0 1.5-.193 2.077-.51-.098.51-.2 1.018-.306 1.52H7.23a.75.75 0 0 0-.75.75v.5a.75.75 0 0 0 1.5 0v-.75c0-.031.01-.146.028-.341a.75.75 0 0 1 .722-.409l.97.194a1 1 0 0 1 .894 1.788l-.03.259a32.95 32.95 0 0 0 3.599-.278c-.14.44-.305.873-.494 1.298l-.02.046v1.258Z" clipRule="evenodd" /></svg>,
        },
        user.role === "ADMIN"
          ? {
              href: "/settings/users",
              label: "Users",
              description: "Roles and access",
              icon: <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true"><path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM7 9a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM3 9a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm9 7.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" /></svg>,
            }
          : null,
        user.role === "ADMIN"
          ? {
              href: "/settings/branding",
              label: "Branding",
              description: "Company and document setup",
              icon: <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true"><path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm3 1.5a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v9a.75.75 0 0 1-.75.75H7.75a.75.75 0 0 1-.75-.75v-9Z" clipRule="evenodd" /></svg>,
            }
          : null,
      ].filter(Boolean) as SettingsNavGroup["items"],
    },
  ].filter((g) => g.items.length > 0);

  const quickActions = [
    {
      href: "/settings/profile",
      label: "Edit profile",
      icon: <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true"><path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.18 5.88a.5.5 0 0 0-.617-.617l-9.792 9.872a4 4 0 0 0-.885 1.343Zm10.177-3.232l2.915-2.915-9.872-9.872-2.915 2.915L12.872 11.53Z" /></svg>,
    },
  ];

  return (
    <SettingsShell
      workspaceName={org?.name ?? "Workspace"}
      actorName={user.name}
      quickActions={quickActions}
      groups={groups}
    >
      {children}
    </SettingsShell>
  );
}