-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "WebsiteStatus" AS ENUM ('PENDING', 'ACTIVE', 'ERROR', 'PAUSED');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('SUCCESS', 'FAILED', 'PENDING');

-- CreateEnum
CREATE TYPE "PublishMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Website" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "wpUsername" TEXT NOT NULL,
    "wpAppPassword" TEXT NOT NULL,
    "customEndpointKey" TEXT NOT NULL,
    "status" "WebsiteStatus" NOT NULL DEFAULT 'PENDING',
    "lastTestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Website_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "topics" TEXT[],
    "tone" TEXT NOT NULL DEFAULT 'informatif',
    "articlesPerDay" INTEGER NOT NULL DEFAULT 1,
    "autoMode" BOOLEAN NOT NULL DEFAULT false,
    "customPrompt" TEXT,
    "newsApiQuery" TEXT,
    "maxArticleAgeHours" INTEGER NOT NULL DEFAULT 72,
    "defaultCategoryIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "autoImage" BOOLEAN NOT NULL DEFAULT true,
    "preferredProvider" TEXT NOT NULL DEFAULT 'AUTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "websiteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "wpPostId" INTEGER,
    "wpPostUrl" TEXT,
    "status" "ArticleStatus" NOT NULL,
    "mode" "PublishMode" NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "sourceUrl" TEXT,
    "sourceName" TEXT,
    "providerName" TEXT,
    "imageUrl" TEXT,
    "categoryIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppRequest" (
    "id" TEXT NOT NULL,
    "senderJid" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "articleLinks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "articleSummaries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppAllowedNumber" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppAllowedNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppSession" (
    "id" TEXT NOT NULL,
    "senderJid" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_websiteId_key" ON "Profile"("websiteId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleLog_jobId_key" ON "ArticleLog"("jobId");

-- CreateIndex
CREATE INDEX "ArticleLog_websiteId_createdAt_idx" ON "ArticleLog"("websiteId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ArticleLog_status_idx" ON "ArticleLog"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleLog_websiteId_sourceUrl_key" ON "ArticleLog"("websiteId", "sourceUrl");

-- CreateIndex
CREATE INDEX "WhatsAppRequest_websiteId_createdAt_idx" ON "WhatsAppRequest"("websiteId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WhatsAppRequest_senderJid_createdAt_idx" ON "WhatsAppRequest"("senderJid", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppAllowedNumber_phoneNumber_key" ON "WhatsAppAllowedNumber"("phoneNumber");

-- CreateIndex
CREATE INDEX "WhatsAppAllowedNumber_userId_idx" ON "WhatsAppAllowedNumber"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSession_senderJid_key" ON "WhatsAppSession"("senderJid");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Website" ADD CONSTRAINT "Website_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleLog" ADD CONSTRAINT "ArticleLog_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppRequest" ADD CONSTRAINT "WhatsAppRequest_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppAllowedNumber" ADD CONSTRAINT "WhatsAppAllowedNumber_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppSession" ADD CONSTRAINT "WhatsAppSession_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

