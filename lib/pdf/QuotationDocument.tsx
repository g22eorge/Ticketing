import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const NAVY = "#0f3b7a";
const NAVY_LIGHT = "#1e56a8";
const GOLD = "#D4AF37";
const DARK = "#0f172a";
const MID = "#475569";
const LIGHT = "#94a3b8";
const BG = "#f6f9ff";
const WHITE = "#ffffff";

const s = StyleSheet.create({
  page: { padding: 20, fontSize: 8.6, color: DARK, backgroundColor: BG },

  // ── header ───────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 8,
    gap: 8,
  },
  headerLeft: {
    flex: 1,
    padding: 10,
    border: `1 solid #c7d9f0`,
    borderLeft: `4 solid ${NAVY}`,
    borderRadius: 7,
    backgroundColor: WHITE,
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  logo: { width: 44, height: 44 },
  companyName: { fontSize: 12, fontWeight: 700, color: NAVY },
  companyTagline: { fontSize: 7.8, color: NAVY_LIGHT, fontWeight: 600, marginBottom: 1 },
  companyLine: { fontSize: 7.6, color: MID, marginBottom: 0.5 },

  headerRight: {
    width: "40%",
    borderRadius: 7,
    overflow: "hidden",
    border: `1 solid ${NAVY}`,
  },
  docTypeBar: {
    backgroundColor: NAVY,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  docType: { fontSize: 18, fontWeight: 700, color: WHITE, letterSpacing: 2 },
  docSubtype: { fontSize: 7.5, color: "#93c5fd", letterSpacing: 1, marginTop: 1 },
  metaBlock: {
    backgroundColor: WHITE,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: `1 solid #e2eaf5`,
    paddingVertical: 3,
  },
  metaLabel: { fontSize: 7, color: LIGHT, textTransform: "uppercase", letterSpacing: 0.4 },
  metaValue: { fontSize: 8.4, fontWeight: 700, color: DARK },
  metaValueAccent: { fontSize: 9, fontWeight: 700, color: NAVY },

  // ── validity banner ──────────────────────────────────────────────────────
  validityBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#eff6ff",
    border: `1 solid #bfdbfe`,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
  },
  validityItem: { alignItems: "center" },
  validityLabel: { fontSize: 6.8, color: LIGHT, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 1 },
  validityValue: { fontSize: 8.4, fontWeight: 700, color: NAVY },
  validityDivider: { width: 1, height: 24, backgroundColor: "#bfdbfe" },
  approvalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    border: `1 solid ${GOLD}`,
    backgroundColor: "#fffbeb",
  },
  approvalText: { fontSize: 8, fontWeight: 700, color: "#92400e" },

  // ── grid ─────────────────────────────────────────────────────────────────
  grid: { flexDirection: "row", gap: 6, marginBottom: 6 },
  col: { width: "49%" },

  // ── section ─────────────────────────────────────────────────────────────
  section: {
    marginBottom: 6,
    borderRadius: 7,
    border: `1 solid #c7d9f0`,
    borderTop: `3 solid ${NAVY}`,
    backgroundColor: WHITE,
    overflow: "hidden",
  },
  sectionHead: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#f0f5ff",
    borderBottom: `1 solid #dbeafe`,
  },
  sectionTitle: { fontSize: 8, fontWeight: 700, color: NAVY, textTransform: "uppercase", letterSpacing: 0.7 },
  sectionBody: { paddingHorizontal: 8, paddingVertical: 6 },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 4,
    paddingBottom: 3,
    borderBottom: `1 solid #e8f0fa`,
  },
  label: { width: "36%", fontSize: 7.6, color: MID },
  value: { width: "64%", fontSize: 8.4, fontWeight: 600, color: DARK },

  // ── detail cards ─────────────────────────────────────────────────────────
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  detailCol: { width: "49%" },
  detailCard: {
    border: `1 solid #dbeafe`,
    borderRadius: 5,
    backgroundColor: "#f8faff",
    padding: 6,
    minHeight: 48,
  },
  fieldLabel: { fontSize: 6.8, color: LIGHT, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 },
  bulletItem: { flexDirection: "row", alignItems: "flex-start", marginBottom: 2, gap: 4 },
  bulletMark: { fontSize: 8, color: NAVY, width: 8 },
  bulletText: { flex: 1, fontSize: 8.2, fontWeight: 600, color: DARK },

  // ── cost ─────────────────────────────────────────────────────────────────
  costWrap: {
    marginTop: 4,
    marginLeft: "auto",
    width: "70%",
    border: `1 solid #c7d9f0`,
    borderRadius: 8,
    overflow: "hidden",
  },
  costHead: { backgroundColor: NAVY, paddingHorizontal: 10, paddingVertical: 4 },
  costHeadText: { fontSize: 8, fontWeight: 700, color: WHITE, textTransform: "uppercase", letterSpacing: 0.6 },
  costBody: { backgroundColor: WHITE, padding: 8 },
  costRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    paddingBottom: 3,
    borderBottom: `1 solid #e2eaf5`,
  },
  costLabel: { fontSize: 8.2, color: MID },
  costValue: { fontSize: 9, fontWeight: 600, color: DARK, textAlign: "right" },
  costDivider: { borderTop: `1.5 solid ${NAVY}`, marginVertical: 4 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 },
  totalLabel: { fontSize: 10, fontWeight: 700, color: NAVY },
  totalValue: { fontSize: 13, fontWeight: 700, color: NAVY, textAlign: "right" },

  // ── terms ────────────────────────────────────────────────────────────────
  termItem: { fontSize: 8.2, color: DARK, fontWeight: 600, marginBottom: 2 },

  // ── signatures ──────────────────────────────────────────────────────────
  sigWrap: {
    marginTop: 4,
    padding: 8,
    border: `1 solid #c7d9f0`,
    borderTop: `2 solid ${NAVY}`,
    borderRadius: 6,
    backgroundColor: WHITE,
  },
  sigRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  sigCol: { width: "50%" },
  sigLine: { borderBottom: `1 solid #94a3b8`, marginTop: 16, marginBottom: 3 },
  sigLabel: { fontSize: 7.4, color: MID },
  sigName: { fontSize: 8.4, fontWeight: 700, color: DARK },

  footer: {
    marginTop: 4,
    paddingTop: 4,
    borderTop: `1 solid #dbeafe`,
    fontSize: 7.2,
    color: LIGHT,
    textAlign: "center",
  },
});

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

