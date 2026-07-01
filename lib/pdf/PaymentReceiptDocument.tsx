/**
 * Payment receipt — Eagle Info house style.
 * Uses the same document header as EagleInfoDocument (quotations/invoices).
 * Details section shows: Received From, Payment Mode, and Balance (if part-payment).
 */
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const INK      = "#0f172a";
const MUTED    = "#6B7280";
const DIVIDER  = "#E5E7EB";
const WHITE    = "#FFFFFF";
const LABEL_SZ = 7;

const s = StyleSheet.create({
  page: {
    paddingHorizontal: 36,
    paddingVertical: 36,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: INK,
    backgroundColor: WHITE,
  },

  // ── Document header (matches EagleInfoDocument) ──
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
  receiptDate: { fontSize: 8.5, color: MUTED },

  hr: { borderTopWidth: 1, borderTopColor: DIVIDER, marginBottom: 20 },

  // ── Receipt details ──
  detailsSection: { marginBottom: 18 },
  sectionLabel: {
    fontSize: LABEL_SZ,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },

  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 6,
  },
  detailLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Oblique",
    width: 140,
  },
  detailField: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomStyle: "dotted",
    borderBottomColor: INK,
    paddingBottom: 2,
  },
  detailValue: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    paddingBottom: 2,
  },

  // ── Amount received box ──
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 8,
  },
  amountLabel: {
    fontSize: 10,
    fontFamily: "Helvetica-Oblique",
  },
  amountBox: {
    borderWidth: 1,
    borderColor: INK,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  amountText: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
  },

  // ── Amount breakdown ──
  breakdownWrap: {
    marginLeft: "auto",
    width: 260,
    marginBottom: 20,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
  },
  breakdownLabel: {
    fontSize: 9,
    color: MUTED,
  },
  breakdownValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  breakdownRowBold: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
  },
  breakdownLabelBold: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  breakdownValueBold: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },

  // ── Footer ──
  footerDivider: { borderTopWidth: 1, borderTopColor: DIVIDER, marginTop: 8, marginBottom: 14 },
  footer: { flexDirection: "row", gap: 32 },
  footerLeft: { flex: 1 },
  footerRight: { flex: 1 },
  footerNoteText: {
    fontSize: 8.5,
    color: INK,
    lineHeight: 1.5,
    marginBottom: 8,
  },
  footerLabel: {
    fontSize: LABEL_SZ,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  balanceBoxFooter: {
    borderWidth: 1,
    borderColor: DIVIDER,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: "flex-end",
    width: "100%",
  },
  balanceLabel: {
    fontSize: LABEL_SZ,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  balanceAmount: { fontSize: 15, fontFamily: "Helvetica-Bold" },

  // ── Authorised signature ──
  signatureSection: {
    flexDirection: "row",
    gap: 32,
    marginTop: 16,
  },
  signatureCol: { flex: 1 },
  signatureLabel: {
    fontSize: 8,
    color: MUTED,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: INK,
    marginBottom: 4,
    paddingBottom: 2,
  },
  signatureName: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
  },
  signatureDottedLine: {
    borderBottomWidth: 1,
    borderBottomStyle: "dotted",
    borderBottomColor: INK,
    marginBottom: 4,
  },
  signatureSubLabel: {
    fontSize: 7.5,
    color: MUTED,
  },
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
  balanceLabel?: string | null;
  totalLabel?: string | null;
  totalAmountLabel?: string | null;
};

