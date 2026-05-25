import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ensureDefaultAiKnowledge } from "@/lib/ai-knowledge";
import { createTextEmbedding } from "@/lib/ai-governance";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

async function createArticleAction(formData: FormData) {
  "use server";
  const { user, orgId } = await requireOrgSession();
  if (!can.manageUsers(user)) redirect("/dashboard");

  const title = String(formData.get("title") ?? "").trim();
  const moduleName = String(formData.get("module") ?? "GENERAL").trim().toUpperCase();
  const content = String(formData.get("content") ?? "").trim();
  const scope = String(formData.get("scope") ?? "org");

  if (!title || !content) return;

  await prisma.aiKnowledgeArticle.create({
    data: { title, module: moduleName, content, orgId: scope === "global" ? null : orgId, embeddingJson: JSON.stringify(createTextEmbedding(`${title} ${moduleName} ${content}`)) },
  });
  revalidatePath("/settings/ai");
}

async function saveSettingsAction(formData: FormData) {
  "use server";
  const { user, orgId } = await requireOrgSession();
  if (!can.manageUsers(user)) redirect("/dashboard");

  await prisma.aiOrgSettings.upsert({
    where: { orgId },
    update: {
      aiEnabled: formData.get("aiEnabled") === "on",
      guideEnabled: formData.get("guideEnabled") === "on",
      insightsEnabled: formData.get("insightsEnabled") === "on",
      allowOrgKnowledge: formData.get("allowOrgKnowledge") === "on",
      allowPromptLogging: formData.get("allowPromptLogging") === "on",
      model: String(formData.get("model") ?? "").trim() || null,
    },
    create: {
      orgId,
      aiEnabled: formData.get("aiEnabled") === "on",
      guideEnabled: formData.get("guideEnabled") === "on",
      insightsEnabled: formData.get("insightsEnabled") === "on",
      allowOrgKnowledge: formData.get("allowOrgKnowledge") === "on",
      allowPromptLogging: formData.get("allowPromptLogging") === "on",
      model: String(formData.get("model") ?? "").trim() || null,
    },
  });
  revalidatePath("/settings/ai");
}

async function toggleArticleAction(formData: FormData) {
  "use server";
  const { user, orgId } = await requireOrgSession();
  if (!can.manageUsers(user)) redirect("/dashboard");

  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";
  if (!id) return;

  await prisma.aiKnowledgeArticle.updateMany({
    where: { id, OR: [{ orgId }, { orgId: null }] },
    data: { isActive: !isActive },
  });
  revalidatePath("/settings/ai");
}

