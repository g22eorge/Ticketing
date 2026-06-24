export const TIIS_ORG_ID = "org_tiis_01";
export const EIS_ORG_SLUG = "eagle-info-solutions";
export const EIS_ORG_NAME = "BusinessOS";

export function normalizeHost(host: string | null | undefined) {
  return (host ?? "").toLowerCase().split(":")[0] ?? "";
}

export function isCareDomain(host: string | null | undefined) {
  return normalizeHost(host).startsWith("care.");
}

export function isAppDomain(host: string | null | undefined) {
  const normalized = normalizeHost(host);
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized.startsWith("app.");
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}
