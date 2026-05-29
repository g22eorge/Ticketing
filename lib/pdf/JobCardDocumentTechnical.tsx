/**
 * Job Card – Technical template
 * Includes system checklists and test result boxes.
 * Designed for technicians who need structured intake forms.
 */
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const ORG  = "#ea580c";
const ORG2 = "#c2410c";
const ORGLT= "#fff7ed";
const ORGBD= "#fed7aa";
const DARK = "#0f172a";
const MID  = "#475569";
const LITE = "#94a3b8";
const LINE = "#e2e8f0";
const WHITE= "#ffffff";
const BG   = "#fffbf8";

const s = StyleSheet.create({
  page: { padding: 18, fontSize: 8.4, color: DARK, backgroundColor: BG },

  banner: {
    flexDirection: "row", marginBottom: 10, borderRadius: 7, overflow: "hidden",
    border: `1 solid ${ORG}`,
  },
  bannerLeft: {
    backgroundColor: ORG2, paddingHorizontal: 14, paddingVertical: 10,
    justifyContent: "center", alignItems: "center", minWidth: 100,
  },
  bannerTitle: { fontSize: 15, fontWeight: 700, color: WHITE, letterSpacing: 1 },
  bannerSub:   { fontSize: 7, color: ORGLT, letterSpacing: 0.8, marginTop: 1 },
  bannerRight: {
    flex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "stretch",
    backgroundColor: WHITE, paddingHorizontal: 10, paddingVertical: 7,
  },
  coBlock: { justifyContent: "center" },
  coName:  { fontSize: 11, fontWeight: 700, color: DARK, marginBottom: 2 },
  coLine:  { fontSize: 7.6, color: MID, marginBottom: 1 },
  metaBlock: { alignItems: "flex-end", justifyContent: "center" },
  metaRow: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  metaLbl: { fontSize: 6.8, color: LITE, textTransform: "uppercase", letterSpacing: 0.4, marginRight: 5 },
  metaVal: { fontSize: 8.8, fontWeight: 700, color: DARK },
  metaAccent: { fontSize: 10, fontWeight: 700, color: ORG2 },
  logo: { width: 42, height: 42, marginRight: 8 },

  grid3: { flexDirection: "row", gap: 7, marginBottom: 8 },
  card: { flex: 1, border: `1 solid ${ORGBD}`, borderRadius: 6, overflow: "hidden", backgroundColor: WHITE, borderTop: `2 solid ${ORG}` },
  cardHead: { backgroundColor: ORGLT, paddingHorizontal: 8, paddingVertical: 4 },
  cardTitle: { fontSize: 7.5, fontWeight: 700, color: ORG2, textTransform: "uppercase", letterSpacing: 0.6 },
  cardBody: { padding: 8 },
  row: { flexDirection: "row", marginBottom: 3.5, paddingBottom: 3, borderBottom: `1 solid ${LINE}` },
  lbl: { width: "40%", fontSize: 7.4, color: MID },
  val: { width: "60%", fontSize: 8, fontWeight: 600, color: DARK },

  fullCard: { border: `1 solid ${ORGBD}`, borderRadius: 6, backgroundColor: WHITE, marginBottom: 8, overflow: "hidden", borderTop: `2 solid ${ORG}` },
  fullHead: { backgroundColor: ORGLT, paddingHorizontal: 8, paddingVertical: 4 },
  fullBody: { padding: 8 },
  textVal: { fontSize: 8.2, color: DARK, lineHeight: 1.4 },

  // checklist section
  checkGrid: { flexDirection: "row", gap: 7, marginBottom: 8 },
  checkCard: { flex: 1, border: `1 solid ${ORGBD}`, borderRadius: 6, backgroundColor: WHITE, overflow: "hidden", borderTop: `2 solid ${ORG}` },
  checkHead: { backgroundColor: ORGLT, paddingHorizontal: 8, paddingVertical: 4 },
  checkTitle: { fontSize: 7.5, fontWeight: 700, color: ORG2, textTransform: "uppercase", letterSpacing: 0.6 },
  checkBody: { padding: 8 },
  checkRow: { flexDirection: "row", alignItems: "center", marginBottom: 5, gap: 6 },
  checkBox: { width: 12, height: 12, borderRadius: 2, border: `1.5 solid ${ORG}`, backgroundColor: WHITE, alignItems: "center", justifyContent: "center" },
  checkLbl: { fontSize: 8, color: DARK },

  // test result boxes
  testGrid: { flexDirection: "row", flexWrap: "wrap", gap: 5, padding: 0 },
  testItem: { width: "31%", border: `1 solid ${ORGBD}`, borderRadius: 4, padding: 5 },
  testName: { fontSize: 7.2, color: ORG2, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 3 },
  testBox:  { height: 16, border: `1 solid ${LINE}`, borderRadius: 3, backgroundColor: "#fef3c7" },

  sigWrap: { marginTop: 6, padding: 8, border: `1 solid ${ORGBD}`, borderTop: `2 solid ${ORG}`, borderRadius: 6, backgroundColor: WHITE },
  sigRow:  { flexDirection: "row", gap: 10 },
  sigCol:  { flex: 1 },
  sigLine: { borderBottom: `1 solid ${LINE}`, marginTop: 18, marginBottom: 3 },
  sigLbl:  { fontSize: 7.5, color: LITE },

  footer: { marginTop: 5, borderTop: `1 solid ${ORGBD}`, paddingTop: 4, fontSize: 7, color: LITE, textAlign: "center" },
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

const INTAKE_CHECKS = ["Power on?", "Screen intact?", "Battery OK?", "Charging port?", "Buttons functional?", "Camera working?"];
const TEST_ITEMS    = ["Boot test", "Touch test", "WiFi test", "Call test", "Audio test", "Camera test", "Charge test", "SIM test", "Bluetooth", "Sensors"];

export function JobCardDocumentTechnical(props: Props) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Banner */}
        <View style={s.banner}>
          <View style={s.bannerLeft}>
            <Text style={s.bannerTitle}>JOB CARD</Text>
            <Text style={s.bannerSub}>TECHNICAL RECORD</Text>
          </View>
          <View style={s.bannerRight}>
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
              <View style={s.metaRow}><Text style={s.metaLbl}>Job Card #</Text><Text style={s.metaAccent}>{props.documentNumber}</Text></View>
              <View style={s.metaRow}><Text style={s.metaLbl}>Repair ID</Text><Text style={s.metaVal}>{props.repairId}</Text></View>
              <View style={s.metaRow}><Text style={s.metaLbl}>Date</Text><Text style={s.metaVal}>{props.dateIssued}</Text></View>
              <View style={s.metaRow}><Text style={s.metaLbl}>Status</Text><Text style={s.metaAccent}>{props.status}</Text></View>
            </View>
          </View>
        </View>

        {/* Client + Device + Received */}
        <View style={s.grid3}>
          <View style={s.card}>
            <View style={s.cardHead}><Text style={s.cardTitle}>Client Info</Text></View>
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
              {props.serialOrImei ? <View style={s.row}><Text style={s.lbl}>IMEI/S/N</Text><Text style={s.val}>{props.serialOrImei}</Text></View> : null}
              <View style={s.row}><Text style={s.lbl}>Condition</Text><Text style={s.val}>{props.physicalCondition}</Text></View>
            </View>
          </View>
          <View style={s.card}>
            <View style={s.cardHead}><Text style={s.cardTitle}>Intake Info</Text></View>
            <View style={s.cardBody}>
              <View style={s.row}><Text style={s.lbl}>Received By</Text><Text style={s.val}>{props.preparedByName}</Text></View>
              <View style={s.row}><Text style={s.lbl}>Role</Text><Text style={s.val}>{props.preparedByRole}</Text></View>
              <View style={s.row}><Text style={s.lbl}>Date</Text><Text style={s.val}>{props.dateIssued}</Text></View>
              {props.accessories ? <View style={s.row}><Text style={s.lbl}>Accessories</Text><Text style={s.val}>{props.accessories}</Text></View> : null}
            </View>
          </View>
        </View>

        {/* Issue + Diagnosis */}
        <View style={s.grid3}>
          <View style={[s.fullCard, { flex: 1 }]}>
            <View style={s.fullHead}><Text style={s.cardTitle}>Customer Issue</Text></View>
            <View style={s.fullBody}><Text style={s.textVal}>{props.customerIssue}</Text></View>
          </View>
          <View style={[s.fullCard, { flex: 1 }]}>
            <View style={s.fullHead}><Text style={s.cardTitle}>Diagnosis Summary</Text></View>
            <View style={s.fullBody}><Text style={s.textVal}>{props.diagnosisSummary}</Text></View>
          </View>
        </View>

        {/* Intake Checklist + Test Results */}
        <View style={s.checkGrid}>
          <View style={s.checkCard}>
            <View style={s.checkHead}><Text style={s.checkTitle}>Intake Checklist</Text></View>
            <View style={s.checkBody}>
              {INTAKE_CHECKS.map((item) => (
                <View style={s.checkRow} key={item}>
                  <View style={s.checkBox} />
                  <Text style={s.checkLbl}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={[s.checkCard, { flex: 2 }]}>
            <View style={s.checkHead}><Text style={s.checkTitle}>Post-Repair Test Results</Text></View>
            <View style={[s.checkBody, { flexDirection: "row", flexWrap: "wrap", gap: 5 }]}>
              {TEST_ITEMS.map((item) => (
                <View style={s.testItem} key={item}>
                  <Text style={s.testName}>{item}</Text>
                  <View style={s.testBox} />
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Parts + Notes */}
        <View style={s.grid3}>
          <View style={[s.fullCard, { flex: 1 }]}>
            <View style={s.fullHead}><Text style={s.cardTitle}>Parts Needed</Text></View>
            <View style={s.fullBody}><Text style={s.textVal}>{props.partsNeeded || "N/A"}</Text></View>
          </View>
          <View style={[s.fullCard, { flex: 1 }]}>
            <View style={s.fullHead}><Text style={s.cardTitle}>Technician Notes</Text></View>
            <View style={s.fullBody}><Text style={s.textVal}>{props.technicianNotes || "—"}</Text></View>
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
