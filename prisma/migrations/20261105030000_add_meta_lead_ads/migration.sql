-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "metaLeadsSyncedAt" TIMESTAMP(3),
ADD COLUMN     "metaPageId" TEXT,
ADD COLUMN     "metaPageName" TEXT,
ADD COLUMN     "metaPageToken" TEXT;

-- CreateTable
CREATE TABLE "MetaLead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadgenId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "formId" TEXT,
    "formName" TEXT,
    "adName" TEXT,
    "campaignName" TEXT,
    "platform" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "fields" JSONB NOT NULL,
    "leadId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Organization_metaPageId_idx" ON "Organization"("metaPageId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaLead_organizationId_leadgenId_key" ON "MetaLead"("organizationId", "leadgenId");

-- CreateIndex
CREATE INDEX "MetaLead_organizationId_createdAt_idx" ON "MetaLead"("organizationId", "createdAt");
