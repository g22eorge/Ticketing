const ZERO_DECIMAL = new Set(["UGX", "JPY", "KRW"]);

export const SUPPORTED_CURRENCIES = [
  "UGX",
  "USD",
  "EUR",
  "GBP",
  "KES",
  "TZS",
  "RWF",
  "CDF",
  "ETB",
  "ZAR",
  "NGN",
  "GHS",
  "EGP",
  "MAD",
  "AED",
  "SAR",
  "QAR",
  "INR",
  "CNY",
  "JPY",
  "AUD",
  "CAD",
  "CHF",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export function normalizeCurrency(value: unknown, fallback: string) {
  const raw = typeof value === "string" ? value : "";
  const next = raw.toUpperCase().trim();
  return next || fallback;
}

export function parseSupportedCurrencies(raw: string | null | undefined, fallback: string): SupportedCurrency[] {
  const tokens = String(raw ?? "")
    .split(",")
    .map((t) => t.toUpperCase().trim())
    .filter(Boolean);

  const unique: SupportedCurrency[] = [];
  for (const t of tokens) {
    if (!isSupportedCurrency(t)) continue;
    if (!unique.includes(t)) unique.push(t);
  }

  if (unique.length > 0) return unique;
  const fb = normalizeCurrency(fallback, "UGX");
  return isSupportedCurrency(fb) ? [fb] : ["UGX"];
}

export function toBaseAmount(params: {
  amount: number;
  currency: string | null;
  baseCurrency: string;
  exchangeRateToBase: number | null;
}) {
  const amount = Number(params.amount);
  if (!Number.isFinite(amount)) return 0;

  const currency = normalizeCurrency(params.currency, params.baseCurrency);
  if (currency === params.baseCurrency) return amount;
  const rate = Number(params.exchangeRateToBase);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return amount * rate;
}

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
