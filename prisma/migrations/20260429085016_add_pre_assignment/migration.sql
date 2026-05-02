-- CreateTable
CREATE TABLE "PreAssignment" (
    "id" TEXT NOT NULL,
    "shiftPeriodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "workplace" "Workplace",
    "memo" TEXT,

    CONSTRAINT "PreAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreAssignment_shiftPeriodId_employeeId_date_key" ON "PreAssignment"("shiftPeriodId", "employeeId", "date");

-- AddForeignKey
ALTER TABLE "PreAssignment" ADD CONSTRAINT "PreAssignment_shiftPeriodId_fkey" FOREIGN KEY ("shiftPeriodId") REFERENCES "ShiftPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAssignment" ADD CONSTRAINT "PreAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
