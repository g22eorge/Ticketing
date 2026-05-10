import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const DARK = "#0f172a";
const MID = "#475569";
const LIGHT = "#94a3b8";
const ACCENT = "#0f3b7a";
const BG = "#ffffff";

const s = StyleSheet.create({
  page: { padding: 24, fontSize: 9, color: DARK, backgroundColor: BG },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 18, fontWeight: 800, letterSpacing: 1.4, color: ACCENT },
  muted: { fontSize: 8.4, color: MID },
  tiny: { fontSize: 7.6, color: LIGHT },
  hr: { borderBottom: "1 solid #e2e8f0", marginVertical: 10 },
  block: { marginBottom: 10 },
  label: { fontSize: 7.6, color: LIGHT, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  value: { fontSize: 9, color: DARK, fontWeight: 600 },
  grid: { flexDirection: "row", gap: 10 },
  col: { width: "50%" },
  box: { border: "1 solid #e2e8f0", borderRadius: 6, padding: 8, backgroundColor: "#f8fafc" },
  moneyRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  moneyTotal: { fontSize: 12, fontWeight: 800, color: ACCENT },
});

type Props = {
  companyName: string;
  companyTagline: string;
  companyAddressLine1: string;
  companyAddressLine2: string;
  companyContacts: string;
  companyEmail: string;
  companyWebsite: string;
  companyLogoUrl: string | null;

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

export function QuotationDocumentMinimal(props: Props) {
  const companyLine = [
    props.companyName,
    props.companyContacts,
    props.companyEmail,
    props.companyWebsite,
  ].filter(Boolean).join(" · ");

  const addressLine = [props.companyAddressLine1, props.companyAddressLine2].filter(Boolean).join(" · ");

  return (
    <Document title={`Quotation ${props.quotationNumber}`}>
      <Page size="A4" style={s.page}>
        <View style={[s.row, { alignItems: "center" }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>QUOTATION</Text>
            {props.companyTagline ? <Text style={s.muted}>{props.companyTagline}</Text> : null}
            {companyLine ? <Text style={s.tiny}>{companyLine}</Text> : null}
            {addressLine ? <Text style={s.tiny}>{addressLine}</Text> : null}
          </View>
          {props.companyLogoUrl ? (
            <Image src={props.companyLogoUrl} alt="" style={{ width: 54, height: 54 }} />
          ) : null}
        </View>

        <View style={s.hr} />

        <View style={s.grid}>
          <View style={s.col}>
            <View style={s.block}>
              <Text style={s.label}>Quotation</Text>
              <Text style={s.value}>{props.quotationNumber}</Text>
              <Text style={s.tiny}>Issued: {props.dateIssued} · Valid until: {props.validUntil}</Text>
            </View>
            <View style={s.block}>
              <Text style={s.label}>Client</Text>
              <Text style={s.value}>{props.clientName}</Text>
              <Text style={s.tiny}>{props.clientPhone}{props.clientEmail ? ` · ${props.clientEmail}` : ""}</Text>
              {props.clientOrganization ? <Text style={s.tiny}>{props.clientOrganization}</Text> : null}
            </View>
          </View>
          <View style={s.col}>
            <View style={s.block}>
              <Text style={s.label}>Repair</Text>
              <Text style={s.value}>{props.repairId}</Text>
              <Text style={s.tiny}>Prepared by: {props.preparedByName} ({props.preparedByRole})</Text>
              <Text style={s.tiny}>Status: {props.status} · Approval: {props.approvalStatus}</Text>
            </View>
            <View style={[s.box, { marginTop: 2 }]}>
              <Text style={s.label}>Totals</Text>
              <View style={s.moneyRow}>
                <Text style={s.muted}>Repair cost</Text>
                <Text style={s.value}>{props.repairCost}</Text>
              </View>
              {props.vatApplicable ? (
                <View style={s.moneyRow}>
                  <Text style={s.muted}>{props.vatLabel}</Text>
                  <Text style={s.value}>{props.vatAmount}</Text>
                </View>
              ) : null}
              <View style={[s.hr, { marginVertical: 6 }]} />
              <View style={s.moneyRow}>
                <Text style={s.muted}>Total payable</Text>
                <Text style={s.moneyTotal}>{props.totalAmountPayable}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={[s.box, { marginTop: 10 }]}>
          <Text style={s.label}>Device</Text>
          <Text style={s.value}>{props.deviceLabel}</Text>
          <Text style={s.tiny}>{props.deviceType}{props.serialOrImei ? ` · ${props.serialOrImei}` : ""}</Text>
          {props.accessories ? <Text style={s.tiny}>Accessories: {props.accessories}</Text> : null}
          {props.physicalCondition ? <Text style={s.tiny}>Condition: {props.physicalCondition}</Text> : null}
        </View>

        <View style={[s.grid, { marginTop: 10 }]}>
          <View style={s.col}>
            <View style={s.box}>
              <Text style={s.label}>Customer Issue</Text>
              <Text style={s.value}>{props.customerIssue || "-"}</Text>
            </View>
          </View>
          <View style={s.col}>
            <View style={s.box}>
              <Text style={s.label}>Diagnosis Summary</Text>
              <Text style={s.value}>{props.diagnosisSummary || "-"}</Text>
            </View>
          </View>
        </View>

        <View style={[s.box, { marginTop: 10 }]}>
          <Text style={s.label}>Scope Of Work</Text>
          <Text style={s.value}>{props.scopeOfWork || "-"}</Text>
          {props.estimatedDuration ? <Text style={s.tiny}>ETA: {props.estimatedDuration}</Text> : null}
          {props.recommendation ? <Text style={s.tiny}>Recommendation: {props.recommendation}</Text> : null}
          {props.notes ? <Text style={s.tiny}>Notes: {props.notes}</Text> : null}
        </View>

        {props.termsText ? (
          <View style={{ marginTop: 10 }}>
            <Text style={s.label}>Terms</Text>
            <Text style={s.muted}>{props.termsText}</Text>
          </View>
        ) : null}

        <View style={s.hr} />
        <View style={s.grid}>
          <View style={s.col}>
            <Text style={s.tiny}>{props.signatureCompanyLabel}</Text>
            <View style={{ borderBottom: "1 solid #94a3b8", marginTop: 18 }} />
          </View>
          <View style={s.col}>
            <Text style={s.tiny}>{props.signatureClientLabel}</Text>
            <View style={{ borderBottom: "1 solid #94a3b8", marginTop: 18 }} />
          </View>
        </View>
        {props.footerText ? <Text style={[s.tiny, { marginTop: 8 }]}>{props.footerText}</Text> : null}
      </Page>
    </Document>
  );
}
