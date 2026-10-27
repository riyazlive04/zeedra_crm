-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "manualOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marginAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "supersededAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastPinDeviceId" TEXT,
ADD COLUMN     "lastPinLoginAt" TIMESTAMP(3),
ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "pinSetAt" TIMESTAMP(3);

-- DropIndex
DROP INDEX "Quotation_organizationId_number_key";

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_organizationId_number_version_key" ON "Quotation"("organizationId", "number", "version");

-- CreateIndex
CREATE INDEX "Quotation_parentId_idx" ON "Quotation"("parentId");

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
