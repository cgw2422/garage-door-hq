-- Answers recorded on the old universal scale, restated in the words their
-- component now uses. A separate migration because Postgres will not let an
-- enum value be used in the same transaction that adds it.
--
-- Severity is preserved exactly: Good and Pass are both healthy, Failed and
-- Fail are both critical, so nothing that was quotable stops being quotable
-- and no report changes its shape.

UPDATE "InspectionItem" SET "status" = 'PASS'
 WHERE "responseType" = 'FUNCTION_TEST' AND "status" = 'GOOD';
-- A worn function test was always a stretch; it meant "works, but watch it".
UPDATE "InspectionItem" SET "status" = 'NEEDS_ATTENTION'
 WHERE "responseType" = 'FUNCTION_TEST' AND "status" = 'WORN';
UPDATE "InspectionItem" SET "status" = 'FAIL'
 WHERE "responseType" = 'FUNCTION_TEST' AND "status" = 'FAILED';

UPDATE "InspectionItem" SET "status" = 'COMPLETE'
 WHERE "responseType" = 'MAINTENANCE' AND "status" = 'GOOD';
UPDATE "InspectionItem" SET "status" = 'NEEDED'
 WHERE "responseType" = 'MAINTENANCE'
   AND "status" IN ('WORN', 'NEEDS_ATTENTION', 'FAILED');

UPDATE "InspectionItem" SET "status" = 'NORMAL'
 WHERE "responseType" = 'NOISE' AND "status" = 'GOOD';
UPDATE "InspectionItem" SET "status" = 'NOTICEABLE'
 WHERE "responseType" = 'NOISE' AND "status" = 'WORN';
UPDATE "InspectionItem" SET "status" = 'EXCESSIVE'
 WHERE "responseType" = 'NOISE' AND "status" IN ('NEEDS_ATTENTION', 'FAILED');
