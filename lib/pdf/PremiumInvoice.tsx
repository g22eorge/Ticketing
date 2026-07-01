import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const C = { ink: "#0a0a0a", body: "#1c1917", muted: "#78716c", faint: "#a8a29e", rule: "#d6d3d1", accent: "#b08968", green: "#16a34a" };
const F = { display: 20, title: 13, heading: 10.5, body: 9, label: 7.5, micro: 6.5 };

const s = StyleSheet.create({
  page: { paddingHorizontal: 36, paddingVertical: 32, fontSize: F.body, fontFamily: "Helvetica", color: C.body },

  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  brandName: { fontSize: F.title, fontFamily: "Helvetica-Bold", color: C.ink, letterSpacing: 0.6 },
  brandSub: { fontSize: F.label, color: C.muted, marginTop: 1 },
  brandContact: { fontSize: F.label, color: C.faint, marginTop: 2 },
  docTitle: { fontSize: F.display, fontFamily: "Helvetica-Bold", color: C.ink, textAlign: "right" },
  docMeta: { fontSize: F.label, color: C.muted, textAlign: "right", marginTop: 2 },
  paidTag: { fontSize: F.label, fontFamily: "Helvetica-Bold", color: C.green, textTransform: "uppercase", letterSpacing: 0.8, textAlign: "right", marginTop: 4 },
  unpaidTag: { fontSize: F.label, fontFamily: "Helvetica-Bold", color: C.accent, textTransform: "uppercase", letterSpacing: 0.8, textAlign: "right", marginTop: 4 },

  accent: { borderTopWidth: 2, borderTopColor: C.accent, marginTop: 14, marginBottom: 22 },

  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  metaLabel: { fontSize: F.label, color: C.faint, textTransform: "uppercase", letterSpacing: 0.3 },
  metaValue: { fontSize: F.body, fontFamily: "Helvetica-Bold", color: C.ink },
  metaAccent: { fontSize: F.body, fontFamily: "Helvetica-Bold", color: C.accent },

  sectionHead: { fontSize: F.heading, fontFamily: "Helvetica-Bold", color: C.ink, letterSpacing: 0.4, marginTop: 16, marginBottom: 6, textTransform: "uppercase" },
  fieldRow: { flexDirection: "row", marginBottom: 3 },
  fieldLabel: { width: 100, fontSize: F.label, color: C.muted, textTransform: "uppercase", letterSpacing: 0.3 },
  fieldValue: { flex: 1, fontSize: F.body, fontFamily: "Helvetica-Bold", color: C.ink },

  twoCol: { flexDirection: "row", gap: 36, marginBottom: 2 },
  col: { flex: 1 },

  textBlock: { fontSize: F.body, color: C.body, lineHeight: 1.5 },

  lightRule: { borderTopWidth: 0.5, borderTopColor: C.rule, marginTop: 10, marginBottom: 10 },

  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  priceLabel: { fontSize: F.body, color: C.body },
  priceValue: { fontSize: F.body, fontFamily: "Helvetica-Bold", color: C.ink, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, paddingTop: 6, borderTopWidth: 1.5, borderTopColor: C.accent },
  totalLabel: { fontSize: F.heading, fontFamily: "Helvetica-Bold", color: C.ink },
  totalValue: { fontSize: F.title, fontFamily: "Helvetica-Bold", color: C.accent, textAlign: "right" },

  lineItemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4, paddingBottom: 4, borderBottomWidth: 0.5, borderBottomColor: C.rule },
  lineDesc: { fontSize: F.body, color: C.body, flex: 1, paddingRight: 12 },
  lineQty: { fontSize: F.label, color: C.muted, width: 32, textAlign: "center" },
  linePrice: { fontSize: F.body, fontFamily: "Helvetica-Bold", color: C.ink, width: 90, textAlign: "right" },

  footer: { marginTop: 20, borderTopWidth: 0.5, borderTopColor: C.rule, paddingTop: 8, fontSize: F.micro, color: C.faint, textAlign: "center" },
});

type LineItem = { description: string; quantity: number; unitPrice: string; discount?: string; lineTotal: string };

type Props = {
  companyName: string;
  companyTagline?: string;
  companyAddressLine1?: string;
  companyAddressLine2?: string;
  companyContacts?: string;
  companyEmail?: string;
  companyWebsite?: string;
  companyLogoUrl?: string;
  invoiceNumber: string;
  dateIssued: string;
  repairId?: string;
  preparedByName?: string;
  preparedByRole?: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  clientOrganization?: string;
  deviceType?: string;
  deviceLabel: string;
  serialOrImei: string;
  diagnosisSummary?: string;
  workDone?: string;
  partsReplaced?: string;
  repairCost: string;
  vatApplicable: boolean;
  vatLabel?: string;
  vatAmount: string;
  totalAmountPayable: string;
  isPaid: boolean;
  status?: string;
  currency: string;
  termsText?: string;
  footerText: string;
  signatureCompanyLabel?: string;
  signatureClientLabel?: string;
  lineItems?: LineItem[];
  documentMode?: string;
  subtotalValue?: string;
};

