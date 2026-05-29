/**
 * Invoice – Executive template
 * Dark slate/charcoal header, gold accent, premium feel for enterprise clients.
 */
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { LineItemsTable, type PdfLineItem } from "./pdf-line-items";

const NAVY  = "#0f172a";
const SLATE = "#1e293b";
const GOLD  = "#d4af37";
const GOLD2 = "#f6e27a";
const MID   = "#475569";
const LITE  = "#94a3b8";
const LINE_L= "#e2e8f0";
const BG    = "#f8fafc";
const WHITE = "#ffffff";

const s = StyleSheet.create({
  page: { padding: 0, fontSize: 8.8, color: NAVY, backgroundColor: BG },

  // ── dark header ──────────────────────────────────────────────────────────────
  header: {
    backgroundColor: NAVY,
    paddingHorizontal: 28, paddingTop: 20, paddingBottom: 16,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  logo:   { width: 56, height: 56, marginRight: 12 },
  coRow:  { flexDirection: "row", alignItems: "center" },
  coName: { fontSize: 14, fontWeight: 700, color: WHITE, marginBottom: 2 },
  coTag:  { fontSize: 8.2, color: GOLD, fontWeight: 600, marginBottom: 2 },
  coLine: { fontSize: 7.8, color: LITE, marginBottom: 1 },
  docSide:{ alignItems: "flex-end" },
  docLbl: { fontSize: 8, color: LITE, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 2 },
  docType:{ fontSize: 28, fontWeight: 700, color: GOLD, letterSpacing: 2, marginBottom: 3 },
  docNum: { fontSize: 9, color: GOLD2, fontWeight: 600 },

  // ── gold accent bar ───────────────────────────────────────────────────────────
  goldBar: { backgroundColor: GOLD, height: 4 },

  // ── dark meta strip ───────────────────────────────────────────────────────────
  metaStrip: {
    backgroundColor: SLATE,
    flexDirection: "row", justifyContent: "space-around",
    paddingVertical: 9, paddingHorizontal: 28, marginBottom: 20,
  },
  metaItem:    { alignItems: "center" },
  metaLbl:     { fontSize: 6.8, color: LITE, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  metaVal:     { fontSize: 9.5, fontWeight: 700, color: WHITE },
  metaValGold: { fontSize: 12, fontWeight: 700, color: GOLD2 },

  body: { paddingHorizontal: 28 },

  // ── cards ─────────────────────────────────────────────────────────────────────
  grid: { flexDirection: "row", gap: 12, marginBottom: 14 },
  card: { flex: 1, border: `1 solid ${LINE_L}`, borderRadius: 6, backgroundColor: WHITE, padding: 10, borderLeft: `3 solid ${GOLD}` },
  secLbl: { fontSize: 7.2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: NAVY, marginBottom: 6 },

  row:  { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5, borderBottom: `1 solid ${LINE_L}` },
  rlbl: { fontSize: 8.2, color: MID },
  rval: { fontSize: 8.4, fontWeight: 600, color: NAVY, maxWidth: "60%", textAlign: "right" },

  wideCard: { border: `1 solid ${LINE_L}`, borderRadius: 6, backgroundColor: WHITE, padding: 10, marginBottom: 14, borderLeft: `3 solid ${GOLD}` },

  costCard: { border: `1 solid ${LINE_L}`, borderRadius: 6, backgroundColor: WHITE, padding: 10, marginBottom: 14, marginLeft: "30%", borderLeft: `3 solid ${GOLD}` },
  costRow:  { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottom: `1 solid ${LINE_L}` },
  costLbl:  { fontSize: 8.4, color: MID },
  costVal:  { fontSize: 8.8, fontWeight: 600, color: NAVY },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  totalLbl: { fontSize: 11, fontWeight: 700, color: NAVY },
  totalVal: { fontSize: 14, fontWeight: 700, color: GOLD },

  termItem: { fontSize: 8.2, color: MID, marginBottom: 3 },

  sigRow:  { flexDirection: "row", gap: 16, marginTop: 16 },
  sigCol:  { flex: 1, border: `1 solid ${LINE_L}`, borderRadius: 4, padding: 10, backgroundColor: WHITE, borderTop: `2 solid ${GOLD}` },
  sigLine: { borderBottom: `1 solid ${LINE_L}`, marginTop: 22, marginBottom: 4 },
  sigName: { fontSize: 8.5, fontWeight: 700, color: NAVY, marginBottom: 2 },
  sigLbl:  { fontSize: 7.5, color: LITE },

  footer: { marginTop: 12, borderTop: `1 solid ${LINE_L}`, paddingTop: 6, fontSize: 7.5, color: LITE, textAlign: "center", marginHorizontal: 28, marginBottom: 12 },
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

const LI_COLORS_EXEC = {
  headerBg:    NAVY,
  headerText:  GOLD,
  rowBorderBg: LINE_L,
  altRowBg:    BG,
  totalAccent: GOLD,
  labelMuted:  MID,
};

export function InvoiceDocumentExecutive(props: Props) {
  const isRepairMode  = !props.documentMode || props.documentMode === "REPAIR";
  const showLineItems = Boolean(props.lineItems?.length);

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Dark header ── */}
        <View style={s.header}>
          <View style={s.coRow}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {props.companyLogoUrl ? <Image style={s.logo} src={props.companyLogoUrl} /> : null}
            <View>
              <Text style={s.coName}>{props.companyName}</Text>
              {props.companyTagline ? <Text style={s.coTag}>{props.companyTagline}</Text> : null}
              <Text style={s.coLine}>{props.companyAddressLine1}</Text>
              <Text style={s.coLine}>{props.companyAddressLine2}</Text>
              <Text style={s.coLine}>{props.companyContacts}{props.companyEmail ? ` · ${props.companyEmail}` : ""}</Text>
              {props.companyWebsite ? <Text style={s.coLine}>{props.companyWebsite}</Text> : null}
            </View>
          </View>
          <View style={s.docSide}>
            <Text style={s.docLbl}>Document</Text>
            <Text style={s.docType}>{props.documentTitle}</Text>
            <Text style={s.docNum}>{props.quotationNumber}</Text>
          </View>
        </View>
        <View style={s.goldBar} />

        {/* ── Meta strip ── */}
        <View style={s.metaStrip}>
          <View style={s.metaItem}><Text style={s.metaLbl}>Date Issued</Text><Text style={s.metaVal}>{props.dateIssued}</Text></View>
          <View style={s.metaItem}><Text style={s.metaLbl}>Valid Until</Text><Text style={s.metaVal}>{props.validUntil}</Text></View>
          <View style={s.metaItem}><Text style={s.metaLbl}>Repair ID</Text><Text style={s.metaVal}>{props.repairId}</Text></View>
          <View style={s.metaItem}><Text style={s.metaLbl}>Total Payable</Text><Text style={s.metaValGold}>{props.totalAmountPayable}</Text></View>
          <View style={s.metaItem}><Text style={s.metaLbl}>Status</Text><Text style={s.metaVal}>{props.status}</Text></View>
        </View>

        <View style={s.body}>
          {/* ── Client + Device + Prepared ── */}
          <View style={s.grid}>
            <View style={s.card}>
              <Text style={s.secLbl}>Bill To</Text>
              <View style={s.row}><Text style={s.rlbl}>Client</Text><Text style={s.rval}>{props.clientName}</Text></View>
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
              colors={LI_COLORS_EXEC}
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
            <View style={s.wideCard}>
              <Text style={s.secLbl}>Diagnosis &amp; Work</Text>
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
          <View style={[s.wideCard, { marginBottom: 14 }]}>
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
