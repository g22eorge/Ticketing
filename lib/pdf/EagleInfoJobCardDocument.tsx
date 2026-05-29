/**
 * Job Card — Eagle Info house style.
 * Uses the same clean white layout as the PDF quote template, adapted for repair jobs.
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
  statusBox: { borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 7, alignItems: "flex-end", width: "100%" },
  statusLabel: { fontSize: LABEL, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  statusValue: { fontSize: 11, fontFamily: "Helvetica-Bold" },

  hr: { borderTopWidth: 1, borderTopColor: DIVIDER, marginBottom: 16 },

  // Two-col grid for sections
  grid2: { flexDirection: "row", gap: 16, marginBottom: 14 },
  col: { flex: 1 },

  // Section
  sectionLabel: { fontSize: LABEL, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: DIVIDER, paddingBottom: 4 },
  fieldRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: DIVIDER, paddingVertical: 4.5 },
  fieldLabel: { width: 90, fontSize: 8.5, color: MUTED },
  fieldValue: { flex: 1, fontSize: 8.5, fontFamily: "Helvetica-Bold" },

  // Full-width section
  fullSection: { marginBottom: 14 },
  contentBox: { borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, padding: 10, minHeight: 40 },
  contentText: { fontSize: 8.5, lineHeight: 1.6 },

  // Checklist
  checkGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  checkItem: { flexDirection: "row", alignItems: "center", gap: 4, width: "30%" },
  checkBox: { width: 10, height: 10, borderWidth: 1, borderColor: DIVIDER, borderRadius: 2 },
  checkLabel: { fontSize: 8, color: MUTED },

  // Footer
  footerDivider: { borderTopWidth: 1, borderTopColor: DIVIDER, marginTop: 20, marginBottom: 14 },
  footer: { flexDirection: "row", gap: 32 },
  footerLabel: { fontSize: LABEL, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 },
  footerText: { fontSize: 8.5, color: INK, lineHeight: 1.5 },

  // Signatures
  sigRow: { flexDirection: "row", gap: 20, marginTop: 16 },
  sigCol: { flex: 1 },
  sigLine: { borderBottomWidth: 1, borderBottomColor: INK, marginTop: 24, marginBottom: 4 },
  sigLabel: { fontSize: 7.5, color: MUTED },
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

const DEVICE_CHECKLIST = [
  "Power cable", "Back cover", "Battery", "SIM card", "Memory card",
  "Charger", "Earphones", "Screen protector", "Case / Cover",
];

export function EagleInfoJobCardDocument(props: Props) {
  const address = [props.companyAddressLine1, props.companyAddressLine2].filter(Boolean).join(", ");
  const accList = (props.accessories !== "N/A" ? props.accessories : "").split(/,|;|\n/).map(s => s.trim()).filter(Boolean);

  return (
    <Document title={`Job Card ${props.documentNumber}`}>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            {props.companyLogoUrl
              // eslint-disable-next-line jsx-a11y/alt-text
              ? <Image style={s.logo} src={props.companyLogoUrl} />
              : null}
            <Text style={s.companyName}>{props.companyName}</Text>
            {address ? <Text style={s.companyLine}>{address}</Text> : null}
            {props.companyContacts ? (
              <View style={s.infoRow}><Text style={s.infoLabel}>PHONE:</Text><Text style={s.companyLine}>{props.companyContacts}</Text></View>
            ) : null}
            {props.companyEmail ? (
              <View style={s.infoRow}><Text style={s.infoLabel}>EMAIL:</Text><Text style={s.companyLine}>{props.companyEmail}</Text></View>
            ) : null}
          </View>
          <View style={s.headerRight}>
            <Text style={s.docTitle}>Job Card</Text>
            <Text style={s.docNumber}>#{props.documentNumber}</Text>
            <View style={s.statusBox}>
              <Text style={s.statusLabel}>Status</Text>
              <Text style={s.statusValue}>{props.status}</Text>
            </View>
          </View>
        </View>

        <View style={s.hr} />

        {/* Client + Device */}
        <View style={s.grid2}>
          <View style={s.col}>
            <Text style={s.sectionLabel}>Client Information</Text>
            {[
              { label: "Name",   value: props.clientName },
              { label: "Phone",  value: props.clientPhone },
              { label: "Email",  value: props.clientEmail || "—" },
              { label: "Org",    value: props.clientOrganization || "—" },
            ].map((r, i) => (
              <View key={i} style={s.fieldRow}>
                <Text style={s.fieldLabel}>{r.label}</Text>
                <Text style={s.fieldValue}>{r.value}</Text>
              </View>
            ))}
          </View>
          <View style={s.col}>
            <Text style={s.sectionLabel}>Device Information</Text>
            {[
              { label: "Type",        value: props.deviceType },
              { label: "Brand/Model", value: props.deviceLabel },
              { label: "Serial/IMEI", value: props.serialOrImei || "—" },
              { label: "Condition",   value: props.physicalCondition || "—" },
            ].map((r, i) => (
              <View key={i} style={s.fieldRow}>
                <Text style={s.fieldLabel}>{r.label}</Text>
                <Text style={s.fieldValue}>{r.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Accessories Checklist */}
        <View style={s.fullSection}>
          <Text style={s.sectionLabel}>Accessories Received</Text>
          <View style={s.checkGrid}>
            {DEVICE_CHECKLIST.map((item) => {
              const checked = accList.some(a => a.toLowerCase().includes(item.toLowerCase()));
              return (
                <View key={item} style={s.checkItem}>
                  <View style={[s.checkBox, checked ? { backgroundColor: INK } : {}]} />
                  <Text style={s.checkLabel}>{item}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Issue + Diagnosis */}
        <View style={s.grid2}>
          <View style={s.col}>
            <Text style={s.sectionLabel}>Customer Issue</Text>
            <View style={s.contentBox}>
              <Text style={s.contentText}>{props.customerIssue !== "N/A" ? props.customerIssue : "—"}</Text>
            </View>
          </View>
          <View style={s.col}>
            <Text style={s.sectionLabel}>Diagnosis / Parts Needed</Text>
            <View style={s.contentBox}>
              <Text style={s.contentText}>
                {[
                  props.diagnosisSummary !== "N/A" ? props.diagnosisSummary : "",
                  props.partsNeeded !== "N/A" ? `Parts: ${props.partsNeeded}` : "",
                ].filter(Boolean).join("\n") || "—"}
              </Text>
            </View>
          </View>
        </View>

        {/* Technician Notes */}
        {props.technicianNotes && props.technicianNotes !== "N/A" ? (
          <View style={s.fullSection}>
            <Text style={s.sectionLabel}>Technician Notes</Text>
            <View style={s.contentBox}>
              <Text style={s.contentText}>{props.technicianNotes}</Text>
            </View>
          </View>
        ) : null}

        {/* Footer */}
        <View style={s.footerDivider} />
        {props.footerText ? (
          <View style={s.footer}>
            <View style={{ flex: 1 }}>
              <Text style={s.footerLabel}>Notes</Text>
              <Text style={s.footerText}>{props.footerText}</Text>
            </View>
          </View>
        ) : null}

        {/* Signatures */}
        <View style={s.sigRow}>
          <View style={s.sigCol}>
            <View style={s.sigLine} />
            <Text style={s.sigLabel}>{props.signatureCompanyLabel || "Authorised Signatory"}</Text>
          </View>
          <View style={s.sigCol}>
            <View style={s.sigLine} />
            <Text style={s.sigLabel}>{props.signatureClientLabel || "Client Signature"}</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}