export function PaymentReceiptDocument({
  branding,
  receiptNumber,
  receivedAt,
  method,
  reference,
  amountLabel,
  forLabel,
  receivedBy,
  clientName,
  clientPhone,
  balanceLabel,
  totalLabel,
  totalAmountLabel,
}: ReceiptProps) {
  const address = [branding.companyAddressLine1, branding.companyAddressLine2]
    .filter(Boolean)
    .join(", ");

  const hasPartPayment = Boolean(balanceLabel && balanceLabel !== "UGX 0" && balanceLabel !== amountLabel);

  return (
    <Document title={`Receipt ${receiptNumber}`}>
      <Page size="A4" style={s.page}>

        {/* ── Document header ── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            {branding.companyLogoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image style={s.logo} src={branding.companyLogoUrl} />
            ) : null}
            <Text style={s.companyName}>{branding.companyName}</Text>
            <Text style={s.companyLine}>{address}</Text>
            {branding.companyContacts ? (
              <View style={s.phoneEmailRow}>
                <Text style={s.companyLineLabel}>PHONE:</Text>
                <Text style={s.companyLine}>{branding.companyContacts}</Text>
              </View>
            ) : null}
            {branding.companyEmail ? (
              <View style={s.phoneEmailRow}>
                <Text style={s.companyLineLabel}>EMAIL:</Text>
                <Text style={s.companyLine}>{branding.companyEmail}</Text>
              </View>
            ) : null}
          </View>
          <View style={s.headerRight}>
            <Text style={s.docTitle}>Receipt</Text>
            <Text style={s.docNumber}>#{receiptNumber}</Text>
            <Text style={s.receiptDate}>Date: {receivedAt}</Text>
          </View>
        </View>

        <View style={s.hr} />

        {/* ── Receipt details ── */}
        <View style={s.detailsSection}>

          {/* Received From */}
          <Text style={s.sectionLabel}>Received From</Text>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Name</Text>
            <View style={s.detailField}>
              <Text style={s.detailValue}>{clientName ?? "—"}</Text>
            </View>
          </View>
          {clientPhone ? (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Phone</Text>
              <View style={s.detailField}>
                <Text style={s.detailValue}>{clientPhone}</Text>
              </View>
            </View>
          ) : null}

          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Being Payment For</Text>
            <View style={s.detailField}>
              <Text style={s.detailValue}>{forLabel}</Text>
            </View>
          </View>

          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Mode of Payment</Text>
            <View style={s.detailField}>
              <Text style={s.detailValue}>{method}</Text>
            </View>
          </View>

          {reference ? (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Reference / Cheque No.</Text>
              <View style={s.detailField}>
                <Text style={s.detailValue}>{reference}</Text>
              </View>
            </View>
          ) : null}

        </View>

        {/* ── Amount received ── */}
        <View style={s.amountRow}>
          <Text style={s.amountLabel}>Amount Received:</Text>
          <View style={s.amountBox}>
            <Text style={s.amountText}>{amountLabel}</Text>
          </View>
        </View>

        {/* ── Breakdown (only if part-payment) ── */}
        {hasPartPayment && totalAmountLabel ? (
          <View style={s.breakdownWrap}>
            {totalLabel ? (
              <View style={s.breakdownRow}>
                <Text style={s.breakdownLabel}>{totalLabel}</Text>
                <Text style={s.breakdownValue}>{totalAmountLabel}</Text>
              </View>
            ) : null}
            <View style={s.breakdownRow}>
              <Text style={s.breakdownLabel}>Amount Paid</Text>
              <Text style={s.breakdownValue}>{amountLabel}</Text>
            </View>
            <View style={s.breakdownRowBold}>
              <Text style={s.breakdownLabelBold}>Balance Due</Text>
              <Text style={s.breakdownValueBold}>{balanceLabel}</Text>
            </View>
          </View>
        ) : null}

        {/* ── Footer ── */}
        {branding.footerText || branding.termsText ? (
          <>
            <View style={s.footerDivider} />
            <View style={s.footer}>
              <View style={s.footerLeft}>
                {branding.footerText ? (
                  <>
                    <Text style={s.footerLabel}>Notes</Text>
                    <Text style={s.footerNoteText}>{branding.footerText}</Text>
                  </>
                ) : null}
                {branding.termsText ? (
                  <>
                    <Text style={s.footerLabel}>Terms & Conditions</Text>
                    <Text style={s.footerNoteText}>{branding.termsText}</Text>
                  </>
                ) : null}
              </View>
              {hasPartPayment ? (
                <View style={s.footerRight}>
                  <View style={s.balanceBoxFooter}>
                    <Text style={s.balanceLabel}>Balance Due</Text>
                    <Text style={s.balanceAmount}>{balanceLabel}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {/* ── Authorised signature ── */}
        <View style={s.signatureSection}>
          <View style={s.signatureCol}>
            <Text style={s.signatureLabel}>Received by</Text>
            <View style={s.signatureDottedLine} />
            <Text style={s.signatureName}>{receivedBy}</Text>
            <Text style={s.signatureSubLabel}>Authorised signature</Text>
          </View>
          <View style={s.signatureCol}>
            <Text style={s.signatureLabel}>Client</Text>
            <View style={s.signatureDottedLine} />
            <Text style={s.signatureSubLabel}>Signature & date</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}