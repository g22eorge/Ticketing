import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

type DeliveryItem = { description: string; quantity: number };

type Props = {
  branding: {
    companyName: string;
    companyTagline?: string | null;
    companyAddressLine1: string;
    companyAddressLine2: string;
    companyContacts: string;
    companyEmail?: string | null;
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

const s = StyleSheet.create({
  page: { padding: 20, fontSize: 10, color: "#0f172a" },
  title: { fontSize: 16, fontWeight: 700 },
  muted: { color: "#475569" },
  metaGrid: { flexDirection: "row", gap: 12, marginTop: 12 },
  metaCol: { flexGrow: 1 },
  label: { fontSize: 9, color: "#64748b" },
  value: { fontSize: 11, fontWeight: 600 },
  table: { marginTop: 12, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, overflow: "hidden" },
  thead: { backgroundColor: "#f1f5f9", flexDirection: "row" },
  th: { padding: 8, fontSize: 9, fontWeight: 700, color: "#475569" },
  tr: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#e2e8f0" },
  td: { padding: 8 },
});

export function DeliveryNoteDocument(props: Props) {
  return (
    <Document title={`Delivery Note ${props.deliveryNoteNumber}`}>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Delivery Note</Text>
        <Text style={s.muted}>{props.branding.companyName}</Text>
        {props.branding.companyTagline ? <Text style={s.muted}>{props.branding.companyTagline}</Text> : null}

        <View style={s.metaGrid}>
          <View style={s.metaCol}>
            <Text style={s.label}>Delivery Note #</Text>
            <Text style={s.value}>{props.deliveryNoteNumber}</Text>
            <Text style={[s.label, { marginTop: 6 }]}>Delivered</Text>
            <Text style={s.value}>{props.deliveredAt}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.label}>Sale / Invoice</Text>
            <Text style={s.value}>{props.saleRef}</Text>
            <Text style={[s.label, { marginTop: 6 }]}>Client</Text>
            <Text style={s.value}>{props.clientName}</Text>
          </View>
        </View>

        <View style={s.metaGrid}>
          <View style={s.metaCol}>
            <Text style={s.label}>Delivered By</Text>
            <Text style={s.value}>{props.deliveredByName}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.label}>Received By</Text>
            <Text style={s.value}>{props.receivedByName}</Text>
          </View>
        </View>

        <View style={s.metaGrid}>
          <View style={s.metaCol}>
            <Text style={s.label}>Delivery Method</Text>
            <Text style={s.value}>{props.deliveryMethod ?? "-"}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.label}>Signature</Text>
            <Text style={s.value}>{props.receivedBySignatureText ?? "_____________________"}</Text>
          </View>
        </View>

        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.th, { width: "80%" }]}>Item</Text>
            <Text style={[s.th, { width: "20%" }]}>Qty</Text>
          </View>
          {props.items.map((it, idx) => (
            <View key={`${idx}:${it.description}`} style={s.tr}>
              <Text style={[s.td, { width: "80%" }]}>{it.description}</Text>
              <Text style={[s.td, { width: "20%" }]}>{String(it.quantity)}</Text>
            </View>
          ))}
          {props.items.length === 0 ? (
            <View style={s.tr}>
              <Text style={[s.td, { width: "100%" }]}>No items</Text>
            </View>
          ) : null}
        </View>

        {props.note ? (
          <View style={{ marginTop: 12 }}>
            <Text style={s.label}>Note</Text>
            <Text style={s.value}>{props.note}</Text>
          </View>
        ) : null}

        <View style={{ marginTop: 16 }}>
          <Text style={s.muted}>{props.branding.companyAddressLine1}</Text>
          <Text style={s.muted}>{props.branding.companyAddressLine2}</Text>
          <Text style={s.muted}>{props.branding.companyContacts}</Text>
          {props.branding.companyEmail ? <Text style={s.muted}>{props.branding.companyEmail}</Text> : null}
        </View>
      </Page>
    </Document>
  );
}
