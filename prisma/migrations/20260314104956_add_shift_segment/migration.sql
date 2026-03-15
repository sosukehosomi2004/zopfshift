/*
  Warnings:

  - You are about to drop the column `positionId` on the `ShiftRequest` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "ShiftRequestStatus" ADD VALUE 'TENTATIVE';

-- DropForeignKey
ALTER TABLE "ShiftRequest" DROP CONSTRAINT "ShiftRequest_positionId_fkey";

-- AlterTable
ALTER TABLE "ShiftRequest" DROP COLUMN "positionId";

-- CreateTable
CREATE TABLE "ShiftSegment" (
    "id" TEXT NOT NULL,
    "shiftRequestId" TEXT NOT NULL,
    "positionId" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ShiftSegment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ShiftSegment" ADD CONSTRAINT "ShiftSegment_shiftRequestId_fkey" FOREIGN KEY ("shiftRequestId") REFERENCES "ShiftRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSegment" ADD CONSTRAINT "ShiftSegment_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
