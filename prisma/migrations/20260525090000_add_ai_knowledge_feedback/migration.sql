CREATE TABLE IF NOT EXISTS "AiKnowledgeArticle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT,
    "title" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embeddingJson" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AiKnowledgeArticle_orgId_module_isActive_idx" ON "AiKnowledgeArticle"("orgId", "module", "isActive");
CREATE INDEX IF NOT EXISTS "AiKnowledgeArticle_isActive_updatedAt_idx" ON "AiKnowledgeArticle"("isActive", "updatedAt");

CREATE TABLE IF NOT EXISTS "AiFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AiFeedback_orgId_feature_createdAt_idx" ON "AiFeedback"("orgId", "feature", "createdAt");
CREATE INDEX IF NOT EXISTS "AiFeedback_rating_createdAt_idx" ON "AiFeedback"("rating", "createdAt");

CREATE TABLE IF NOT EXISTS "AiPromptLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "model" TEXT,
    "questionRedacted" TEXT NOT NULL,
    "contextSummary" TEXT,
    "mode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AiPromptLog_orgId_feature_createdAt_idx" ON "AiPromptLog"("orgId", "feature", "createdAt");
CREATE INDEX IF NOT EXISTS "AiPromptLog_promptVersion_createdAt_idx" ON "AiPromptLog"("promptVersion", "createdAt");

CREATE TABLE IF NOT EXISTS "AiOrgSettings" (
    "orgId" TEXT NOT NULL PRIMARY KEY,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "guideEnabled" BOOLEAN NOT NULL DEFAULT true,
    "insightsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "allowOrgKnowledge" BOOLEAN NOT NULL DEFAULT true,
    "allowPromptLogging" BOOLEAN NOT NULL DEFAULT true,
    "model" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
