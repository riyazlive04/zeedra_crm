-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'SALES_MANAGER', 'TELECALLER', 'FIELD_SALES', 'INSTALLER');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'FACEBOOK', 'INSTAGRAM', 'GOOGLE_ADS', 'WHATSAPP', 'REFERRAL', 'WALK_IN', 'JUSTDIAL', 'INDIAMART', 'CHANNEL_PARTNER', 'COLD_CALL', 'EXHIBITION', 'OTHER');

-- CreateEnum
CREATE TYPE "Segment" AS ENUM ('RESIDENTIAL', 'HOUSING_SOCIETY', 'COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURE', 'INSTITUTIONAL');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_DONE', 'QUOTATION_SENT', 'NEGOTIATION', 'WON', 'LOST', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "Temperature" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "RoofType" AS ENUM ('RCC', 'METAL_SHEET', 'TILED', 'ASBESTOS', 'GROUND_MOUNT', 'OTHER');

-- CreateEnum
CREATE TYPE "Timeline" AS ENUM ('IMMEDIATE', 'WITHIN_1_MONTH', 'ONE_TO_3_MONTHS', 'THREE_TO_6_MONTHS', 'EXPLORING');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'LOAN', 'PARTIAL_LOAN', 'UNDECIDED');

-- CreateEnum
CREATE TYPE "Objection" AS ENUM ('NONE', 'PRICE', 'FINANCE', 'ROOF_ISSUE', 'OWNERSHIP', 'FAMILY_DECISION', 'TRUST', 'TIMING', 'COMPETITOR', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('NOTE', 'CALL', 'STAGE_CHANGE', 'QUALIFICATION', 'WHATSAPP', 'APPOINTMENT', 'CHECK_IN', 'QUOTATION', 'AI', 'AUTOMATION', 'ASSIGNMENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('SITE_VISIT', 'QUOTATION_MEETING', 'FOLLOW_UP_CALL', 'LOAN_DOCUMENTATION', 'INSTALLATION');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GeoVerdict" AS ENUM ('VERIFIED', 'OUT_OF_RANGE', 'LOW_ACCURACY', 'TIME_MISMATCH', 'CLOCK_TAMPER', 'IMPOSSIBLE_TRAVEL', 'SITE_UNPINNED', 'NO_GPS', 'OFFICE_CREATED');

-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('BOOKING_CONFIRMED', 'DOCUMENTATION', 'PORTAL_REGISTRATION', 'DISCOM_FEASIBILITY', 'DESIGN_APPROVED', 'MATERIAL_DISPATCHED', 'INSTALLATION', 'NET_METER_APPLIED', 'DISCOM_INSPECTION', 'COMMISSIONED', 'SUBSIDY_APPLIED', 'SUBSIDY_RECEIVED', 'CLOSED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "gstin" TEXT,
    "logoUrl" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'GROWTH',
    "apiKey" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "waPhoneNumberId" TEXT,
    "waAccessToken" TEXT,
    "waBusinessId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'FIELD_SALES',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "territory" TEXT,
    "avatarColor" TEXT NOT NULL DEFAULT '#f59e0b',
    "googleEmail" TEXT,
    "googleRefreshToken" TEXT,
    "googleCalendarId" TEXT DEFAULT 'primary',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("organizationId","key")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "altPhone" TEXT,
    "email" TEXT,
    "whatsappOptIn" BOOLEAN NOT NULL DEFAULT true,
    "source" "LeadSource" NOT NULL DEFAULT 'OTHER',
    "campaign" TEXT,
    "segment" "Segment" NOT NULL DEFAULT 'RESIDENTIAL',
    "address" TEXT,
    "city" TEXT,
    "district" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "sitePinned" BOOLEAN NOT NULL DEFAULT false,
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "temperature" "Temperature" NOT NULL DEFAULT 'COLD',
    "score" INTEGER NOT NULL DEFAULT 0,
    "scoreBreakdown" JSONB,
    "monthlyBill" DOUBLE PRECISION,
    "monthlyUnits" DOUBLE PRECISION,
    "discom" TEXT,
    "consumerNumber" TEXT,
    "sanctionedLoadKw" DOUBLE PRECISION,
    "phase" TEXT,
    "ownsProperty" BOOLEAN,
    "roofType" "RoofType",
    "roofAreaSqft" DOUBLE PRECISION,
    "shadowFree" BOOLEAN,
    "floors" INTEGER,
    "basicQualified" BOOLEAN,
    "basicCheckReason" TEXT,
    "siteVisitReady" BOOLEAN,
    "installationTimeline" "Timeline",
    "paymentMode" "PaymentMode",
    "budgetConfirmed" BOOLEAN,
    "loanInterest" BOOLEAN,
    "loanStatus" TEXT,
    "objection" "Objection" DEFAULT 'NONE',
    "objectionNote" TEXT,
    "decisionMakerMet" BOOLEAN,
    "competitorQuote" DOUBLE PRECISION,
    "recommendedKw" DOUBLE PRECISION,
    "estimatedCost" DOUBLE PRECISION,
    "subsidyAmount" DOUBLE PRECISION,
    "aiSummary" TEXT,
    "aiNextAction" TEXT,
    "aiUpdatedAt" TIMESTAMP(3),
    "assignedToId" TEXT,
    "createdById" TEXT,
    "nextFollowUpAt" TIMESTAMP(3),
    "lastContactAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "wonAt" TIMESTAMP(3),
    "dealValue" DOUBLE PRECISION,
    "tags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT,
    "userId" TEXT,
    "type" "ActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT,
    "assignedToId" TEXT,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "type" "AppointmentType" NOT NULL DEFAULT 'SITE_VISIT',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "address" TEXT,
    "notes" TEXT,
    "outcome" TEXT,
    "googleEventId" TEXT,
    "googleSyncError" TEXT,
    "checkInAt" TIMESTAMP(3),
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkInAccuracy" DOUBLE PRECISION,
    "checkInDistanceM" DOUBLE PRECISION,
    "checkInVerdict" TEXT,
    "checkOutAt" TIMESTAMP(3),
    "reminder24Sent" BOOLEAN NOT NULL DEFAULT false,
    "reminder2Sent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "appointmentId" TEXT,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "systemKw" DOUBLE PRECISION NOT NULL,
    "panelBrand" TEXT NOT NULL,
    "panelWattage" INTEGER NOT NULL,
    "panelCount" INTEGER NOT NULL,
    "panelType" TEXT NOT NULL DEFAULT 'Mono PERC Bifacial',
    "inverterBrand" TEXT NOT NULL,
    "inverterKw" DOUBLE PRECISION NOT NULL,
    "inverterType" TEXT NOT NULL DEFAULT 'On-grid String',
    "structureType" TEXT NOT NULL DEFAULT 'Hot-dip galvanised elevated',
    "lineItems" JSONB NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstRate" DOUBLE PRECISION NOT NULL,
    "gstAmount" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "subsidyAmount" DOUBLE PRECISION NOT NULL,
    "netCost" DOUBLE PRECISION NOT NULL,
    "loanAmount" DOUBLE PRECISION,
    "loanRate" DOUBLE PRECISION,
    "loanTenureMonths" INTEGER,
    "emi" DOUBLE PRECISION,
    "annualGenerationKwh" DOUBLE PRECISION NOT NULL,
    "annualSavings" DOUBLE PRECISION NOT NULL,
    "paybackYears" DOUBLE PRECISION NOT NULL,
    "savings25Years" DOUBLE PRECISION NOT NULL,
    "co2TonnesPerYear" DOUBLE PRECISION NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "terms" TEXT,
    "capturedLat" DOUBLE PRECISION,
    "capturedLng" DOUBLE PRECISION,
    "capturedAccuracyM" DOUBLE PRECISION,
    "deviceTime" TIMESTAMP(3),
    "serverTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "distanceFromSiteM" DOUBLE PRECISION,
    "geoVerdict" "GeoVerdict" NOT NULL DEFAULT 'OFFICE_CREATED',
    "geoFlags" JSONB,
    "deviceInfo" TEXT,
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "shareToken" TEXT,
    "viewedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationPing" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "refId" TEXT,
    "deviceTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationPing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'UTILITY',
    "metaTemplateName" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT,
    "phone" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "templateKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "providerId" TEXT,
    "error" TEXT,
    "automated" BOOLEAN NOT NULL DEFAULT false,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "stage" "ProjectStage" NOT NULL DEFAULT 'BOOKING_CONFIRMED',
    "systemKw" DOUBLE PRECISION NOT NULL,
    "contractValue" DOUBLE PRECISION NOT NULL,
    "amountReceived" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "managerId" TEXT,
    "installDate" TIMESTAMP(3),
    "commissionedAt" TIMESTAMP(3),
    "portalAppId" TEXT,
    "netMeterNo" TEXT,
    "stageHistory" JSONB NOT NULL,
    "checklist" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "refKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_apiKey_key" ON "Organization"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_role_idx" ON "User"("organizationId", "role");

-- CreateIndex
CREATE INDEX "Lead_organizationId_stage_idx" ON "Lead"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "Lead_organizationId_temperature_idx" ON "Lead"("organizationId", "temperature");

-- CreateIndex
CREATE INDEX "Lead_organizationId_assignedToId_idx" ON "Lead"("organizationId", "assignedToId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_phone_idx" ON "Lead"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "Lead_organizationId_createdAt_idx" ON "Lead"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_organizationId_code_key" ON "Lead"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Activity_organizationId_leadId_createdAt_idx" ON "Activity"("organizationId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_organizationId_assignedToId_done_dueAt_idx" ON "Task"("organizationId", "assignedToId", "done", "dueAt");

-- CreateIndex
CREATE INDEX "Appointment_organizationId_startAt_idx" ON "Appointment"("organizationId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_organizationId_assignedToId_startAt_idx" ON "Appointment"("organizationId", "assignedToId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_shareToken_key" ON "Quotation"("shareToken");

-- CreateIndex
CREATE INDEX "Quotation_organizationId_createdAt_idx" ON "Quotation"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Quotation_organizationId_geoVerdict_idx" ON "Quotation"("organizationId", "geoVerdict");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_organizationId_number_key" ON "Quotation"("organizationId", "number");

-- CreateIndex
CREATE INDEX "LocationPing_organizationId_userId_createdAt_idx" ON "LocationPing"("organizationId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_organizationId_key_key" ON "MessageTemplate"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessage_providerId_key" ON "WhatsAppMessage"("providerId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_organizationId_leadId_createdAt_idx" ON "WhatsAppMessage"("organizationId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_organizationId_phone_idx" ON "WhatsAppMessage"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "AutomationRule_organizationId_trigger_active_idx" ON "AutomationRule"("organizationId", "trigger", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Project_leadId_key" ON "Project"("leadId");

-- CreateIndex
CREATE INDEX "Project_organizationId_stage_idx" ON "Project"("organizationId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_code_key" ON "Project"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationRun_createdAt_idx" ON "AutomationRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRun_ruleId_refKey_key" ON "AutomationRun"("ruleId", "refKey");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

