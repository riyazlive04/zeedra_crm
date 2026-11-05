-- CreateTable
CREATE TABLE "SolarDesign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "data" JSONB NOT NULL,
    "panelCount" INTEGER NOT NULL DEFAULT 0,
    "systemKw" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shadingLossPct" DOUBLE PRECISION,
    "annualKwh" DOUBLE PRECISION,
    "shareToken" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolarDesign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SolarDesign_organizationId_updatedAt_idx" ON "SolarDesign"("organizationId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SolarDesign_shareToken_key" ON "SolarDesign"("shareToken");

-- CreateIndex
CREATE INDEX "SolarDesign_leadId_idx" ON "SolarDesign"("leadId");

-- AddForeignKey
ALTER TABLE "SolarDesign" ADD CONSTRAINT "SolarDesign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolarDesign" ADD CONSTRAINT "SolarDesign_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
