-- CreateTable
CREATE TABLE "LocationStatusEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "deviceTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationStatusEvent_organizationId_userId_createdAt_idx" ON "LocationStatusEvent"("organizationId", "userId", "createdAt");

-- AddForeignKey
ALTER TABLE "LocationStatusEvent" ADD CONSTRAINT "LocationStatusEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationStatusEvent" ADD CONSTRAINT "LocationStatusEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
