-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME');

-- CreateEnum
CREATE TYPE "Workplace" AS ENUM ('FACTORY', 'CAFE', 'FLOOR', 'OFFICE', 'OTHER');

-- CreateEnum
CREATE TYPE "ShiftTimeSlot" AS ENUM ('EARLY', 'DAYTIME', 'CLOSE');

-- CreateEnum
CREATE TYPE "DayType" AS ENUM ('WEEKDAY_MON_THU', 'FRIDAY', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "DayOffType" AS ENUM ('DAY_OFF', 'PAID_LEAVE');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('DRAFT', 'GENERATING', 'REVIEW', 'CONFIRMED');

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "employeeNumber" SERIAL NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastNameRomaji" TEXT NOT NULL,
    "firstNameRomaji" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "EmployeeRole" NOT NULL DEFAULT 'STAFF',
    "employmentType" "EmploymentType" NOT NULL,
    "primaryWorkplace" "Workplace" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSecondaryWorkplace" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workplace" "Workplace" NOT NULL,

    CONSTRAINT "EmployeeSecondaryWorkplace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeShiftTime" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "timeSlot" "ShiftTimeSlot" NOT NULL,

    CONSTRAINT "EmployeeShiftTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "workplace" "Workplace" NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSkill" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "EmployeeSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkplaceStaffingRule" (
    "id" TEXT NOT NULL,
    "workplace" "Workplace" NOT NULL,
    "dayType" "DayType" NOT NULL,
    "requiredCount" INTEGER NOT NULL,
    "minFullTimeCount" INTEGER,
    "baseFullTimeCount" INTEGER,

    CONSTRAINT "WorkplaceStaffingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkplaceSlot" (
    "id" TEXT NOT NULL,
    "workplace" "Workplace" NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "WorkplaceSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkplaceSlotSkill" (
    "id" TEXT NOT NULL,
    "workplaceSlotId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "WorkplaceSlotSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkplaceSlotRule" (
    "id" TEXT NOT NULL,
    "workplaceSlotId" TEXT NOT NULL,
    "dayType" "DayType" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "groupKey" TEXT,

    CONSTRAINT "WorkplaceSlotRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyHolidayConfig" (
    "id" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "holidayCount" INTEGER NOT NULL,

    CONSTRAINT "MonthlyHolidayConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayOffRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "DayOffType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DayOffRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftPeriod" (
    "id" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftCandidate" (
    "id" TEXT NOT NULL,
    "shiftPeriodId" TEXT NOT NULL,
    "candidateIndex" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "id" TEXT NOT NULL,
    "shiftCandidateId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "workplace" "Workplace" NOT NULL,
    "workplaceSlotId" TEXT,
    "shiftTimeSlot" "ShiftTimeSlot",
    "isMoved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeNumber_key" ON "Employee"("employeeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeSecondaryWorkplace_employeeId_workplace_key" ON "EmployeeSecondaryWorkplace"("employeeId", "workplace");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeShiftTime_employeeId_timeSlot_key" ON "EmployeeShiftTime"("employeeId", "timeSlot");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_workplace_name_key" ON "Skill"("workplace", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeSkill_employeeId_skillId_key" ON "EmployeeSkill"("employeeId", "skillId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkplaceStaffingRule_workplace_dayType_key" ON "WorkplaceStaffingRule"("workplace", "dayType");

-- CreateIndex
CREATE UNIQUE INDEX "WorkplaceSlot_workplace_name_key" ON "WorkplaceSlot"("workplace", "name");

-- CreateIndex
CREATE UNIQUE INDEX "WorkplaceSlotSkill_workplaceSlotId_skillId_key" ON "WorkplaceSlotSkill"("workplaceSlotId", "skillId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkplaceSlotRule_workplaceSlotId_dayType_key" ON "WorkplaceSlotRule"("workplaceSlotId", "dayType");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyHolidayConfig_fiscalYear_month_key" ON "MonthlyHolidayConfig"("fiscalYear", "month");

-- CreateIndex
CREATE UNIQUE INDEX "DayOffRequest_employeeId_date_key" ON "DayOffRequest"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftCandidate_shiftPeriodId_candidateIndex_key" ON "ShiftCandidate"("shiftPeriodId", "candidateIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftAssignment_shiftCandidateId_employeeId_date_key" ON "ShiftAssignment"("shiftCandidateId", "employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- AddForeignKey
ALTER TABLE "EmployeeSecondaryWorkplace" ADD CONSTRAINT "EmployeeSecondaryWorkplace_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeShiftTime" ADD CONSTRAINT "EmployeeShiftTime_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSkill" ADD CONSTRAINT "EmployeeSkill_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSkill" ADD CONSTRAINT "EmployeeSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkplaceSlotSkill" ADD CONSTRAINT "WorkplaceSlotSkill_workplaceSlotId_fkey" FOREIGN KEY ("workplaceSlotId") REFERENCES "WorkplaceSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkplaceSlotSkill" ADD CONSTRAINT "WorkplaceSlotSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkplaceSlotRule" ADD CONSTRAINT "WorkplaceSlotRule_workplaceSlotId_fkey" FOREIGN KEY ("workplaceSlotId") REFERENCES "WorkplaceSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayOffRequest" ADD CONSTRAINT "DayOffRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCandidate" ADD CONSTRAINT "ShiftCandidate_shiftPeriodId_fkey" FOREIGN KEY ("shiftPeriodId") REFERENCES "ShiftPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_shiftCandidateId_fkey" FOREIGN KEY ("shiftCandidateId") REFERENCES "ShiftCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
