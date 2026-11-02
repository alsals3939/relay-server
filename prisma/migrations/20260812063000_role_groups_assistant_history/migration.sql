-- CreateEnum
CREATE TYPE "AiConfigAssistantStatus" AS ENUM ('GATHERING', 'READY');

-- CreateTable
CREATE TABLE "RoleGroup" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleGroup_pkey" PRIMARY KEY ("id")
);

-- Backfill one default role group per existing workspace.
INSERT INTO "RoleGroup" (
    "id",
    "workspaceId",
    "name",
    "description",
    "isDefault",
    "position",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    "id",
    '기본 역할군',
    '기존 워크스페이스 데이터가 포함된 기본 역할군입니다.',
    true,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Workspace";

-- Add role group references before enforcing non-null constraints.
ALTER TABLE "AiConfig" ADD COLUMN "roleGroupId" TEXT;
ALTER TABLE "Document" ADD COLUMN "roleGroupId" TEXT;
ALTER TABLE "KnowledgeItem" ADD COLUMN "roleGroupId" TEXT;
ALTER TABLE "Checklist" ADD COLUMN "roleGroupId" TEXT;
ALTER TABLE "ChatSession" ADD COLUMN "roleGroupId" TEXT;

UPDATE "AiConfig" AS item
SET "roleGroupId" = role_group."id"
FROM "RoleGroup" AS role_group
WHERE role_group."workspaceId" = item."workspaceId"
  AND role_group."isDefault" = true;

UPDATE "Document" AS item
SET "roleGroupId" = role_group."id"
FROM "RoleGroup" AS role_group
WHERE role_group."workspaceId" = item."workspaceId"
  AND role_group."isDefault" = true;

UPDATE "KnowledgeItem" AS item
SET "roleGroupId" = role_group."id"
FROM "RoleGroup" AS role_group
WHERE role_group."workspaceId" = item."workspaceId"
  AND role_group."isDefault" = true;

UPDATE "Checklist" AS item
SET "roleGroupId" = role_group."id"
FROM "RoleGroup" AS role_group
WHERE role_group."workspaceId" = item."workspaceId"
  AND role_group."isDefault" = true;

UPDATE "ChatSession" AS item
SET "roleGroupId" = role_group."id"
FROM "RoleGroup" AS role_group
WHERE role_group."workspaceId" = item."workspaceId"
  AND role_group."isDefault" = true;

ALTER TABLE "AiConfig" ALTER COLUMN "roleGroupId" SET NOT NULL;
ALTER TABLE "Document" ALTER COLUMN "roleGroupId" SET NOT NULL;
ALTER TABLE "KnowledgeItem" ALTER COLUMN "roleGroupId" SET NOT NULL;
ALTER TABLE "Checklist" ALTER COLUMN "roleGroupId" SET NOT NULL;
ALTER TABLE "ChatSession" ALTER COLUMN "roleGroupId" SET NOT NULL;

-- CreateTable
CREATE TABLE "WorkspaceMemberRoleGroup" (
    "workspaceMemberId" TEXT NOT NULL,
    "roleGroupId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMemberRoleGroup_pkey" PRIMARY KEY ("workspaceMemberId", "roleGroupId")
);

-- Preserve access by assigning every existing member to the default group.
INSERT INTO "WorkspaceMemberRoleGroup" ("workspaceMemberId", "roleGroupId")
SELECT member."id", role_group."id"
FROM "WorkspaceMember" AS member
JOIN "RoleGroup" AS role_group
  ON role_group."workspaceId" = member."workspaceId"
 AND role_group."isDefault" = true;

-- CreateTable
CREATE TABLE "WorkspaceInvitationRoleGroup" (
    "invitationId" TEXT NOT NULL,
    "roleGroupId" TEXT NOT NULL,

    CONSTRAINT "WorkspaceInvitationRoleGroup_pkey" PRIMARY KEY ("invitationId", "roleGroupId")
);

-- Preserve pending invitation behavior with the default group.
INSERT INTO "WorkspaceInvitationRoleGroup" ("invitationId", "roleGroupId")
SELECT invitation."id", role_group."id"
FROM "WorkspaceInvitation" AS invitation
JOIN "RoleGroup" AS role_group
  ON role_group."workspaceId" = invitation."workspaceId"
 AND role_group."isDefault" = true;

-- CreateTable
CREATE TABLE "AiConfigAssistantSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "roleGroupId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '새 설정 대화',
    "status" "AiConfigAssistantStatus" NOT NULL DEFAULT 'GATHERING',
    "lastSummary" TEXT,
    "lastProposedSystemPrompt" TEXT,
    "lastMissingTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConfigAssistantSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConfigAssistantMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiConfigAssistantMessage_pkey" PRIMARY KEY ("id")
);

