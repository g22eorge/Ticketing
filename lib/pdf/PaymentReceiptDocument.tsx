import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

type ReceiptProps = {
  branding: {
    companyName: string;
    companyTagline?: string | null;
    companyAddressLine1: string;
    companyAddressLine2: string;
    companyContacts: string;
    companyEmail?: string | null;
    companyWebsite?: string | null;
  };
  receiptNumber: string;
  receivedAt: string;
  method: string;
  reference?: string | null;
  amountLabel: string;
  forLabel: string;
  receivedBy: string;
};

const s = StyleSheet.create({
  page: { padding: 20, fontSize: 10, color: "#0f172a" },
  title: { fontSize: 16, fontWeight: 700 },
  muted: { color: "#475569" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  block: { marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: "#e2e8f0" },
  label: { fontSize: 9, color: "#64748b" },
  value: { fontSize: 11, fontWeight: 600 },
});

export function PaymentReceiptDocument(props: ReceiptProps) {
  return (
    <Document title={`Receipt ${props.receiptNumber}`}>
      <Page size="A4" style={s.page}>
        <View style={s.row}>
          <View>
            <Text style={s.title}>Receipt</Text>
            <Text style={s.muted}>{props.branding.companyName}</Text>
            {props.branding.companyTagline ? <Text style={s.muted}>{props.branding.companyTagline}</Text> : null}
          </View>
          <View>
            <Text style={s.label}>Receipt #</Text>
            <Text style={s.value}>{props.receiptNumber}</Text>
            <Text style={[s.label, { marginTop: 6 }]}>Received</Text>
            <Text style={s.value}>{props.receivedAt}</Text>
          </View>
        </View>

        <View style={s.block}>
          <View style={s.row}>
            <View>
              <Text style={s.label}>Amount</Text>
              <Text style={s.value}>{props.amountLabel}</Text>
            </View>
            <View>
              <Text style={s.label}>Method</Text>
              <Text style={s.value}>{props.method}</Text>
            </View>
          </View>

          <View style={{ marginTop: 10 }}>
            <Text style={s.label}>For</Text>
            <Text style={s.value}>{props.forLabel}</Text>
          </View>

          {props.reference ? (
            <View style={{ marginTop: 10 }}>
              <Text style={s.label}>Reference</Text>
              <Text style={s.value}>{props.reference}</Text>
            </View>
          ) : null}
        </View>

        <View style={[s.block, { marginTop: 12 }]}>
          <Text style={s.label}>Received By</Text>
          <Text style={s.value}>{props.receivedBy}</Text>
        </View>

        <View style={{ marginTop: 14 }}>
          <Text style={s.muted}>{props.branding.companyAddressLine1}</Text>
          <Text style={s.muted}>{props.branding.companyAddressLine2}</Text>
          <Text style={s.muted}>{props.branding.companyContacts}</Text>
          {props.branding.companyEmail ? <Text style={s.muted}>{props.branding.companyEmail}</Text> : null}
          {props.branding.companyWebsite ? <Text style={s.muted}>{props.branding.companyWebsite}</Text> : null}
        </View>
      </Page>
    </Document>
  );
}
