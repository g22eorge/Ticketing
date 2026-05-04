-- Deactivate legacy seed users from removed role split
UPDATE "User"
SET role = 'OPS',
    isActive = false,
    updatedAt = CURRENT_TIMESTAMP
WHERE email IN ('intake@eagle.local', 'accounts@eagle.local');
