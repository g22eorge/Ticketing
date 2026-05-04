type LegacyOrCurrentJob = {
  externalTechBill?: number | null;
  clientBill?: number | null;
  costEstimate?: number | null;
  finalCost?: number | null;
};

export function getExternalTechBill(job: LegacyOrCurrentJob) {
  if (typeof job.externalTechBill === "number") return job.externalTechBill;
  return null;
}

export function getClientBill(job: LegacyOrCurrentJob) {
  if (typeof job.clientBill === "number") return job.clientBill;
  if (typeof job.finalCost === "number") return job.finalCost;
  return null;
}
