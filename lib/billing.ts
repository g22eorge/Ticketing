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

/** Resolve the effective external tech payout amount.
 *  externalTechFee (admin-overridden) takes priority when > 0.
 *  Falls back to externalTechBill (what the tech submitted).
 *  Using ?? alone is insufficient — an explicit 0 fee masks a real bill. */
export function resolveTechCost(fee?: number | null, bill?: number | null): number {
  if (typeof fee === "number" && fee > 0) return fee;
  if (typeof bill === "number" && bill > 0) return bill;
  return 0;
}