-- Replace workspace-level AI config uniqueness with role-group uniqueness.
DROP INDEX "AiConfig_workspaceId_key";

-- CreateIndex
CREATE UNIQUE INDEX "RoleGroup_workspaceId_name_key" ON "RoleGroup"("workspaceId", "name");
CREATE INDEX "RoleGroup_workspaceId_position_idx" ON "RoleGroup"("workspaceId", "position");
CREATE INDEX "WorkspaceMemberRoleGroup_roleGroupId_idx" ON "WorkspaceMemberRoleGroup"("roleGroupId");
CREATE INDEX "WorkspaceInvitationRoleGroup_roleGroupId_idx" ON "WorkspaceInvitationRoleGroup"("roleGroupId");
CREATE UNIQUE INDEX "AiConfig_roleGroupId_key" ON "AiConfig"("roleGroupId");
CREATE INDEX "AiConfig_workspaceId_idx" ON "AiConfig"("workspaceId");
CREATE INDEX "Document_workspaceId_roleGroupId_idx" ON "Document"("workspaceId", "roleGroupId");
CREATE INDEX "KnowledgeItem_workspaceId_roleGroupId_idx" ON "KnowledgeItem"("workspaceId", "roleGroupId");
CREATE INDEX "Checklist_workspaceId_roleGroupId_idx" ON "Checklist"("workspaceId", "roleGroupId");
CREATE INDEX "ChatSession_workspaceId_userId_roleGroupId_idx" ON "ChatSession"("workspaceId", "userId", "roleGroupId");
CREATE INDEX "AiConfigAssistantSession_workspaceId_roleGroupId_updatedAt_idx" ON "AiConfigAssistantSession"("workspaceId", "roleGroupId", "updatedAt");
CREATE INDEX "AiConfigAssistantMessage_sessionId_createdAt_idx" ON "AiConfigAssistantMessage"("sessionId", "createdAt");

-- Replace superseded indexes.
DROP INDEX "Document_workspaceId_idx";
DROP INDEX "KnowledgeItem_workspaceId_idx";
DROP INDEX "Checklist_workspaceId_idx";
DROP INDEX "ChatSession_workspaceId_userId_idx";

-- AddForeignKey
ALTER TABLE "RoleGroup" ADD CONSTRAINT "RoleGroup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMemberRoleGroup" ADD CONSTRAINT "WorkspaceMemberRoleGroup_workspaceMemberId_fkey" FOREIGN KEY ("workspaceMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMemberRoleGroup" ADD CONSTRAINT "WorkspaceMemberRoleGroup_roleGroupId_fkey" FOREIGN KEY ("roleGroupId") REFERENCES "RoleGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvitationRoleGroup" ADD CONSTRAINT "WorkspaceInvitationRoleGroup_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "WorkspaceInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvitationRoleGroup" ADD CONSTRAINT "WorkspaceInvitationRoleGroup_roleGroupId_fkey" FOREIGN KEY ("roleGroupId") REFERENCES "RoleGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiConfig" ADD CONSTRAINT "AiConfig_roleGroupId_fkey" FOREIGN KEY ("roleGroupId") REFERENCES "RoleGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_roleGroupId_fkey" FOREIGN KEY ("roleGroupId") REFERENCES "RoleGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_roleGroupId_fkey" FOREIGN KEY ("roleGroupId") REFERENCES "RoleGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Checklist" ADD CONSTRAINT "Checklist_roleGroupId_fkey" FOREIGN KEY ("roleGroupId") REFERENCES "RoleGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_roleGroupId_fkey" FOREIGN KEY ("roleGroupId") REFERENCES "RoleGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiConfigAssistantSession" ADD CONSTRAINT "AiConfigAssistantSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiConfigAssistantSession" ADD CONSTRAINT "AiConfigAssistantSession_roleGroupId_fkey" FOREIGN KEY ("roleGroupId") REFERENCES "RoleGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiConfigAssistantSession" ADD CONSTRAINT "AiConfigAssistantSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiConfigAssistantMessage" ADD CONSTRAINT "AiConfigAssistantMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiConfigAssistantSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
