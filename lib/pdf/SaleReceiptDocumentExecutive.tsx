/**
 * Receipt – Executive template
 * Dark premium format with gold accents for high-value payments.
 */
import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { formatMoney, getAppCurrency, normalizeCurrency } from "@/lib/currency";

type Branding = {
  documentTitle?: string | null; companyName?: string | null; companyContacts?: string | null;
  companyEmail?: string | null; companyWebsite?: string | null;
  companyAddressLine1?: string | null; companyAddressLine2?: string | null;
  vatRatePercent?: number | null;
} | null;

type Sale = {
  saleNumber: string; status: string; createdAt: Date; currency?: string | null;
  branch: { name: string } | null;
  client: { fullName: string; phone: string | null } | null;
  subtotal: number; discountAmount: number; vatAmount: number; totalAmount: number; paidAmount: number;
  items: Array<{ id: string; description: string; quantity: number; unitPrice: number; lineTotal: number }>;
  payments: Array<{ id: string; amount: number; method: string; reference: string | null; receivedAt: Date }>;
};

const NAVY  = "#0f172a";
const NAVY2 = "#1e293b";
const GOLD  = "#d4af37";
const GOLD2 = "#f6e27a";
const MID   = "#475569";
const LITE  = "#94a3b8";
const LINE  = "#334155";
const LINE_L= "#e2e8f0";
const BG    = "#f8fafc";
const WHITE = "#ffffff";

