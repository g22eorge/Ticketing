import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { getCurrentUserRole } from "@/lib/session";
import { PosSessionClient } from "./PosSessionClient";

export default async function PosSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await getCurrentUserRole();

  if (!can.openPosSession(user)) {
    redirect("/");
  }

  const posSession = await prisma.posSession.findUnique({
    where: { id },
    include: { operator: { select: { name: true } } },
  });

  if (!posSession) {
    notFound();
  }

  const openSale = await prisma.sale.findFirst({
    where: { posSessionId: id, status: "OPEN" },
    include: { items: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <PosSessionClient
      posSession={posSession}
      openSale={openSale}
      canProcessRefunds={can.processRefunds(user)}
      canApplyDiscount={can.applyPosDiscount(user)}
    />
  );
}
