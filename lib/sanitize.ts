export function sanitizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function sanitizeOptionalText(value: string | null | undefined) {
  if (!value) return null;
  const normalized = sanitizeText(value);
  return normalized.length > 0 ? normalized : null;
}
