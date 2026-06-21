import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatMoney, getAppCurrency, normalizeCurrency } from "@/lib/currency";

const C = { ink: "#0a0a0a", body: "#1c1917", muted: "#78716c", faint: "#a8a29e", rule: "#d6d3d1", accent: "#b08968", green: "#16a34a" };
const F = { display: 20, title: 13, heading: 10.5, body: 9, label: 7.5, micro: 6.5 };

const s = StyleSheet.create({
  page: { paddingHorizontal: 36, paddingVertical: 32, fontSize: F.body, fontFamily: "Helvetica", color: C.body },

  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  brandName: { fontSize: F.title, fontFamily: "Helvetica-Bold", color: C.ink, letterSpacing: 0.6 },
  brandSub: { fontSize: F.label, color: C.muted, marginTop: 1 },
  brandContact: { fontSize: F.label, color: C.faint, marginTop: 2 },
  docTitle: { fontSize: F.display, fontFamily: "Helvetica-Bold", color: C.ink, textAlign: "right" },
  docMeta: { fontSize: F.label, color: C.muted, textAlign: "right", marginTop: 2 },
  paidTag: { fontSize: F.heading, fontFamily: "Helvetica-Bold", color: C.green, textTransform: "uppercase", letterSpacing: 1.5, textAlign: "right", marginTop: 4 },

  accent: { borderTopWidth: 2, borderTopColor: C.accent, marginTop: 14, marginBottom: 22 },

  sectionHead: { fontSize: F.heading, fontFamily: "Helvetica-Bold", color: C.ink, letterSpacing: 0.4, marginTop: 16, marginBottom: 6, textTransform: "uppercase" },
  fieldRow: { flexDirection: "row", marginBottom: 3 },
  fieldLabel: { width: 100, fontSize: F.label, color: C.muted, textTransform: "uppercase", letterSpacing: 0.3 },
  fieldValue: { flex: 1, fontSize: F.body, fontFamily: "Helvetica-Bold", color: C.ink },

  twoCol: { flexDirection: "row", gap: 24, marginBottom: 2 },
  col: { flex: 1 },

  lightRule: { borderTopWidth: 0.5, borderTopColor: C.rule, marginTop: 10, marginBottom: 10 },

  lineItemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3, paddingBottom: 3, borderBottomWidth: 0.3, borderBottomColor: C.rule },
  lineDesc: { fontSize: F.body, color: C.body, flex: 1, paddingRight: 8 },
  lineQty: { fontSize: F.label, color: C.muted, width: 30, textAlign: "center" },
  linePrice: { fontSize: F.body, fontFamily: "Helvetica-Bold", color: C.ink, width: 70, textAlign: "right" },

  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  priceLabel: { fontSize: F.body, color: C.body },
  priceValue: { fontSize: F.body, fontFamily: "Helvetica-Bold", color: C.ink, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, paddingTop: 6, borderTopWidth: 1.5, borderTopColor: C.accent },
  totalLabel: { fontSize: F.heading, fontFamily: "Helvetica-Bold", color: C.ink },
  totalValue: { fontSize: F.title, fontFamily: "Helvetica-Bold", color: C.accent, textAlign: "right" },

  payRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  payLabel: { fontSize: F.label, color: C.muted, textTransform: "uppercase" },
  payValue: { fontSize: F.body, fontFamily: "Helvetica-Bold", color: C.ink },

  thanks: { fontSize: F.heading, fontFamily: "Helvetica-Bold", color: C.ink, textAlign: "center", marginTop: 18, letterSpacing: 0.5 },
  thanksSub: { fontSize: F.label, color: C.muted, textAlign: "center", marginTop: 2 },

  footer: { marginTop: 20, borderTopWidth: 0.5, borderTopColor: C.rule, paddingTop: 8, fontSize: F.micro, color: C.faint, textAlign: "center" },
});

type Branding = {
  documentTitle?: string | null;
  companyName?: string | null;
  companyTagline?: string | null;
  companyContacts?: string | null;
  companyEmail?: string | null;
  companyWebsite?: string | null;
  companyAddressLine1?: string | null;
  companyAddressLine2?: string | null;
  companyLogoUrl?: string | null;
  vatRatePercent?: number | null;
  termsText?: string;
  footerText?: string;
  bankName?: string | null;
  bankBranch?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
} | null;

type Sale = {
  saleNumber: string;
  status: string;
  createdAt: Date;
  currency?: string | null;
  branch: { name: string } | null;
  client: { fullName: string; phone: string | null } | null;
  subtotal: number;
  discountAmount: number;
  vatAmount: number;
  totalAmount: number;
  paidAmount: number;
  items: Array<{ id: string; description: string; quantity: number; unitPrice: number; lineTotal: number; sku?: string | null }>;
  payments: Array<{ id: string; amount: number; method: string; reference: string | null; receivedAt: Date }>;
};

