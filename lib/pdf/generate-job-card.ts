import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { getDocumentBrandingSettings } from "@/lib/document-branding";
import { JobCardDocument } from "@/lib/pdf/JobCardDocument";
import { prisma } from "@/lib/prisma";

function formatDocDate(value: Date) {
  return value.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "2-digit",
    timeZone: "Africa/Nairobi",
  });
}

function prettyEnum(value: string | null | undefined) {
  if (!value) return "N/A";
  return value.replaceAll("_", " ");
}

function compactText(value: string | null | undefined, max = 90) {
  if (!value) return "N/A";
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}...`;
}

function compactListText(value: string | null | undefined, max = 220) {
  if (!value) return "N/A";
  const normalized = value
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}...`;
}

async function toDataUriFromRemote(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") || "image/png";
  const bytes = new Uint8Array(await res.arrayBuffer());
  return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function toDataUriFromLocal(filePath: string, contentType: string) {
  const bytes = await readFile(filePath);
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

async function resolveLogo() {
  const localCandidates = [
    { file: path.join(process.cwd(), "public", "eagle-info-logo.png"), type: "image/png" },
    { file: path.join(process.cwd(), "public", "eagle-info-logo.jpg"), type: "image/jpeg" },
    { file: path.join(process.cwd(), "public", "eagle-info-logo.jpeg"), type: "image/jpeg" },
    { file: path.join(process.cwd(), "public", "eagle-info-logo.webp"), type: "image/webp" },
  ];
  for (const c of localCandidates) {
    try { return await toDataUriFromLocal(c.file, c.type); } catch { /* try next */ }
  }
  const baseUrl = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (baseUrl) {
    for (const url of [`${baseUrl}/eagle-info-logo.png`, `${baseUrl}/eagle-info-logo.jpg`]) {
      const remote = await toDataUriFromRemote(url);
      if (remote) return remote;
    }
  }
  return undefined;
}

export type GenerateJobCardResult =
  | { ok: true; buffer: Buffer; filename: string; documentNumber: string; clientPhone: string }
  | { ok: false; error: string };

export async function generateJobCardBuffer(
  jobId: string,
  staffName: string,
  staffRole: string,
  staffUserId?: string,
): Promise<GenerateJobCardResult> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true, jobNumber: true, status: true,
      deviceType: true, brand: true, model: true, serialOrImei: true,
      accessories: true, physicalNotes: true, issueDescription: true,
      diagnosisNotes: true, externalDiagnosis: true,
      recommendationOption: true, partsNeeded: true,
      repairTimeline: true, technicianNotes: true, workDone: true,
      receivedAt: true,
      client: { select: { id: true, fullName: true, phone: true, email: true, organization: true } },
    },
  });

  if (!job) return { ok: false, error: "Job not found" };

  const branding = await getDocumentBrandingSettings();
  const logoUrl = await resolveLogo();
  const documentNumber = `JC-${job.jobNumber}`;

  if (staffUserId) {
    await prisma.auditLog.create({
      data: {
        jobId: job.id, userId: staffUserId,
        action: "JOB_CARD_GENERATED",
        detail: JSON.stringify({ documentNumber }),
      },
    }).catch(() => null);
  }

  const docElement = createElement(JobCardDocument, {
    companyName: branding.companyName,
    companyTagline: branding.companyTagline ?? "",
    companyAddressLine1: branding.companyAddressLine1,
    companyAddressLine2: branding.companyAddressLine2,
    companyContacts: branding.companyContacts,
    companyEmail: branding.companyEmail ?? "",
    companyWebsite: branding.companyWebsite ?? "",
    companyLogoUrl: logoUrl,
    documentNumber,
    dateIssued: formatDocDate(job.receivedAt),
    repairId: job.jobNumber,
    preparedByName: staffName,
    preparedByRole: staffRole,
    clientName: job.client.fullName,
    clientPhone: job.client.phone,
    clientEmail: compactText(job.client.email, 36),
    clientOrganization: compactText(job.client.organization, 40),
    deviceType: prettyEnum(job.deviceType),
    deviceLabel: compactText(`${job.brand} ${job.model}`, 45),
    serialOrImei: compactText(job.serialOrImei, 30),
    accessories: compactText(job.accessories, 45),
    physicalCondition: compactText(job.physicalNotes, 45),
    customerIssue: compactText(job.issueDescription, 85),
    diagnosisSummary: compactListText(job.diagnosisNotes ?? job.externalDiagnosis, 180),
    partsNeeded: compactListText(job.partsNeeded, 180),
    technicianNotes: compactListText(job.technicianNotes, 180),
    status: prettyEnum(job.status),
    footerText: branding.footerText,
    signatureCompanyLabel: branding.signatureCompanyLabel,
    signatureClientLabel: branding.signatureClientLabel,
  });

  const pdf = await renderToBuffer(docElement as never);
  return {
    ok: true,
    buffer: Buffer.from(pdf),
    filename: `job-card-${job.jobNumber}.pdf`,
    documentNumber,
    clientPhone: job.client.phone,
  };
}
