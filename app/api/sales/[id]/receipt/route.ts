import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { getDocumentBrandingSettings } from "@/lib/document-branding";
import { ReceiptTemplateComponent, resolveTemplateKey } from "@/lib/pdf/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { user, orgId } = await requireOrgSession();

  if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sale = await prisma.sale.findFirst({
    where: { id, orgId },
      select: {
        id: true,
        saleNumber: true,
        status: true,
        currency: true,
        subtotal: true,
        discountAmount: true,
        vatAmount: true,
        totalAmount: true,
        paidAmount: true,
        createdAt: true,
      branch: { select: { name: true } },
      client: { select: { fullName: true, phone: true } },
      items: { select: { id: true, description: true, quantity: true, unitPrice: true, lineTotal: true }, orderBy: { createdAt: "asc" } },
      payments: { select: { id: true, amount: true, method: true, reference: true, receivedAt: true }, orderBy: { receivedAt: "asc" } },
    },
  });

  if (!sale) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const branding = await getDocumentBrandingSettings(orgId).catch(() => null);
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } }).catch(() => null);
  const templateKey = resolveTemplateKey({
    kind: "RECEIPT",
    requestedKey: (branding as unknown as { receiptTemplateKey?: string | null }).receiptTemplateKey,
    plan: org?.plan ?? "STARTER",
  });
  const ReceiptDoc = ReceiptTemplateComponent(templateKey);

  try {
    const element = createElement(ReceiptDoc, {
      sale,
      branding,
    });
    const pdf = await renderToBuffer(element as never);
    return new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="receipt-${sale.saleNumber}.pdf"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PDF generation error";
    return NextResponse.json({ error: `Receipt PDF generation failed: ${message}` }, { status: 500 });
  }
}
