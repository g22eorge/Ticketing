-- AlterTable
ALTER TABLE "Job" ADD COLUMN "timelineConfidence" TEXT;
ALTER TABLE "Job" ADD COLUMN "timelineMaxMinutes" INTEGER;
ALTER TABLE "Job" ADD COLUMN "timelineMinMinutes" INTEGER;
ALTER TABLE "Job" ADD COLUMN "timelineNote" TEXT;
