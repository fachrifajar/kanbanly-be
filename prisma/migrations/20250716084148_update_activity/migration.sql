-- DropForeignKey
ALTER TABLE "activities" DROP CONSTRAINT "activities_boardId_fkey";

-- DropForeignKey
ALTER TABLE "activities" DROP CONSTRAINT "activities_workspaceId_fkey";

-- AlterTable
ALTER TABLE "activities" ALTER COLUMN "workspaceId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "boards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
