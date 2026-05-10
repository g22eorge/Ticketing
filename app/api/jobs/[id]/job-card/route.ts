import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

import { getDocumentBrandingSettings } from "@/lib/document-branding";
import { can } from "@/lib/permissions";
import { JobCardTemplateComponent, resolveTemplateKey } from "@/lib/pdf/templates";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatDocDate(value: Date) {
  return value.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
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
  const b64 = Buffer.from(bytes).toString("base64");
  return `data:${contentType};base64,${b64}`;
}

async function toDataUriFromLocal(filePath: string, contentType: string) {
  const bytes = await readFile(filePath);
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

async function resolveLogo() {
  const localCandidates: Array<{ file: string; type: string }> = [
    { file: path.join(process.cwd(), "public", "eagle-info-logo.png"), type: "image/png" },
    { file: path.join(process.cwd(), "public", "eagle-info-logo.jpg"), type: "image/jpeg" },
    { file: path.join(process.cwd(), "public", "eagle-info-logo.jpeg"), type: "image/jpeg" },
    { file: path.join(process.cwd(), "public", "eagle-info-logo.webp"), type: "image/webp" },
  ];

  for (const candidate of localCandidates) {
    try {
      return await toDataUriFromLocal(candidate.file, candidate.type);
    } catch {
      // try next
    }
  }

  const baseUrl = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!baseUrl) return undefined;
  for (const candidate of [
    `${baseUrl}/eagle-info-logo.png`,
    `${baseUrl}/eagle-info-logo.jpg`,
    `${baseUrl}/eagle-info-logo.jpeg`,
  ]) {
    const remote = await toDataUriFromRemote(candidate);
    if (remote) return remote;
  }
  return undefined;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { session, user, orgId } = await requireOrgSession();
  const permissionUser = { role: user.role, permissions: user.permissions };

  if (!can.generateJobCards(permissionUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const job = await prisma.job.findUnique({
    where: { id, orgId },
    select: {
      id: true,
      jobNumber: true,
      status: true,
      deviceType: true,
      brand: true,
      model: true,
      serialOrImei: true,
      accessories: true,
      physicalNotes: true,
      issueDescription: true,
      diagnosisNotes: true,
      externalDiagnosis: true,
      recommendationOption: true,
      partsNeeded: true,
      repairTimeline: true,
      technicianNotes: true,
      workDone: true,
      receivedAt: true,
      client: { select: { id: true, fullName: true, phone: true, email: true, organization: true } },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } }).catch(() => null);
  const branding = await getDocumentBrandingSettings(orgId);
  const templateKey = resolveTemplateKey({
    kind: "JOB_CARD",
    requestedKey: (branding as unknown as { jobCardTemplateKey?: string | null }).jobCardTemplateKey,
    plan: org?.plan ?? "STARTER",
  });
  const JobCardDoc = JobCardTemplateComponent(templateKey);
  const logoUrl = await resolveLogo();
  const documentNumber = `JC-${job.jobNumber}`;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const statusQrDataUrl = baseUrl
    ? await QRCode.toDataURL(`${baseUrl}/status/${job.jobNumber}`, { width: 120, margin: 1 }).catch(() => undefined)
    : undefined;

  await prisma.auditLog.create({
    data: {
      jobId: job.id,
      userId: session.user.id,
      action: "JOB_CARD_GENERATED",
      detail: JSON.stringify({ documentNumber }),
      orgId,
    },
  });

  const docElement = createElement(JobCardDoc, {
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
    preparedByName: user.name,
    preparedByRole: user.role,
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
    statusQrDataUrl,
  });

  try {
    const pdf = await renderToBuffer(docElement as never);
    return new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="job-card-${job.jobNumber}.pdf"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PDF generation error";
    return NextResponse.json({ error: `Job card PDF generation failed: ${message}` }, { status: 500 });
  }
}
