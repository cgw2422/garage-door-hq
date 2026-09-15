-- Move the items whose question is more specific than "did it pass?" onto
-- their own answer sets, and restate the answers already recorded in the
-- words those sets use. A separate migration because Postgres will not let an
-- enum value be used in the same transaction that adds it.
--
-- Severity is preserved throughout: Balanced and Working are healthy, exactly
-- as Pass was, so no finding becomes quotable or stops being quotable.

UPDATE "InspectionItem" SET "responseType" = 'BALANCE' WHERE "componentKey" = 'door-balance';
UPDATE "InspectionItem" SET "responseType" = 'SAFETY_TEST' WHERE "componentKey" = 'auto-reverse';
UPDATE "InspectionItem" SET "responseType" = 'ALIGNMENT' WHERE "componentKey" = 'photo-eyes';

UPDATE "InspectionItem" SET "status" = 'BALANCED'
 WHERE "responseType" = 'BALANCE' AND "status" = 'PASS';
UPDATE "InspectionItem" SET "status" = 'NEEDS_ADJUSTMENT'
 WHERE "responseType" = 'BALANCE' AND "status" = 'NEEDS_ATTENTION';
UPDATE "InspectionItem" SET "status" = 'NEEDS_ADJUSTMENT'
 WHERE "responseType" = 'BALANCE' AND "status" = 'FAIL';

UPDATE "InspectionItem" SET "status" = 'WORKING'
 WHERE "responseType" = 'ALIGNMENT' AND "status" = 'PASS';
UPDATE "InspectionItem" SET "status" = 'NEEDS_ADJUSTMENT'
 WHERE "responseType" = 'ALIGNMENT' AND "status" = 'NEEDS_ATTENTION';
UPDATE "InspectionItem" SET "status" = 'FAILED'
 WHERE "responseType" = 'ALIGNMENT' AND "status" = 'FAIL';

-- Noise loses its middle answer: normal or excessive is the judgement a
-- technician actually makes standing next to the door.
UPDATE "InspectionItem" SET "status" = 'EXCESSIVE'
 WHERE "responseType" = 'NOISE' AND "status" = 'NOTICEABLE';
