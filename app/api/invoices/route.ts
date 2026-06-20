import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { nextAvailableInvoiceNumber } from "@/lib/commercial/document-workflow";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sanitizeOptionalText, sanitizeText } from "@/lib/sanitize";
import { requireOrgSession } from "@/lib/org-context";

type InvoiceLineInput = {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  discountAmount?: number;
};

type CreateInvoiceInput = {
  clientId?: string;
  newClient?: {
    fullName?: string;
    phone?: string;
    email?: string;
    organization?: string;
    address?: string;
  };
  subject?: string;
  dueDate?: string;
  currency?: string;
  notes?: string;
  taxApplicable?: boolean;
  taxRate?: number;
  items?: InvoiceLineInput[];
};

function errorStatus(message: string) {
  if (message === "Unauthorized") return 403;
  if (message.endsWith("not found") || message.includes("not found")) return 404;
  return 400;
}

export async function POST(request: Request) {
  try {
    const { user, orgId } = await requireOrgSession();
    if (!can.createInvoices(user)) {
      throw new Error("Unauthorized");
    }

    const data = (await request.json()) as CreateInvoiceInput;
    const requestedNewClient = data.newClient && (data.newClient.fullName || data.newClient.phone)
      ? {
          fullName: sanitizeText(String(data.newClient.fullName ?? "")),
          phone: sanitizeText(String(data.newClient.phone ?? "")),
          email: sanitizeOptionalText(data.newClient.email),
          organization: sanitizeOptionalText(data.newClient.organization),
          address: sanitizeOptionalText(data.newClient.address),
        }
      : null;

    if (!data.clientId && !requestedNewClient) {
      throw new Error("Choose an existing client or create a new client for this invoice");
    }
    if (requestedNewClient && (requestedNewClient.fullName.length < 2 || requestedNewClient.phone.length < 3)) {
      throw new Error("New client requires a name and phone number");
    }
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new Error("Add at least one invoice item");
    }

    const taxRate = data.taxApplicable
      ? Math.min(Math.max(Number.isFinite(Number(data.taxRate)) ? Number(data.taxRate) : 0, 0), 100)
      : 0;
    const items = data.items.map((item) => {
      const description = sanitizeText(String(item.description ?? ""));
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const discountAmount = Math.max(0, Number(item.discountAmount) || 0);
      if (!description || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error("Each invoice item needs a description, quantity, and valid price");
      }
      const gross = quantity * unitPrice;
      if (discountAmount > gross) {
        throw new Error("Line discount cannot exceed the line amount");
      }
      const lineTotal = gross - discountAmount;
      const taxAmount = taxRate > 0 ? lineTotal * (taxRate / 100) : 0;
      return { description, quantity, unitPrice, discountAmount, taxAmount, lineTotal };
    });

    let clientId = data.clientId || null;
    if (clientId) {
      const client = await prisma.client.findFirst({ where: { id: clientId, orgId }, select: { id: true } });
      if (!client) throw new Error("Client not found");
    }

    if (requestedNewClient) {
      const existingClient = await prisma.client.findFirst({
        where: { phone: requestedNewClient.phone, orgId },
        select: { id: true, email: true, organization: true, address: true },
      });
      if (existingClient) {
        clientId = existingClient.id;
        const fillMissing: { email?: string | null; organization?: string | null; address?: string | null } = {};
        if (!existingClient.email && requestedNewClient.email) fillMissing.email = requestedNewClient.email;
        if (!existingClient.organization && requestedNewClient.organization) fillMissing.organization = requestedNewClient.organization;
        if (!existingClient.address && requestedNewClient.address) fillMissing.address = requestedNewClient.address;
        if (Object.keys(fillMissing).length > 0) {
          await prisma.client.update({ where: { id: existingClient.id }, data: fillMissing });
        }
      } else {
        clientId = null;
      }
    }

    const currency = sanitizeText(String(data.currency || process.env.APP_CURRENCY || "UGX")).toUpperCase() || "UGX";
    const totalAmount = items.reduce((sum, item) => sum + item.lineTotal + item.taxAmount, 0);

    const invoice = await prisma.$transaction(async (tx) => {
      if (requestedNewClient && !clientId) {
        const createdClient = await tx.client.create({
          data: {
            orgId,
            fullName: requestedNewClient.fullName,
            phone: requestedNewClient.phone,
            email: requestedNewClient.email,
            organization: requestedNewClient.organization,
            address: requestedNewClient.address,
          },
          select: { id: true },
        });
        clientId = createdClient.id;
      }

      const invoiceNumber = await nextAvailableInvoiceNumber(tx);
      return tx.invoice.create({
        data: {
          orgId,
          invoiceNumber,
          invoiceType: "SERVICE",
          clientId,
          subject: sanitizeOptionalText(data.subject),
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          status: "ISSUED",
          currency,
          totalAmount,
          paidAmount: 0,
          notes: sanitizeOptionalText(data.notes),
          lines: {
            create: items.map((item) => ({
              orgId,
              sourceType: "StandaloneInvoice",
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountAmount: item.discountAmount,
              taxAmount: item.taxAmount,
              lineTotal: item.lineTotal,
            })),
          },
        },
      });
    });

    revalidatePath("/documents/invoices");
    revalidatePath("/documents/new");
    return NextResponse.json(
      { id: invoice.id, href: `/api/invoices/${invoice.id}`, listHref: "/documents/invoices" },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create invoice";
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
}
