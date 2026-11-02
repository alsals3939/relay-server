-- CreateEnum
CREATE TYPE "RoleGroupDraftStatus" AS ENUM ('PENDING', 'APPROVED');

-- CreateEnum
CREATE TYPE "OnboardingPlanStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "citations" JSONB;

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "roleGroupId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleGroupDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "roleGroupId" TEXT NOT NULL,
    "status" "RoleGroupDraftStatus" NOT NULL DEFAULT 'PENDING',
    "systemPrompt" TEXT NOT NULL,
    "faqItems" JSONB NOT NULL,
    "planDays" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "RoleGroupDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingPlan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "roleGroupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "OnboardingPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentDay" INTEGER NOT NULL DEFAULT 1,
    "finalSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingDay" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "goal" TEXT NOT NULL,
    "keyConcepts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingMission" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OnboardingMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingReflection" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "aiSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingReflection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentChunk_workspaceId_roleGroupId_idx" ON "DocumentChunk"("workspaceId", "roleGroupId");

-- CreateIndex
CREATE INDEX "DocumentChunk_documentId_position_idx" ON "DocumentChunk"("documentId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "RoleGroupDraft_roleGroupId_key" ON "RoleGroupDraft"("roleGroupId");

-- CreateIndex
CREATE INDEX "RoleGroupDraft_workspaceId_idx" ON "RoleGroupDraft"("workspaceId");

-- CreateIndex
CREATE INDEX "OnboardingPlan_workspaceId_roleGroupId_idx" ON "OnboardingPlan"("workspaceId", "roleGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingPlan_workspaceId_roleGroupId_userId_key" ON "OnboardingPlan"("workspaceId", "roleGroupId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingDay_planId_dayNumber_key" ON "OnboardingDay"("planId", "dayNumber");

-- CreateIndex
CREATE INDEX "OnboardingMission_dayId_position_idx" ON "OnboardingMission"("dayId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingReflection_dayId_key" ON "OnboardingReflection"("dayId");

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleGroupDraft" ADD CONSTRAINT "RoleGroupDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleGroupDraft" ADD CONSTRAINT "RoleGroupDraft_roleGroupId_fkey" FOREIGN KEY ("roleGroupId") REFERENCES "RoleGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingPlan" ADD CONSTRAINT "OnboardingPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingPlan" ADD CONSTRAINT "OnboardingPlan_roleGroupId_fkey" FOREIGN KEY ("roleGroupId") REFERENCES "RoleGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingPlan" ADD CONSTRAINT "OnboardingPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingDay" ADD CONSTRAINT "OnboardingDay_planId_fkey" FOREIGN KEY ("planId") REFERENCES "OnboardingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingMission" ADD CONSTRAINT "OnboardingMission_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "OnboardingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingReflection" ADD CONSTRAINT "OnboardingReflection_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "OnboardingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
