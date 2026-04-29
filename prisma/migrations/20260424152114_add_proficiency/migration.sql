-- CreateEnum
CREATE TYPE "Proficiency" AS ENUM ('LOW', 'MID', 'HIGH');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "floorProficiency" "Proficiency";

-- AlterTable
ALTER TABLE "EmployeeSkill" ADD COLUMN     "proficiency" "Proficiency";
