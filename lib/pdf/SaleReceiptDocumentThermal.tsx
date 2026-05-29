/**
 * Receipt – Thermal template
 * Mimics 80mm thermal receipt paper: narrow, centre-aligned, text-dense.
 * Great for POS printers.
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

const s = StyleSheet.create({
  // 80mm = 226pt; use explicit padding props (react-pdf doesn't support shorthand strings)
  page:      { paddingTop: 20, paddingBottom: 20, paddingLeft: 14, paddingRight: 14, fontSize: 9, color: "#111", backgroundColor: "#fff" },
  company:   { fontSize: 13, fontWeight: 700, textAlign: "center", marginBottom: 2 },
  line:      { fontSize: 8.2, color: "#444", textAlign: "center", marginBottom: 1 },
  dashedDiv: { borderBottom: "1 dashed #bbb", marginTop: 6, marginBottom: 6 },
  solidDiv:  { borderBottom: "1 solid #333", marginTop: 4, marginBottom: 4 },
  receiptLbl:{ fontSize: 11, fontWeight: 700, textAlign: "center", marginBottom: 3, letterSpacing: 0.5 },
  metaRow:   { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  metaLbl:   { fontSize: 8, color: "#666" },
  metaVal:   { fontSize: 8.5, fontWeight: 600 },
  itemRow:   { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  itemName:  { flex: 1, fontSize: 9, color: "#111" },
  itemQtyAmt:{ flexDirection: "row", gap: 8, alignItems: "center" },
  itemQty:   { fontSize: 8.5, color: "#555" },
  itemAmt:   { fontSize: 9, fontWeight: 600, minWidth: 60, textAlign: "right" },
  totalRow:  { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  totalLbl:  { fontSize: 8.5, color: "#555" },
  totalVal:  { fontSize: 9, fontWeight: 600 },
  grandRow:  { flexDirection: "row", justifyContent: "space-between", marginTop: 4, marginBottom: 2 },
  grandLbl:  { fontSize: 12, fontWeight: 700 },
  grandVal:  { fontSize: 13, fontWeight: 700 },
  payLabel:  { fontSize: 8, color: "#666", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  payRow:    { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  payMth:    { fontSize: 8.2, color: "#444", flex: 1 },
  payAmt:    { fontSize: 8.5, fontWeight: 600 },
  thanks:    { textAlign: "center", fontSize: 10, fontWeight: 700, marginTop: 8, marginBottom: 1 },
  website:   { textAlign: "center", fontSize: 7.8, color: "#666", marginBottom: 1 },
  farewell:  { textAlign: "center", fontSize: 7.8, color: "#888" },
});

export function SaleReceiptDocumentThermal({ sale, branding }: { sale: Sale; branding: Branding }) {
  const currency = normalizeCurrency(sale.currency, getAppCurrency());
  return (
    <Document title={`Receipt ${sale.saleNumber}`}>
      {/* 80mm width × generous height for variable-length receipts */}
      <Page size={{ width: 226, height: 900 }} style={s.page}>

        {/* ── Company header ── */}
        <Text style={s.company}>{branding?.companyName || "Store"}</Text>
        {branding?.companyAddressLine1 ? <Text style={s.line}>{branding.companyAddressLine1}</Text> : null}
        {branding?.companyAddressLine2 ? <Text style={s.line}>{branding.companyAddressLine2}</Text> : null}
        {branding?.companyContacts     ? <Text style={s.line}>{branding.companyContacts}</Text>     : null}
        {branding?.companyEmail        ? <Text style={s.line}>{branding.companyEmail}</Text>        : null}
        {branding?.companyWebsite      ? <Text style={s.line}>{branding.companyWebsite}</Text>      : null}

        <View style={s.dashedDiv} />

        {/* ── Receipt meta ── */}
        <Text style={s.receiptLbl}>{branding?.documentTitle || "RECEIPT"}</Text>
        <View style={s.metaRow}><Text style={s.metaLbl}>No.</Text><Text style={s.metaVal}>{sale.saleNumber}</Text></View>
        <View style={s.metaRow}><Text style={s.metaLbl}>Date</Text><Text style={s.metaVal}>{sale.createdAt.toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })}</Text></View>
        <View style={s.metaRow}><Text style={s.metaLbl}>Customer</Text><Text style={s.metaVal}>{sale.client?.fullName ?? "Walk-in"}</Text></View>
        {sale.client?.phone ? <View style={s.metaRow}><Text style={s.metaLbl}>Phone</Text><Text style={s.metaVal}>{sale.client.phone}</Text></View> : null}
        {sale.branch        ? <View style={s.metaRow}><Text style={s.metaLbl}>Branch</Text><Text style={s.metaVal}>{sale.branch.name}</Text></View>  : null}

        <View style={s.solidDiv} />

        {/* ── Items ── */}
        {sale.items.map((it) => (
          <View style={s.itemRow} key={it.id}>
            <Text style={s.itemName}>{it.description}</Text>
            <View style={s.itemQtyAmt}>
              <Text style={s.itemQty}>×{it.quantity}</Text>
              <Text style={s.itemAmt}>{formatMoney(it.lineTotal, currency)}</Text>
            </View>
          </View>
        ))}

        <View style={s.solidDiv} />

        {/* ── Totals ── */}
        <View style={s.totalRow}><Text style={s.totalLbl}>Subtotal</Text><Text style={s.totalVal}>{formatMoney(sale.subtotal, currency)}</Text></View>
        {sale.discountAmount > 0 ? <View style={s.totalRow}><Text style={s.totalLbl}>Discount</Text><Text style={s.totalVal}>-{formatMoney(sale.discountAmount, currency)}</Text></View> : null}
        {sale.vatAmount > 0       ? <View style={s.totalRow}><Text style={s.totalLbl}>VAT</Text><Text style={s.totalVal}>{formatMoney(sale.vatAmount, currency)}</Text></View>           : null}
        <View style={s.dashedDiv} />
        <View style={s.grandRow}><Text style={s.grandLbl}>TOTAL</Text><Text style={s.grandVal}>{formatMoney(sale.totalAmount, currency)}</Text></View>

        {/* ── Payments ── */}
        {sale.payments.length > 0 ? (
          <>
            <View style={s.dashedDiv} />
            <Text style={s.payLabel}>Payment</Text>
            {sale.payments.map((p) => (
              <View style={s.payRow} key={p.id}>
                <Text style={s.payMth}>{p.method.replaceAll("_", " ")}{p.reference ? ` · ${p.reference}` : ""}</Text>
                <Text style={s.payAmt}>{formatMoney(p.amount, currency)}</Text>
              </View>
            ))}
          </>
        ) : null}

        <View style={s.dashedDiv} />

        {/* ── Footer ── */}
        <Text style={s.thanks}>Thank you!</Text>
        {branding?.companyWebsite ? <Text style={s.website}>{branding.companyWebsite}</Text> : null}
        <Text style={s.farewell}>Please come again</Text>
      </Page>
    </Document>
  );
}
