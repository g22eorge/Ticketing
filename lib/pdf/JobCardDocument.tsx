import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const A = "#D97706"; // amber accent
const DARK = "#0f172a";
const MID = "#475569";
const LIGHT = "#94a3b8";
const BG = "#fffbf2";
const WHITE = "#ffffff";

const s = StyleSheet.create({
  page: { padding: 20, fontSize: 8.6, color: DARK, backgroundColor: BG },

  // ── top banner ──────────────────────────────────────────────────────────
  banner: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 10,
    borderRadius: 8,
    overflow: "hidden",
    border: `1 solid ${A}`,
  },
  bannerLeft: {
    backgroundColor: A,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 90,
  },
  bannerTitle: { fontSize: 16, fontWeight: 700, color: WHITE, letterSpacing: 1.5 },
  bannerSub: { fontSize: 7, color: WHITE, letterSpacing: 0.8, marginTop: 1 },
  bannerRight: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "stretch",
    backgroundColor: WHITE,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bannerCompany: { justifyContent: "center" },
  bannerCompanyName: { fontSize: 11, fontWeight: 700, color: DARK },
  bannerCompanyLine: { fontSize: 7.6, color: MID, marginTop: 1 },
  bannerMeta: { alignItems: "flex-end", justifyContent: "center" },
  bannerMetaRow: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  bannerMetaLabel: { fontSize: 7, color: LIGHT, textTransform: "uppercase", letterSpacing: 0.4, marginRight: 4 },
  bannerMetaValue: { fontSize: 8.6, fontWeight: 700, color: DARK },
  bannerMetaValueAccent: { fontSize: 9.5, fontWeight: 700, color: A },

  // ── status strip ────────────────────────────────────────────────────────
  statusStrip: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
    border: `1 solid #fcd34d`,
    backgroundColor: "#fffbeb",
    gap: 3,
  },
  statusPillLabel: { fontSize: 6.8, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.4 },
  statusPillValue: { fontSize: 7.8, fontWeight: 700, color: "#78350f" },

  // ── two-col grid ─────────────────────────────────────────────────────────
  grid: { flexDirection: "row", gap: 6, marginBottom: 6 },
  col: { width: "49%" },

  // ── section ─────────────────────────────────────────────────────────────
  section: {
    marginBottom: 6,
    borderRadius: 7,
    border: `1 solid #fed7aa`,
    borderTop: `3 solid ${A}`,
    backgroundColor: WHITE,
    overflow: "hidden",
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#fff7ed",
    borderBottom: `1 solid #fed7aa`,
    gap: 4,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: A,
  },
  sectionTitle: { fontSize: 8, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.7 },
  sectionBody: { paddingHorizontal: 8, paddingVertical: 6 },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 4,
    paddingBottom: 3,
    borderBottom: `1 solid #fef3c7`,
  },
  label: { width: "38%", fontSize: 7.6, color: MID },
  value: { width: "62%", fontSize: 8.4, fontWeight: 600, color: DARK },

  // ── long text field ──────────────────────────────────────────────────────
  fieldLabel: { fontSize: 7, color: LIGHT, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 },
  fieldBox: {
    border: `1 solid #fde68a`,
    borderRadius: 5,
    backgroundColor: "#fffbeb",
    padding: 6,
    minHeight: 44,
    marginBottom: 5,
  },
  fieldValue: { fontSize: 8.2, color: DARK, lineHeight: 1.45 },

  bulletItem: { flexDirection: "row", alignItems: "flex-start", marginBottom: 2, gap: 4 },
  bulletMark: { fontSize: 8, color: A, width: 8 },
  bulletText: { flex: 1, fontSize: 8.2, fontWeight: 600, color: DARK },

  // ── checklist ───────────────────────────────────────────────────────────
  checkRow: { flexDirection: "row", alignItems: "center", marginBottom: 4, gap: 6 },
  checkBox: {
    width: 11, height: 11, borderRadius: 2,
    border: `1.5 solid ${A}`, backgroundColor: WHITE,
    alignItems: "center", justifyContent: "center",
  },
  checkBoxFilled: { backgroundColor: A },
  checkMark: { fontSize: 7, fontWeight: 700, color: WHITE },
  checkLabel: { fontSize: 8, color: DARK },

  // ── signatures ──────────────────────────────────────────────────────────
  sigWrap: {
    marginTop: 4,
    padding: 8,
    border: `1 solid #fed7aa`,
    borderTop: `2 solid ${A}`,
    borderRadius: 6,
    backgroundColor: WHITE,
  },
  sigRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  sigCol: { width: "50%" },
  sigLine: { borderBottom: `1 solid #94a3b8`, marginTop: 16, marginBottom: 3 },
  sigLabel: { fontSize: 7.4, color: MID },
  sigName: { fontSize: 8.4, fontWeight: 700, color: DARK },

  footer: {
    marginTop: 4,
    paddingTop: 4,
    borderTop: `1 solid #fed7aa`,
    fontSize: 7.2,
    color: LIGHT,
    textAlign: "center",
  },
});

