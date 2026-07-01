import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const C = { ink: "#0a0a0a", body: "#1c1917", muted: "#78716c", faint: "#a8a29e", rule: "#d6d3d1", accent: "#b08968" };
const F = { display: 20, title: 13, heading: 10.5, body: 9, label: 7.5, micro: 6.5 };

const s = StyleSheet.create({
  page: { paddingHorizontal: 36, paddingVertical: 32, fontSize: F.body, fontFamily: "Helvetica", color: C.body },

  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  brandName: { fontSize: F.title, fontFamily: "Helvetica-Bold", color: C.ink, letterSpacing: 0.6 },
  brandSub: { fontSize: F.label, color: C.muted, marginTop: 1 },
  brandContact: { fontSize: F.label, color: C.faint, marginTop: 2 },
  docTitle: { fontSize: F.display, fontFamily: "Helvetica-Bold", color: C.ink, textAlign: "right" },
  docMeta: { fontSize: F.label, color: C.muted, textAlign: "right", marginTop: 2 },

  accent: { borderTopWidth: 2, borderTopColor: C.accent, marginTop: 14, marginBottom: 20 },

  sectionHead: { fontSize: F.heading, fontFamily: "Helvetica-Bold", color: C.ink, letterSpacing: 0.4, marginTop: 16, marginBottom: 6, textTransform: "uppercase" },
  fieldRow: { flexDirection: "row", marginBottom: 3 },
  fieldLabel: { width: 100, fontSize: F.label, color: C.muted, textTransform: "uppercase", letterSpacing: 0.3 },
  fieldValue: { flex: 1, fontSize: F.body, fontFamily: "Helvetica-Bold", color: C.ink },

  twoCol: { flexDirection: "row", gap: 24, marginBottom: 2 },
  col: { flex: 1 },

  textBlock: { fontSize: F.body, color: C.body, lineHeight: 1.5, minHeight: 30 },

  lightRule: { borderTopWidth: 0.5, borderTopColor: C.rule, marginTop: 8, marginBottom: 8 },

  statusTag: { fontSize: F.label, fontFamily: "Helvetica-Bold", color: C.accent, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "right", marginTop: 4 },

  checkRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  checkBox: { width: 8, height: 8, borderWidth: 0.8, borderColor: C.muted, alignItems: "center", justifyContent: "center" },
  checkMark: { fontSize: 6, fontFamily: "Helvetica-Bold", color: C.accent },
  checkLabel: { fontSize: F.body, color: C.body },

  sigArea: { marginTop: 22, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: C.rule },
  sigRow: { flexDirection: "row", gap: 30, marginTop: 10 },
  sigCol: { flex: 1 },
  sigLine: { borderBottomWidth: 0.5, borderBottomColor: C.rule, marginTop: 28, marginBottom: 4 },
  sigLabel: { fontSize: F.label, color: C.muted },

  footer: { marginTop: 20, borderTopWidth: 0.5, borderTopColor: C.rule, paddingTop: 8, fontSize: F.micro, color: C.faint, textAlign: "center" },
});

type Props = {
  companyName: string;
  companyTagline?: string;
  companyAddressLine1?: string;
  companyAddressLine2?: string;
  companyContacts?: string;
  companyEmail?: string;
  companyWebsite?: string;
  companyLogoUrl?: string;
  documentNumber: string;
  dateIssued: string;
  repairId?: string;
  preparedByName: string;
  preparedByRole?: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  clientOrganization?: string;
  deviceType?: string;
  deviceLabel: string;
  serialOrImei: string;
  accessories?: string;
  physicalCondition?: string;
  customerIssue: string;
  diagnosisSummary?: string;
  partsNeeded?: string;
  technicianNotes?: string;
  status: string;
  footerText: string;
  signatureCompanyLabel?: string;
  signatureClientLabel?: string;
};

function CheckItem({ checked, label }: { checked: boolean; label: string }) {
  return (
    <View style={s.checkRow}>
      <View style={s.checkBox}>{checked ? <Text style={s.checkMark}>x</Text> : null}</View>
      <Text style={s.checkLabel}>{label}</Text>
    </View>
  );
}

