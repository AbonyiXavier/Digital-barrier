-- Constraints Prisma's schema language cannot express.

-- At most one pending disable request per user. The whole UI assumes a single
-- pending request (usePendingRequest returns the first match), so two would be
-- a silent correctness bug rather than a visible one.
CREATE UNIQUE INDEX "one_pending_request_per_user"
  ON "disable_request" ("userId")
  WHERE "status" = 'PENDING';

-- Protection level is 1..4, mapping 1:1 onto a lock method.
ALTER TABLE "protection"
  ADD CONSTRAINT "protection_lock_level_range"
  CHECK ("lockLevel" BETWEEN 1 AND 4);

-- The waiting period is a closed set, not a free integer: the UI offers exactly
-- these four and describeWaitingPeriod() only formats these cleanly.
ALTER TABLE "protection"
  ADD CONSTRAINT "protection_waiting_period_allowed"
  CHECK ("waitingPeriodMinutes" IN (15, 60, 1440, 2880));

-- targetLevel is set if and only if the intent is to weaken the lock.
ALTER TABLE "disable_request"
  ADD CONSTRAINT "request_target_level_matches_intent"
  CHECK (
    ("intent" = 'LOWER_LEVEL' AND "targetLevel" BETWEEN 1 AND 4)
    OR ("intent" = 'DISABLE' AND "targetLevel" IS NULL)
  );

-- readyAt belongs to a delay, expiresAt to a partner request. Enforcing this
-- keeps the overloaded "resolvesAt" of the prototype from creeping back in.
ALTER TABLE "disable_request"
  ADD CONSTRAINT "request_deadline_matches_method"
  CHECK (
    ("method" = 'DELAY' AND "readyAt" IS NOT NULL AND "expiresAt" IS NULL)
    OR ("method" = 'PARTNER' AND "expiresAt" IS NOT NULL AND "readyAt" IS NULL)
  );

-- A block count is never negative.
ALTER TABLE "block_count"
  ADD CONSTRAINT "block_count_non_negative" CHECK ("count" >= 0);

-- renewsAt is set if and only if the plan is premium.
ALTER TABLE "subscription"
  ADD CONSTRAINT "subscription_renews_at_matches_plan"
  CHECK (
    ("plan" = 'PREMIUM' AND "renewsAt" IS NOT NULL)
    OR ("plan" = 'FREE' AND "renewsAt" IS NULL)
  );
