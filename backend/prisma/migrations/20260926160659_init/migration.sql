-- CreateEnum
CREATE TYPE "ProtectionCategory" AS ENUM ('ADULT_WEBSITES', 'ADULT_APPS', 'ADULT_SEARCH', 'GAMBLING');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'MACOS', 'WINDOWS');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('PROTECTED', 'PAUSED', 'OFFLINE', 'NEEDS_SETUP');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('ACTIVE', 'PENDING', 'DECLINED');

-- CreateEnum
CREATE TYPE "RequestMethod" AS ENUM ('DELAY', 'PARTNER');

-- CreateEnum
CREATE TYPE "RequestIntent" AS ENUM ('DISABLE', 'LOWER_LEVEL');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RuleList" AS ENUM ('ALLOW', 'BLOCK');

-- CreateEnum
CREATE TYPE "PlanId" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "BlockedScreenTheme" AS ENUM ('CALM', 'BOLD', 'MINIMAL');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "protectedSince" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protection" (
    "userId" TEXT NOT NULL,
    "protectionOn" BOOLEAN NOT NULL DEFAULT true,
    "accountabilityOn" BOOLEAN NOT NULL DEFAULT false,
    "lockLevel" INTEGER NOT NULL DEFAULT 1,
    "pinHash" TEXT,
    "waitingPeriodMinutes" INTEGER NOT NULL DEFAULT 1440,
    "partnerId" TEXT,
    "enabledCategories" "ProtectionCategory"[] DEFAULT ARRAY['ADULT_WEBSITES', 'ADULT_APPS']::"ProtectionCategory"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "protection_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'NEEDS_SETUP',
    "installId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pairing_code" (
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pairing_code_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "block_count" (
    "deviceId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "block_count_pkey" PRIMARY KEY ("deviceId","day")
);

-- CreateTable
CREATE TABLE "partner" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "PartnerStatus" NOT NULL DEFAULT 'PENDING',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "inviteTokenHash" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "clientRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disable_request" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" "RequestMethod" NOT NULL,
    "intent" "RequestIntent" NOT NULL,
    "targetLevel" INTEGER,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL DEFAULT '',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "partnerId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedVia" TEXT,
    "clientRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disable_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_rule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "list" "RuleList" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minEntries" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_version" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "entries" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "sourceBytes" INTEGER NOT NULL,
    "artifactBytes" INTEGER NOT NULL,
    "artifact" BYTEA NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_refresh_attempt" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "entries" INTEGER,
    "unchanged" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_refresh_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "userId" TEXT NOT NULL,
    "plan" "PlanId" NOT NULL DEFAULT 'FREE',
    "period" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY',
    "renewsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "approval_settings" (
    "userId" TEXT NOT NULL,
    "notifyOnDisable" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnLevelChange" BOOLEAN NOT NULL DEFAULT true,
    "weeklyDigest" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "userId" TEXT NOT NULL,
    "blockedAttempts" BOOLEAN NOT NULL DEFAULT true,
    "partnerActivity" BOOLEAN NOT NULL DEFAULT true,
    "weeklyReport" BOOLEAN NOT NULL DEFAULT true,
    "productUpdates" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "blocked_screen_config" (
    "userId" TEXT NOT NULL,
    "theme" "BlockedScreenTheme" NOT NULL DEFAULT 'CALM',
    "headline" VARCHAR(40) NOT NULL,
    "message" VARCHAR(160) NOT NULL,
    "showPartnerButton" BOOLEAN NOT NULL DEFAULT true,
    "showBreathingExercise" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocked_screen_config_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "push_token" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "protection_partnerId_idx" ON "protection"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "device_installId_key" ON "device"("installId");

-- CreateIndex
CREATE INDEX "device_userId_idx" ON "device"("userId");

-- CreateIndex
CREATE INDEX "device_lastSeenAt_idx" ON "device"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "device_userId_clientRef_key" ON "device"("userId", "clientRef");

-- CreateIndex
CREATE INDEX "pairing_code_userId_idx" ON "pairing_code"("userId");

-- CreateIndex
CREATE INDEX "pairing_code_expiresAt_idx" ON "pairing_code"("expiresAt");

-- CreateIndex
CREATE INDEX "block_count_day_idx" ON "block_count"("day");

-- CreateIndex
CREATE UNIQUE INDEX "partner_inviteTokenHash_key" ON "partner"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "partner_userId_idx" ON "partner"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_userId_clientRef_key" ON "partner"("userId", "clientRef");

-- CreateIndex
CREATE INDEX "disable_request_userId_status_idx" ON "disable_request"("userId", "status");

-- CreateIndex
CREATE INDEX "disable_request_status_expiresAt_idx" ON "disable_request"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "disable_request_status_readyAt_idx" ON "disable_request"("status", "readyAt");

-- CreateIndex
CREATE UNIQUE INDEX "disable_request_userId_clientRef_key" ON "disable_request"("userId", "clientRef");

-- CreateIndex
CREATE INDEX "user_rule_userId_list_idx" ON "user_rule"("userId", "list");

-- CreateIndex
CREATE UNIQUE INDEX "user_rule_userId_domain_key" ON "user_rule"("userId", "domain");

-- CreateIndex
CREATE INDEX "feed_version_feedId_publishedAt_idx" ON "feed_version"("feedId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "feed_version_feedId_sha256_key" ON "feed_version"("feedId", "sha256");

-- CreateIndex
CREATE INDEX "feed_refresh_attempt_feedId_at_idx" ON "feed_refresh_attempt"("feedId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "push_token_token_key" ON "push_token"("token");

-- CreateIndex
CREATE INDEX "push_token_userId_idx" ON "push_token"("userId");

-- CreateIndex
CREATE INDEX "outbox_publishedAt_createdAt_idx" ON "outbox"("publishedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protection" ADD CONSTRAINT "protection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protection" ADD CONSTRAINT "protection_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device" ADD CONSTRAINT "device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pairing_code" ADD CONSTRAINT "pairing_code_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_count" ADD CONSTRAINT "block_count_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner" ADD CONSTRAINT "partner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disable_request" ADD CONSTRAINT "disable_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disable_request" ADD CONSTRAINT "disable_request_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_rule" ADD CONSTRAINT "user_rule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_version" ADD CONSTRAINT "feed_version_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "feed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_refresh_attempt" ADD CONSTRAINT "feed_refresh_attempt_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "feed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_settings" ADD CONSTRAINT "approval_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_screen_config" ADD CONSTRAINT "blocked_screen_config_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_token" ADD CONSTRAINT "push_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
