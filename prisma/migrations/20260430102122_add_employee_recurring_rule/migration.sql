-- CreateEnum
CREATE TYPE "RecurringRuleType" AS ENUM ('ALWAYS_OFF', 'ALWAYS_WORK');

-- CreateTable
CREATE TABLE "EmployeeRecurringRule" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "isHoliday" BOOLEAN,
    "ruleType" "RecurringRuleType" NOT NULL,
    "workplace" "Workplace",
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeRecurringRule_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "EmployeeRecurringRule" ADD CONSTRAINT "EmployeeRecurringRule_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
