-- CreateTable
CREATE TABLE "ChecklistItemCompletion" (
    "checklistItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistItemCompletion_pkey" PRIMARY KEY ("checklistItemId", "userId")
);

-- CreateIndex
CREATE INDEX "ChecklistItemCompletion_userId_idx" ON "ChecklistItemCompletion"("userId");

-- AddForeignKey
ALTER TABLE "ChecklistItemCompletion" ADD CONSTRAINT "ChecklistItemCompletion_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "ChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItemCompletion" ADD CONSTRAINT "ChecklistItemCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
