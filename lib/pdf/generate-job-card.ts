import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";

import { formatEATDocDate } from "@/lib/date-eat";
import { getDocumentBrandingSettings } from "@/lib/document-branding";
import { compactText, compactListText, prettyEnum, resolvePdfLogo } from "@/lib/pdf/pdf-utils";
import { JobCardTemplateComponent, resolveTemplateKey } from "@/lib/pdf/templates";
import { prisma } from "@/lib/prisma";

export type GenerateJobCardResult =
  | { ok: true; buffer: Buffer; filename: string; documentNumber: string; clientPhone: string }
  | { ok: false; error: string };

export async function generateJobCardBuffer(
  jobId: string,
  staffName: string,
  staffRole: string,
  staffUserId?: string,
  expectedOrgId?: string,
): Promise<GenerateJobCardResult> {
  const job = await prisma.job.findUnique({
    where: expectedOrgId ? { id: jobId, orgId: expectedOrgId } : { id: jobId },
    select: {
      id: true, jobNumber: true, status: true,
      orgId: true,
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

  const orgId = job.orgId ?? undefined;
  const org = orgId ? await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } }).catch(() => null) : null;
  const branding = await getDocumentBrandingSettings(orgId);
  const templateKey = resolveTemplateKey({
    kind: "JOB_CARD",
    requestedKey: (branding as unknown as { jobCardTemplateKey?: string | null }).jobCardTemplateKey,
    plan: org?.plan ?? "STARTER",
  });
  const JobCardDoc = JobCardTemplateComponent(templateKey);
  const logoUrl = await resolvePdfLogo(branding?.companyLogoUrl);
  const documentNumber = `JC-${job.jobNumber}`;

  if (staffUserId) {
    await prisma.auditLog.create({
      data: {
        jobId: job.id, userId: staffUserId,
        action: "JOB_CARD_GENERATED",
        detail: JSON.stringify({ documentNumber }),
        orgId: job.orgId,
      },
    }).catch(() => null);
  }

  const docElement = createElement(JobCardDoc as never, {
    companyName: branding.companyName,
    companyTagline: branding.companyTagline ?? "",
    companyAddressLine1: branding.companyAddressLine1,
    companyAddressLine2: branding.companyAddressLine2,
    companyContacts: branding.companyContacts,
    companyEmail: branding.companyEmail ?? "",
    companyWebsite: branding.companyWebsite ?? "",
    companyLogoUrl: logoUrl,
    documentNumber,
    dateIssued: formatEATDocDate(job.receivedAt),
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
