-- AlterTable
ALTER TABLE "public"."RequestWindow" DROP COLUMN "consecutiveBlocks",
                                      DROP COLUMN "dayOverrides",
                                      ADD COLUMN "messages" JSONB NOT NULL DEFAULT '[]';
