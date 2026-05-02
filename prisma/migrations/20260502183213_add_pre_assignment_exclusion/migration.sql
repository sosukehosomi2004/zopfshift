-- CreateTable
CREATE TABLE "PreAssignmentExclusion" (
    "id" TEXT NOT NULL,
    "shiftPeriodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreAssignmentExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreAssignmentExclusion_shiftPeriodId_employeeId_date_key" ON "PreAssignmentExclusion"("shiftPeriodId", "employeeId", "date");
