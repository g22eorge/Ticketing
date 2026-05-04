-- Normalize legacy values before enum reduction in Prisma client
UPDATE "Job"
SET communicationStatus = 'AWAITING_RESPONSE'
WHERE communicationStatus IN ('QUOTED', 'ALTERNATIVE_OFFERED');

UPDATE "Job"
SET recommendationOption = 'PROCEED_REPAIR'
WHERE recommendationOption = 'DATA_RECOVERY_ONLY';

UPDATE "Job"
SET recommendationOption = 'RETURN_UNREPAIRED'
WHERE recommendationOption = 'REFER_ELSEWHERE';