export default async function AiSettingsPage() {
  const { user, orgId } = await requireOrgSession();
  if (!can.manageUsers(user)) redirect("/dashboard");

  await ensureDefaultAiKnowledge();

  const [articles, feedback, promptLogs, settings] = await Promise.all([
    prisma.aiKnowledgeArticle.findMany({
      where: { OR: [{ orgId }, { orgId: null }] },
      orderBy: [{ orgId: "desc" }, { updatedAt: "desc" }],
      take: 80,
    }).catch(() => []),
    prisma.aiFeedback.findMany({
      where: { OR: [{ orgId }, { orgId: null }] },
      orderBy: { createdAt: "desc" },
      take: 40,
    }).catch(() => []),
    prisma.aiPromptLog.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }).catch(() => []),
    prisma.aiOrgSettings.upsert({ where: { orgId }, update: {}, create: { orgId } }).catch(() => null),
  ]);

  const helpful = feedback.filter((item) => item.rating === "HELPFUL").length;
  const notHelpful = feedback.filter((item) => item.rating === "NOT_HELPFUL").length;

  return (
    <section className="space-y-4">
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="text-lg font-bold text-[var(--ink)]">AI Knowledge & Feedback</p>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Improve the Duuka AI Guide without training on customer data. Add curated help articles and review helpful/not-helpful feedback.
        </p>
      </div>

      <form action={saveSettingsAction} className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="text-sm font-bold text-[var(--ink)]">AI Governance</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {[
            ["aiEnabled", "Enable AI"],
            ["guideEnabled", "Enable AI Guide"],
            ["insightsEnabled", "Enable AI Insights"],
            ["allowOrgKnowledge", "Use workspace articles"],
            ["allowPromptLogging", "Log redacted prompts"],
          ].map(([name, label]) => (
            <label key={name} className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)]">
              <input type="checkbox" name={name} defaultChecked={settings ? Boolean(settings[name as keyof typeof settings]) : true} />
              {label}
            </label>
          ))}
          <input name="model" defaultValue={settings?.model ?? ""} placeholder="Model override, e.g. gemini-1.5-flash" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none md:col-span-2" />
          <button className="btn-premium rounded-lg px-4 py-2 text-sm">Save AI Settings</button>
        </div>
      </form>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4"><p className="text-xs text-[var(--ink-muted)]">Helpful</p><p className="text-2xl font-bold text-emerald-600">{helpful}</p></div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4"><p className="text-xs text-[var(--ink-muted)]">Not helpful</p><p className="text-2xl font-bold text-amber-600">{notHelpful}</p></div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4"><p className="text-xs text-[var(--ink-muted)]">Prompt logs</p><p className="text-2xl font-bold text-[var(--ink)]">{promptLogs.length}</p></div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <form action={createArticleAction} className="panel-shadow space-y-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-sm font-bold text-[var(--ink)]">Add Knowledge Article</p>
          <input name="title" required placeholder="Title" className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none" />
          <input name="module" placeholder="Module, e.g. JOBS, FINANCE, AI" className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none" />
          <textarea name="content" required rows={8} placeholder="Clear instructions the AI can cite when answering staff questions." className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none" />
          <select name="scope" className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none">
            <option value="org">This workspace only</option>
            <option value="global">Global default</option>
          </select>
          <button className="btn-premium rounded-lg px-4 py-2 text-sm">Save Article</button>
        </form>

        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-sm font-bold text-[var(--ink)]">Recent AI Feedback</p>
          <div className="mt-3 space-y-3">
            {feedback.length === 0 ? <p className="text-sm text-[var(--ink-muted)]">No AI feedback yet.</p> : null}
            {feedback.map((item) => (
              <article key={item.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  <span>{item.feature}</span>
                  <span className={item.rating === "HELPFUL" ? "text-emerald-600" : "text-amber-600"}>{item.rating.replace("_", " ")}</span>
                  <span>{item.createdAt.toLocaleString()}</span>
                </div>
                <p className="mt-2 text-xs font-semibold text-[var(--ink)]">Q: {item.question}</p>
                <p className="mt-1 line-clamp-3 text-xs text-[var(--ink-muted)]">A: {item.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </div>

      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="text-sm font-bold text-[var(--ink)]">Knowledge Articles</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {articles.map((article) => (
            <article key={article.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">{article.title}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">{article.module} · {article.orgId ? "Workspace" : "Global"}</p>
                </div>
                <form action={toggleArticleAction}>
                  <input type="hidden" name="id" value={article.id} />
                  <input type="hidden" name="isActive" value={String(article.isActive)} />
                  <button className="rounded-lg border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--ink-muted)]">
                    {article.isActive ? "Disable" : "Enable"}
                  </button>
                </form>
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">{article.content}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="text-sm font-bold text-[var(--ink)]">Recent Redacted Prompt Logs</p>
        <div className="mt-3 space-y-2">
          {promptLogs.length === 0 ? <p className="text-sm text-[var(--ink-muted)]">No prompt logs yet.</p> : null}
          {promptLogs.map((log) => (
            <article key={log.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3 text-xs">
              <p className="font-semibold text-[var(--ink)]">{log.feature} · {log.mode} · {log.promptVersion}</p>
              <p className="mt-1 text-[var(--ink-muted)]">{log.questionRedacted}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
