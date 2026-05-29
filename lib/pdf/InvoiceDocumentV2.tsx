import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { LineItemsTable, type PdfLineItem } from "./pdf-line-items";

const GREEN = "#059669";
const GREEN_DARK = "#065f46";
const GREEN_LIGHT = "#d1fae5";
const DARK = "#0f172a";
const MID = "#475569";
const LIGHT = "#94a3b8";
const BG = "#f0fdf8";
const WHITE = "#ffffff";
const RED = "#dc2626";

const s = StyleSheet.create({
  page: { padding: 20, fontSize: 8.6, color: DARK, backgroundColor: BG },

  // ── header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 8,
    gap: 8,
  },
  headerLeft: {
    flex: 1,
    padding: 10,
    border: `1 solid #a7f3d0`,
    borderLeft: `4 solid ${GREEN}`,
    borderRadius: 7,
    backgroundColor: WHITE,
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  logo: { width: 44, height: 44 },
  companyName: { fontSize: 12, fontWeight: 700, color: GREEN_DARK },
  companyTagline: { fontSize: 7.8, color: GREEN, fontWeight: 600, marginBottom: 1 },
  companyLine: { fontSize: 7.6, color: MID, marginBottom: 0.5 },

  headerRight: {
    width: "40%",
    borderRadius: 7,
    overflow: "hidden",
    border: `1 solid ${GREEN}`,
  },
  docTypeBar: {
    backgroundColor: GREEN,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  docType: { fontSize: 18, fontWeight: 700, color: WHITE, letterSpacing: 2 },
  docSubtype: { fontSize: 7.5, color: GREEN_LIGHT, letterSpacing: 1, marginTop: 1 },
  metaBlock: { backgroundColor: WHITE, paddingHorizontal: 10, paddingVertical: 7 },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: `1 solid #d1fae5`,
    paddingVertical: 3,
  },
  metaLabel: { fontSize: 7, color: LIGHT, textTransform: "uppercase", letterSpacing: 0.4 },
  metaValue: { fontSize: 8.4, fontWeight: 700, color: DARK },
  metaValueAccent: { fontSize: 9, fontWeight: 700, color: GREEN_DARK },

  // ── payment status bar ────────────────────────────────────────────────────
  payBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 7,
    border: `1 solid #a7f3d0`,
    backgroundColor: WHITE,
    marginBottom: 8,
    overflow: "hidden",
  },
  payBarLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 8,
  },
  payItem: { alignItems: "center" },
  payLabel: { fontSize: 6.8, color: LIGHT, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 1 },
  payValue: { fontSize: 8.6, fontWeight: 700, color: DARK },
  payDivider: { width: 1, height: 28, backgroundColor: "#a7f3d0" },
  payStatusWrap: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  paidBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: GREEN,
    border: `1 solid ${GREEN_DARK}`,
  },
  unpaidBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: RED,
    border: `1 solid #991b1b`,
  },
  badgeText: { fontSize: 9, fontWeight: 700, color: WHITE, letterSpacing: 0.8 },

  // ── grid ─────────────────────────────────────────────────────────────────
  grid: { flexDirection: "row", gap: 6, marginBottom: 6 },
  col: { width: "49%" },

  // ── section ─────────────────────────────────────────────────────────────
  section: {
    marginBottom: 6,
    borderRadius: 7,
    border: `1 solid #a7f3d0`,
    borderTop: `3 solid ${GREEN}`,
    backgroundColor: WHITE,
    overflow: "hidden",
  },
  sectionHead: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#f0fdf4",
    borderBottom: `1 solid #d1fae5`,
  },
  sectionTitle: { fontSize: 8, fontWeight: 700, color: GREEN_DARK, textTransform: "uppercase", letterSpacing: 0.7 },
  sectionBody: { paddingHorizontal: 8, paddingVertical: 6 },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 4,
    paddingBottom: 3,
    borderBottom: `1 solid #ecfdf5`,
  },
  label: { width: "36%", fontSize: 7.6, color: MID },
  value: { width: "64%", fontSize: 8.4, fontWeight: 600, color: DARK },

  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  detailCol: { width: "49%" },
  detailCard: {
    border: `1 solid #d1fae5`,
    borderRadius: 5,
    backgroundColor: "#f0fdf4",
    padding: 6,
    minHeight: 48,
  },
  fieldLabel: { fontSize: 6.8, color: LIGHT, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 },
  bulletItem: { flexDirection: "row", alignItems: "flex-start", marginBottom: 2, gap: 4 },
  bulletMark: { fontSize: 8, color: GREEN, width: 8 },
  bulletText: { flex: 1, fontSize: 8.2, fontWeight: 600, color: DARK },

  // ── cost ─────────────────────────────────────────────────────────────────
  costWrap: {
    marginTop: 4,
    marginLeft: "auto",
    width: "70%",
    border: `1 solid #a7f3d0`,
    borderRadius: 8,
    overflow: "hidden",
  },
  costHead: { backgroundColor: GREEN, paddingHorizontal: 10, paddingVertical: 4 },
  costHeadText: { fontSize: 8, fontWeight: 700, color: WHITE, textTransform: "uppercase", letterSpacing: 0.6 },
  costBody: { backgroundColor: WHITE, padding: 8 },
  costRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    paddingBottom: 3,
    borderBottom: `1 solid #d1fae5`,
  },
  costLabel: { fontSize: 8.2, color: MID },
  costValue: { fontSize: 9, fontWeight: 600, color: DARK, textAlign: "right" },
  costDivider: { borderTop: `1.5 solid ${GREEN}`, marginVertical: 4 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 },
  totalLabel: { fontSize: 10, fontWeight: 700, color: GREEN_DARK },
  totalValue: { fontSize: 14, fontWeight: 700, color: GREEN_DARK, textAlign: "right" },

  termItem: { fontSize: 8.2, color: DARK, fontWeight: 600, marginBottom: 2 },

  sigWrap: {
    marginTop: 4,
    padding: 8,
    border: `1 solid #a7f3d0`,
    borderTop: `2 solid ${GREEN}`,
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
    borderTop: `1 solid #d1fae5`,
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
  workDone: string;
  partsReplaced: string;
  diagnosisSummary: string;
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
  // ── optional line-items (product / service / contract mode) ─────────────────
  lineItems?:     PdfLineItem[];
  documentMode?:  string;   // "REPAIR" | "PRODUCT" | "SERVICE" | "CONTRACT"
  subtotalValue?: string;   // pre-formatted subtotal, falls back to repairCost
};

