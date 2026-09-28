-- AlterTable
ALTER TABLE "feed" ADD COLUMN     "categories" "ProtectionCategory"[] DEFAULT ARRAY[]::"ProtectionCategory"[];

-- Backfill the feeds that already exist. Doing it here rather than in the seed
-- means an existing database is correct after `migrate deploy`, not only after
-- someone remembers to re-seed.
--
-- The adult lists serve both website and app blocking: an adult app reaches the
-- same hostnames its website does, so one list covers both toggles.
UPDATE "feed" SET "categories" = ARRAY['ADULT_WEBSITES','ADULT_APPS']::"ProtectionCategory"[]
  WHERE "id" IN ('hagezi-nsfw', 'stevenblack-porn');

UPDATE "feed" SET "categories" = ARRAY['GAMBLING']::"ProtectionCategory"[]
  WHERE "id" = 'hagezi-gambling';
