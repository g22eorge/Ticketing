const ZERO_DECIMAL = new Set(["UGX", "JPY", "KRW"]);

export function getAppCurrency() {
  const value = (process.env.APP_CURRENCY ?? "UGX").toUpperCase().trim();
  return value || "UGX";
}

export function formatMoney(amount: number, currency = getAppCurrency()) {
  const digits = ZERO_DECIMAL.has(currency) ? 0 : 2;
  const number = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
  return `${currency} ${number}`;
}

export function formatMoneyCompact(amount: number, currency = getAppCurrency()) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    const val = (abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1).replace(/\.0$/, "");
    return `${sign}${currency} ${val}M`;
  }
  if (abs >= 1_000) {
    const val = (abs / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1).replace(/\.0$/, "");
    return `${sign}${currency} ${val}K`;
  }
  return formatMoney(amount, currency);
}
