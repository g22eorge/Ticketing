import { Resend } from "resend";
import type { ReactElement } from "react";

function normalizeFrom(value: string): string | null {
  // Guard against common env formatting issues (quotes, smart quotes, extra whitespace).
  const trimmed = value
    .trim()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/^['\"]+|['\"]+$/g, "")
    .trim();

  const emailRe = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;

  // Name <email@domain>
  const m = trimmed.match(/^(.*?)<\s*([^>]+)\s*>$/);
  if (m) {
    const name = m[1]?.trim().replace(/^['\"]+|['\"]+$/g, "").trim();
    const email = (m[2] ?? "").trim();
    if (!emailRe.test(email)) return null;
    return name ? `${name} <${email}>` : email;
  }

  // email@domain
  if (emailRe.test(trimmed)) return trimmed;

  return null;
}

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export function emailIsConfigured() {
  const fromCandidate = process.env.RESEND_ALERTS_FROM || process.env.RESEND_FROM;
  const from = fromCandidate ? normalizeFrom(fromCandidate) : null;
  // Sending capability should not depend on a specific alert recipient.
  return Boolean(process.env.RESEND_API_KEY && from);
}

export async function sendEmail(input: {
  to: string | string[];
  subject: string;
  text: string;
  react?: ReactElement;
  from?: string;
}) {
  const resend = getResend();
  if (!resend) {
    return { success: false as const, error: "Email not configured" };
  }

  const fromCandidate = input.from ?? process.env.RESEND_ALERTS_FROM ?? process.env.RESEND_FROM;
  if (!fromCandidate) return { success: false as const, error: "Missing RESEND_FROM" };
  const from = normalizeFrom(fromCandidate);
  if (!from) {
    return {
      success: false as const,
      error: "Invalid RESEND_FROM format. Use email@domain.com or Name <email@domain.com>.",
    };
  }

  try {
    const res = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.react ? { react: input.react } : {}),
    });

    // resend returns { data, error }
    type ResendSendResult = { data?: { id?: string } | null; error?: { message?: string } | string | null };
    const result = res as unknown as ResendSendResult;

    if (result.error) {
      const message = typeof result.error === "string" ? result.error : result.error.message;
      return { success: false as const, error: String(message ?? result.error) };
    }

    const id = result.data?.id;
    return { success: true as const, messageId: typeof id === "string" ? id : undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false as const, error: message };
  }
}
