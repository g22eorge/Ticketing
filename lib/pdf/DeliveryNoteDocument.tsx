/**
 * Delivery Note — Eagle Info house style.
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
  refBox: { borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 7, alignItems: "flex-end", width: "100%" },
  refLabel: { fontSize: LABEL, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  refValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },

  hr: { borderTopWidth: 1, borderTopColor: DIVIDER, marginBottom: 16 },

  grid2: { flexDirection: "row", gap: 24, marginBottom: 16 },
  col: { flex: 1 },
  sectionLabel: { fontSize: LABEL, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: DIVIDER, paddingBottom: 4 },
  fieldRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: DIVIDER, paddingVertical: 4.5 },
  fieldLabel: { width: 80, fontSize: 8.5, color: MUTED },
  fieldValue: { flex: 1, fontSize: 8.5, fontFamily: "Helvetica-Bold" },

  // Items table
  table: { marginBottom: 16 },
  tableHead: { flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: INK, paddingBottom: 4 },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.4 },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: DIVIDER, paddingVertical: 7 },
  colNum:  { width: 24 },
  colDesc: { flex: 1 },
  colQty:  { width: 60, textAlign: "right" },

  // Footer
  footerDivider: { borderTopWidth: 1, borderTopColor: DIVIDER, marginTop: 20, marginBottom: 14 },
  sigRow: { flexDirection: "row", gap: 24 },
  sigCol: { flex: 1 },
  sigLine: { borderBottomWidth: 1, borderBottomColor: INK, marginTop: 28, marginBottom: 5 },
  sigLabel: { fontSize: 7.5, color: MUTED },
  sigName: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },

  noteLabel: { fontSize: LABEL, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 },
  noteText: { fontSize: 8.5, color: INK, lineHeight: 1.5, marginBottom: 12 },
});

type DeliveryItem = { description: string; quantity: number };

type Props = {
  branding: {
    companyName: string;
    companyTagline?: string | null;
    companyAddressLine1: string;
    companyAddressLine2: string;
    companyContacts: string;
    companyEmail?: string | null;
    companyLogoUrl?: string | null;
  };
  deliveryNoteNumber: string;
  deliveredAt: string;
  saleRef: string;
  clientName: string;
  deliveredByName: string;
  receivedByName: string;
  receivedBySignatureText?: string | null;
  deliveryMethod?: string | null;
  note?: string | null;
  items: DeliveryItem[];
};

export function DeliveryNoteDocument({ branding, deliveryNoteNumber, deliveredAt, saleRef, clientName, deliveredByName, receivedByName, receivedBySignatureText, deliveryMethod, note, items }: Props) {
  const address = [branding.companyAddressLine1, branding.companyAddressLine2].filter(Boolean).join(", ");

  return (
    <Document title={`Delivery Note ${deliveryNoteNumber}`}>
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
              <View style={s.infoRow}><Text style={s.infoLabel}>PHONE:</Text><Text style={s.companyLine}>{branding.companyContacts}</Text></View>
            ) : null}
            {branding.companyEmail ? (
              <View style={s.infoRow}><Text style={s.infoLabel}>EMAIL:</Text><Text style={s.companyLine}>{branding.companyEmail}</Text></View>
            ) : null}
          </View>
          <View style={s.headerRight}>
            <Text style={s.docTitle}>Delivery Note</Text>
            <Text style={s.docNumber}>#{deliveryNoteNumber}</Text>
            <View style={s.refBox}>
              <Text style={s.refLabel}>Reference</Text>
              <Text style={s.refValue}>{saleRef}</Text>
            </View>
          </View>
        </View>

        <View style={s.hr} />

        {/* Client + Delivery info */}
        <View style={s.grid2}>
          <View style={s.col}>
            <Text style={s.sectionLabel}>Delivered To</Text>
            {[
              { label: "Client",   value: clientName },
              { label: "Method",   value: deliveryMethod ?? "-" },
              { label: "Date",     value: deliveredAt },
            ].map((r, i) => (
              <View key={i} style={s.fieldRow}>
                <Text style={s.fieldLabel}>{r.label}</Text>
                <Text style={s.fieldValue}>{r.value}</Text>
              </View>
            ))}
          </View>
          <View style={s.col}>
            <Text style={s.sectionLabel}>Dispatch Details</Text>
            {[
              { label: "Dispatched by", value: deliveredByName },
              { label: "Received by",   value: receivedByName },
            ].map((r, i) => (
              <View key={i} style={s.fieldRow}>
                <Text style={s.fieldLabel}>{r.label}</Text>
                <Text style={s.fieldValue}>{r.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Items */}
        <View style={s.table}>
          <View style={s.tableHead}>
            <Text style={[s.th, s.colNum]}>#</Text>
            <Text style={[s.th, s.colDesc]}>Description</Text>
            <Text style={[s.th, s.colQty]}>Qty</Text>
          </View>
          {items.map((it, i) => (
            <View key={i} style={s.tableRow}>
              <Text style={[{ fontSize: 9 }, s.colNum]}>{i + 1}</Text>
              <Text style={[{ fontSize: 9 }, s.colDesc]}>{it.description}</Text>
              <Text style={[{ fontSize: 9 }, s.colQty]}>{String(it.quantity)}</Text>
            </View>
          ))}
        </View>

        {/* Note */}
        {note ? (
          <>
            <Text style={s.noteLabel}>Notes</Text>
            <Text style={s.noteText}>{note}</Text>
          </>
        ) : null}

        {/* Signatures */}
        <View style={s.footerDivider} />
        <View style={s.sigRow}>
          <View style={s.sigCol}>
            <Text style={s.sigName}>{deliveredByName}</Text>
            <View style={s.sigLine} />
            <Text style={s.sigLabel}>Dispatched by</Text>
          </View>
          <View style={s.sigCol}>
            <Text style={s.sigName}>{receivedByName}</Text>
            <View style={s.sigLine} />
            <Text style={s.sigLabel}>
              {receivedBySignatureText ? receivedBySignatureText : "Client signature (confirmation of receipt)"}
            </Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}
