/**
 * Job Card – Premium template
 * Dark branded cover feel, gold accents, enterprise-grade styling.
 */
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const NAVY  = "#0f172a";
const NAVY2 = "#1e293b";
const GOLD  = "#d4af37";
const GOLD2 = "#f6e27a";
const MID   = "#475569";
const LITE  = "#94a3b8";
const LINE_L= "#e2e8f0";
const BG    = "#f8fafc";
const WHITE = "#ffffff";

const s = StyleSheet.create({
  page: { padding: 0, fontSize: 8.6, color: NAVY, backgroundColor: BG },

  header: {
    backgroundColor: NAVY, paddingHorizontal: 28, paddingTop: 18, paddingBottom: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  logo:    { width: 56, height: 56, marginRight: 12, borderRadius: 4 },
  coRow:   { flexDirection: "row", alignItems: "center" },
  coName:  { fontSize: 14, fontWeight: 700, color: WHITE, marginBottom: 2 },
  coTag:   { fontSize: 8, color: LITE, marginBottom: 1 },
  coLine:  { fontSize: 7.8, color: LITE },
  docSide: { alignItems: "flex-end" },
  docType: { fontSize: 24, fontWeight: 700, color: GOLD, letterSpacing: 2, marginBottom: 2 },
  docSub:  { fontSize: 8, color: LITE, letterSpacing: 0.8 },
  docNum:  { fontSize: 9, color: GOLD2, marginTop: 4, fontWeight: 700 },

  goldBar: { height: 3, backgroundColor: GOLD },

  // dark info strip
  strip: {
    backgroundColor: NAVY2,
    flexDirection: "row", justifyContent: "space-around",
    paddingVertical: 8, paddingHorizontal: 28,
    marginBottom: 18,
  },
  stripItem:  { alignItems: "center" },
  stripLbl:   { fontSize: 6.8, color: LITE, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  stripVal:   { fontSize: 9, fontWeight: 700, color: WHITE },
  stripValGold: { fontSize: 11, fontWeight: 700, color: GOLD },

  body: { paddingHorizontal: 28 },

  grid: { flexDirection: "row", gap: 12, marginBottom: 12 },
  card: { flex: 1, border: `1 solid ${LINE_L}`, borderRadius: 7, backgroundColor: WHITE, overflow: "hidden" },
  cardHead: { backgroundColor: NAVY2, paddingHorizontal: 10, paddingVertical: 5 },
  cardTitle: { fontSize: 7.5, fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: 0.8 },
  cardBody: { padding: 10 },

  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5, borderBottom: `1 solid ${LINE_L}` },
  rlbl: { fontSize: 8, color: MID },
  rval: { fontSize: 8.2, fontWeight: 600, color: NAVY, maxWidth: "60%", textAlign: "right" },

  fieldCard: { border: `1 solid ${LINE_L}`, borderRadius: 7, backgroundColor: WHITE, marginBottom: 10, overflow: "hidden" },
  fieldHead: { backgroundColor: NAVY2, paddingHorizontal: 10, paddingVertical: 5 },
  fieldTitle: { fontSize: 7.5, fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: 0.8 },
  fieldBody: { padding: 10 },
  fieldText: { fontSize: 8.4, color: NAVY, lineHeight: 1.5 },

  sigWrap: { border: `1 solid ${LINE_L}`, borderRadius: 7, backgroundColor: WHITE, padding: 10, marginBottom: 12, borderTop: `3 solid ${GOLD}` },
  sigRow:  { flexDirection: "row", gap: 14, marginTop: 2 },
  sigCol:  { flex: 1 },
  sigLine: { borderBottom: `1 solid ${LINE_L}`, marginTop: 22, marginBottom: 4 },
  sigLbl:  { fontSize: 7.5, color: LITE },

  footer: { marginHorizontal: 28, marginBottom: 12, borderTop: `1 solid ${LINE_L}`, paddingTop: 5, fontSize: 7.5, color: LITE, textAlign: "center" },
});

type Props = {
  companyName: string; companyTagline?: string; companyAddressLine1: string; companyAddressLine2: string;
  companyContacts: string; companyEmail?: string; companyWebsite?: string; companyLogoUrl?: string;
  documentNumber: string; dateIssued: string; repairId: string; preparedByName: string; preparedByRole: string;
  clientName: string; clientPhone: string; clientEmail: string; clientOrganization: string;
  deviceType: string; deviceLabel: string; serialOrImei: string; accessories: string; physicalCondition: string;
  customerIssue: string; diagnosisSummary: string; partsNeeded: string; technicianNotes: string;
  status: string; footerText: string; signatureCompanyLabel: string; signatureClientLabel: string;
  statusQrDataUrl?: string;
};

export function JobCardDocumentPremium(props: Props) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Dark header */}
        <View style={s.header}>
          <View style={s.coRow}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {props.companyLogoUrl ? <Image style={s.logo} src={props.companyLogoUrl} /> : null}
            <View>
              <Text style={s.coName}>{props.companyName}</Text>
              {props.companyTagline ? <Text style={s.coTag}>{props.companyTagline}</Text> : null}
              <Text style={s.coLine}>{props.companyContacts}</Text>
              {props.companyEmail ? <Text style={s.coLine}>{props.companyEmail}</Text> : null}
            </View>
          </View>
          <View style={s.docSide}>
            <Text style={s.docType}>JOB CARD</Text>
            <Text style={s.docSub}>INTAKE RECORD · PREMIUM</Text>
            <Text style={s.docNum}>{props.documentNumber}</Text>
          </View>
        </View>
        <View style={s.goldBar} />

        {/* Info strip */}
        <View style={s.strip}>
          <View style={s.stripItem}><Text style={s.stripLbl}>Date</Text><Text style={s.stripVal}>{props.dateIssued}</Text></View>
          <View style={s.stripItem}><Text style={s.stripLbl}>Repair ID</Text><Text style={s.stripValGold}>{props.repairId}</Text></View>
          <View style={s.stripItem}><Text style={s.stripLbl}>Received By</Text><Text style={s.stripVal}>{props.preparedByName}</Text></View>
          <View style={s.stripItem}><Text style={s.stripLbl}>Status</Text><Text style={s.stripValGold}>{props.status}</Text></View>
          <View style={s.stripItem}><Text style={s.stripLbl}>Device</Text><Text style={s.stripVal}>{props.deviceType}</Text></View>
        </View>

        <View style={s.body}>
          {/* Client + Device */}
          <View style={s.grid}>
            <View style={s.card}>
              <View style={s.cardHead}><Text style={s.cardTitle}>Client</Text></View>
              <View style={s.cardBody}>
                <View style={s.row}><Text style={s.rlbl}>Name</Text><Text style={s.rval}>{props.clientName}</Text></View>
                {props.clientOrganization ? <View style={s.row}><Text style={s.rlbl}>Org</Text><Text style={s.rval}>{props.clientOrganization}</Text></View> : null}
                <View style={s.row}><Text style={s.rlbl}>Phone</Text><Text style={s.rval}>{props.clientPhone}</Text></View>
                {props.clientEmail ? <View style={s.row}><Text style={s.rlbl}>Email</Text><Text style={s.rval}>{props.clientEmail}</Text></View> : null}
              </View>
            </View>
            <View style={s.card}>
              <View style={s.cardHead}><Text style={s.cardTitle}>Device</Text></View>
              <View style={s.cardBody}>
                <View style={s.row}><Text style={s.rlbl}>Model</Text><Text style={s.rval}>{props.deviceLabel}</Text></View>
                <View style={s.row}><Text style={s.rlbl}>Type</Text><Text style={s.rval}>{props.deviceType}</Text></View>
                {props.serialOrImei ? <View style={s.row}><Text style={s.rlbl}>S/N</Text><Text style={s.rval}>{props.serialOrImei}</Text></View> : null}
                <View style={s.row}><Text style={s.rlbl}>Condition</Text><Text style={s.rval}>{props.physicalCondition}</Text></View>
                {props.accessories ? <View style={s.row}><Text style={s.rlbl}>Accessories</Text><Text style={s.rval}>{props.accessories}</Text></View> : null}
              </View>
            </View>
          </View>

          {/* Issue */}
          <View style={s.fieldCard}>
            <View style={s.fieldHead}><Text style={s.fieldTitle}>Customer Issue</Text></View>
            <View style={s.fieldBody}><Text style={s.fieldText}>{props.customerIssue}</Text></View>
          </View>

          {/* Diagnosis */}
          <View style={s.fieldCard}>
            <View style={s.fieldHead}><Text style={s.fieldTitle}>Diagnosis Summary</Text></View>
            <View style={s.fieldBody}><Text style={s.fieldText}>{props.diagnosisSummary}</Text></View>
          </View>

          {/* Parts + Notes */}
          <View style={s.grid}>
            <View style={s.card}>
              <View style={s.cardHead}><Text style={s.cardTitle}>Parts Needed</Text></View>
              <View style={s.cardBody}><Text style={s.fieldText}>{props.partsNeeded || "N/A"}</Text></View>
            </View>
            <View style={s.card}>
              <View style={s.cardHead}><Text style={s.cardTitle}>Technician Notes</Text></View>
              <View style={s.cardBody}><Text style={s.fieldText}>{props.technicianNotes || "—"}</Text></View>
            </View>
          </View>

          {/* Signatures */}
          <View style={s.sigWrap} wrap={false}>
            <View style={s.sigRow}>
              <View style={s.sigCol}><View style={s.sigLine} /><Text style={s.sigLbl}>{props.signatureCompanyLabel}</Text></View>
              <View style={s.sigCol}><View style={s.sigLine} /><Text style={s.sigLbl}>{props.signatureClientLabel}</Text></View>
            </View>
          </View>
        </View>

        <Text style={s.footer}>{props.footerText}</Text>
      </Page>
    </Document>
  );
}