export function PremiumInvoiceDocument(props: Props) {
  const address = [props.companyAddressLine1, props.companyAddressLine2].filter(Boolean).join(", ");
  const hasLines = props.lineItems && props.lineItems.length > 0;

  return (
    <Document>
      <Page size="A4" style={s.page}>

        <View style={s.top}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {props.companyLogoUrl ? <Image src={props.companyLogoUrl} style={{ width: 60, height: 30, objectFit: "contain", marginBottom: 4 }} /> : null}
            <Text style={s.brandName}>{props.companyName}</Text>
            {props.companyTagline ? <Text style={s.brandSub}>{props.companyTagline}</Text> : null}
            {(props.companyContacts || address) ? <Text style={s.brandContact}>{[props.companyContacts, address].filter(Boolean).join("  ")}</Text> : null}
          </View>
          <View>
            <Text style={s.docTitle}>Invoice</Text>
            <Text style={s.docMeta}>{props.invoiceNumber}</Text>
            <Text style={s.docMeta}>{props.dateIssued}</Text>
            {props.isPaid ? <Text style={s.paidTag}>Paid</Text> : <Text style={s.unpaidTag}>Due</Text>}
          </View>
        </View>

        <View style={s.accent} />

        <View style={s.twoCol}>
          <View style={s.col}>
            <View style={s.metaRow}><Text style={s.metaLabel}>Job Ref</Text><Text style={s.metaAccent}>{props.repairId || props.invoiceNumber}</Text></View>
            {props.preparedByName ? <View style={s.metaRow}><Text style={s.metaLabel}>Prepared By</Text><Text style={s.metaValue}>{props.preparedByName}</Text></View> : null}
          </View>
          <View style={s.col}>
            {props.status ? <View style={s.metaRow}><Text style={s.metaLabel}>Status</Text><Text style={s.metaValue}>{props.status}</Text></View> : null}
          </View>
        </View>

        <Text style={s.sectionHead}>Billed To</Text>
        <View style={s.twoCol}>
          <View style={s.col}>
            <View style={s.fieldRow}><Text style={s.fieldLabel}>Name</Text><Text style={s.fieldValue}>{props.clientName}</Text></View>
            <View style={s.fieldRow}><Text style={s.fieldLabel}>Phone</Text><Text style={s.fieldValue}>{props.clientPhone}</Text></View>
            {props.clientEmail ? <View style={s.fieldRow}><Text style={s.fieldLabel}>Email</Text><Text style={s.fieldValue}>{props.clientEmail}</Text></View> : null}
          </View>
          <View style={s.col}>
            {props.clientOrganization ? <View style={s.fieldRow}><Text style={s.fieldLabel}>Organization</Text><Text style={s.fieldValue}>{props.clientOrganization}</Text></View> : null}
            <View style={s.fieldRow}><Text style={s.fieldLabel}>Device</Text><Text style={s.fieldValue}>{props.deviceLabel}</Text></View>
            <View style={s.fieldRow}><Text style={s.fieldLabel}>Serial / IMEI</Text><Text style={s.fieldValue}>{props.serialOrImei || "N/A"}</Text></View>
          </View>
        </View>

        {props.diagnosisSummary ? (
          <View>
            <Text style={s.sectionHead}>Description</Text>
            <Text style={s.textBlock}>{props.diagnosisSummary}</Text>
            {props.workDone && props.workDone !== "N/A" ? <Text style={[s.textBlock, { marginTop: 4 }]}>Work done: {props.workDone}</Text> : null}
          </View>
        ) : null}

        <Text style={s.sectionHead}>Charges</Text>
        {hasLines ? (
          <View>
            <View style={s.lineItemRow}>
              <Text style={[s.lineDesc, { fontFamily: "Helvetica-Bold", color: C.muted, fontSize: F.label, textTransform: "uppercase" }]}>Description</Text>
              <Text style={[s.lineQty, { fontFamily: "Helvetica-Bold", color: C.muted }]}>Qty</Text>
              <Text style={[s.linePrice, { fontFamily: "Helvetica-Bold", color: C.muted, fontSize: F.label }]}>Amount</Text>
            </View>
            {props.lineItems!.map((item, i) => (
              <View key={i} style={s.lineItemRow}>
                <Text style={s.lineDesc}>{item.description}</Text>
                <Text style={s.lineQty}>{item.quantity}</Text>
                <Text style={s.linePrice}>{item.lineTotal}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={s.priceRow}><Text style={s.priceLabel}>Repair Cost</Text><Text style={s.priceValue}>{props.currency} {props.repairCost}</Text></View>
        )}

        <View style={s.lightRule} />
        {props.vatApplicable ? <View style={s.priceRow}><Text style={s.priceLabel}>{props.vatLabel || "VAT"}</Text><Text style={s.priceValue}>{props.currency} {props.vatAmount}</Text></View> : null}
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>{props.isPaid ? "Total Paid" : "Total Due"}</Text>
          <Text style={s.totalValue}>{props.currency} {props.totalAmountPayable}</Text>
        </View>

        {props.termsText ? (
          <View>
            <Text style={s.sectionHead}>Terms</Text>
            {props.termsText.split("\n").filter(Boolean).map((line, i) => (
              <Text key={i} style={{ fontSize: F.label, color: C.muted, lineHeight: 1.6, marginBottom: 2 }}>{line.trim()}</Text>
            ))}
          </View>
        ) : null}

        <Text style={s.footer}>{props.footerText}</Text>
      </Page>
    </Document>
  );
}
