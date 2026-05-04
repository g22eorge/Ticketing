-- Merge legacy INTAKE role into OPS
UPDATE "User"
SET role = 'OPS'
WHERE role = 'INTAKE';
