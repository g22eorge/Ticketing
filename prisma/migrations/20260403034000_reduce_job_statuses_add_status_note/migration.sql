-- Add status note to keep operational context after status reduction
ALTER TABLE "Job" ADD COLUMN "statusNote" TEXT;

-- Map removed statuses into reduced set with notes
UPDATE "Job"
SET status = 'IN_REPAIR',
    statusNote = CASE
      WHEN statusNote IS NULL OR TRIM(statusNote) = '' THEN 'Migrated from REFERRED: external specialist workflow.'
      ELSE statusNote || ' | Migrated from REFERRED: external specialist workflow.'
    END
WHERE status = 'REFERRED';

UPDATE "Job"
SET status = 'IN_REPAIR',
    statusNote = CASE
      WHEN statusNote IS NULL OR TRIM(statusNote) = '' THEN 'Migrated from AWAITING_PARTS: parts pending.'
      ELSE statusNote || ' | Migrated from AWAITING_PARTS: parts pending.'
    END
WHERE status = 'AWAITING_PARTS';

UPDATE "Job"
SET status = 'CLOSED',
    statusNote = CASE
      WHEN statusNote IS NULL OR TRIM(statusNote) = '' THEN 'Migrated from CANCELLED.'
      ELSE statusNote || ' | Migrated from CANCELLED.'
    END
WHERE status = 'CANCELLED';
