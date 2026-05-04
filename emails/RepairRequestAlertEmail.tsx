import * as React from "react";

import { Button, Section, Text } from "@react-email/components";

import { EmailLayout } from "@/emails/_components/EmailLayout";

function label(value: string | null | undefined) {
  return value && value.trim() ? value.trim() : "-";
}

export type RepairRequestAlertEmailProps = {
  requestNumber: string;
  createdAtISO: string;
  customerName: string;
  phone: string;
  email?: string | null;
  deviceType: string;
  brand: string;
  model?: string | null;
  problemDescription: string;
  handoverMethod: string;
  intakeUrl?: string | null;
};

export function RepairRequestAlertEmail(props: RepairRequestAlertEmailProps) {
  return (
    <EmailLayout
      preview={`New repair request ${props.requestNumber}`}
      title={`New Repair Request ${props.requestNumber}`}
    >
      <Text style={p}>
        A new repair request has been submitted.
      </Text>

      <Section style={card}>
        <Text style={row}>
          <strong>Request</strong>: {label(props.requestNumber)}
        </Text>
        <Text style={row}>
          <strong>Created</strong>: {label(props.createdAtISO)}
        </Text>
        <Text style={row}>
          <strong>Name</strong>: {label(props.customerName)}
        </Text>
        <Text style={row}>
          <strong>Phone</strong>: {label(props.phone)}
        </Text>
        <Text style={row}>
          <strong>Email</strong>: {label(props.email)}
        </Text>
        <Text style={row}>
          <strong>Device</strong>: {label(props.deviceType)}
        </Text>
        <Text style={row}>
          <strong>Brand/Model</strong>: {label(props.brand)} {label(props.model)}
        </Text>
        <Text style={row}>
          <strong>Handover</strong>: {label(props.handoverMethod)}
        </Text>
      </Section>

      <Text style={h2}>Problem</Text>
      <Text style={pre}>{label(props.problemDescription)}</Text>

      {props.intakeUrl ? (
        <Section style={{ paddingTop: 12 }}>
          <Button href={props.intakeUrl} style={button}>
            Open Intake
          </Button>
        </Section>
      ) : null}
    </EmailLayout>
  );
}

const p: React.CSSProperties = {
  fontSize: 14,
  lineHeight: "20px",
  color: "#111827",
  margin: "0 0 12px 0",
};

const h2: React.CSSProperties = {
  fontSize: 13,
  lineHeight: "18px",
  margin: "16px 0 6px 0",
  color: "#111827",
  fontWeight: 700,
};

const card: React.CSSProperties = {
  border: "1px solid #e7e8ee",
  borderRadius: 10,
  padding: 12,
  backgroundColor: "#fbfbfd",
};

const row: React.CSSProperties = {
  fontSize: 13,
  lineHeight: "18px",
  color: "#111827",
  margin: "0 0 6px 0",
};

const pre: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  fontSize: 13,
  lineHeight: "18px",
  color: "#111827",
  margin: 0,
  border: "1px solid #e7e8ee",
  borderRadius: 10,
  padding: 12,
  backgroundColor: "#ffffff",
};

const button: React.CSSProperties = {
  backgroundColor: "#111827",
  color: "#ffffff",
  borderRadius: 10,
  padding: "10px 12px",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 700,
  display: "inline-block",
};
