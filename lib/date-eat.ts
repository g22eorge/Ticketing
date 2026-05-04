const EAT_LOCALE = "en-GB";
const EAT_TIMEZONE = "Africa/Nairobi";

export function formatEATDate(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(EAT_LOCALE, { timeZone: EAT_TIMEZONE });
}

export function formatEATDateTime(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(EAT_LOCALE, { timeZone: EAT_TIMEZONE });
}

export function formatEATMonthLabel(year: number, month: number) {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString(EAT_LOCALE, {
    month: "long",
    year: "numeric",
    timeZone: EAT_TIMEZONE,
  });
}