export function PremiumReceiptDocument({ sale, branding }: { sale: Sale; branding: Branding }) {
  const currency = normalizeCurrency(sale.currency, getAppCurrency());
  const address = [branding?.companyAddressLine1, branding?.companyAddressLine2].filter(Boolean).join(", ");
  const balance = Math.max(0, sale.totalAmount - sale.paidAmount);
  const dateStr = sale.createdAt.toLocaleDateString("en-GB", { timeZone: "Africa/Nairobi", day: "2-digit", month: "short", year: "numeric" });
  const hasDiscount = sale.discountAmount > 0;
  const hasVat = sale.vatAmount > 0;

  return (
    <Document>
      <Page size="A4" style={s.page}>

        <View style={s.top}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {branding?.companyLogoUrl ? <Image src={branding.companyLogoUrl} style={{ width: 60, height: 30, objectFit: "contain", marginBottom: 4 }} /> : null}
            <Text style={s.brandName}>{branding?.companyName || ""}</Text>
            {branding?.companyTagline ? <Text style={s.brandSub}>{branding.companyTagline}</Text> : null}
            {(branding?.companyContacts || address) ? <Text style={s.brandContact}>{[branding?.companyContacts, address].filter(Boolean).join("  ")}</Text> : null}
          </View>
          <View>
            <Text style={s.docTitle}>Receipt</Text>
            <Text style={s.docMeta}>{sale.saleNumber}</Text>
            <Text style={s.docMeta}>{dateStr}</Text>
            <Text style={s.paidTag}>Paid</Text>
          </View>
        </View>

        <View style={s.accent} />

        <Text style={s.sectionHead}>Client</Text>
        <View style={s.twoCol}>
          <View style={s.col}>
            <View style={s.fieldRow}><Text style={s.fieldLabel}>Name</Text><Text style={s.fieldValue}>{sale.client?.fullName ?? "Walk-in Customer"}</Text></View>
            {sale.client?.phone ? <View style={s.fieldRow}><Text style={s.fieldLabel}>Phone</Text><Text style={s.fieldValue}>{sale.client.phone}</Text></View> : null}
          </View>
          <View style={s.col}>
            {sale.branch?.name ? <View style={s.fieldRow}><Text style={s.fieldLabel}>Branch</Text><Text style={s.fieldValue}>{sale.branch.name}</Text></View> : null}
          </View>
        </View>

        <Text style={s.sectionHead}>Items</Text>
        <View style={s.lineItemRow}>
          <Text style={[s.lineDesc, { fontFamily: "Helvetica-Bold", color: C.muted, fontSize: F.label, textTransform: "uppercase" }]}>Description</Text>
          <Text style={[s.lineQty, { fontFamily: "Helvetica-Bold", color: C.muted }]}>Qty</Text>
          <Text style={[s.linePrice, { fontFamily: "Helvetica-Bold", color: C.muted, fontSize: F.label }]}>Amount</Text>
        </View>
        {sale.items.map((it) => (
          <View key={it.id} style={s.lineItemRow}>
            <Text style={s.lineDesc}>{it.description}</Text>
            <Text style={s.lineQty}>{it.quantity}</Text>
            <Text style={s.linePrice}>{formatMoney(it.lineTotal, currency)}</Text>
          </View>
        ))}

        <View style={s.lightRule} />

        {(hasDiscount || hasVat) ? (
          <View>
            <View style={s.priceRow}><Text style={s.priceLabel}>Subtotal</Text><Text style={s.priceValue}>{formatMoney(sale.subtotal, currency)}</Text></View>
            {hasDiscount ? <View style={s.priceRow}><Text style={s.priceLabel}>Discount</Text><Text style={s.priceValue}>-{formatMoney(sale.discountAmount, currency)}</Text></View> : null}
            {hasVat ? <View style={s.priceRow}><Text style={s.priceLabel}>VAT ({branding?.vatRatePercent ?? 18}%)</Text><Text style={s.priceValue}>{formatMoney(sale.vatAmount, currency)}</Text></View> : null}
          </View>
        ) : null}

        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Total Paid</Text>
          <Text style={s.totalValue}>{formatMoney(sale.paidAmount, currency)}</Text>
        </View>

        {balance > 0 ? (
          <View style={s.priceRow}><Text style={[s.priceLabel, { fontFamily: "Helvetica-Bold" }]}>Balance Due</Text><Text style={[s.priceValue, { color: C.accent }]}>{formatMoney(balance, currency)}</Text></View>
        ) : null}

        {sale.payments.length > 0 ? (
          <View>
            <Text style={s.sectionHead}>Payment</Text>
            {sale.payments.map((p) => (
              <View key={p.id} style={{ marginBottom: 4 }}>
                <View style={s.payRow}>
                  <Text style={s.payLabel}>{p.method.replaceAll("_", " ")}</Text>
                  <Text style={s.payValue}>{formatMoney(p.amount, currency)}</Text>
                </View>
                {p.reference ? <Text style={{ fontSize: F.label, color: C.faint }}>Ref: {p.reference}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        <Text style={s.thanks}>Thank you</Text>
        <Text style={s.thanksSub}>We appreciate your business.</Text>

        <Text style={s.footer}>{branding?.footerText || ""}</Text>
      </Page>
    </Document>
  );
}
