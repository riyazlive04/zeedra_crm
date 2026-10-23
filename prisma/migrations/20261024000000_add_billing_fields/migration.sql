-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "billingStatus" TEXT NOT NULL DEFAULT 'TRIALING';
ALTER TABLE "Organization" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "subscribedAt" TIMESTAMP(3);
