/**
 * Payment receipt — Eagle Info house style.
 * Matches the clean white design from Quote_EISL-000014.pdf.
 */
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const INK     = "#0f172a";
const MUTED   = "#6B7280";
const DIVIDER = "#E5E7EB";
const WHITE   = "#FFFFFF";
const LABEL   = 7;

const s = StyleSheet.create({
  page: { paddingHorizontal: 40, paddingVertical: 36, fontSize: 9, fontFamily: "Helvetica", color: INK, backgroundColor: WHITE },

  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  headerLeft: { flex: 1, paddingRight: 24 },
  logo: { width: 72, height: 36, marginBottom: 6, objectFit: "contain" },
  companyName: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  companyLine: { fontSize: 8, color: MUTED, marginBottom: 1.5 },
  infoRow: { flexDirection: "row", gap: 4, marginBottom: 1.5 },
  infoLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", width: 38 },

  headerRight: { width: 180, alignItems: "flex-end" },
  docTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  docNumber: { fontSize: 8.5, color: MUTED, marginBottom: 8 },
  balanceBox: { borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 7, alignItems: "flex-end", width: "100%" },
  balanceLabel: { fontSize: LABEL, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  balanceAmount: { fontSize: 15, fontFamily: "Helvetica-Bold" },

  hr: { borderTopWidth: 1, borderTopColor: DIVIDER, marginBottom: 18 },

  // Details table
  detailsWrap: { flexDirection: "row", gap: 32, marginBottom: 20 },
  detailsLeft: { flex: 1 },
  detailsRight: { width: 200 },
  sectionLabel: { fontSize: LABEL, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 },
  clientName: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  clientLine: { fontSize: 8.5, color: MUTED, marginBottom: 1.5 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: DIVIDER, paddingVertical: 4 },
  detailLabel: { fontSize: 8.5, color: MUTED },
  detailValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },

  // Amount block
  amountBlock: { marginTop: 6, marginLeft: "auto", width: 240 },
  amtRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderTopWidth: 1.5, borderTopColor: INK },
  amtLabel: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  amtValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },

  // Footer
  footerDivider: { borderTopWidth: 1, borderTopColor: DIVIDER, marginTop: 32, marginBottom: 14 },
  footer: { flexDirection: "row", gap: 32 },
  footerLabel: { fontSize: LABEL, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 },
  footerText: { fontSize: 8.5, color: INK, lineHeight: 1.5 },
  stamp: { marginTop: 24, alignItems: "flex-end" },
  stampBox: { borderWidth: 1.5, borderColor: DIVIDER, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center", width: 140 },
  stampLabel: { fontSize: 7, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  stampLine: { borderTopWidth: 1, borderTopColor: INK, width: "100%", marginBottom: 4 },
  stampName: { fontSize: 7.5, color: MUTED },
});

type ReceiptProps = {
  branding: {
    companyName: string;
    companyTagline?: string | null;
    companyAddressLine1: string;
    companyAddressLine2: string;
    companyContacts: string;
    companyEmail?: string | null;
    companyWebsite?: string | null;
    companyLogoUrl?: string | null;
    termsText?: string;
    footerText?: string;
  };
  receiptNumber: string;
  receivedAt: string;
  method: string;
  reference?: string | null;
  amountLabel: string;
  forLabel: string;
  receivedBy: string;
  clientName?: string | null;
  clientPhone?: string | null;
};

export function PaymentReceiptDocument({ branding, receiptNumber, receivedAt, method, reference, amountLabel, forLabel, receivedBy, clientName, clientPhone }: ReceiptProps) {
  const address = [branding.companyAddressLine1, branding.companyAddressLine2].filter(Boolean).join(", ");

  return (
    <Document title={`Receipt ${receiptNumber}`}>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            {branding.companyLogoUrl
              // eslint-disable-next-line jsx-a11y/alt-text
              ? <Image style={s.logo} src={branding.companyLogoUrl} />
              : null}
            <Text style={s.companyName}>{branding.companyName}</Text>
            {address ? <Text style={s.companyLine}>{address}</Text> : null}
            {branding.companyContacts ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>PHONE:</Text>
                <Text style={s.companyLine}>{branding.companyContacts}</Text>
              </View>
            ) : null}
            {branding.companyEmail ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>EMAIL:</Text>
                <Text style={s.companyLine}>{branding.companyEmail}</Text>
              </View>
            ) : null}
          </View>
          <View style={s.headerRight}>
            <Text style={s.docTitle}>Receipt</Text>
            <Text style={s.docNumber}>#{receiptNumber}</Text>
            <View style={s.balanceBox}>
              <Text style={s.balanceLabel}>Amount Received</Text>
              <Text style={s.balanceAmount}>{amountLabel}</Text>
            </View>
          </View>
        </View>

        <View style={s.hr} />

        {/* Details */}
        <View style={s.detailsWrap}>
          <View style={s.detailsLeft}>
            {clientName ? (
              <>
                <Text style={s.sectionLabel}>Received From</Text>
                <Text style={s.clientName}>{clientName}</Text>
                {clientPhone ? <Text style={s.clientLine}>{clientPhone}</Text> : null}
              </>
            ) : null}
          </View>
          <View style={s.detailsRight}>
            {[
              { label: "Receipt Date:",    value: receivedAt },
              { label: "Payment Method:",  value: method },
              { label: "Reference:",       value: reference || "-" },
              { label: "For:",             value: forLabel },
            ].map((row, i) => (
              <View key={i} style={s.detailRow}>
                <Text style={s.detailLabel}>{row.label}</Text>
                <Text style={s.detailValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Amount */}
        <View style={s.amountBlock}>
          <View style={s.amtRow}>
            <Text style={s.amtLabel}>Total Received</Text>
            <Text style={s.amtValue}>{amountLabel}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footerDivider} />
        <View style={s.footer}>
          {branding.footerText ? (
            <View style={{ flex: 1 }}>
              <Text style={s.footerLabel}>Notes</Text>
              <Text style={s.footerText}>{branding.footerText}</Text>
            </View>
          ) : null}
          {branding.termsText ? (
            <View style={{ flex: 1 }}>
              <Text style={s.footerLabel}>Terms &amp; Conditions</Text>
              <Text style={s.footerText}>{branding.termsText}</Text>
            </View>
          ) : null}
        </View>

        {/* Authorised stamp */}
        <View style={s.stamp}>
          <View style={s.stampBox}>
            <Text style={s.stampLabel}>Received by</Text>
            <View style={s.stampLine} />
            <Text style={s.stampName}>{receivedBy}</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}
