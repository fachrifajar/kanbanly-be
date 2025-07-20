/*
  Warnings:

  - You are about to drop the column `isAccepted` on the `workspace_invitations` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'CONSUMED', 'EXPIRED');

-- AlterTable
ALTER TABLE "workspace_invitations" DROP COLUMN "isAccepted",
ADD COLUMN     "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "workspace_invitations_email_idx" ON "workspace_invitations"("email");
