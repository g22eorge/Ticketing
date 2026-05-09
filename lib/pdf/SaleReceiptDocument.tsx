import React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import { formatMoney, getAppCurrency } from "@/lib/currency";

type Branding = {
  documentTitle?: string | null;
  companyName?: string | null;
  companyContacts?: string | null;
  companyEmail?: string | null;
  companyWebsite?: string | null;
  companyAddressLine1?: string | null;
  companyAddressLine2?: string | null;
  vatRatePercent?: number | null;
} | null;

type Sale = {
  saleNumber: string;
  status: string;
  createdAt: Date;
  branch: { name: string } | null;
  client: { fullName: string; phone: string | null } | null;
  subtotal: number;
  discountAmount: number;
  vatAmount: number;
  totalAmount: number;
  paidAmount: number;
  items: Array<{ id: string; description: string; quantity: number; unitPrice: number; lineTotal: number }>;
  payments: Array<{ id: string; amount: number; method: string; reference: string | null; receivedAt: Date }>;
};

export function SaleReceiptDocument({
  sale,
  branding,
}: {
  sale: Sale;
  branding: Branding;
}) {
  const currency = getAppCurrency();
  const title = branding?.documentTitle || branding?.companyName || "Receipt";
  const companyLine = [branding?.companyName, branding?.companyContacts, branding?.companyEmail, branding?.companyWebsite]
    .filter(Boolean)
    .join(" · ");
  const addressLine = [branding?.companyAddressLine1, branding?.companyAddressLine2].filter(Boolean).join(" · ");

  return (
    <Document title={`Receipt ${sale.saleNumber}`}> 
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {companyLine ? <Text style={styles.muted}>{companyLine}</Text> : null}
          {addressLine ? <Text style={styles.muted}>{addressLine}</Text> : null}
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Receipt</Text>
            <Text style={styles.metaValue}>{sale.saleNumber}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>{sale.createdAt.toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Branch</Text>
            <Text style={styles.metaValue}>{sale.branch?.name ?? "-"}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaColWide}>
            <Text style={styles.metaLabel}>Customer</Text>
            <Text style={styles.metaValue}>{sale.client?.fullName ?? "Walk-in"}</Text>
            {sale.client?.phone ? <Text style={styles.muted}>{sale.client.phone}</Text> : null}
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Status</Text>
            <Text style={styles.metaValue}>{sale.status}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.trHead}>
            <Text style={[styles.th, styles.colItem]}>Item</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colPrice]}>Price</Text>
            <Text style={[styles.th, styles.colTotal]}>Total</Text>
          </View>

          {sale.items.length === 0 ? (
            <View style={styles.tr}>
              <Text style={[styles.td, styles.colItem]}>No items</Text>
              <Text style={[styles.td, styles.colQty]}>-</Text>
              <Text style={[styles.td, styles.colPrice]}>-</Text>
              <Text style={[styles.td, styles.colTotal]}>-</Text>
            </View>
          ) : (
            sale.items.map((it) => (
              <View key={it.id} style={styles.tr}>
                <Text style={[styles.td, styles.colItem]}>{it.description}</Text>
                <Text style={[styles.td, styles.colQty]}>{String(it.quantity)}</Text>
                <Text style={[styles.td, styles.colPrice]}>{formatMoney(it.unitPrice, currency)}</Text>
                <Text style={[styles.td, styles.colTotal]}>{formatMoney(it.lineTotal, currency)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatMoney(sale.subtotal, currency)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Discount</Text>
            <Text style={styles.totalValue}>{formatMoney(Math.max(0, sale.discountAmount), currency)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>VAT</Text>
            <Text style={styles.totalValue}>{formatMoney(sale.vatAmount, currency)}</Text>
          </View>
          <View style={[styles.totalRow, styles.totalRowStrong]}>
            <Text style={styles.totalLabelStrong}>Total</Text>
            <Text style={styles.totalValueStrong}>{formatMoney(sale.totalAmount, currency)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Paid</Text>
            <Text style={styles.totalValue}>{formatMoney(sale.paidAmount, currency)}</Text>
          </View>
        </View>

        {sale.payments.length ? (
          <View style={styles.payments}>
            <Text style={styles.sectionLabel}>Payments</Text>
            {sale.payments.map((p) => (
              <View key={p.id} style={styles.paymentRow}>
                <Text style={styles.paymentLeft}>
                  {p.receivedAt.toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })} · {p.method.replaceAll("_", " ")}
                  {p.reference ? ` · ${p.reference}` : ""}
                </Text>
                <Text style={styles.paymentRight}>{formatMoney(p.amount, currency)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.footer}>Thank you.</Text>
      </Page>
    </Document>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 10,
    color: "#111",
  },
  header: {
    marginBottom: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 4,
  },
  muted: {
    color: "#555",
    fontSize: 9,
    lineHeight: 1.25,
  },
  metaRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
  },
  metaCol: {
    flexGrow: 1,
  },
  metaColWide: {
    flexGrow: 2,
  },
  metaLabel: {
    fontSize: 8,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  metaValue: {
    fontSize: 10,
    fontWeight: 600,
    marginTop: 2,
  },
  table: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    overflow: "hidden",
  },
  trHead: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  th: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#666",
  },
  td: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    fontSize: 10,
  },
  colItem: { flexGrow: 1, flexBasis: 0 },
  colQty: { width: 50, textAlign: "right" },
  colPrice: { width: 90, textAlign: "right" },
  colTotal: { width: 90, textAlign: "right" },
  totals: {
    marginTop: 12,
    marginLeft: "auto",
    width: 220,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    padding: 10,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  totalRowStrong: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  totalLabel: { color: "#555" },
  totalValue: { fontWeight: 600 },
  totalLabelStrong: { fontWeight: 700 },
  totalValueStrong: { fontWeight: 700 },
  payments: {
    marginTop: 12,
  },
  sectionLabel: {
    fontSize: 8,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  paymentLeft: { color: "#444" },
  paymentRight: { fontWeight: 600 },
  footer: {
    marginTop: 18,
    textAlign: "center",
    color: "#666",
    fontSize: 9,
  },
});
