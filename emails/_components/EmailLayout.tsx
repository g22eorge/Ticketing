import * as React from "react";

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export function EmailLayout({
  preview,
  title,
  children,
}: {
  preview: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Heading as="h1" style={h1}>
              {title}
            </Heading>
          </Section>

          <Section style={content}>{children}</Section>

          <Hr style={hr} />
          <Text style={footer}>
            Eagle Info Solutions
            <br />
            This message was generated automatically.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: "#f6f7fb",
  margin: 0,
  padding: "24px 12px",
  fontFamily:
    "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji",
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: 12,
  padding: 20,
  maxWidth: 560,
  margin: "0 auto",
  border: "1px solid #e7e8ee",
};

const header: React.CSSProperties = {
  paddingBottom: 8,
};

const content: React.CSSProperties = {
  paddingTop: 4,
};

const h1: React.CSSProperties = {
  fontSize: 18,
  lineHeight: "24px",
  margin: 0,
  color: "#111827",
};

const hr: React.CSSProperties = {
  borderColor: "#e7e8ee",
  margin: "20px 0",
};

const footer: React.CSSProperties = {
  fontSize: 12,
  lineHeight: "18px",
  color: "#6b7280",
  margin: 0,
};
