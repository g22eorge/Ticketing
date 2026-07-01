import { headers } from "next/headers";

export type DeploymentContext =
  | {
      mode: "CARE_SINGLE_TENANT";
      host: string;
      fixedOrgId: string;
    }
  | {
      mode: "COMMERCIAL_MULTI_TENANT";
      host: string;
      fixedOrgId?: undefined;
    };

export function resolveDeploymentContext(host: string | null | undefined): DeploymentContext {
  const normalizedHost = (host ?? "").toLowerCase();
  const hostWithoutPort = normalizedHost.split(":")[0];

  // Single‑tenant domains are configured via SINGLE_TENANT_DOMAIN_MAP (JSON string)
  const singleTenantDomains: Record<string, string> = {};

  const overrideEnv = process.env.SINGLE_TENANT_DOMAIN_MAP;
  if (overrideEnv) {
    try {
      const overrideMap = JSON.parse(overrideEnv);
      Object.assign(singleTenantDomains, overrideMap);
    } catch (err) {
      console.error("Failed to parse SINGLE_TENANT_DOMAIN_MAP:", err);
    }
  }

  const fixedOrgId = singleTenantDomains[hostWithoutPort];
  if (fixedOrgId) {
    return {
      mode: "CARE_SINGLE_TENANT",
      host: hostWithoutPort,
      fixedOrgId,
    };
  }

  return {
    mode: "COMMERCIAL_MULTI_TENANT",
    host: hostWithoutPort,
  };
}

export async function getDeploymentContext() {
  const host = (await headers()).get("host");
  return resolveDeploymentContext(host);
}
