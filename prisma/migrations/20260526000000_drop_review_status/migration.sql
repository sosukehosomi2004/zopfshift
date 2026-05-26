-- REVIEW ステータスは廃止 (候補1つしか生成しないので不要)。
-- 既存の REVIEW 期間は ADJUSTING に変換し、enum から REVIEW 値を削除する。

-- 1. 既存の REVIEW を ADJUSTING に変換
UPDATE "ShiftPeriod" SET "status" = 'ADJUSTING' WHERE "status" = 'REVIEW';

-- 2. enum から REVIEW を削除
--    Postgres は enum 値の直接削除をサポートしないので、型を作り直す。
--    default 値は CAST できないので一旦外す。
ALTER TABLE "ShiftPeriod" ALTER COLUMN "status" DROP DEFAULT;

ALTER TYPE "PeriodStatus" RENAME TO "PeriodStatus_old";

CREATE TYPE "PeriodStatus" AS ENUM ('DRAFT', 'GENERATING', 'ADJUSTING', 'CONFIRMED');

ALTER TABLE "ShiftPeriod"
  ALTER COLUMN "status" TYPE "PeriodStatus"
  USING ("status"::text::"PeriodStatus");

ALTER TABLE "ShiftPeriod" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE "PeriodStatus_old";
