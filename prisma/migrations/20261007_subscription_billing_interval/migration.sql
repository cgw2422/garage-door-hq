-- A subscription's billing interval, so a yearly price is never counted as
-- monthly revenue.
--
-- Every row that exists when this runs was created under monthly-only billing,
-- so the default is correct as a backfill as well as a default.
ALTER TABLE "Subscription"
  ADD COLUMN "billingInterval" TEXT NOT NULL DEFAULT 'month';