function BulletField({ value }: { value: string }) {
  const lines = value.split(/\n|\||;/g).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return <Text style={{ fontSize: 8, color: LIGHT }}>N/A</Text>;
  return (
    <View>
      {lines.map((line, i) => (
        <View style={s.bulletItem} key={i}>
          <Text style={s.bulletMark}>•</Text>
          <Text style={s.bulletText}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

export function QuotationDocument(props: Props) {
  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.logoRow}>
              {props.companyLogoUrl ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image style={s.logo} src={props.companyLogoUrl} />
              ) : null}
              <View>
                <Text style={s.companyName}>{props.companyName}</Text>
                {props.companyTagline ? <Text style={s.companyTagline}>{props.companyTagline}</Text> : null}
              </View>
            </View>
            <Text style={s.companyLine}>{props.companyAddressLine1}</Text>
            <Text style={s.companyLine}>{props.companyAddressLine2}</Text>
            <Text style={s.companyLine}>{props.companyContacts}</Text>
            {props.companyEmail ? <Text style={s.companyLine}>{props.companyEmail}</Text> : null}
            {props.companyWebsite ? <Text style={s.companyLine}>{props.companyWebsite}</Text> : null}
          </View>

          <View style={s.headerRight}>
            <View style={s.docTypeBar}>
              <Text style={s.docType}>QUOTATION</Text>
              <Text style={s.docSubtype}>REPAIR ESTIMATE</Text>
            </View>
            <View style={s.metaBlock}>
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Quote No.</Text>
                <Text style={s.metaValueAccent}>{props.quotationNumber}</Text>
              </View>
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Job Ref.</Text>
                <Text style={s.metaValue}>{props.repairId}</Text>
              </View>
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Prepared By</Text>
                <Text style={s.metaValue}>{props.preparedByName}</Text>
              </View>
              <View style={[s.metaRow, { borderBottom: "none" }]}>
                <Text style={s.metaLabel}>Amount Due</Text>
                <Text style={[s.metaValue, { fontSize: 11, color: NAVY }]}>{props.totalAmountPayable}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Validity banner */}
        <View style={s.validityBanner}>
          <View style={s.validityItem}>
            <Text style={s.validityLabel}>Date Issued</Text>
            <Text style={s.validityValue}>{props.dateIssued}</Text>
          </View>
          <View style={s.validityDivider} />
          <View style={s.validityItem}>
            <Text style={s.validityLabel}>Valid Until</Text>
            <Text style={[s.validityValue, { color: "#b45309" }]}>{props.validUntil}</Text>
          </View>
          <View style={s.validityDivider} />
          <View style={s.validityItem}>
            <Text style={s.validityLabel}>Est. Duration</Text>
            <Text style={s.validityValue}>{props.estimatedDuration || "TBD"}</Text>
          </View>
          <View style={s.validityDivider} />
          <View style={s.validityItem}>
            <Text style={s.validityLabel}>Approval</Text>
            <View style={s.approvalBadge}>
              <Text style={s.approvalText}>{props.approvalStatus}</Text>
            </View>
          </View>
        </View>

        {/* Client + Device */}
        <View style={s.grid}>
          <View style={s.col}>
            <View style={s.section}>
              <View style={s.sectionHead}><Text style={s.sectionTitle}>Client</Text></View>
              <View style={s.sectionBody}>
                <View style={s.row}><Text style={s.label}>Name</Text><Text style={s.value}>{props.clientName}</Text></View>
                <View style={s.row}><Text style={s.label}>Phone</Text><Text style={s.value}>{props.clientPhone}</Text></View>
                <View style={s.row}><Text style={s.label}>Email</Text><Text style={s.value}>{props.clientEmail || "N/A"}</Text></View>
                <View style={s.row}><Text style={s.label}>Org</Text><Text style={s.value}>{props.clientOrganization || "N/A"}</Text></View>
              </View>
            </View>
          </View>
          <View style={s.col}>
            <View style={s.section}>
              <View style={s.sectionHead}><Text style={s.sectionTitle}>Device</Text></View>
              <View style={s.sectionBody}>
                <View style={s.row}><Text style={s.label}>Type</Text><Text style={s.value}>{props.deviceType}</Text></View>
                <View style={s.row}><Text style={s.label}>Model</Text><Text style={s.value}>{props.deviceLabel}</Text></View>
                <View style={s.row}><Text style={s.label}>Serial/IMEI</Text><Text style={s.value}>{props.serialOrImei || "N/A"}</Text></View>
                <View style={s.row}><Text style={s.label}>Condition</Text><Text style={s.value}>{props.physicalCondition || "N/A"}</Text></View>
              </View>
            </View>
          </View>
        </View>

        {/* Diagnosis & Scope */}
        <View style={s.section}>
          <View style={s.sectionHead}><Text style={s.sectionTitle}>Diagnosis & Scope of Work</Text></View>
          <View style={s.sectionBody}>
            <View style={s.detailGrid}>
              <View style={s.detailCol}>
                <View style={s.detailCard}>
                  <Text style={s.fieldLabel}>Customer Issue</Text>
                  <BulletField value={props.customerIssue} />
                </View>
              </View>
              <View style={s.detailCol}>
                <View style={s.detailCard}>
                  <Text style={s.fieldLabel}>Diagnosis</Text>
                  <BulletField value={props.diagnosisSummary} />
                </View>
              </View>
              <View style={s.detailCol}>
                <View style={s.detailCard}>
                  <Text style={s.fieldLabel}>Proposed Repairs</Text>
                  <BulletField value={props.scopeOfWork} />
                </View>
              </View>
              <View style={s.detailCol}>
                <View style={s.detailCard}>
                  <Text style={s.fieldLabel}>Additional Notes</Text>
                  <BulletField value={props.notes || props.recommendation || "—"} />
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Cost */}
        <View style={s.section} wrap={false}>
          <View style={s.sectionHead}><Text style={s.sectionTitle}>Cost Estimate</Text></View>
          <View style={s.sectionBody}>
            <View style={s.costWrap}>
              <View style={s.costHead}><Text style={s.costHeadText}>Pricing Breakdown</Text></View>
              <View style={s.costBody}>
                <View style={s.costRow}>
                  <Text style={s.costLabel}>Repair Cost</Text>
                  <Text style={s.costValue}>{props.repairCost}</Text>
                </View>
                {props.vatApplicable ? (
                  <View style={s.costRow}>
                    <Text style={s.costLabel}>{props.vatLabel}</Text>
                    <Text style={s.costValue}>{props.vatAmount}</Text>
                  </View>
                ) : null}
                <View style={s.costDivider} />
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>Total Payable</Text>
                  <Text style={s.totalValue}>{props.totalAmountPayable}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Terms */}
        <View style={s.section}>
          <View style={s.sectionHead}><Text style={s.sectionTitle}>Terms & Conditions</Text></View>
          <View style={s.sectionBody}>
            {props.termsText.split("\n").map((l) => l.trim()).filter(Boolean).map((line, i) => (
              <Text key={i} style={s.termItem}>• {line}</Text>
            ))}
          </View>
        </View>

        {/* Signatures */}
        <View style={s.sigWrap} wrap={false}>
          <Text style={[s.sectionTitle, { color: NAVY }]}>Client Acceptance</Text>
          <View style={s.sigRow}>
            <View style={s.sigCol}>
              <Text style={s.sigName}>{props.signatureCompanyLabel}</Text>
              <View style={s.sigLine} />
              <Text style={s.sigLabel}>Authorised signatory</Text>
            </View>
            <View style={s.sigCol}>
              <Text style={s.sigName}>{props.signatureClientLabel}</Text>
              <View style={s.sigLine} />
              <Text style={s.sigLabel}>Client signature & date (acceptance of quote)</Text>
            </View>
          </View>
          <Text style={s.footer}>{props.footerText}</Text>
        </View>

      </Page>
    </Document>
  );
}
