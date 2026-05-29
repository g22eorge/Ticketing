/**
 * POS Sale Receipt — Eagle Info house style.
 * Matches the clean white design from Quote_EISL-000014.pdf.
 */
import { EagleInfoDocument, type EagleInfoLineItem } from "./EagleInfoDocument";
import { formatMoney, getAppCurrency, normalizeCurrency } from "@/lib/currency";

type Branding = {
  documentTitle?: string | null;
  companyName?: string | null;
  companyTagline?: string | null;
  companyContacts?: string | null;
  companyEmail?: string | null;
  companyWebsite?: string | null;
  companyAddressLine1?: string | null;
  companyAddressLine2?: string | null;
  companyLogoUrl?: string | null;
  vatRatePercent?: number | null;
  termsText?: string;
  footerText?: string;
  bankName?: string | null;
  bankBranch?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
} | null;

type Sale = {
  saleNumber: string;
  status: string;
  createdAt: Date;
  currency?: string | null;
  branch: { name: string } | null;
  client: { fullName: string; phone: string | null } | null;
  subtotal: number;
  discountAmount: number;
  vatAmount: number;
  totalAmount: number;
  paidAmount: number;
  items: Array<{ id: string; description: string; quantity: number; unitPrice: number; lineTotal: number; sku?: string | null }>;
  payments: Array<{ id: string; amount: number; method: string; reference: string | null; receivedAt: Date }>;
};

export function SaleReceiptDocument({ sale, branding }: { sale: Sale; branding: Branding }) {
  const currency = normalizeCurrency(sale.currency, getAppCurrency());

  const lineItems: EagleInfoLineItem[] = sale.items.map((it) => ({
    name:     it.description,
    sku:      it.sku ?? null,
    quantity: it.quantity,
    rate:     formatMoney(it.unitPrice, currency),
    amount:   formatMoney(it.lineTotal, currency),
  }));

  const address = [branding?.companyAddressLine1, branding?.companyAddressLine2]
    .filter(Boolean).join(", ");

  const balance = Math.max(0, sale.totalAmount - sale.paidAmount);
  const dateStr = sale.createdAt.toLocaleDateString("en-GB", { timeZone: "Africa/Nairobi", day: "2-digit", month: "short", year: "numeric" });

  // Build payment-to bank details
  const bankLines = [
    branding?.bankName,
    branding?.bankBranch ? `Branch: ${branding.bankBranch}` : null,
    branding?.bankAccountName ? `A/c Name: ${branding.bankAccountName}` : null,
    branding?.bankAccountNumber ? `A/c No.: ${branding.bankAccountNumber}` : null,
  ].filter(Boolean).join("\n");

  // Method summary for notes
  const methodNote = sale.payments.length > 0
    ? sale.payments.map(p => `${p.method.replaceAll("_", " ")}: ${formatMoney(p.amount, currency)}`).join(" · ")
    : null;

  return (
    <EagleInfoDocument
      companyName={branding?.companyName ?? ""}
      companyAddress={address}
      companyPhone={branding?.companyContacts ?? null}
      companyEmail={branding?.companyEmail ?? null}
      companyLogoUrl={branding?.companyLogoUrl ?? null}
      docTitle="Receipt"
      docNumber={sale.saleNumber}
      docDate={dateStr}
      terms={sale.branch?.name ? `Branch: ${sale.branch.name}` : null}
      dueDate={null}
      clientName={sale.client?.fullName ?? "Walk-in Customer"}
      clientPhone={sale.client?.phone ?? null}
      clientEmail={null}
      clientLocation={null}
      lineItems={lineItems}
      subTotal={sale.discountAmount > 0 ? formatMoney(sale.subtotal, currency) : null}
      totalLabel="Total"
      totalAmount={formatMoney(sale.totalAmount, currency)}
      paymentMade={sale.paidAmount > 0 ? formatMoney(sale.paidAmount, currency) : null}
      balanceDue={balance > 0 ? formatMoney(balance, currency) : formatMoney(0, currency)}
      notes={methodNote ?? (branding?.footerText ?? null)}
      paymentTo={bankLines || null}
      termsText={branding?.termsText ?? null}
    />
  );
}
