import { Prisma, type CommunicationTemplate, type OutboundMessageChannel } from "@prisma/client";

import { prisma } from "@/lib/prisma";

function supportsTemplates() {
  return Boolean(Prisma.dmmf.datamodel.models.find((m) => m.name === "CommunicationTemplate"));
}

export function extractTemplateVariables(text: string): string[] {
  const set = new Set<string>();
  const re = /\{([a-zA-Z0-9_]+)\}/g;
  for (const match of text.matchAll(re)) {
    const key = match[1];
    if (key) set.add(key);
  }
  return [...set].sort();
}

export function renderTemplateText(text: string, variables: Record<string, string | number | null | undefined>): string {
  return text.replaceAll(/\{([a-zA-Z0-9_]+)\}/g, (full, key: string) => {
    const raw = variables[key];
    if (raw === null || raw === undefined) return full;
    return String(raw);
  });
}

export async function getCommunicationTemplate(key: string, channel: OutboundMessageChannel): Promise<CommunicationTemplate | null> {
  if (!supportsTemplates()) return null;
  try {
    return await prisma.communicationTemplate.findFirst({
      where: { key, channel },
    });
  } catch {
    // If the table isn't migrated yet, silently fall back.
    return null;
  }
}

export async function renderCommunicationTemplate(input: {
  key: string;
  channel: OutboundMessageChannel;
  variables: Record<string, string | number | null | undefined>;
  fallback?: { subject?: string; body: string };
}): Promise<{
  subject?: string;
  body: string;
  usedTemplate: boolean;
  metaTemplateName: string | null;
  metaLanguageCode: string;
  metaParamValues: string[];
}> {
  const template = await getCommunicationTemplate(input.key, input.channel);
  if (!template || !template.isActive) {
    return {
      subject: input.fallback?.subject,
      body: input.fallback?.body ?? "",
      usedTemplate: false,
      metaTemplateName: null,
      metaLanguageCode: "en",
      metaParamValues: [],
    };
  }

  const subject = template.subject ? renderTemplateText(template.subject, input.variables) : undefined;
  const body = renderTemplateText(template.body, input.variables);

  // Extract param values in the order declared in the template's `variables` JSON array.
  // This order must match the {{1}}, {{2}}… positions in the approved Meta template.
  let metaParamValues: string[] = [];
  if (template.metaTemplateName) {
    let varOrder: string[] = [];
    try {
      const parsed = JSON.parse(template.variables ?? "[]");
      if (Array.isArray(parsed)) varOrder = parsed.map(String);
    } catch {
      varOrder = [];
    }
    metaParamValues = varOrder.map((k) => {
      const v = input.variables[k];
      return v == null ? "" : String(v);
    });
  }

  return {
    subject,
    body,
    usedTemplate: true,
    metaTemplateName: template.metaTemplateName ?? null,
    metaLanguageCode: template.metaLanguageCode ?? "en",
    metaParamValues,
  };
}
