-- Reassign references and remove legacy intake/accounts seed users

-- Move job creators from legacy users to OPS user
UPDATE "Job"
SET createdById = (SELECT id FROM "User" WHERE email = 'ops@eagle.local' LIMIT 1)
WHERE createdById IN (
  SELECT id FROM "User" WHERE email IN ('intake@eagle.local', 'accounts@eagle.local')
)
AND EXISTS (SELECT 1 FROM "User" WHERE email = 'ops@eagle.local');

-- Clear technician assignment if a legacy non-tech user is assigned
UPDATE "Job"
SET assignedToId = NULL
WHERE assignedToId IN (
  SELECT id FROM "User" WHERE email IN ('intake@eagle.local', 'accounts@eagle.local')
);

-- Reassign payout markers to admin user
UPDATE "Job"
SET externalPaidById = (SELECT id FROM "User" WHERE email = 'admin@eagle.local' LIMIT 1)
WHERE externalPaidById IN (
  SELECT id FROM "User" WHERE email IN ('intake@eagle.local', 'accounts@eagle.local')
)
AND EXISTS (SELECT 1 FROM "User" WHERE email = 'admin@eagle.local');

-- Reassign audit logs to admin user
UPDATE "AuditLog"
SET userId = (SELECT id FROM "User" WHERE email = 'admin@eagle.local' LIMIT 1)
WHERE userId IN (
  SELECT id FROM "User" WHERE email IN ('intake@eagle.local', 'accounts@eagle.local')
)
AND EXISTS (SELECT 1 FROM "User" WHERE email = 'admin@eagle.local');

-- Reassign client notes to OPS user
UPDATE "ClientNote"
SET authorId = (SELECT id FROM "User" WHERE email = 'ops@eagle.local' LIMIT 1)
WHERE authorId IN (
  SELECT id FROM "User" WHERE email IN ('intake@eagle.local', 'accounts@eagle.local')
)
AND EXISTS (SELECT 1 FROM "User" WHERE email = 'ops@eagle.local');

-- Delete legacy users (sessions/accounts cascade from schema)
DELETE FROM "User"
WHERE email IN ('intake@eagle.local', 'accounts@eagle.local');
