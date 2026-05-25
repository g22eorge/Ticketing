import { prisma } from "@/lib/prisma";
import { cosineSimilarity, createTextEmbedding, getAiSettings, redactPii } from "@/lib/ai-governance";

export type AiKnowledgeHit = {
  id: string;
  title: string;
  module: string;
  content: string;
};

export const DEFAULT_AI_KNOWLEDGE = [
  {
    title: "Jobs and repair workflow",
    module: "JOBS",
    content: "Jobs track repairs from intake to completion. Create jobs from Jobs -> New Job, capture client and device details, then move through RECEIVED, DIAGNOSING, REFERRED, AWAITING_APPROVAL, IN_REPAIR, READY_FOR_PICKUP, COMPLETED, or CLOSED. External technicians must never see client identity or pricing history.",
  },
  {
    title: "Inventory and procurement workflow",
    module: "INVENTORY",
    content: "Inventory manages parts, quantities, reorder levels, suppliers, purchase requests, purchase orders, goods received, stock counts, transfers, and stock locations. Use Goods Received for supplier stock arrivals instead of manually changing quantities.",
  },
  {
    title: "Finance and documents workflow",
    module: "FINANCE",
    content: "Finance covers invoices, receipts, expenses, bank accounts, chart of accounts, journal entries, P&L, balance sheet, cash flow, customer statements, aged receivables, and inventory value. Quotations become invoices; invoices produce receipts and delivery notes when paid or delivered.",
  },
  {
    title: "Sales, POS, and CRM workflow",
    module: "SALES",
    content: "Sales CRM tracks leads, campaigns, quotations, visits, and targets. POS handles walk-in sales and cashier shifts. Managers should review open leads, target progress, paid sales, receipts, and campaign follow-up activity.",
  },
  {
    title: "AI Guide and AI Insights",
    module: "AI",
    content: "The Duuka AI Guide helps staff learn how to use the system. AI Insights and Business Copilot help managers understand aggregate operational risks such as stuck repairs, low stock, overdue invoices, supplier payables, expenses, and target progress. AI should not receive client PII or private notes unless explicitly designed and approved.",
  },
  {
    title: "Roles and security rules",
    module: "SECURITY",
    content: "Roles control data access. ADMIN has full workspace access. OPS and FRONT_DESK manage intake and client communication. FINANCE handles billing and reports. Internal technicians update repair work. External technicians only see assigned job device details and safe diagnosis summaries, never client PII or pricing history.",
  },
] as const;

function tokens(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .slice(0, 12);
}

export async function ensureDefaultAiKnowledge() {
  try {
    for (const article of DEFAULT_AI_KNOWLEDGE) {
      const existing = await prisma.aiKnowledgeArticle.findFirst({
        where: { orgId: null, title: article.title },
        select: { id: true },
      });
      if (existing) {
        continue;
      } else {
        await prisma.aiKnowledgeArticle.create({
          data: { ...article, embeddingJson: JSON.stringify(createTextEmbedding(`${article.title} ${article.module} ${article.content}`)) },
        });
      }
    }
  } catch {
    // Older deployments may not have the AI knowledge tables yet.
  }
}

export async function retrieveAiKnowledge(query: string, orgId?: string | null, limit = 4): Promise<AiKnowledgeHit[]> {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return [];
  const settings = await getAiSettings(orgId);
  const includeOrgKnowledge = Boolean(orgId && settings.allowOrgKnowledge);
  const queryEmbedding = createTextEmbedding(query);

  try {
    const rows = await prisma.aiKnowledgeArticle.findMany({
      where: {
        isActive: true,
        OR: [
          { orgId: null },
          ...(includeOrgKnowledge ? [{ orgId }] : []),
          ...queryTokens.flatMap((token) => [
            { title: { contains: token } },
            { module: { contains: token } },
            { content: { contains: token } },
          ]),
        ],
      },
      select: { id: true, orgId: true, title: true, module: true, content: true, embeddingJson: true },
      take: 40,
      orderBy: { updatedAt: "desc" },
    });

    return rows
      .map((row) => {
        const safeText = redactPii(`${row.title} ${row.module} ${row.content}`);
        const haystack = safeText.toLowerCase();
        const score = queryTokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
        let semanticScore = 0;
        try {
          const embedding = row.embeddingJson ? JSON.parse(row.embeddingJson) as number[] : createTextEmbedding(safeText);
          semanticScore = cosineSimilarity(queryEmbedding, embedding);
        } catch {
          semanticScore = 0;
        }
        return { ...row, score: score + semanticScore * 4 };
      })
      .filter((row) => row.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score: _score, orgId: _orgId, embeddingJson: _embeddingJson, ...row }) => ({ ...row, content: redactPii(row.content) }));
  } catch {
    return [];
  }
}

export function formatKnowledgeContext(hits: AiKnowledgeHit[]) {
  if (hits.length === 0) return "";
  return [
    "Relevant Duuka ProMax knowledge base articles:",
    ...hits.map((hit, index) => `${index + 1}. ${hit.title} [${hit.module}]\n${hit.content}`),
  ].join("\n\n");
}
