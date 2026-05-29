/**
 * Adapts the existing InvoiceDocument prop shape into EagleInfoDocument.
 * Drop-in replacement for InvoiceDocument (invoice_classic default).
 */
import { EagleInfoDocument, type EagleInfoLineItem } from "./EagleInfoDocument";
import type { PdfLineItem } from "./pdf-line-items";

type Props = {
  companyName: string;
  companyTagline?: string;
  companyAddressLine1: string;
  companyAddressLine2: string;
  companyContacts: string;
  companyEmail?: string;
  companyWebsite?: string;
  companyLogoUrl?: string;
  invoiceNumber: string;
  dateIssued: string;
  repairId: string;
  preparedByName: string;
  preparedByRole: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientOrganization: string;
  deviceType: string;
  deviceLabel: string;
  serialOrImei: string;
  diagnosisSummary: string;
  workDone: string;
  partsReplaced: string;
  repairCost: string;
  vatApplicable: boolean;
  vatLabel: string;
  vatAmount: string;
  totalAmountPayable: string;
  isPaid: boolean;
  status: string;
  currency: string;
  termsText: string;
  footerText: string;
  signatureCompanyLabel: string;
  signatureClientLabel: string;
  lineItems?: PdfLineItem[];
  documentMode?: string;
  subtotalValue?: string;
};

export function EagleInfoInvoiceAdapter(props: Props) {
  const address = [props.companyAddressLine1, props.companyAddressLine2]
    .filter(Boolean).join(", ");

  // Build line items — use provided lines, or synthesise from repair data
  let items: EagleInfoLineItem[];
  if (props.lineItems && props.lineItems.length > 0) {
    items = props.lineItems.map((li) => ({
      name:     li.description,
      quantity: li.quantity,
      rate:     li.unitPrice,
      amount:   li.lineTotal,
    }));
  } else {
    // Repair invoice: single composite line
    const parts   = props.partsReplaced !== "N/A" ? `\nParts: ${props.partsReplaced}` : "";
    const workDesc = props.workDone !== "N/A"     ? props.workDone : props.diagnosisSummary;
    items = [{
      name:     `Device Repair — ${props.deviceLabel}`,
      sku:      props.repairId,
      quantity: 1,
      rate:     props.repairCost,
      amount:   props.totalAmountPayable,
    }];
    if (workDesc && workDesc !== "N/A") {
      items[0] = { ...items[0], name: `${items[0].name}\n${workDesc}${parts}` };
    }
  }

  const paymentNote = props.footerText || "";
  // Split bank details out of the footer if it starts with a bank name pattern
  const bankDetails = paymentNote.includes("Bank")
    ? paymentNote
    : "";

  return (
    <EagleInfoDocument
      companyName={props.companyName}
      companyAddress={address}
      companyPhone={props.companyContacts || null}
      companyEmail={props.companyEmail || null}
      companyLogoUrl={props.companyLogoUrl || null}
      docTitle="Invoice"
      docNumber={props.invoiceNumber}
      docDate={props.dateIssued}
      terms={props.termsText ? "As agreed" : null}
      dueDate={props.isPaid ? "Paid" : null}
      clientName={props.clientName}
      clientEmail={props.clientEmail || null}
      clientPhone={props.clientPhone || null}
      clientLocation={props.clientOrganization || null}
      lineItems={items}
      subTotal={props.subtotalValue || null}
      totalLabel="Total"
      totalAmount={props.totalAmountPayable}
      paymentMade={props.isPaid ? props.totalAmountPayable : "UGX 0"}
      balanceDue={props.isPaid ? "UGX 0" : props.totalAmountPayable}
      notes={props.footerText || null}
      paymentTo={null}
      termsText={props.termsText || null}
    />
  );
}
