/**
 * Job Card – Compact template
 * Space-efficient layout, smaller fonts, more information per page.
 * Good for high-volume shops.
 */
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const SKY  = "#0284c7";
const SKY2 = "#0369a1";
const SKYLT= "#e0f2fe";
const DARK = "#0f172a";
const MID  = "#475569";
const LITE = "#94a3b8";
const LINE = "#e2e8f0";
const WHITE= "#ffffff";
const BG   = "#f0f9ff";

const s = StyleSheet.create({
  page: { padding: 16, fontSize: 8, color: DARK, backgroundColor: BG },

  // compact top bar
  topBar: {
    flexDirection: "row", alignItems: "stretch",
    backgroundColor: SKY2, borderRadius: 6, overflow: "hidden",
    marginBottom: 8,
  },
  topLeft: { backgroundColor: SKY, paddingHorizontal: 12, paddingVertical: 8, justifyContent: "center", alignItems: "center", minWidth: 80 },
  topLeftTitle: { fontSize: 12, fontWeight: 700, color: WHITE, letterSpacing: 1 },
  topLeftSub:   { fontSize: 6.5, color: SKYLT, marginTop: 1, letterSpacing: 0.8 },
  topRight: { flex: 1, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  coBlock: {},
  coName: { fontSize: 10, fontWeight: 700, color: WHITE, marginBottom: 1 },
  coLine: { fontSize: 7, color: SKYLT, marginBottom: 0.5 },
  metaBlock: { alignItems: "flex-end" },
  metaRow: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  metaLbl: { fontSize: 6.5, color: SKYLT, textTransform: "uppercase", letterSpacing: 0.3, marginRight: 4 },
  metaVal: { fontSize: 8.5, fontWeight: 700, color: WHITE },
  metaValAccent: { fontSize: 10, fontWeight: 700, color: "#bae6fd" },
  logo: { width: 36, height: 36, marginRight: 8 },

  // pills row
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 8 },
  pill: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 7, paddingVertical: 2.5,
    borderRadius: 20, border: `1 solid ${SKY}`, backgroundColor: SKYLT, gap: 3,
  },
  pillLbl: { fontSize: 6.5, color: SKY2, textTransform: "uppercase", letterSpacing: 0.3 },
  pillVal: { fontSize: 7.8, fontWeight: 700, color: SKY2 },

  // grid
  grid: { flexDirection: "row", gap: 6, marginBottom: 6 },
  card: {
    flex: 1, border: `1 solid ${LINE}`, borderRadius: 5,
    backgroundColor: WHITE, overflow: "hidden",
  },
  cardHead: { backgroundColor: SKYLT, paddingHorizontal: 8, paddingVertical: 3, borderBottom: `1 solid ${LINE}` },
  cardTitle: { fontSize: 7, fontWeight: 700, color: SKY2, textTransform: "uppercase", letterSpacing: 0.5 },
  cardBody: { padding: 7 },
  row: { flexDirection: "row", marginBottom: 3, paddingBottom: 2.5, borderBottom: `1 solid ${LINE}` },
  lbl: { width: "38%", fontSize: 7.2, color: MID },
  val: { width: "62%", fontSize: 7.8, fontWeight: 600, color: DARK },

  fieldVal: { fontSize: 7.6, color: DARK, minHeight: 32 },

  sigWrap: { marginTop: 6, padding: 7, border: `1 solid ${LINE}`, borderRadius: 5, backgroundColor: WHITE },
  sigRow:  { flexDirection: "row", gap: 10, marginTop: 2 },
  sigCol:  { flex: 1 },
  sigLine: { borderBottom: `1 solid ${LINE}`, marginTop: 16, marginBottom: 3 },
  sigLbl:  { fontSize: 7, color: LITE },

  footer: { marginTop: 4, borderTop: `1 solid ${LINE}`, paddingTop: 3, fontSize: 6.8, color: LITE, textAlign: "center" },
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

export function JobCardDocumentCompact(props: Props) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Top bar */}
        <View style={s.topBar}>
          <View style={s.topLeft}>
            <Text style={s.topLeftTitle}>JOB</Text>
            <Text style={s.topLeftTitle}>CARD</Text>
            <Text style={s.topLeftSub}>COMPACT</Text>
          </View>
          <View style={s.topRight}>
            <View style={s.coBlock}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                {props.companyLogoUrl ? <Image style={s.logo} src={props.companyLogoUrl} /> : null}
                <View>
                  <Text style={s.coName}>{props.companyName}</Text>
                  {props.companyTagline ? <Text style={s.coLine}>{props.companyTagline}</Text> : null}
                  <Text style={s.coLine}>{props.companyAddressLine1}</Text>
                  <Text style={s.coLine}>{props.companyContacts}{props.companyEmail ? ` · ${props.companyEmail}` : ""}</Text>
                </View>
              </View>
            </View>
            <View style={s.metaBlock}>
              <View style={s.metaRow}><Text style={s.metaLbl}>Job Card #</Text><Text style={s.metaValAccent}>{props.documentNumber}</Text></View>
              <View style={s.metaRow}><Text style={s.metaLbl}>Repair ID</Text><Text style={s.metaVal}>{props.repairId}</Text></View>
              <View style={s.metaRow}><Text style={s.metaLbl}>Date</Text><Text style={s.metaVal}>{props.dateIssued}</Text></View>
              <View style={s.metaRow}><Text style={s.metaLbl}>Received By</Text><Text style={s.metaVal}>{props.preparedByName}</Text></View>
            </View>
          </View>
        </View>

        {/* Status pills */}
        <View style={s.pills}>
          <View style={s.pill}><Text style={s.pillLbl}>Status</Text><Text style={s.pillVal}>{props.status}</Text></View>
          <View style={s.pill}><Text style={s.pillLbl}>Device</Text><Text style={s.pillVal}>{props.deviceType}</Text></View>
          {props.serialOrImei ? <View style={s.pill}><Text style={s.pillLbl}>S/N</Text><Text style={s.pillVal}>{props.serialOrImei}</Text></View> : null}
          {props.accessories  ? <View style={s.pill}><Text style={s.pillLbl}>Accessories</Text><Text style={s.pillVal}>{props.accessories}</Text></View> : null}
        </View>

        {/* Client + Device (side by side) */}
        <View style={s.grid}>
          <View style={s.card}>
            <View style={s.cardHead}><Text style={s.cardTitle}>Client</Text></View>
            <View style={s.cardBody}>
              <View style={s.row}><Text style={s.lbl}>Name</Text><Text style={s.val}>{props.clientName}</Text></View>
              {props.clientOrganization ? <View style={s.row}><Text style={s.lbl}>Org</Text><Text style={s.val}>{props.clientOrganization}</Text></View> : null}
              <View style={s.row}><Text style={s.lbl}>Phone</Text><Text style={s.val}>{props.clientPhone}</Text></View>
              {props.clientEmail ? <View style={s.row}><Text style={s.lbl}>Email</Text><Text style={s.val}>{props.clientEmail}</Text></View> : null}
            </View>
          </View>
          <View style={s.card}>
            <View style={s.cardHead}><Text style={s.cardTitle}>Device</Text></View>
            <View style={s.cardBody}>
              <View style={s.row}><Text style={s.lbl}>Model</Text><Text style={s.val}>{props.deviceLabel}</Text></View>
              <View style={s.row}><Text style={s.lbl}>Type</Text><Text style={s.val}>{props.deviceType}</Text></View>
              {props.serialOrImei ? <View style={s.row}><Text style={s.lbl}>S/N</Text><Text style={s.val}>{props.serialOrImei}</Text></View> : null}
              <View style={s.row}><Text style={s.lbl}>Condition</Text><Text style={s.val}>{props.physicalCondition}</Text></View>
            </View>
          </View>
        </View>

        {/* Issue + Diagnosis side by side */}
        <View style={s.grid}>
          <View style={s.card}>
            <View style={s.cardHead}><Text style={s.cardTitle}>Customer Issue</Text></View>
            <View style={s.cardBody}>
              <Text style={s.fieldVal}>{props.customerIssue}</Text>
            </View>
          </View>
          <View style={s.card}>
            <View style={s.cardHead}><Text style={s.cardTitle}>Diagnosis</Text></View>
            <View style={s.cardBody}>
              <Text style={s.fieldVal}>{props.diagnosisSummary}</Text>
            </View>
          </View>
        </View>

        {/* Parts + Notes side by side */}
        <View style={s.grid}>
          <View style={s.card}>
            <View style={s.cardHead}><Text style={s.cardTitle}>Parts Needed</Text></View>
            <View style={s.cardBody}>
              <Text style={s.fieldVal}>{props.partsNeeded || "N/A"}</Text>
            </View>
          </View>
          <View style={s.card}>
            <View style={s.cardHead}><Text style={s.cardTitle}>Technician Notes</Text></View>
            <View style={s.cardBody}>
              <Text style={s.fieldVal}>{props.technicianNotes || "—"}</Text>
            </View>
          </View>
        </View>

        {/* Signatures */}
        <View style={s.sigWrap} wrap={false}>
          <View style={s.sigRow}>
            <View style={s.sigCol}><View style={s.sigLine} /><Text style={s.sigLbl}>{props.signatureCompanyLabel}</Text></View>
            <View style={s.sigCol}><View style={s.sigLine} /><Text style={s.sigLbl}>{props.signatureClientLabel}</Text></View>
          </View>
        </View>

        <Text style={s.footer}>{props.footerText}</Text>
      </Page>
    </Document>
  );
}
