-- Add lostReason to Lead table
-- Captures why a lead was lost (Price, Competitor, No Budget, Timing, etc.)
ALTER TABLE "Lead" ADD COLUMN "lostReason" TEXT;
