-- AlterTable
ALTER TABLE "RequestWindow"
  ADD COLUMN "weekdayCapacity" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "holidayCapacity" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "dayOverrides" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "consecutiveBlocks" JSONB NOT NULL DEFAULT '[]';