const s = StyleSheet.create({
  page: { padding: 0, fontSize: 9, color: NAVY, backgroundColor: BG },

  header: {
    backgroundColor: NAVY, paddingHorizontal: 28, paddingTop: 18, paddingBottom: 14,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  coName:  { fontSize: 14, fontWeight: 700, color: WHITE, marginBottom: 2 },
  coLine:  { fontSize: 7.8, color: LITE, marginBottom: 0.5 },
  docSide: { alignItems: "flex-end" },
  docTitle:{ fontSize: 24, fontWeight: 700, color: GOLD, letterSpacing: 2, marginBottom: 2 },
  docNum:  { fontSize: 9, color: LITE },
  docDate: { fontSize: 8.5, color: GOLD2, marginTop: 2 },

  goldBar: { height: 3, backgroundColor: GOLD },

  strip: {
    backgroundColor: NAVY2, paddingVertical: 8, paddingHorizontal: 28,
    flexDirection: "row", justifyContent: "space-around", marginBottom: 20,
  },
  stripItem:    { alignItems: "center" },
  stripLbl:     { fontSize: 6.8, color: LITE, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  stripVal:     { fontSize: 9.5, fontWeight: 700, color: WHITE },
  stripValGold: { fontSize: 11, fontWeight: 700, color: GOLD },

  body: { paddingHorizontal: 28 },

  table: { border: `1 solid ${LINE_L}`, borderRadius: 7, overflow: "hidden", backgroundColor: WHITE, marginBottom: 16 },
  trHead: { flexDirection: "row", backgroundColor: NAVY2, borderBottom: `1 solid ${LINE}` },
  tr:     { flexDirection: "row", borderBottom: `1 solid ${LINE_L}` },
  th:     { paddingVertical: 7, paddingHorizontal: 8, fontSize: 7.5, fontWeight: 700, textTransform: "uppercase", color: GOLD },
  td:     { paddingVertical: 6, paddingHorizontal: 8, fontSize: 9, color: NAVY },
  colItem:  { flex: 1 },
  colQty:   { width: 44, textAlign: "right" },
  colPrice: { width: 80, textAlign: "right" },
  colTotal: { width: 80, textAlign: "right" },

  totalsBox: { border: `1 solid ${LINE_L}`, borderLeft: `3 solid ${GOLD}`, borderRadius: 7, backgroundColor: WHITE, padding: 12, marginLeft: "40%", marginBottom: 16 },
  totalRow:  { flexDirection: "row", justifyContent: "space-between", marginBottom: 4, paddingBottom: 3, borderBottom: `1 solid ${LINE_L}` },
  totalLbl:  { fontSize: 9, color: MID },
  totalVal:  { fontSize: 9, fontWeight: 600, color: NAVY },
  grandRow:  { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  grandLbl:  { fontSize: 12, fontWeight: 700, color: NAVY },
  grandVal:  { fontSize: 15, fontWeight: 700, color: GOLD },

  paySection: { border: `1 solid ${LINE_L}`, borderLeft: `3 solid ${GOLD}`, borderRadius: 7, backgroundColor: WHITE, overflow: "hidden", marginBottom: 14 },
  payHead:    { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: NAVY2 },
  payTitle:   { fontSize: 7.5, fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: 0.8 },
  payRow:     { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 5, borderBottom: `1 solid ${LINE_L}` },
  payLeft:    { fontSize: 8.5, color: MID },
  payRight:   { fontSize: 9, fontWeight: 600, color: NAVY },

  footer: { marginHorizontal: 28, marginBottom: 12, borderTop: `1 solid ${LINE_L}`, paddingTop: 5, fontSize: 8, color: LITE, textAlign: "center" },
});

export function SaleReceiptDocumentExecutive({ sale, branding }: { sale: Sale; branding: Branding }) {
  const currency = normalizeCurrency(sale.currency, getAppCurrency());
  return (
    <Document title={`Receipt ${sale.saleNumber}`}>
      <Page size="A4" style={s.page}>
        {/* Dark header */}
        <View style={s.header}>
          <View>
            <Text style={s.coName}>{branding?.companyName || "Store"}</Text>
            {branding?.companyAddressLine1 ? <Text style={s.coLine}>{branding.companyAddressLine1}</Text> : null}
            {branding?.companyAddressLine2 ? <Text style={s.coLine}>{branding.companyAddressLine2}</Text> : null}
            {branding?.companyContacts ? <Text style={s.coLine}>{branding.companyContacts}</Text> : null}
            {branding?.companyEmail    ? <Text style={s.coLine}>{branding.companyEmail}</Text>    : null}
          </View>
          <View style={s.docSide}>
            <Text style={s.docTitle}>{branding?.documentTitle || "RECEIPT"}</Text>
            <Text style={s.docNum}>{sale.saleNumber}</Text>
            <Text style={s.docDate}>{sale.createdAt.toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })}</Text>
          </View>
        </View>
        <View style={s.goldBar} />

        {/* Strip */}
        <View style={s.strip}>
          <View style={s.stripItem}><Text style={s.stripLbl}>Customer</Text><Text style={s.stripVal}>{sale.client?.fullName ?? "Walk-in"}</Text></View>
          {sale.branch ? <View style={s.stripItem}><Text style={s.stripLbl}>Branch</Text><Text style={s.stripVal}>{sale.branch.name}</Text></View> : null}
          <View style={s.stripItem}><Text style={s.stripLbl}>Status</Text><Text style={s.stripVal}>{sale.status}</Text></View>
          <View style={s.stripItem}><Text style={s.stripLbl}>Amount Paid</Text><Text style={s.stripValGold}>{formatMoney(sale.paidAmount, currency)}</Text></View>
        </View>

        <View style={s.body}>
          {/* Items */}
          <View style={s.table}>
            <View style={s.trHead}>
              <Text style={[s.th, s.colItem]}>Item</Text>
              <Text style={[s.th, s.colQty]}>Qty</Text>
              <Text style={[s.th, s.colPrice]}>Price</Text>
              <Text style={[s.th, s.colTotal]}>Total</Text>
            </View>
            {sale.items.length === 0 ? (
              <View style={s.tr}><Text style={[s.td, s.colItem]}>No items</Text><Text style={[s.td, s.colQty]}>-</Text><Text style={[s.td, s.colPrice]}>-</Text><Text style={[s.td, s.colTotal]}>-</Text></View>
            ) : sale.items.map((it) => (
              <View key={it.id} style={s.tr}>
                <Text style={[s.td, s.colItem]}>{it.description}</Text>
                <Text style={[s.td, s.colQty]}>{String(it.quantity)}</Text>
                <Text style={[s.td, s.colPrice]}>{formatMoney(it.unitPrice, currency)}</Text>
                <Text style={[s.td, s.colTotal]}>{formatMoney(it.lineTotal, currency)}</Text>
              </View>
            ))}
          </View>

          {/* Totals */}
          <View style={s.totalsBox}>
            <View style={s.totalRow}><Text style={s.totalLbl}>Subtotal</Text><Text style={s.totalVal}>{formatMoney(sale.subtotal, currency)}</Text></View>
            {sale.discountAmount > 0 ? <View style={s.totalRow}><Text style={s.totalLbl}>Discount</Text><Text style={s.totalVal}>-{formatMoney(sale.discountAmount, currency)}</Text></View> : null}
            {sale.vatAmount > 0 ? <View style={s.totalRow}><Text style={s.totalLbl}>VAT</Text><Text style={s.totalVal}>{formatMoney(sale.vatAmount, currency)}</Text></View> : null}
            <View style={s.grandRow}><Text style={s.grandLbl}>TOTAL</Text><Text style={s.grandVal}>{formatMoney(sale.totalAmount, currency)}</Text></View>
          </View>

          {/* Payments */}
          {sale.payments.length > 0 ? (
            <View style={s.paySection}>
              <View style={s.payHead}><Text style={s.payTitle}>Payment Record</Text></View>
              {sale.payments.map((p) => (
                <View key={p.id} style={s.payRow}>
                  <Text style={s.payLeft}>{p.method.replaceAll("_", " ")}{p.reference ? ` · ${p.reference}` : ""} · {p.receivedAt.toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })}</Text>
                  <Text style={s.payRight}>{formatMoney(p.amount, currency)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <Text style={s.footer}>Thank you for your business{branding?.companyWebsite ? ` · ${branding.companyWebsite}` : ""}.</Text>
      </Page>
    </Document>
  );
}
