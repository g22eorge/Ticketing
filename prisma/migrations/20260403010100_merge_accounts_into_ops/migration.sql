-- Merge legacy ACCOUNTS role into OPS
UPDATE "User"
SET role = 'OPS'
WHERE role = 'ACCOUNTS';
