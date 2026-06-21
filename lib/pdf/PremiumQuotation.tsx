import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const C = { ink: "#0a0a0a", body: "#1c1917", muted: "#78716c", faint: "#a8a29e", rule: "#d6d3d1", accent: "#b08968" };
const F = { display: 20, title: 13, heading: 10.5, body: 9, label: 7.5, micro: 6.5 };

const s = StyleSheet.create({
  page: { paddingHorizontal: 36, paddingVertical: 32, fontSize: F.body, fontFamily: "Helvetica", color: C.body },

  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  brandName: { fontSize: F.title, fontFamily: "Helvetica-Bold", color: C.ink, letterSpacing: 0.6 },
  brandSub: { fontSize: F.label, color: C.muted, marginTop: 1 },
  brandContact: { fontSize: F.label, color: C.faint, marginTop: 2 },
  docTitle: { fontSize: F.display, fontFamily: "Helvetica-Bold", color: C.ink, textAlign: "right" },
  docMeta: { fontSize: F.label, color: C.muted, textAlign: "right", marginTop: 2 },

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

  textBlock: { fontSize: F.body, color: C.body, lineHeight: 1.5, minHeight: 30 },

  lightRule: { borderTopWidth: 0.5, borderTopColor: C.rule, marginTop: 10, marginBottom: 10 },

  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  priceLabel: { fontSize: F.body, color: C.body },
  priceValue: { fontSize: F.body, fontFamily: "Helvetica-Bold", color: C.ink, textAlign: "right" },
  priceAccent: { fontSize: F.body, fontFamily: "Helvetica-Bold", color: C.accent, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, paddingTop: 6, borderTopWidth: 1.5, borderTopColor: C.accent },
  totalLabel: { fontSize: F.heading, fontFamily: "Helvetica-Bold", color: C.ink },
  totalValue: { fontSize: F.title, fontFamily: "Helvetica-Bold", color: C.accent, textAlign: "right" },

  termLine: { fontSize: F.label, color: C.muted, lineHeight: 1.6, marginBottom: 2 },

  sigArea: { marginTop: 18, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: C.rule },
  sigRow: { flexDirection: "row", gap: 30, marginTop: 10 },
  sigCol: { flex: 1 },
  sigLine: { borderBottomWidth: 0.5, borderBottomColor: C.rule, marginTop: 28, marginBottom: 4 },
  sigLabel: { fontSize: F.label, color: C.muted },

  footer: { marginTop: 20, borderTopWidth: 0.5, borderTopColor: C.rule, paddingTop: 8, fontSize: F.micro, color: C.faint, textAlign: "center" },
});

type Props = {
  companyName: string;
  companyTagline?: string;
  companyAddressLine1?: string;
  companyAddressLine2?: string;
  companyContacts?: string;
  companyEmail?: string;
  companyWebsite?: string;
  companyLogoUrl?: string;
  quotationNumber: string;
  dateIssued: string;
  validUntil: string;
  repairId?: string;
  preparedByName: string;
  preparedByRole?: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  clientOrganization?: string;
  deviceType?: string;
  deviceLabel: string;
  serialOrImei: string;
  accessories?: string;
  physicalCondition?: string;
  customerIssue: string;
  diagnosisSummary?: string;
  scopeOfWork?: string;
  repairCost: string;
  vatApplicable: boolean;
  vatLabel?: string;
  vatAmount: string;
  totalAmountPayable: string;
  estimatedDuration?: string;
  approvalStatus?: string;
  recommendation?: string;
  notes?: string;
  status?: string;
  currency: string;
  termsText?: string;
  footerText: string;
  signatureCompanyLabel?: string;
  signatureClientLabel?: string;
};

export function PremiumQuotationDocument(props: Props) {
  const address = [props.companyAddressLine1, props.companyAddressLine2].filter(Boolean).join(", ");

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
            <Text style={s.docTitle}>Quotation</Text>
            <Text style={s.docMeta}>{props.quotationNumber}</Text>
            <Text style={s.docMeta}>{props.dateIssued}</Text>
          </View>
        </View>

        <View style={s.accent} />

        <View style={s.twoCol}>
          <View style={s.col}>
            <View style={s.metaRow}><Text style={s.metaLabel}>Valid Until</Text><Text style={s.metaValue}>{props.validUntil}</Text></View>
            {props.estimatedDuration ? <View style={s.metaRow}><Text style={s.metaLabel}>Est. Duration</Text><Text style={s.metaValue}>{props.estimatedDuration}</Text></View> : null}
            {props.approvalStatus ? <View style={s.metaRow}><Text style={s.metaLabel}>Status</Text><Text style={s.metaAccent}>{props.approvalStatus}</Text></View> : null}
          </View>
          <View style={s.col}>
            <View style={s.metaRow}><Text style={s.metaLabel}>Prepared By</Text><Text style={s.metaValue}>{props.preparedByName}</Text></View>
            {props.repairId ? <View style={s.metaRow}><Text style={s.metaLabel}>Job Ref</Text><Text style={s.metaAccent}>{props.repairId}</Text></View> : null}
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

        <Text style={s.sectionHead}>Issue</Text>
        <Text style={s.textBlock}>{props.customerIssue}</Text>

        {props.scopeOfWork ? (
          <View>
            <Text style={s.sectionHead}>Scope of Work</Text>
            <Text style={s.textBlock}>{props.scopeOfWork}</Text>
          </View>
        ) : null}

        {props.recommendation ? (
          <View>
            <Text style={s.sectionHead}>Recommendation</Text>
            <Text style={s.textBlock}>{props.recommendation}</Text>
          </View>
        ) : null}

        <Text style={s.sectionHead}>Charges</Text>
        <View style={s.priceRow}><Text style={s.priceLabel}>Repair Cost</Text><Text style={s.priceValue}>{props.currency} {props.repairCost}</Text></View>
        {props.vatApplicable ? <View style={s.priceRow}><Text style={s.priceLabel}>{props.vatLabel || "VAT"}</Text><Text style={s.priceValue}>{props.currency} {props.vatAmount}</Text></View> : null}
        <View style={s.totalRow}><Text style={s.totalLabel}>Total</Text><Text style={s.totalValue}>{props.currency} {props.totalAmountPayable}</Text></View>

        {props.termsText ? (
          <View>
            <Text style={s.sectionHead}>Terms</Text>
            {props.termsText.split("\n").filter(Boolean).map((line, i) => (
              <Text key={i} style={s.termLine}>{line.trim()}</Text>
            ))}
          </View>
        ) : null}

        <View style={s.sigArea} wrap={false}>
          <View style={s.sigRow}>
            <View style={s.sigCol}>
              <View style={s.sigLine} />
              <Text style={s.sigLabel}>{props.signatureCompanyLabel || "Authorised signatory"}</Text>
            </View>
            <View style={s.sigCol}>
              <View style={s.sigLine} />
              <Text style={s.sigLabel}>{props.signatureClientLabel || "Client acceptance & date"}</Text>
            </View>
          </View>
        </View>

        <Text style={s.footer}>{props.footerText}</Text>
      </Page>
    </Document>
  );
}