type Props = {
  companyName: string;
  companyTagline?: string;
  companyAddressLine1: string;
  companyAddressLine2: string;
  companyContacts: string;
  companyEmail?: string;
  companyWebsite?: string;
  companyLogoUrl?: string;
  documentNumber: string;
  dateIssued: string;
  repairId: string;
  preparedByName: string;
  preparedByRole: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientOrganization: string;
  deviceType: string;
  deviceLabel: string;
  serialOrImei: string;
  accessories: string;
  physicalCondition: string;
  customerIssue: string;
  diagnosisSummary: string;
  partsNeeded: string;
  technicianNotes: string;
  status: string;
  footerText: string;
  signatureCompanyLabel: string;
  signatureClientLabel: string;
  statusQrDataUrl?: string;
};

function BulletField({ value }: { value: string }) {
  const lines = (value ?? "").split(/\n|\||;/g).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return <Text style={s.fieldValue}>N/A</Text>;
  return (
    <View>
      {lines.map((line, i) => (
        <View style={s.bulletItem} key={i}>
          <Text style={s.bulletMark}>•</Text>
          <Text style={s.bulletText}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

function CheckItem({ checked, label }: { checked: boolean; label: string }) {
  return (
    <View style={s.checkRow}>
      <View style={[s.checkBox, checked ? s.checkBoxFilled : {}]}>
        {checked ? <Text style={s.checkMark}>✓</Text> : null}
      </View>
      <Text style={s.checkLabel}>{label}</Text>
    </View>
  );
}

export function JobCardDocument(props: Props) {
  const hasAccessories = !!props.accessories && !["n/a", "none", "-", ""].includes(props.accessories.toLowerCase().trim());

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Banner */}
        <View style={s.banner}>
          <View style={s.bannerLeft}>
            <Text style={s.bannerTitle}>JOB CARD</Text>
            <Text style={s.bannerSub}>INTAKE RECORD</Text>
          </View>
          <View style={s.bannerRight}>
            <View style={s.bannerCompany}>
              {props.companyLogoUrl ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image style={{ width: 40, height: 40, marginBottom: 4 }} src={props.companyLogoUrl} />
              ) : null}
              <Text style={s.bannerCompanyName}>{props.companyName}</Text>
              {props.companyTagline ? <Text style={s.bannerCompanyLine}>{props.companyTagline}</Text> : null}
              <Text style={s.bannerCompanyLine}>{props.companyContacts}</Text>
            </View>
            <View style={s.bannerMeta}>
              <View style={s.bannerMetaRow}>
                <Text style={s.bannerMetaLabel}>Job Card #</Text>
                <Text style={s.bannerMetaValueAccent}>{props.documentNumber}</Text>
              </View>
              <View style={s.bannerMetaRow}>
                <Text style={s.bannerMetaLabel}>Job #</Text>
                <Text style={s.bannerMetaValue}>{props.repairId}</Text>
              </View>
              <View style={s.bannerMetaRow}>
                <Text style={s.bannerMetaLabel}>Date</Text>
                <Text style={s.bannerMetaValue}>{props.dateIssued}</Text>
              </View>
              <View style={s.bannerMetaRow}>
                <Text style={s.bannerMetaLabel}>Received By</Text>
                <Text style={s.bannerMetaValue}>{props.preparedByName}</Text>
              </View>
              {props.statusQrDataUrl ? (
                <View style={{ marginTop: 4, alignItems: "flex-end" }}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <Image style={{ width: 42, height: 42 }} src={props.statusQrDataUrl} />
                  <Text style={{ fontSize: 5.5, color: LIGHT, marginTop: 1 }}>Scan to track</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Status strip */}
        <View style={s.statusStrip}>
          <View style={s.statusPill}>
            <Text style={s.statusPillLabel}>Status</Text>
            <Text style={s.statusPillValue}>{props.status}</Text>
          </View>
          <View style={s.statusPill}>
            <Text style={s.statusPillLabel}>Device</Text>
            <Text style={s.statusPillValue}>{props.deviceType}</Text>
          </View>
        </View>

        {/* Client + Device */}
        <View style={s.grid}>
          <View style={s.col}>
            <View style={s.section}>
              <View style={s.sectionHead}>
                <View style={s.sectionDot} />
                <Text style={s.sectionTitle}>Customer</Text>
              </View>
              <View style={s.sectionBody}>
                <View style={s.row}><Text style={s.label}>Name</Text><Text style={s.value}>{props.clientName}</Text></View>
                <View style={s.row}><Text style={s.label}>Phone</Text><Text style={s.value}>{props.clientPhone}</Text></View>
                {props.clientEmail ? <View style={s.row}><Text style={s.label}>Email</Text><Text style={s.value}>{props.clientEmail}</Text></View> : null}
                {props.clientOrganization ? <View style={s.row}><Text style={s.label}>Org</Text><Text style={s.value}>{props.clientOrganization}</Text></View> : null}
              </View>
            </View>
          </View>

          <View style={s.col}>
            <View style={s.section}>
              <View style={s.sectionHead}>
                <View style={s.sectionDot} />
                <Text style={s.sectionTitle}>Device</Text>
              </View>
              <View style={s.sectionBody}>
                <View style={s.row}><Text style={s.label}>Type</Text><Text style={s.value}>{props.deviceType}</Text></View>
                <View style={s.row}><Text style={s.label}>Model</Text><Text style={s.value}>{props.deviceLabel}</Text></View>
                <View style={s.row}><Text style={s.label}>Serial/IMEI</Text><Text style={s.value}>{props.serialOrImei || "N/A"}</Text></View>
              </View>
            </View>
          </View>
        </View>

        {/* Physical checklist + accessories */}
        <View style={s.grid}>
          <View style={s.col}>
            <View style={s.section}>
              <View style={s.sectionHead}>
                <View style={s.sectionDot} />
                <Text style={s.sectionTitle}>Physical Condition</Text>
              </View>
              <View style={s.sectionBody}>
                <CheckItem checked label="Screen intact" />
                <CheckItem checked={false} label="Cracked / broken screen" />
                <CheckItem checked label="Body undamaged" />
                <CheckItem checked={false} label="Liquid damage suspected" />
                <CheckItem checked={false} label="Missing parts" />
                {props.physicalCondition ? (
                  <>
                    <Text style={[s.fieldLabel, { marginTop: 4 }]}>Intake notes</Text>
                    <Text style={[s.fieldValue, { color: MID }]}>{props.physicalCondition}</Text>
                  </>
                ) : null}
              </View>
            </View>
          </View>

          <View style={s.col}>
            <View style={s.section}>
              <View style={s.sectionHead}>
                <View style={s.sectionDot} />
                <Text style={s.sectionTitle}>Accessories Received</Text>
              </View>
              <View style={s.sectionBody}>
                <CheckItem checked={hasAccessories} label="Charger / cable" />
                <CheckItem checked={false} label="Power adapter" />
                <CheckItem checked={false} label="Protective case" />
                <CheckItem checked={false} label="SIM card removed" />
                {hasAccessories ? (
                  <>
                    <Text style={[s.fieldLabel, { marginTop: 4 }]}>Listed items</Text>
                    <Text style={[s.fieldValue, { color: MID }]}>{props.accessories}</Text>
                  </>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        {/* Customer issue + Diagnosis */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <View style={s.sectionDot} />
            <Text style={s.sectionTitle}>Fault Report & Diagnosis</Text>
          </View>
          <View style={s.sectionBody}>
            <View style={s.grid}>
              <View style={s.col}>
                <Text style={s.fieldLabel}>Customer reported fault</Text>
                <View style={s.fieldBox}><BulletField value={props.customerIssue} /></View>
              </View>
              <View style={s.col}>
                <Text style={s.fieldLabel}>Technician diagnosis</Text>
                <View style={s.fieldBox}><BulletField value={props.diagnosisSummary || "Pending diagnosis"} /></View>
              </View>
            </View>
            <View style={s.grid}>
              <View style={s.col}>
                <Text style={s.fieldLabel}>Parts needed</Text>
                <View style={s.fieldBox}><BulletField value={props.partsNeeded || "To be determined"} /></View>
              </View>
              <View style={s.col}>
                <Text style={s.fieldLabel}>Technician notes</Text>
                <View style={s.fieldBox}><BulletField value={props.technicianNotes || "—"} /></View>
              </View>
            </View>
          </View>
        </View>

        {/* Signatures */}
        <View style={s.sigWrap} wrap={false}>
          <Text style={[s.sectionTitle, { color: "#92400e" }]}>Acknowledgement</Text>
          <View style={s.sigRow}>
            <View style={s.sigCol}>
              <Text style={s.sigName}>{props.signatureCompanyLabel}</Text>
              <View style={s.sigLine} />
              <Text style={s.sigLabel}>Received by (staff signature)</Text>
            </View>
            <View style={s.sigCol}>
              <Text style={s.sigName}>{props.signatureClientLabel}</Text>
              <View style={s.sigLine} />
              <Text style={s.sigLabel}>Customer signature & date</Text>
            </View>
          </View>
          <Text style={s.footer}>{props.footerText}</Text>
        </View>

      </Page>
    </Document>
  );
}
