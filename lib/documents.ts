import { JobStatus } from "@prisma/client";

export function formatQuotationNumber(
  jobNumber: string,
  issuedAt: Date,
  prefix: string,
  template: string,
  padLength: number,
) {
  const month = issuedAt.getMonth() + 1;
  const eisMatch = jobNumber.match(/^EIS-(\d{1,2})\/(\d{4})\/(\d+)$/i);
  const eiMatch = jobNumber.match(/^EI-(\d{4})-(\d+)$/i);

  const year = eisMatch?.[2] ?? eiMatch?.[1] ?? String(issuedAt.getFullYear());
  const sequence = eisMatch?.[3] ?? eiMatch?.[2] ?? jobNumber.match(/(\d+)$/)?.[1] ?? "1";
  const serial = String(Number(sequence)).padStart(padLength, "0");

  return template
    .replaceAll("{PREFIX}", prefix)
    .replaceAll("{M}", String(month))
    .replaceAll("{MM}", String(month).padStart(2, "0"))
    .replaceAll("{YYYY}", year)
    .replaceAll("{SEQ}", serial);
}

export function canGenerateInvoiceForStatus(status: JobStatus) {
  return status === JobStatus.READY_FOR_PICKUP || status === JobStatus.COMPLETED || status === JobStatus.CLOSED;
}

export function canGenerateQuotationForStatus(status: JobStatus) {
  const allowed: JobStatus[] = [
    JobStatus.DIAGNOSING,
    JobStatus.REFERRED,
    JobStatus.IN_EXTERNAL_REPAIR,
    JobStatus.WAITING_FOR_PARTS,
    JobStatus.RETURNED_FROM_EXTERNAL,
    JobStatus.AWAITING_APPROVAL,
    JobStatus.IN_REPAIR,
    JobStatus.READY_FOR_PICKUP,
    JobStatus.COMPLETED,
    JobStatus.CLOSED,
  ];
  return allowed.includes(status);
}
