import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import { LineItemsTable, type PdfLineItem } from "./pdf-line-items";

const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontSize: 8.6,
    color: "#0f172a",
    backgroundColor: "#f4f7fb",
  },
  topAccent: {
    height: 5,
    backgroundColor: "#D4AF37",
    borderRadius: 8,
    marginBottom: 10,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  leftHeader: {
    width: "52%",
    padding: 8,
    border: "1 solid #d6e0eb",
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  logo: {
    width: 82,
    height: 82,
    marginBottom: 6,
  },
  companyName: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 1,
    color: "#0f172a",
  },
  companyLine: {
    fontSize: 8.3,
    color: "#1f2937",
    marginBottom: 0.8,
  },
  rightHeader: {
    width: "46%",
    alignItems: "stretch",
    marginTop: 10,
  },
  heading: {
    fontSize: 12,
    fontWeight: 700,
    textAlign: "center",
    color: "#ffffff",
  },
  headingBlock: {
    width: "100%",
    marginBottom: 7,
    backgroundColor: "#0f3b7a",
    borderRadius: 8,
    paddingVertical: 6,
    border: "1 solid #0b2f63",
  },
  headerInfoBlock: {
    width: "100%",
    border: "1 solid #d1dbe7",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    paddingHorizontal: 8,
    paddingTop: 7,
    paddingBottom: 5,
  },
  infoRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
    borderBottom: "1 solid #d7e0ea",
    paddingBottom: 3,
    paddingTop: 1,
  },
  infoRowHighlight: {
    marginBottom: 5,
    paddingTop: 3,
    paddingBottom: 4,
    paddingHorizontal: 4,
    border: "1 solid #bfd3ea",
    borderRadius: 6,
    backgroundColor: "#f1f7ff",
  },
  infoRowGroupGap: {
    marginTop: 4,
  },
  infoLabel: {
    fontSize: 7.4,
    fontWeight: 600,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: "#475569",
    textAlign: "left",
  },
  infoValue: {
    fontSize: 8.8,
    fontWeight: 700,
    color: "#0f172a",
    textAlign: "right",
  },
  infoValueHighlight: {
    color: "#0f3b7a",
    fontSize: 9.4,
  },
  section: {
    marginBottom: 7,
    padding: 8,
    border: "1 solid #d6e0eb",
    borderTop: "3 solid #8eb8df",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    boxShadow: "0 1 0 #e7eef6",
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    marginBottom: 7,
    color: "#D4AF37",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  grid: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 4,
  },
  colHalf: {
    width: "49%",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    gap: 10,
    borderBottom: "1 solid #edf2f8",
    paddingBottom: 2,
  },
  label: {
    width: "35%",
    color: "#475569",
    fontSize: 8.2,
  },
  value: {
    width: "63%",
    fontWeight: 600,
    fontSize: 9.4,
    flexShrink: 1,
  },
  longField: {
    marginBottom: 0,
  },
  longLabel: {
    fontSize: 7.2,
    color: "#64748b",
    marginBottom: 3,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  longValue: {
    fontSize: 8.4,
    fontWeight: 600,
    color: "#0f172a",
  },
  summaryStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottom: "1 solid #dbe5f0",
  },
  summaryCompactRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottom: "1 solid #dbe5f0",
  },
  summaryCompactPair: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 10,
    border: "1 solid #d8e5f4",
    backgroundColor: "#f6faff",
  },
  summaryCompactLabel: {
    fontSize: 7,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  summaryCompactValue: {
    fontSize: 7.6,
    fontWeight: 700,
    color: "#0f172a",
  },
  summaryItem: {
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: "#eef4fb",
    border: "1 solid #d6e1ee",
  },
  summaryLabel: {
    fontSize: 7,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  summaryValue: {
    fontSize: 8.3,
    fontWeight: 700,
    color: "#0f172a",
  },
  bulletList: {
    marginTop: 1,
  },
  bulletItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 2,
    gap: 4,
  },
  bulletMark: {
    width: 8,
    fontSize: 7.6,
    color: "#0f3b7a",
  },
  bulletText: {
    flex: 1,
    fontSize: 8.4,
    fontWeight: 600,
    color: "#0f172a",
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  detailCol: {
    width: "49%",
  },
  detailCard: {
    border: "1 solid #dde6f1",
    borderRadius: 6,
    backgroundColor: "#f8fbff",
    paddingHorizontal: 6,
    paddingVertical: 5,
    minHeight: 52,
  },
  total: {
    marginTop: 4,
    paddingTop: 4,
    borderTop: "1 solid #cbd5e1",
    fontSize: 9,
    fontWeight: 700,
  },
  costWrap: {
    marginTop: 4,
    marginLeft: "auto",
    width: "72%",
    padding: 6,
    border: "1 solid #cfdbeb",
    borderRadius: 8,
    backgroundColor: "#f9fbff",
  },
  costRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    borderBottom: "1 solid #dde7f3",
    paddingBottom: 3,
  },
  costLabel: {
    fontSize: 8.2,
    color: "#334155",
  },
  costValue: {
    fontSize: 9,
    fontWeight: 600,
    textAlign: "right",
  },
  costDivider: {
    borderTop: "1 solid #9cb2cc",
    marginTop: 1,
    marginBottom: 4,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 1,
  },
  totalLabel: {
    fontSize: 10.2,
    fontWeight: 700,
    color: "#0f172a",
  },
  totalValue: {
    fontSize: 12,
    fontWeight: 700,
    color: "#0f3b7a",
    textAlign: "right",
  },
  termsItem: {
    marginBottom: 2,
    fontSize: 8.4,
    fontWeight: 600,
    color: "#0f172a",
  },
  signaturesWrap: {
    marginTop: 1,
    marginBottom: 1,
    padding: 6,
    border: "1 solid #d6e0eb",
    borderTop: "2 solid #a7c8e7",
    borderRadius: 6,
    backgroundColor: "#ffffff",
  },
  signaturesRow: {
    flexDirection: "row",
    gap: 10,
  },
  signatureCol: {
    width: "50%",
  },
  signatureLine: {
    borderBottom: "1 solid #94a3b8",
    marginTop: 10,
    marginBottom: 4,
  },
  signatureLabel: {
    fontSize: 8,
    color: "#475569",
  },
  signatureValue: {
    fontSize: 9,
    fontWeight: 700,
    color: "#0f172a",
  },
  footer: {
    marginTop: 1,
    fontSize: 7.6,
    color: "#5b6b81",
    textAlign: "center",
  },
  footerInline: {
    marginTop: 4,
    paddingTop: 4,
    borderTop: "1 solid #dbe5f0",
    fontSize: 7.5,
    color: "#5b6b81",
    textAlign: "center",
  },
});

