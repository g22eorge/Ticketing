import type { ReactNode } from "react";

import { Pencil, User, Users, Building2 } from "lucide-react";

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
          icon: <User className="h-4 w-4" aria-hidden="true" />,
        },
        user.role === "ADMIN"
          ? {
              href: "/settings/users",
              label: "Users",
              description: "Roles and access",
              icon: <Users className="h-4 w-4" aria-hidden="true" />,
            }
          : null,
        user.role === "ADMIN"
          ? {
              href: "/settings/branding",
              label: "Branding",
              description: "Company and document setup",
              icon: <Building2 className="h-4 w-4" aria-hidden="true" />,
            }
          : null,
      ].filter(Boolean) as SettingsNavGroup["items"],
    },
  ].filter((g) => g.items.length > 0);

  const quickActions = [
    {
      href: "/settings/profile",
      label: "Edit profile",
      icon: <Pencil className="h-4 w-4" aria-hidden="true" />,
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