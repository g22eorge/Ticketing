/**
 * EagleInfoDocument — Default document template matching Eagle Info's house style.
 *
 * Layout (matches Quote_EISL-000014.pdf):
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  [Logo]  Company Name            Estimate / Invoice  │
 *   │  Address · Phone · Email         #EISL-000014        │
 *   │                                  BALANCE DUE         │
 *   │                                  UGX 21,800,000      │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  TO                     Quote Date:  May 29, 2026    │
 *   │  AVSI Foundation        Terms:       30 Days         │
 *   │  email · location       Due Date:    -               │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  #  ITEM & DESCRIPTION      QTY      RATE     AMOUNT │
 *   │  1  Adobe CC 2025                    …        …      │
 *   │     SKU: EIS008SXX001                                 │
 *   │                              Sub Total  UGX …        │
 *   │                              Total      UGX …        │
 *   │                              Paid       UGX …        │
 *   │                              Balance    UGX …        │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  NOTES                   TERMS & CONDITIONS           │
 *   │  note text               terms text                  │
 *   │  PAYMENT TO                                           │
 *   │  bank details                                         │
 *   └──────────────────────────────────────────────────────────┘
 */
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

// ── Palette ────────────────────────────────────────────────────────────────────
const INK      = "#0f172a";   // near-black body text
const MUTED    = "#6B7280";   // grey labels
const DIVIDER  = "#E5E7EB";   // thin rule
const WHITE    = "#FFFFFF";
const LABEL_SZ = 7;           // caps section-label font size

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    paddingHorizontal: 36,
    paddingVertical: 36,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: INK,
    backgroundColor: WHITE,
  },

  // ── Header ──
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  headerLeft: { flex: 1, paddingRight: 28 },
  logo: { width: 72, height: 36, marginBottom: 6, objectFit: "contain" },
  companyName: { fontSize: 13.5, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  companyLine: { fontSize: 8.5, color: MUTED, marginBottom: 1.5 },
  phoneEmailRow: { flexDirection: "row", gap: 4, marginBottom: 1.5 },
  companyLineLabel: { fontSize: 8, color: INK, fontFamily: "Helvetica-Bold", width: 42 },

  headerRight: { width: 175, alignItems: "flex-end" },
  docTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  docNumber: { fontSize: 8.5, color: MUTED, marginBottom: 8 },
  balanceBox: { borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 7, alignItems: "flex-end", width: "100%" },
  balanceLabel: { fontSize: LABEL_SZ, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  balanceAmount: { fontSize: 15, fontFamily: "Helvetica-Bold" },

  // ── Divider ──
  hr: { borderTopWidth: 1, borderTopColor: DIVIDER, marginBottom: 14 },

  // ── Client / dates row ──
  toDateRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  toBlock: { flex: 1 },
  toLabel: { fontSize: LABEL_SZ, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 },
  toName: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  toLine: { fontSize: 8.5, color: MUTED, marginBottom: 1.5 },
  datesBlock: { width: 220 },
  dateRow: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: DIVIDER, paddingVertical: 4 },
  dateLabel: { fontSize: 8.5, color: MUTED },
  dateValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },

  // ── Line-items table ──
  table: { marginBottom: 6 },
  tableHead: { flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: INK, paddingBottom: 4, marginBottom: 0 },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.4 },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: DIVIDER, paddingVertical: 7 },
  colNum:   { width: 22 },
  colDesc:  { flex: 1, paddingRight: 8 },
  colQty:   { width: 38, textAlign: "center" },
  colRate:  { width: 100, textAlign: "right" },
  colAmt:   { width: 110, textAlign: "right" },
  itemName: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  itemSku:  { fontSize: 7.5, color: MUTED },

  // ── Totals ──
  totalsWrap: { marginTop: 8, marginLeft: "auto", width: 260 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: DIVIDER },
  totalLabel: { fontSize: 9, color: MUTED },
  totalValue: { fontSize: 9, textAlign: "right" },
  totalRowBold: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  totalLabelBold: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  totalValueBold: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "right" },
  balanceBoxFooter: { borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 7, alignItems: "flex-end", width: "100%", marginTop: 8 },

  // ── Footer ──
  footerDivider: { borderTopWidth: 1, borderTopColor: DIVIDER, marginTop: 20, marginBottom: 14 },
  footer: { flexDirection: "row", gap: 32 },
  footerLeft: { flex: 1 },
  footerRight: { flex: 1 },
  footerLabel: { fontSize: LABEL_SZ, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 },
  footerText: { fontSize: 8.5, color: INK, lineHeight: 1.5, marginBottom: 10 },
  bankName: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  bankLine: { fontSize: 8.5, color: INK, marginBottom: 1.5 },
});

