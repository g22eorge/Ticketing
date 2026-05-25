import { prisma } from "@/lib/prisma";

export const AI_PROMPT_VERSION = "duuka-ai-2026-05-25-v2";
const VECTOR_SIZE = 128;

export function redactPii(text: string) {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[card]")
    .replace(/\b(?:imei|serial|s\/n)\s*[:#-]?\s*[a-z0-9-]{6,}\b/gi, "[device-id]");
}

function hashToken(token: string) {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function tokenize(text: string) {
  return redactPii(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !["the", "and", "for", "with", "that", "this", "from"].includes(token));
}

export function createTextEmbedding(text: string) {
  const vector = Array.from({ length: VECTOR_SIZE }, () => 0);
  for (const token of tokenize(text)) {
    const index = hashToken(token) % VECTOR_SIZE;
    vector[index] += 1;
  }
  const norm = Math.sqrt(vector.reduce((total, value) => total + value * value, 0)) || 1;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

export function cosineSimilarity(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < length; i += 1) dot += a[i] * b[i];
  return dot;
}

export async function getAiSettings(orgId?: string | null) {
  if (!orgId) {
    return { aiEnabled: true, guideEnabled: true, insightsEnabled: true, allowOrgKnowledge: true, allowPromptLogging: true, model: null as string | null };
  }
  try {
    return await prisma.aiOrgSettings.upsert({
      where: { orgId },
      update: {},
      create: { orgId },
    });
  } catch {
    return { aiEnabled: true, guideEnabled: true, insightsEnabled: true, allowOrgKnowledge: true, allowPromptLogging: true, model: null as string | null };
  }
}

export async function logAiPrompt(input: {
  orgId?: string | null;
  userId?: string | null;
  feature: string;
  model?: string | null;
  question: string;
  contextSummary?: string | null;
  mode: string;
}) {
  const settings = await getAiSettings(input.orgId);
  if (!settings.allowPromptLogging) return;
  try {
    await prisma.aiPromptLog.create({
      data: {
        orgId: input.orgId,
        userId: input.userId,
        feature: input.feature,
        promptVersion: AI_PROMPT_VERSION,
        model: input.model,
        questionRedacted: redactPii(input.question).slice(0, 4000),
        contextSummary: input.contextSummary?.slice(0, 2000) ?? null,
        mode: input.mode,
      },
    });
  } catch {
    // Prompt logs are best-effort diagnostics only.
  }
}
