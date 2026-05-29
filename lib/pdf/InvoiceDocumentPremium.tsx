/**
 * Invoice – Premium template
 * Full-width violet/purple header spanning the top, large logo, prominent accent colours.
 */
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { LineItemsTable, type PdfLineItem } from "./pdf-line-items";

const PUR  = "#7c3aed";
const PUR2 = "#5b21b6";
const PUR3 = "#ede9fe";
const PUR4 = "#c4b5fd";
const DARK = "#0f172a";
const MID  = "#475569";
const LITE = "#94a3b8";
const LINE = "#e2e8f0";
const BG   = "#faf8ff";
const WHITE= "#ffffff";

const s = StyleSheet.create({
  page: { padding: 0, fontSize: 8.8, color: DARK, backgroundColor: BG },

  // ── full-width hero header ──────────────────────────────────────────────────
  hero: {
    backgroundColor: PUR2,
    paddingHorizontal: 28, paddingTop: 20, paddingBottom: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  heroLeft:  { flexDirection: "row", alignItems: "center", gap: 14 },
  logo:      { width: 62, height: 62, borderRadius: 6 },
  coName:    { fontSize: 15, fontWeight: 700, color: WHITE, marginBottom: 2 },
  coTag:     { fontSize: 8.4, color: PUR4, fontWeight: 600, marginBottom: 2 },
  coLine:    { fontSize: 8, color: PUR3, marginBottom: 1 },
  heroRight: { alignItems: "flex-end" },
  docType:   { fontSize: 26, fontWeight: 700, color: WHITE, letterSpacing: 2, marginBottom: 4 },
  docBadge:  { backgroundColor: PUR, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 2 },
  docBadgeTxt: { fontSize: 8.5, color: WHITE, fontWeight: 700 },

  // ── purple summary band ─────────────────────────────────────────────────────
  band: {
    backgroundColor: PUR,
    flexDirection: "row", justifyContent: "space-around",
    paddingVertical: 9, paddingHorizontal: 28, marginBottom: 18,
  },
  bandItem:  { alignItems: "center" },
  bandLbl:   { fontSize: 6.8, color: PUR3, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  bandVal:   { fontSize: 10, fontWeight: 700, color: WHITE },
  bandValLg: { fontSize: 12, fontWeight: 700, color: "#fde68a" },

  body: { paddingHorizontal: 28 },

  // ── cards ──────────────────────────────────────────────────────────────────
  grid:   { flexDirection: "row", gap: 12, marginBottom: 14 },
  card:   { flex: 1, border: `1 solid ${LINE}`, borderRadius: 8, backgroundColor: WHITE, padding: 10, borderTop: `3 solid ${PUR}` },
  secLbl: { fontSize: 7.2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: PUR2, marginBottom: 6 },
  row:    { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottom: `1 solid ${LINE}` },
  rlbl:   { fontSize: 8.2, color: MID },
  rval:   { fontSize: 8.4, fontWeight: 600, color: DARK, maxWidth: "58%", textAlign: "right" },

  diagCard: { border: `1 solid ${LINE}`, borderRadius: 8, backgroundColor: WHITE, padding: 10, marginBottom: 14, borderTop: `3 solid ${PUR}` },

  costCard: { border: `1 solid ${LINE}`, borderRadius: 8, backgroundColor: WHITE, padding: 10, marginBottom: 14, marginLeft: "30%", borderTop: `3 solid ${PUR}` },
  costRow:  { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottom: `1 solid ${LINE}` },
  costLbl:  { fontSize: 8.4, color: MID },
  costVal:  { fontSize: 8.8, fontWeight: 600, color: DARK },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, paddingTop: 6, borderTop: `2 solid ${PUR}` },
  totalLbl: { fontSize: 11, fontWeight: 700, color: DARK },
  totalVal: { fontSize: 14, fontWeight: 700, color: PUR2 },

  termItem: { fontSize: 8.2, color: MID, marginBottom: 3 },

  sigRow:  { flexDirection: "row", gap: 16, marginTop: 14 },
  sigCol:  { flex: 1, borderTop: `2 solid ${PUR}`, paddingTop: 8 },
  sigLine: { borderBottom: `1 solid ${LINE}`, marginTop: 22, marginBottom: 4 },
  sigName: { fontSize: 8.5, fontWeight: 700, color: DARK, marginBottom: 2 },
  sigLbl:  { fontSize: 7.5, color: LITE },

  footer: { marginTop: 10, marginHorizontal: 28, borderTop: `1 solid ${LINE}`, paddingTop: 6, fontSize: 7.5, color: LITE, textAlign: "center", marginBottom: 12 },
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

const LI_COLORS_PREMIUM = {
  headerBg:    PUR2,
  headerText:  WHITE,
  rowBorderBg: LINE,
  altRowBg:    BG,
  totalAccent: PUR2,
  labelMuted:  MID,
};

export function InvoiceDocumentPremium(props: Props) {
  const isRepairMode  = !props.documentMode || props.documentMode === "REPAIR";
  const showLineItems = Boolean(props.lineItems?.length);

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Hero header ── */}
        <View style={s.hero}>
          <View style={s.heroLeft}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {props.companyLogoUrl ? <Image style={s.logo} src={props.companyLogoUrl} /> : null}
            <View>
              <Text style={s.coName}>{props.companyName}</Text>
              {props.companyTagline ? <Text style={s.coTag}>{props.companyTagline}</Text> : null}
              <Text style={s.coLine}>{props.companyAddressLine1} · {props.companyAddressLine2}</Text>
              <Text style={s.coLine}>{props.companyContacts}{props.companyEmail ? ` · ${props.companyEmail}` : ""}</Text>
              {props.companyWebsite ? <Text style={s.coLine}>{props.companyWebsite}</Text> : null}
            </View>
          </View>
          <View style={s.heroRight}>
            <Text style={s.docType}>{props.documentTitle}</Text>
            <View style={s.docBadge}>
              <Text style={s.docBadgeTxt}>{props.quotationNumber}</Text>
            </View>
          </View>
        </View>

        {/* ── Key numbers band ── */}
        <View style={s.band}>
          <View style={s.bandItem}><Text style={s.bandLbl}>Date Issued</Text><Text style={s.bandVal}>{props.dateIssued}</Text></View>
          <View style={s.bandItem}><Text style={s.bandLbl}>Valid Until</Text><Text style={s.bandVal}>{props.validUntil}</Text></View>
          <View style={s.bandItem}><Text style={s.bandLbl}>Repair ID</Text><Text style={s.bandVal}>{props.repairId}</Text></View>
          <View style={s.bandItem}><Text style={s.bandLbl}>Total Payable</Text><Text style={s.bandValLg}>{props.totalAmountPayable}</Text></View>
          <View style={s.bandItem}><Text style={s.bandLbl}>Status</Text><Text style={s.bandVal}>{props.status}</Text></View>
        </View>

        <View style={s.body}>
          {/* ── Client + Device + Prepared ── */}
          <View style={s.grid}>
            <View style={s.card}>
              <Text style={s.secLbl}>Bill To</Text>
              <View style={s.row}><Text style={s.rlbl}>Name</Text><Text style={s.rval}>{props.clientName}</Text></View>
              {props.clientOrganization ? <View style={s.row}><Text style={s.rlbl}>Org</Text><Text style={s.rval}>{props.clientOrganization}</Text></View> : null}
              <View style={s.row}><Text style={s.rlbl}>Phone</Text><Text style={s.rval}>{props.clientPhone}</Text></View>
              {props.clientEmail ? <View style={s.row}><Text style={s.rlbl}>Email</Text><Text style={s.rval}>{props.clientEmail}</Text></View> : null}
            </View>
            {isRepairMode && (
              <View style={s.card}>
                <Text style={s.secLbl}>Device</Text>
                <View style={s.row}><Text style={s.rlbl}>Model</Text><Text style={s.rval}>{props.deviceLabel}</Text></View>
                <View style={s.row}><Text style={s.rlbl}>Type</Text><Text style={s.rval}>{props.deviceType}</Text></View>
                {props.serialOrImei    ? <View style={s.row}><Text style={s.rlbl}>S/N</Text><Text style={s.rval}>{props.serialOrImei}</Text></View>           : null}
                {props.accessories     ? <View style={s.row}><Text style={s.rlbl}>Accessories</Text><Text style={s.rval}>{props.accessories}</Text></View>      : null}
                {props.physicalCondition ? <View style={s.row}><Text style={s.rlbl}>Condition</Text><Text style={s.rval}>{props.physicalCondition}</Text></View> : null}
              </View>
            )}
            <View style={s.card}>
              <Text style={s.secLbl}>Prepared By</Text>
              <View style={s.row}><Text style={s.rlbl}>Name</Text><Text style={s.rval}>{props.preparedByName}</Text></View>
              <View style={s.row}><Text style={s.rlbl}>Role</Text><Text style={s.rval}>{props.preparedByRole}</Text></View>
              <View style={s.row}><Text style={s.rlbl}>Approval</Text><Text style={s.rval}>{props.approvalStatus}</Text></View>
              <View style={s.row}><Text style={s.rlbl}>Duration</Text><Text style={s.rval}>{props.estimatedDuration}</Text></View>
            </View>
          </View>

          {/* ── Line items table — product/service/contract mode ── */}
          {showLineItems && (
            <LineItemsTable
              items={props.lineItems!}
              colors={LI_COLORS_PREMIUM}
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
            <View style={s.diagCard}>
              <Text style={s.secLbl}>Diagnosis &amp; Work Summary</Text>
              <View style={s.row}><Text style={s.rlbl}>Issue reported</Text><Text style={[s.rval, { maxWidth: "70%" }]}>{props.customerIssue}</Text></View>
              <View style={s.row}><Text style={s.rlbl}>Diagnosis</Text><Text style={[s.rval, { maxWidth: "70%" }]}>{props.diagnosisSummary}</Text></View>
              <View style={s.row}><Text style={s.rlbl}>Scope of work</Text><Text style={[s.rval, { maxWidth: "70%" }]}>{props.scopeOfWork}</Text></View>
              {props.notes ? <View style={s.row}><Text style={s.rlbl}>Notes</Text><Text style={[s.rval, { maxWidth: "70%" }]}>{props.notes}</Text></View> : null}
            </View>
          )}

          {/* ── Cost Breakdown — only when no line items ── */}
          {!showLineItems && (
            <View style={s.costCard}>
              <Text style={s.secLbl}>Cost Breakdown</Text>
              <View style={s.costRow}><Text style={s.costLbl}>{isRepairMode ? "Repair cost" : "Subtotal"}</Text><Text style={s.costVal}>{props.repairCost}</Text></View>
              {props.vatApplicable ? <View style={s.costRow}><Text style={s.costLbl}>{props.vatLabel}</Text><Text style={s.costVal}>{props.vatAmount}</Text></View> : null}
              <View style={s.totalRow}><Text style={s.totalLbl}>Total Amount Payable</Text><Text style={s.totalVal}>{props.totalAmountPayable}</Text></View>
            </View>
          )}

          {/* ── Terms ── */}
          <View style={[s.diagCard, { marginBottom: 14 }]}>
            <Text style={s.secLbl}>Terms &amp; Conditions</Text>
            {props.termsText.split("\n").filter(Boolean).map((l, i) => (
              <Text key={i} style={s.termItem}>– {l}</Text>
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
        </View>

        <Text style={s.footer}>{props.footerText}</Text>
      </Page>
    </Document>
  );
}