// ── Types ──────────────────────────────────────────────────────────────────────

export type EagleInfoLineItem = {
  name: string;
  sku?: string | null;
  quantity: number;
  rate: string;       // pre-formatted
  amount: string;     // pre-formatted
};

export type EagleInfoDocumentProps = {
  // Company
  companyName: string;
  companyAddress: string;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyLogoUrl?: string | null;

  // Document meta
  docTitle: string;          // "Estimate" | "Invoice" | "Receipt" | "Credit Note"
  docNumber: string;
  docDate: string;
  terms?: string | null;     // "30 Days"
  dueDate?: string | null;

  // Client
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientLocation?: string | null;

  // Line items
  lineItems: EagleInfoLineItem[];

  // Totals
  subTotal?: string | null;
  vatLabel?: string | null;   // e.g. "VAT (18%)"
  vatAmount?: string | null;  // pre-formatted
  totalLabel?: string;        // "Total"
  totalAmount: string;
  paymentMade?: string | null;
  balanceDue: string;

  // Footer
  notes?: string | null;
  paymentTo?: string | null; // multi-line bank details
  termsText?: string | null;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function EagleInfoDocument(props: EagleInfoDocumentProps) {
  const {
    companyName, companyAddress, companyPhone, companyEmail, companyLogoUrl,
    docTitle, docNumber, docDate, terms, dueDate,
    clientName, clientEmail, clientPhone, clientLocation,
    lineItems,
    subTotal, vatLabel, vatAmount, totalLabel = "Total", totalAmount, paymentMade, balanceDue,
    notes, paymentTo, termsText,
  } = props;

  const dateRows = [
    { label: `${docTitle} Date:`, value: docDate },
    { label: "Terms:",            value: terms || "-" },
    { label: "Due Date:",         value: dueDate || "-" },
  ];

  // Bank details: split on newlines
  const bankLines = (paymentTo ?? "").split("\n").map(l => l.trim()).filter(Boolean);
  const bankName  = bankLines[0] ?? "";
  const bankRest  = bankLines.slice(1);

  return (
    <Document title={`${docTitle} ${docNumber}`}>
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.header}>
          {/* Left: logo + company */}
          <View style={s.headerLeft}>
            {companyLogoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image style={s.logo} src={companyLogoUrl} />
            ) : null}
            <Text style={s.companyName}>{companyName}</Text>
            <Text style={s.companyLine}>{companyAddress}</Text>
            {companyPhone ? (
              <View style={s.phoneEmailRow}>
                <Text style={s.companyLineLabel}>PHONE:</Text>
                <Text style={s.companyLine}>{companyPhone}</Text>
              </View>
            ) : null}
            {companyEmail ? (
              <View style={s.phoneEmailRow}>
                <Text style={s.companyLineLabel}>EMAIL:</Text>
                <Text style={s.companyLine}>{companyEmail}</Text>
              </View>
            ) : null}
          </View>

          {/* Right: doc type + balance */}
          <View style={s.headerRight}>
            <Text style={s.docTitle}>{docTitle}</Text>
            <Text style={s.docNumber}>#{docNumber}</Text>
            <View style={s.balanceBox}>
              <Text style={s.balanceLabel}>Balance Due</Text>
              <Text style={s.balanceAmount}>{balanceDue}</Text>
            </View>
          </View>
        </View>

        {/* ── Divider ── */}
        <View style={s.hr} />

        {/* ── Client / Dates ── */}
        <View style={s.toDateRow}>
          <View style={s.toBlock}>
            <Text style={s.toLabel}>To</Text>
            <Text style={s.toName}>{clientName}</Text>
            {clientEmail   ? <Text style={s.toLine}>{clientEmail}</Text>   : null}
            {clientPhone   ? <Text style={s.toLine}>{clientPhone}</Text>   : null}
            {clientLocation? <Text style={s.toLine}>{clientLocation}</Text>: null}
          </View>
          <View style={s.datesBlock}>
            {dateRows.map((dr, i) => (
              <View key={i} style={s.dateRow}>
                <Text style={s.dateLabel}>{dr.label}</Text>
                <Text style={s.dateValue}>{dr.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Line items table ── */}
        <View style={s.table}>
          {/* Header row */}
          <View style={s.tableHead}>
            <Text style={[s.th, s.colNum]}>#</Text>
            <Text style={[s.th, s.colDesc]}>Item &amp; Description</Text>
            <Text style={[s.th, s.colQty]}>Qty</Text>
            <Text style={[s.th, s.colRate]}>Rate</Text>
            <Text style={[s.th, s.colAmt]}>Amount</Text>
          </View>

          {/* Data rows */}
          {lineItems.map((item, idx) => (
            <View key={idx} style={s.tableRow}>
              <Text style={[{ fontSize: 9 }, s.colNum]}>{idx + 1}</Text>
              <View style={s.colDesc}>
                <Text style={s.itemName}>{item.name}</Text>
                {item.sku ? <Text style={s.itemSku}>SKU: {item.sku}</Text> : null}
              </View>
              <Text style={[{ fontSize: 9 }, s.colQty]}>{String(item.quantity)}</Text>
              <Text style={[{ fontSize: 9, color: MUTED }, s.colRate]}>{item.rate}</Text>
              <Text style={[{ fontSize: 9 }, s.colAmt]}>{item.amount}</Text>
            </View>
          ))}
        </View>

        {/* ── Totals ──Hall only Sub Total, VAT, Total (no Balance Due) ── */}
        <View style={s.totalsWrap}>
          {subTotal ? (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Sub Total</Text>
              <Text style={s.totalValue}>{subTotal}</Text>
            </View>
          ) : null}
          {vatLabel && vatAmount ? (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>{vatLabel}</Text>
              <Text style={s.totalValue}>{vatAmount}</Text>
            </View>
          ) : null}
          <View style={s.totalRowBold}>
            <Text style={s.totalLabelBold}>{totalLabel}</Text>
            <Text style={s.totalValueBold}>{totalAmount}</Text>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={s.footerDivider} />
        <View style={s.footer}>
          {/* Left: notes + payment to + terms */}
          <View style={s.footerLeft}>
            {notes ? (
              <>
                <Text style={s.footerLabel}>Notes</Text>
                <Text style={s.footerText}>{notes}</Text>
              </>
            ) : null}
            {bankLines.length > 0 ? (
              <>
                <Text style={s.footerLabel}>Payment To</Text>
                {bankName ? <Text style={s.bankName}>{bankName}</Text> : null}
                {bankRest.map((line, i) => (
                  <Text key={i} style={s.bankLine}>{line}</Text>
                ))}
              </>
            ) : null}
            {termsText ? (
              <>
                <Text style={s.footerLabel}>Terms &amp; Conditions</Text>
                <Text style={s.footerText}>{termsText}</Text>
              </>
            ) : null}
          </View>

          {/* Right: balance due */}
          <View style={s.footerRight}>
            <View style={s.balanceBoxFooter}>
              <Text style={s.balanceLabel}>Balance Due</Text>
              <Text style={s.balanceAmount}>{balanceDue}</Text>
            </View>
          </View>
        </View>

      </Page>
    </Document>
  );
}
