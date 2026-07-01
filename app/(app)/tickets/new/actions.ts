"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ClientType, TicketCategory, TicketPriority } from "@prisma/client";

import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sanitizeOptionalText, sanitizeText } from "@/lib/sanitize";

type State = { error: string | null };

const PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const CATEGORIES = new Set(["HARDWARE", "SOFTWARE", "NETWORK", "INTERNET", "EMAIL", "PRINTER", "OTHER"]);
const CLIENT_TYPES = new Set(["INDIVIDUAL", "COMPANY", "SCHOOL", "NGO", "GOVERNMENT"]);

function buildTicketNumber(seq: number) {
  const now = new Date();
  const shortYear = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `TKT-${shortYear}${month}-${String(seq).padStart(4, "0")}`;
}

function enumValue<T extends string>(value: FormDataEntryValue | null, allowed: Set<string>, fallback: T): T {
  const raw = String(value ?? "").toUpperCase();
  return (allowed.has(raw) ? raw : fallback) as T;
}

export async function createTicketAction(_prev: State, formData: FormData): Promise<State> {
  const { user, orgId } = await requireOrgSession();
  if (!can.createJob(user)) return { error: "You do not have permission to create tickets." };

  const existingClientId = sanitizeOptionalText(String(formData.get("clientId") ?? ""));
  const reporterName = sanitizeText(String(formData.get("reporterName") ?? ""));
  const reporterPhone = sanitizeText(String(formData.get("reporterPhone") ?? ""));
  const reporterEmail = sanitizeOptionalText(String(formData.get("reporterEmail") ?? ""));
  const reporterCompany = sanitizeOptionalText(String(formData.get("reporterCompany") ?? ""));
  const subject = sanitizeText(String(formData.get("subject") ?? ""));
  const description = sanitizeText(String(formData.get("description") ?? ""));
  const deviceInfo = sanitizeOptionalText(String(formData.get("deviceInfo") ?? ""));
  const priority = enumValue<TicketPriority>(formData.get("priority"), PRIORITIES, "MEDIUM");
  const category = enumValue<TicketCategory>(formData.get("category"), CATEGORIES, "OTHER");
  const clientType = enumValue<ClientType>(formData.get("clientType"), CLIENT_TYPES, "INDIVIDUAL");
  const isSLACovered = formData.get("isSLACovered") === "on";
  const estimatedCostRaw = String(formData.get("estimatedCost") ?? "").trim();
  const estimatedCost = estimatedCostRaw ? Number(estimatedCostRaw) : null;

  if (!reporterName || !reporterPhone || !subject || !description) {
    return { error: "Client/contact, phone, subject, and issue description are required." };
  }
  if (estimatedCost !== null && (!Number.isFinite(estimatedCost) || estimatedCost < 0)) {
    return { error: "Estimated cost must be a valid positive amount." };
  }

  let ticketId = "";
  await prisma.$transaction(async (tx) => {
    let clientId = existingClientId || null;
    if (clientId) {
      const client = await tx.client.findFirst({ where: { id: clientId, orgId }, select: { id: true } });
      clientId = client?.id ?? null;
    }

    if (!clientId) {
      const client = await tx.client.upsert({
        where: { phone_orgId: { phone: reporterPhone, orgId } },
        create: {
          orgId,
          fullName: reporterName,
          phone: reporterPhone,
          email: reporterEmail ?? undefined,
          organization: reporterCompany ?? undefined,
          clientType,
          isSLACovered,
        },
        update: {
          fullName: reporterName,
          email: reporterEmail ?? undefined,
          organization: reporterCompany ?? undefined,
          clientType,
          isSLACovered,
        },
        select: { id: true },
      });
      clientId = client.id;
    }

    const sequence = await tx.ticketSequence.upsert({
      where: { orgId_year: { orgId, year: new Date().getFullYear() } },
      create: { orgId, year: new Date().getFullYear(), value: 1 },
      update: { value: { increment: 1 } },
    });

    const ticket = await tx.ticket.create({
      data: {
        orgId,
        ticketNumber: buildTicketNumber(sequence.value),
        clientId,
        reporterName,
        reporterPhone,
        reporterEmail: reporterEmail ?? undefined,
        reporterCompany: reporterCompany ?? undefined,
        subject,
        description,
        deviceInfo: deviceInfo ?? undefined,
        priority,
        category,
        isSLACovered,
        estimatedCost,
      },
      select: { id: true },
    });
    ticketId = ticket.id;
  });

  revalidatePath("/tickets");
  redirect(`/tickets/${ticketId}`);
}
