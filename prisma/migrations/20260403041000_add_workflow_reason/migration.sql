-- Structured workflow reason for status and operations context
ALTER TABLE "Job"
ADD COLUMN "workflowReason" TEXT NOT NULL DEFAULT 'NONE';