type InvoiceDocProps = {
  companyName: string;
  companyTagline?: string;
  companyAddressLine1: string;
  companyAddressLine2: string;
  companyContacts: string;
  companyEmail?: string;
  companyWebsite?: string;
  companyLogoUrl?: string;
  documentTitle: string;
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
  // ── optional line-items (product / service / contract mode) ─────────────────
  lineItems?:     PdfLineItem[];
  documentMode?:  string;   // "REPAIR" | "PRODUCT" | "SERVICE" | "CONTRACT"
  subtotalValue?: string;
};

function toBulletLines(value: string) {
  const lines = value
    .split(/\n|\||;/g)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (lines.length === 0) return ["N/A"];
  return lines;
}

function BulletField({ value }: { value: string }) {
  const lines = toBulletLines(value);
  return (
    <View style={styles.bulletList}>
      {lines.map((line, index) => (
        <View style={styles.bulletItem} key={`${line}-${index}`}>
          <Text style={styles.bulletMark}>•</Text>
          <Text style={styles.bulletText}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

const LI_COLORS_CLASSIC = {
  headerBg:    "#0f3b7a",
  headerText:  "#ffffff",
  rowBorderBg: "#dde7f3",
  altRowBg:    "#f6faff",
  totalAccent: "#0f3b7a",
  labelMuted:  "#475569",
};

export function InvoiceDocument(props: InvoiceDocProps) {
  const isRepairMode  = !props.documentMode || props.documentMode === "REPAIR";
  const showLineItems = Boolean(props.lineItems?.length);
  const recommendation = props.recommendation.trim();
  const showRecommendation =
    recommendation.length > 0
    && !["n/a", "not set", "none", "-"].includes(recommendation.toLowerCase());

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.topAccent} />

        <View style={styles.topRow}>
          <View style={styles.leftHeader}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {props.companyLogoUrl ? <Image style={styles.logo} src={props.companyLogoUrl} /> : null}
            <Text style={styles.companyName}>{props.companyName}</Text>
            {props.companyTagline ? <Text style={[styles.companyLine, { fontWeight: 700, color: "#0f3b7a" }]}>{props.companyTagline}</Text> : null}
            <Text style={styles.companyLine}>{props.companyAddressLine1}</Text>
            <Text style={styles.companyLine}>{props.companyAddressLine2}</Text>
            <Text style={styles.companyLine}>{props.companyContacts}</Text>
            {props.companyEmail ? <Text style={styles.companyLine}>{props.companyEmail}</Text> : null}
            {props.companyWebsite ? <Text style={styles.companyLine}>{props.companyWebsite}</Text> : null}
          </View>

          <View style={styles.rightHeader}>
            <View style={styles.headingBlock}>
              <Text style={styles.heading}>{props.documentTitle}</Text>
            </View>
            <View style={styles.headerInfoBlock}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Est No:</Text>
                <Text style={styles.infoValue}>{props.quotationNumber}</Text>
              </View>
              <View style={[styles.infoRow, styles.infoRowHighlight]}>
                <Text style={styles.infoLabel}>Balance Due:</Text>
                <Text style={[styles.infoValue, styles.infoValueHighlight]}>{props.totalAmountPayable}</Text>
              </View>
              <View style={[styles.infoRow, styles.infoRowGroupGap]}>
                <Text style={styles.infoLabel}>Est Date:</Text>
                <Text style={styles.infoValue}>{props.dateIssued}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Valid Until:</Text>
                <Text style={styles.infoValue}>{props.validUntil}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.grid}>
          <View style={styles.colHalf}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Client & Job</Text>
              <View style={styles.row}><Text style={styles.label}>Repair ID</Text><Text style={styles.value}>{props.repairId}</Text></View>
              <View style={styles.row}><Text style={styles.label}>Prepared By</Text><Text style={styles.value}>{props.preparedByName}</Text></View>
              <View style={styles.row}><Text style={styles.label}>Client</Text><Text style={styles.value}>{props.clientName}</Text></View>
              <View style={styles.row}><Text style={styles.label}>Phone</Text><Text style={styles.value}>{props.clientPhone}</Text></View>
              <View style={styles.row}><Text style={styles.label}>Email</Text><Text style={styles.value}>{props.clientEmail}</Text></View>
              <View style={styles.row}><Text style={styles.label}>Org</Text><Text style={styles.value}>{props.clientOrganization}</Text></View>
            </View>
          </View>

          {isRepairMode && (
            <View style={styles.colHalf}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Device</Text>
                <View style={styles.row}><Text style={styles.label}>Type</Text><Text style={styles.value}>{props.deviceType}</Text></View>
                <View style={styles.row}><Text style={styles.label}>Model</Text><Text style={styles.value}>{props.deviceLabel}</Text></View>
                <View style={styles.row}><Text style={styles.label}>Serial/IMEI</Text><Text style={styles.value}>{props.serialOrImei}</Text></View>
                <View style={styles.row}><Text style={styles.label}>Accessories</Text><Text style={styles.value}>{props.accessories}</Text></View>
                <View style={styles.row}><Text style={styles.label}>Condition</Text><Text style={styles.value}>{props.physicalCondition}</Text></View>
              </View>
            </View>
          )}
        </View>

        {/* Line items table — product / service / contract mode */}
        {showLineItems && (
          <LineItemsTable
            items={props.lineItems!}
            colors={LI_COLORS_CLASSIC}
            hasDiscount={props.lineItems!.some((i) => Boolean(i.discount))}
            subtotalValue={props.subtotalValue ?? props.repairCost}
            vatLabel={props.vatApplicable ? props.vatLabel : undefined}
            vatValue={props.vatApplicable ? props.vatAmount : undefined}
            totalLabel="Total Amount Payable"
            totalValue={props.totalAmountPayable}
          />
        )}

        {/* Diagnosis & Work — shown only in repair mode without line items */}
        {isRepairMode && !showLineItems && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Diagnosis & Work</Text>
          <View style={styles.summaryCompactRow}>
            <View style={styles.summaryCompactPair}>
              <Text style={styles.summaryCompactLabel}>Duration:</Text>
              <Text style={styles.summaryCompactValue}>{props.estimatedDuration}</Text>
            </View>
            <View style={styles.summaryCompactPair}>
              <Text style={styles.summaryCompactLabel}>Approval:</Text>
              <Text style={styles.summaryCompactValue}>{props.approvalStatus}</Text>
            </View>
            <View style={styles.summaryCompactPair}>
              <Text style={styles.summaryCompactLabel}>Status:</Text>
              <Text style={styles.summaryCompactValue}>{props.status}</Text>
            </View>
            {showRecommendation ? (
              <View style={styles.summaryCompactPair}>
                <Text style={styles.summaryCompactLabel}>Recommendation:</Text>
                <Text style={styles.summaryCompactValue}>{recommendation}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.detailGrid}>
            <View style={styles.detailCol}>
              <View style={styles.detailCard}>
                <View style={styles.longField}>
                  <Text style={styles.longLabel}>Issue</Text>
                  <BulletField value={props.customerIssue} />
                </View>
              </View>
            </View>
            <View style={styles.detailCol}>
              <View style={styles.detailCard}>
                <View style={styles.longField}>
                  <Text style={styles.longLabel}>Diagnosis</Text>
                  <BulletField value={props.diagnosisSummary} />
                </View>
              </View>
            </View>
            <View style={styles.detailCol}>
              <View style={styles.detailCard}>
                <View style={styles.longField}>
                  <Text style={styles.longLabel}>Scope</Text>
                  <BulletField value={props.scopeOfWork} />
                </View>
              </View>
            </View>
            <View style={styles.detailCol}>
              <View style={styles.detailCard}>
                <View style={styles.longField}>
                  <Text style={styles.longLabel}>Notes</Text>
                  <BulletField value={props.notes} />
                </View>
              </View>
            </View>
          </View>
        </View>
        )}

        {/* Cost Breakdown — hidden when line items table is shown (it includes its own totals) */}
        {!showLineItems && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Cost Breakdown</Text>
            <View style={styles.costWrap}>
              <View style={styles.costRow}>
                <Text style={styles.costLabel}>{isRepairMode ? "Repair Cost" : "Subtotal"}</Text>
                <Text style={styles.costValue}>{props.repairCost}</Text>
              </View>
              {props.vatApplicable ? (
                <View style={styles.costRow}>
                  <Text style={styles.costLabel}>{props.vatLabel}</Text>
                  <Text style={styles.costValue}>{props.vatAmount}</Text>
                </View>
              ) : null}
              <View style={styles.costDivider} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total Amount Payable</Text>
                <Text style={styles.totalValue}>{props.totalAmountPayable}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Terms & Conditions</Text>
          {props.termsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => (
              <Text key={line} style={styles.termsItem}>- {line}</Text>
            ))}
        </View>

        <View style={styles.signaturesWrap} wrap={false}>
          <Text style={styles.sectionTitle}>Sign-off</Text>
          <View style={styles.signaturesRow}>
            <View style={styles.signatureCol}>
              <Text style={styles.signatureValue}>{props.signatureCompanyLabel}</Text>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Authorized company signature</Text>
            </View>
            <View style={styles.signatureCol}>
              <Text style={styles.signatureValue}>{props.signatureClientLabel}</Text>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Client signature & date</Text>
            </View>
          </View>
          <Text style={styles.footerInline}>{props.footerText}</Text>
        </View>
      </Page>
    </Document>
  );
}