export function PremiumJobCardDocument(props: Props) {
  const hasAccessories = !!props.accessories && !["n/a", "none", "-", ""].includes(props.accessories.toLowerCase().trim());
  const address = [props.companyAddressLine1, props.companyAddressLine2].filter(Boolean).join(", ");

  return (
    <Document>
      <Page size="A4" style={s.page}>

        <View style={s.top}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {props.companyLogoUrl ? <Image src={props.companyLogoUrl} style={{ width: 60, height: 30, objectFit: "contain", marginBottom: 4 }} /> : null}
            <Text style={s.brandName}>{props.companyName}</Text>
            {props.companyTagline ? <Text style={s.brandSub}>{props.companyTagline}</Text> : null}
            {(props.companyContacts || address) ? <Text style={s.brandContact}>{[props.companyContacts, address].filter(Boolean).join("  ")}</Text> : null}
          </View>
          <View>
            <Text style={s.docTitle}>Job Card</Text>
            <Text style={s.docMeta}>{props.documentNumber}</Text>
            <Text style={s.docMeta}>{props.dateIssued}</Text>
            <Text style={s.statusTag}>{props.status}</Text>
          </View>
        </View>

        <View style={s.accent} />

        <Text style={s.sectionHead}>Client</Text>
        <View style={s.twoCol}>
          <View style={s.col}>
            <View style={s.fieldRow}><Text style={s.fieldLabel}>Name</Text><Text style={s.fieldValue}>{props.clientName}</Text></View>
            <View style={s.fieldRow}><Text style={s.fieldLabel}>Phone</Text><Text style={s.fieldValue}>{props.clientPhone}</Text></View>
            {props.clientEmail ? <View style={s.fieldRow}><Text style={s.fieldLabel}>Email</Text><Text style={s.fieldValue}>{props.clientEmail}</Text></View> : null}
          </View>
          <View style={s.col}>
            {props.clientOrganization ? <View style={s.fieldRow}><Text style={s.fieldLabel}>Organization</Text><Text style={s.fieldValue}>{props.clientOrganization}</Text></View> : null}
            <View style={s.fieldRow}><Text style={s.fieldLabel}>Prepared By</Text><Text style={s.fieldValue}>{props.preparedByName}{props.preparedByRole ? ` — ${props.preparedByRole}` : ""}</Text></View>
          </View>
        </View>

        <Text style={s.sectionHead}>Device</Text>
        <View style={s.twoCol}>
          <View style={s.col}>
            <View style={s.fieldRow}><Text style={s.fieldLabel}>Device</Text><Text style={s.fieldValue}>{props.deviceLabel}</Text></View>
            <View style={s.fieldRow}><Text style={s.fieldLabel}>Serial / IMEI</Text><Text style={s.fieldValue}>{props.serialOrImei || "N/A"}</Text></View>
          </View>
          <View style={s.col}>
            <View style={s.fieldRow}><Text style={s.fieldLabel}>Type</Text><Text style={s.fieldValue}>{props.deviceType || "N/A"}</Text></View>
            <View style={s.fieldRow}><Text style={s.fieldLabel}>Accessories</Text><Text style={s.fieldValue}>{props.accessories || "None"}</Text></View>
          </View>
        </View>

        <Text style={s.sectionHead}>Condition</Text>
        <View style={s.twoCol}>
          <View style={s.col}>
            <CheckItem checked label="Screen intact" />
            <CheckItem checked={false} label="Cracked / broken screen" />
            <CheckItem checked label="Body undamaged" />
          </View>
          <View style={s.col}>
            <CheckItem checked={false} label="Liquid damage suspected" />
            <CheckItem checked={false} label="Missing parts" />
            {hasAccessories ? <CheckItem checked label="Accessories included" /> : null}
          </View>
        </View>

        <Text style={s.sectionHead}>Fault Report</Text>
        <Text style={s.textBlock}>{props.customerIssue}</Text>

        {props.diagnosisSummary ? (
          <View>
            <Text style={s.sectionHead}>Diagnosis</Text>
            <Text style={s.textBlock}>{props.diagnosisSummary}</Text>
          </View>
        ) : null}

        {props.partsNeeded ? (
          <View>
            <Text style={s.sectionHead}>Parts Needed</Text>
            <Text style={s.textBlock}>{props.partsNeeded}</Text>
          </View>
        ) : null}

        {props.technicianNotes ? (
          <View>
            <Text style={s.sectionHead}>Technician Notes</Text>
            <Text style={s.textBlock}>{props.technicianNotes}</Text>
          </View>
        ) : null}

        <View style={s.lightRule} />

        <View style={s.sigArea}>
          <View style={s.sigRow}>
            <View style={s.sigCol}>
              <View style={s.sigLine} />
              <Text style={s.sigLabel}>{props.signatureCompanyLabel || "Received by (staff)"}</Text>
            </View>
            <View style={s.sigCol}>
              <View style={s.sigLine} />
              <Text style={s.sigLabel}>{props.signatureClientLabel || "Customer signature & date"}</Text>
            </View>
          </View>
        </View>

        <Text style={s.footer}>{props.footerText}</Text>
      </Page>
    </Document>
  );
}
