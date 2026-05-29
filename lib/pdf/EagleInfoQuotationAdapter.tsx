/**
 * Adapts the existing QuotationDocument prop shape into EagleInfoDocument.
 * Drop-in replacement for QuotationDocument (quote_classic default).
 */
import { EagleInfoDocument, type EagleInfoLineItem } from "./EagleInfoDocument";

type Props = {
  companyName: string;
  companyTagline?: string;
  companyAddressLine1: string;
  companyAddressLine2: string;
  companyContacts: string;
  companyEmail?: string;
  companyWebsite?: string;
  companyLogoUrl?: string;
  quotationNumber: string;
  dateIssued: string;
  validUntil: string;
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
  accessories: string;
  physicalCondition: string;
  customerIssue: string;
  diagnosisSummary: string;
  scopeOfWork: string;
  repairCost: string;
  vatApplicable: boolean;
  vatLabel: string;
  vatAmount: string;
  totalAmountPayable: string;
  estimatedDuration: string;
  approvalStatus: string;
  recommendation: string;
  notes: string;
  status: string;
  currency: string;
  termsText: string;
  footerText: string;
  signatureCompanyLabel: string;
  signatureClientLabel: string;
};

export function EagleInfoQuotationAdapter(props: Props) {
  const address = [props.companyAddressLine1, props.companyAddressLine2]
    .filter(Boolean).join(", ");

  // Build description for the repair line item
  const descParts: string[] = [];
  if (props.diagnosisSummary && props.diagnosisSummary !== "N/A") {
    descParts.push(props.diagnosisSummary);
  }
  if (props.scopeOfWork && props.scopeOfWork !== "N/A" && props.scopeOfWork !== "To be confirmed after client approval") {
    descParts.push(props.scopeOfWork);
  }

  const items: EagleInfoLineItem[] = [{
    name:     `Device Repair — ${props.deviceLabel}`,
    sku:      props.repairId,
    quantity: 1,
    rate:     props.repairCost,
    amount:   props.totalAmountPayable,
  }];

  // Notes: merge customer issue + internal notes
  const notesArr = [
    props.customerIssue !== "N/A" ? `Issue reported: ${props.customerIssue}` : null,
    props.notes && props.notes !== "N/A" ? props.notes : null,
    props.footerText && props.footerText.trim() ? props.footerText : null,
  ].filter(Boolean);

  return (
    <EagleInfoDocument
      companyName={props.companyName}
      companyAddress={address}
      companyPhone={props.companyContacts || null}
      companyEmail={props.companyEmail || null}
      companyLogoUrl={props.companyLogoUrl || null}
      docTitle="Estimate"
      docNumber={props.quotationNumber}
      docDate={props.dateIssued}
      terms={`Valid until ${props.validUntil}`}
      dueDate={props.estimatedDuration ? `ETA: ${props.estimatedDuration}` : null}
      clientName={props.clientName}
      clientEmail={props.clientEmail || null}
      clientPhone={props.clientPhone || null}
      clientLocation={props.clientOrganization || null}
      lineItems={items}
      subTotal={null}
      totalLabel="Total"
      totalAmount={props.totalAmountPayable}
      paymentMade="UGX 0"
      balanceDue={props.totalAmountPayable}
      notes={notesArr.join("\n\n") || "Looking forward to your business."}
      paymentTo={null}
      termsText={props.termsText || "Payment is due by the agreed date."}
    />
  );
}
