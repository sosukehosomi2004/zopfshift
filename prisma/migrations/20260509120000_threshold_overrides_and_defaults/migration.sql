-- AlterTable
ALTER TABLE "public"."RequestWindow"
  ADD COLUMN "thresholdOverrides" JSONB NOT NULL DEFAULT '{}',
  ALTER COLUMN "weekdayCapacity" SET DEFAULT 6,
  ALTER COLUMN "holidayCapacity" SET DEFAULT 4;

-- 既存データも新しいデフォルト値に揃える
UPDATE "public"."RequestWindow" SET "weekdayCapacity" = 6 WHERE "weekdayCapacity" = 5;
UPDATE "public"."RequestWindow" SET "holidayCapacity" = 4 WHERE "holidayCapacity" = 10;
