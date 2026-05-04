import { Prisma } from "@prisma/client";

// In production it is possible for the running Prisma Client to be temporarily
// out of sync with code (e.g. a deployment where Prisma Client wasn't regenerated).
// Guard enum-valued queries by filtering to values the runtime client supports.
export function filterSupportedJobStatuses<T extends string>(values: readonly T[]): T[] {
  const jobStatusEnum = Prisma.dmmf.datamodel.enums.find((e) => e.name === "JobStatus");
  const allowed = new Set((jobStatusEnum?.values ?? []).map((v) => v.name));
  return values.filter((value) => allowed.has(value));
}
