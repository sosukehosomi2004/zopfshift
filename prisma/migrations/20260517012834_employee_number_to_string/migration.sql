-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "employeeNumber" DROP DEFAULT,
ALTER COLUMN "employeeNumber" SET DATA TYPE TEXT;
DROP SEQUENCE "Employee_employeeNumber_seq";
