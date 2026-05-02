-- CreateEnum
CREATE TYPE "DayCategory" AS ENUM ('HOLIDAY', 'WEEKEND_OR_HOLIDAY', 'WEEKDAY');

-- AlterTable: 新しい列を追加
ALTER TABLE "EmployeeRecurringRule" ADD COLUMN "dayCategory" "DayCategory";

-- 既存データの移行: isHoliday=true → dayCategory=HOLIDAY
UPDATE "EmployeeRecurringRule" SET "dayCategory" = 'HOLIDAY' WHERE "isHoliday" = true;

-- 古い列を削除
ALTER TABLE "EmployeeRecurringRule" DROP COLUMN "isHoliday";
