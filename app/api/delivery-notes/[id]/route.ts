import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";

import { getDocumentBrandingSettings } from "@/lib/document-branding";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { DeliveryNoteDocument } from "@/lib/pdf/DeliveryNoteDocument";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, orgId } = await requireOrgSession();
  if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const note = await prisma.deliveryNote.findFirst({
    where: { id, orgId },
    select: {
      id: true,
      deliveryNoteNumber: true,
      deliveredAt: true,
      deliveryMethod: true,
      deliveredByName: true,
      receivedByName: true,
      receivedBySignatureText: true,
      note: true,
      sale: {
        select: {
          saleNumber: true,
          invoiceNumber: true,
          client: { select: { fullName: true } },
        },
      },
      items: { select: { description: true, quantity: true }, orderBy: { description: "asc" } },
    },
  });

  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const branding = await getDocumentBrandingSettings(orgId);
  const element = createElement(DeliveryNoteDocument as never, {
    branding,
    deliveryNoteNumber: note.deliveryNoteNumber,
    deliveredAt: note.deliveredAt.toLocaleString("en-GB"),
    saleRef: note.sale.invoiceNumber ?? note.sale.saleNumber,
    clientName: note.sale.client?.fullName ?? "-",
    deliveredByName: note.deliveredByName,
    receivedByName: note.receivedByName,
    receivedBySignatureText: note.receivedBySignatureText,
    deliveryMethod: note.deliveryMethod,
    note: note.note,
    items: note.items.map((it) => ({ description: it.description, quantity: it.quantity })),
  });

  const pdf = await renderToBuffer(element as never);
  return new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="delivery-note-${note.deliveryNoteNumber}.pdf"`,
    },
  });
}
