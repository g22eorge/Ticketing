/**
 * Invoice – Minimal template
 * Ultra-clean, whitespace-focused, no colored blocks or borders.
 * Everything is expressed through typography and subtle dividers.
 */
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { LineItemsTable, type PdfLineItem } from "./pdf-line-items";

const DARK  = "#111827";
const MID   = "#6b7280";
const LIGHT = "#9ca3af";
const LINE  = "#e5e7eb";
const ACCENT= "#1d4ed8";   // subtle blue for totals & doc number
const WHITE = "#ffffff";

const s = StyleSheet.create({
  page:       { padding: 40, fontSize: 9, color: DARK, backgroundColor: WHITE },

  // ── header ──────────────────────────────────────────────────────────────────
  header:     { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
  logo:       { width: 56, height: 56, marginBottom: 6 },
  coName:     { fontSize: 13, fontWeight: 700, color: DARK, marginBottom: 2 },
  coTag:      { fontSize: 8.4, color: ACCENT, fontWeight: 600, marginBottom: 2 },
  coLine:     { fontSize: 8.2, color: MID, marginBottom: 1.5 },
  docSide:    { alignItems: "flex-end" },
  docTitle:   { fontSize: 22, fontWeight: 700, color: DARK, letterSpacing: 1, marginBottom: 8 },
  docNumRow:  { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  docNumLbl:  { fontSize: 7.8, color: LIGHT, textTransform: "uppercase", letterSpacing: 0.6 },
  docNumVal:  { fontSize: 11, fontWeight: 700, color: ACCENT },
  docMeta:    { fontSize: 8.4, color: MID, textAlign: "right", marginBottom: 1.5 },

  // ── dividers ─────────────────────────────────────────────────────────────────
  divider:    { borderBottom: `1 solid ${LINE}`, marginBottom: 20, marginTop: 4 },

  // ── bill-to / device / prepared columns ──────────────────────────────────────
  grid:       { flexDirection: "row", gap: 20, marginBottom: 20 },
  col:        { flex: 1 },
  colLabel:   { fontSize: 7.5, color: LIGHT, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 },
  colVal:     { fontSize: 9, color: DARK, marginBottom: 1.5 },
  colValBold: { fontSize: 10, fontWeight: 700, color: DARK, marginBottom: 1.5 },
  colSep:     { borderBottom: `1 solid ${LINE}`, marginBottom: 10, marginTop: 4 },

  // ── sections ─────────────────────────────────────────────────────────────────
  section:    { marginBottom: 18 },
  secTitle:   { fontSize: 7.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: LIGHT, marginBottom: 8 },
  row:        { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottom: `1 solid ${LINE}` },
  rowLabel:   { fontSize: 8.4, color: MID },
  rowVal:     { fontSize: 8.4, fontWeight: 600, color: DARK },

  // ── cost totals ───────────────────────────────────────────────────────────────
  totalRow:   { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, marginTop: 4, borderTop: `2 solid ${DARK}` },
  totalLbl:   { fontSize: 11, fontWeight: 700, color: DARK },
  totalVal:   { fontSize: 13, fontWeight: 700, color: ACCENT },

  // ── terms ─────────────────────────────────────────────────────────────────────
  termItem:   { fontSize: 8.2, color: MID, marginBottom: 3 },

  // ── signatures ───────────────────────────────────────────────────────────────
  sigRow:     { flexDirection: "row", gap: 30, marginTop: 20 },
  sigCol:     { flex: 1 },
  sigLine:    { borderBottom: `1 solid ${LINE}`, marginTop: 28, marginBottom: 4 },
  sigLbl:     { fontSize: 7.5, color: LIGHT },
  sigName:    { fontSize: 8.5, fontWeight: 700, color: DARK, marginBottom: 1 },

  footer:     { marginTop: 20, borderTop: `1 solid ${LINE}`, paddingTop: 6, fontSize: 7.5, color: LIGHT, textAlign: "center" },
});

type Props = {
  companyName: string; companyTagline?: string; companyAddressLine1: string; companyAddressLine2: string;
  companyContacts: string; companyEmail?: string; companyWebsite?: string; companyLogoUrl?: string;
  documentTitle: string; quotationNumber: string; dateIssued: string; validUntil: string;
  repairId: string; preparedByName: string; preparedByRole: string;
  clientName: string; clientPhone: string; clientEmail: string; clientOrganization: string;
  deviceType: string; deviceLabel: string; serialOrImei: string; accessories: string; physicalCondition: string;
  customerIssue: string; diagnosisSummary: string; scopeOfWork: string;
  repairCost: string; vatApplicable: boolean; vatLabel: string; vatAmount: string; totalAmountPayable: string;
  estimatedDuration: string; approvalStatus: string; recommendation: string; notes: string;
  status: string; currency: string; termsText: string; footerText: string;
  signatureCompanyLabel: string; signatureClientLabel: string;
  // ── optional line-items ───────────────────────────────────────────────────────
  lineItems?:     PdfLineItem[];
  documentMode?:  string;
  subtotalValue?: string;
};

const LI_COLORS_MINIMAL = {
  headerBg:    DARK,
  headerText:  WHITE,
  rowBorderBg: LINE,
  altRowBg:    "#f9fafb",
  totalAccent: ACCENT,
  labelMuted:  MID,
};

export function InvoiceDocumentMinimal(props: Props) {
  const isRepairMode  = !props.documentMode || props.documentMode === "REPAIR";
  const showLineItems = Boolean(props.lineItems?.length);

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {props.companyLogoUrl ? <Image style={s.logo} src={props.companyLogoUrl} /> : null}
            <Text style={s.coName}>{props.companyName}</Text>
            {props.companyTagline ? <Text style={s.coTag}>{props.companyTagline}</Text> : null}
            <Text style={s.coLine}>{props.companyAddressLine1}</Text>
            <Text style={s.coLine}>{props.companyAddressLine2}</Text>
            <Text style={s.coLine}>{props.companyContacts}</Text>
            {props.companyEmail   ? <Text style={s.coLine}>{props.companyEmail}</Text>   : null}
            {props.companyWebsite ? <Text style={s.coLine}>{props.companyWebsite}</Text> : null}
          </View>
          <View style={s.docSide}>
            <Text style={s.docTitle}>{props.documentTitle}</Text>
            <View style={s.docNumRow}>
              <Text style={s.docNumLbl}>No.</Text>
              <Text style={s.docNumVal}>{props.quotationNumber}</Text>
            </View>
            <Text style={s.docMeta}>Issued: {props.dateIssued}</Text>
            <Text style={s.docMeta}>Valid until: {props.validUntil}</Text>
            <Text style={s.docMeta}>Repair ID: {props.repairId}</Text>
          </View>
        </View>
        <View style={s.divider} />

        {/* ── Bill To / Device / Prepared By ── */}
        <View style={s.grid}>
          <View style={s.col}>
            <Text style={s.colLabel}>Bill To</Text>
            <Text style={s.colValBold}>{props.clientName}</Text>
            {props.clientOrganization ? <Text style={s.colVal}>{props.clientOrganization}</Text> : null}
            <Text style={s.colVal}>{props.clientPhone}</Text>
            {props.clientEmail ? <Text style={s.colVal}>{props.clientEmail}</Text> : null}
          </View>
          {isRepairMode && (
            <View style={s.col}>
              <Text style={s.colLabel}>Device</Text>
              <Text style={s.colValBold}>{props.deviceLabel}</Text>
              <Text style={s.colVal}>{props.deviceType}</Text>
              {props.serialOrImei ? <Text style={s.colVal}>S/N: {props.serialOrImei}</Text> : null}
              {props.accessories  ? <Text style={s.colVal}>Accessories: {props.accessories}</Text> : null}
              {props.physicalCondition ? <Text style={s.colVal}>Condition: {props.physicalCondition}</Text> : null}
            </View>
          )}
          <View style={s.col}>
            <Text style={s.colLabel}>Prepared By</Text>
            <Text style={s.colValBold}>{props.preparedByName}</Text>
            <Text style={s.colVal}>{props.preparedByRole}</Text>
            <View style={s.colSep} />
            <Text style={s.colLabel}>Status</Text>
            <Text style={s.colValBold}>{props.status}</Text>
          </View>
        </View>

        {/* ── Line items table — product/service/contract mode ── */}
        {showLineItems && (
          <LineItemsTable
            items={props.lineItems!}
            colors={LI_COLORS_MINIMAL}
            hasDiscount={props.lineItems!.some((i) => Boolean(i.discount))}
            subtotalValue={props.subtotalValue ?? props.repairCost}
            vatLabel={props.vatApplicable ? props.vatLabel : undefined}
            vatValue={props.vatApplicable ? props.vatAmount : undefined}
            totalLabel="Total Amount Payable"
            totalValue={props.totalAmountPayable}
          />
        )}

        {/* ── Diagnosis & Work — repair mode only ── */}
        {isRepairMode && !showLineItems && (
          <View style={s.section}>
            <Text style={s.secTitle}>Diagnosis &amp; Work</Text>
            <View style={s.row}><Text style={s.rowLabel}>Issue reported</Text><Text style={[s.rowVal, { maxWidth: "65%" }]}>{props.customerIssue}</Text></View>
            <View style={s.row}><Text style={s.rowLabel}>Diagnosis</Text><Text style={[s.rowVal, { maxWidth: "65%" }]}>{props.diagnosisSummary}</Text></View>
            <View style={s.row}><Text style={s.rowLabel}>Scope of work</Text><Text style={[s.rowVal, { maxWidth: "65%" }]}>{props.scopeOfWork}</Text></View>
            <View style={s.row}><Text style={s.rowLabel}>Est. duration</Text><Text style={s.rowVal}>{props.estimatedDuration}</Text></View>
            <View style={s.row}><Text style={s.rowLabel}>Approval</Text><Text style={s.rowVal}>{props.approvalStatus}</Text></View>
            {props.notes ? <View style={s.row}><Text style={s.rowLabel}>Notes</Text><Text style={[s.rowVal, { maxWidth: "65%" }]}>{props.notes}</Text></View> : null}
          </View>
        )}

        {/* ── Cost Breakdown — only when no line items ── */}
        {!showLineItems && (
          <View style={s.section}>
            <Text style={s.secTitle}>Cost Breakdown</Text>
            <View style={s.row}><Text style={s.rowLabel}>{isRepairMode ? "Repair cost" : "Subtotal"}</Text><Text style={s.rowVal}>{props.repairCost}</Text></View>
            {props.vatApplicable ? <View style={s.row}><Text style={s.rowLabel}>{props.vatLabel}</Text><Text style={s.rowVal}>{props.vatAmount}</Text></View> : null}
            <View style={s.totalRow}><Text style={s.totalLbl}>Total Amount Payable</Text><Text style={s.totalVal}>{props.totalAmountPayable}</Text></View>
          </View>
        )}

        {/* ── Terms ── */}
        <View style={s.section}>
          <Text style={s.secTitle}>Terms &amp; Conditions</Text>
          {props.termsText.split("\n").filter(Boolean).map((l, i) => (
            <Text key={i} style={s.termItem}>— {l}</Text>
          ))}
        </View>

        {/* ── Signatures ── */}
        <View style={s.sigRow} wrap={false}>
          <View style={s.sigCol}>
            <Text style={s.sigName}>{props.signatureCompanyLabel}</Text>
            <View style={s.sigLine} />
            <Text style={s.sigLbl}>Authorized company signature &amp; date</Text>
          </View>
          <View style={s.sigCol}>
            <Text style={s.sigName}>{props.signatureClientLabel}</Text>
            <View style={s.sigLine} />
            <Text style={s.sigLbl}>Client signature &amp; date</Text>
          </View>
        </View>

        <Text style={s.footer}>{props.footerText}</Text>
      </Page>
    </Document>
  );
}
