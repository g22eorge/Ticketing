import { headers } from "next/headers";

import { EIS_ORG_ID, isCareDomain } from "@/lib/org";

export type DeploymentContext =
  | {
      mode: "CARE_SINGLE_TENANT";
      host: string;
      fixedOrgId: typeof EIS_ORG_ID;
    }
  | {
      mode: "COMMERCIAL_MULTI_TENANT";
      host: string;
      fixedOrgId?: undefined;
    };

export function resolveDeploymentContext(host: string | null | undefined): DeploymentContext {
  const normalizedHost = (host ?? "").toLowerCase();
  if (isCareDomain(normalizedHost)) {
    return {
      mode: "CARE_SINGLE_TENANT",
      host: normalizedHost,
      fixedOrgId: EIS_ORG_ID,
    };
  }

  return {
    mode: "COMMERCIAL_MULTI_TENANT",
    host: normalizedHost,
  };
}

export async function getDeploymentContext() {
  const host = (await headers()).get("host");
  return resolveDeploymentContext(host);
}