function BulletField({ value }: { value: string | null | undefined }) {
  const lines = (value ?? "").split(/\n|\||;/g).map((l) => l.trim()).filter(Boolean);
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

const LI_COLORS_V2 = {
  headerBg:    GREEN,
  headerText:  WHITE,
  rowBorderBg: "#d1fae5",
  altRowBg:    "#f0fdf4",
  totalAccent: GREEN_DARK,
  labelMuted:  MID,
};

export function InvoiceDocumentV2(rawProps: Props) {
  // Sanitise all string props — react-pdf's textkit crashes when a Text node receives
  // undefined as content (calls undefined.split('')). Coerce everything upfront.
  const s2 = (v: string | undefined | null) => v ?? "";
  const props: Props = {
    ...rawProps,
    companyName:           s2(rawProps.companyName),
    companyAddressLine1:   s2(rawProps.companyAddressLine1),
    companyAddressLine2:   s2(rawProps.companyAddressLine2),
    companyContacts:       s2(rawProps.companyContacts),
    invoiceNumber:         s2(rawProps.invoiceNumber),
    dateIssued:            s2(rawProps.dateIssued),
    repairId:              s2(rawProps.repairId),
    preparedByName:        s2(rawProps.preparedByName),
    preparedByRole:        s2(rawProps.preparedByRole),
    clientName:            s2(rawProps.clientName),
    clientPhone:           s2(rawProps.clientPhone),
    clientEmail:           s2(rawProps.clientEmail),
    clientOrganization:    s2(rawProps.clientOrganization),
    deviceType:            s2(rawProps.deviceType),
    deviceLabel:           s2(rawProps.deviceLabel),
    serialOrImei:          s2(rawProps.serialOrImei),
    workDone:              s2(rawProps.workDone),
    partsReplaced:         s2(rawProps.partsReplaced),
    diagnosisSummary:      s2(rawProps.diagnosisSummary),
    repairCost:            s2(rawProps.repairCost),
    vatLabel:              s2(rawProps.vatLabel),
    vatAmount:             s2(rawProps.vatAmount),
    totalAmountPayable:    s2(rawProps.totalAmountPayable),
    status:                s2(rawProps.status),
    currency:              s2(rawProps.currency),
    termsText:             s2(rawProps.termsText),
    footerText:            s2(rawProps.footerText),
    signatureCompanyLabel: s2(rawProps.signatureCompanyLabel),
    signatureClientLabel:  s2(rawProps.signatureClientLabel),
  };
  const isRepairMode  = !props.documentMode || props.documentMode === "REPAIR";
  const showLineItems = Boolean(props.lineItems?.length);

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
              <Text style={s.docType}>INVOICE</Text>
              <Text style={s.docSubtype}>TAX INVOICE</Text>
            </View>
            <View style={s.metaBlock}>
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Invoice No.</Text>
                <Text style={s.metaValueAccent}>{props.invoiceNumber}</Text>
              </View>
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Job Ref.</Text>
                <Text style={s.metaValue}>{props.repairId}</Text>
              </View>
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Date</Text>
                <Text style={s.metaValue}>{props.dateIssued}</Text>
              </View>
              <View style={[s.metaRow, { borderBottom: "none" }]}>
                <Text style={s.metaLabel}>Amount Due</Text>
                <Text style={[s.metaValue, { fontSize: 11, color: GREEN_DARK }]}>{props.totalAmountPayable}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Payment status bar */}
        <View style={s.payBar}>
          <View style={s.payBarLeft}>
            <View style={s.payItem}>
              <Text style={s.payLabel}>Billed To</Text>
              <Text style={s.payValue}>{props.clientName}</Text>
            </View>
            <View style={s.payDivider} />
            <View style={s.payItem}>
              <Text style={s.payLabel}>Device</Text>
              <Text style={s.payValue}>{props.deviceLabel}</Text>
            </View>
            <View style={s.payDivider} />
            <View style={s.payItem}>
              <Text style={s.payLabel}>Job Status</Text>
              <Text style={s.payValue}>{props.status}</Text>
            </View>
          </View>
          <View style={s.payStatusWrap}>
            <View style={props.isPaid ? s.paidBadge : s.unpaidBadge}>
              <Text style={s.badgeText}>{props.isPaid ? "PAID" : "UNPAID"}</Text>
            </View>
          </View>
        </View>

        {/* Client + Device */}
        <View style={s.grid}>
          <View style={s.col}>
            <View style={s.section}>
              <View style={s.sectionHead}><Text style={s.sectionTitle}>Bill To</Text></View>
              <View style={s.sectionBody}>
                <View style={s.row}><Text style={s.label}>Name</Text><Text style={s.value}>{props.clientName}</Text></View>
                <View style={s.row}><Text style={s.label}>Phone</Text><Text style={s.value}>{props.clientPhone}</Text></View>
                <View style={s.row}><Text style={s.label}>Email</Text><Text style={s.value}>{props.clientEmail || "N/A"}</Text></View>
                <View style={s.row}><Text style={s.label}>Org</Text><Text style={s.value}>{props.clientOrganization || "N/A"}</Text></View>
              </View>
            </View>
          </View>
          {isRepairMode && (
            <View style={s.col}>
              <View style={s.section}>
                <View style={s.sectionHead}><Text style={s.sectionTitle}>Device Repaired</Text></View>
                <View style={s.sectionBody}>
                  <View style={s.row}><Text style={s.label}>Type</Text><Text style={s.value}>{props.deviceType}</Text></View>
                  <View style={s.row}><Text style={s.label}>Model</Text><Text style={s.value}>{props.deviceLabel}</Text></View>
                  <View style={s.row}><Text style={s.label}>Serial/IMEI</Text><Text style={s.value}>{props.serialOrImei || "N/A"}</Text></View>
                  <View style={s.row}><Text style={s.label}>Prepared By</Text><Text style={s.value}>{props.preparedByName}</Text></View>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Work done — shown only in repair mode without line items */}
        {isRepairMode && !showLineItems && (
          <View style={s.section}>
            <View style={s.sectionHead}><Text style={s.sectionTitle}>Services Rendered</Text></View>
            <View style={s.sectionBody}>
              <View style={s.detailGrid}>
                <View style={s.detailCol}>
                  <View style={s.detailCard}>
                    <Text style={s.fieldLabel}>Diagnosis</Text>
                    <BulletField value={props.diagnosisSummary} />
                  </View>
                </View>
                <View style={s.detailCol}>
                  <View style={s.detailCard}>
                    <Text style={s.fieldLabel}>Work Performed</Text>
                    <BulletField value={props.workDone} />
                  </View>
                </View>
                <View style={s.detailCol}>
                  <View style={s.detailCard}>
                    <Text style={s.fieldLabel}>Parts Replaced</Text>
                    <BulletField value={props.partsReplaced} />
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Line items table — replaces services when provided */}
        {showLineItems && (
          <LineItemsTable
            items={props.lineItems!}
            colors={LI_COLORS_V2}
            hasDiscount={props.lineItems!.some((i) => Boolean(i.discount))}
            subtotalValue={props.subtotalValue ?? props.repairCost}
            vatLabel={props.vatApplicable ? props.vatLabel : undefined}
            vatValue={props.vatApplicable ? props.vatAmount : undefined}
            totalLabel="Total Payable"
            totalValue={props.totalAmountPayable}
          />
        )}

        {/* Cost — shown only when no line items (table has its own totals) */}
        {!showLineItems && (
        <View style={s.section} wrap={false}>
          <View style={s.sectionHead}><Text style={s.sectionTitle}>Amount Due</Text></View>
          <View style={s.sectionBody}>
            <View style={s.costWrap}>
              <View style={s.costHead}><Text style={s.costHeadText}>Invoice Total</Text></View>
              <View style={s.costBody}>
                <View style={s.costRow}>
                  <Text style={s.costLabel}>Repair Services</Text>
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
        )}

        {/* Terms */}
        <View style={s.section}>
          <View style={s.sectionHead}><Text style={s.sectionTitle}>Terms & Conditions</Text></View>
          <View style={s.sectionBody}>
            {(props.termsText ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((line, i) => (
              <Text key={i} style={s.termItem}>• {line}</Text>
            ))}
          </View>
        </View>

        {/* Signatures */}
        <View style={s.sigWrap} wrap={false}>
          <Text style={[s.sectionTitle, { color: GREEN_DARK }]}>Payment Acknowledgement</Text>
          <View style={s.sigRow}>
            <View style={s.sigCol}>
              <Text style={s.sigName}>{props.signatureCompanyLabel}</Text>
              <View style={s.sigLine} />
              <Text style={s.sigLabel}>Authorised signatory</Text>
            </View>
            <View style={s.sigCol}>
              <Text style={s.sigName}>{props.signatureClientLabel}</Text>
              <View style={s.sigLine} />
              <Text style={s.sigLabel}>Client signature & payment confirmation</Text>
            </View>
          </View>
          <Text style={s.footer}>{props.footerText}</Text>
        </View>

      </Page>
    </Document>
  );
}
