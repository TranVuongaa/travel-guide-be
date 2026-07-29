-- CreateEnum
CREATE TYPE "TravelContentIngestionStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "TravelTrendType" AS ENUM ('TOP', 'RISING');

-- CreateTable
CREATE TABLE "travel_content_ingestion_runs" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "TravelContentIngestionStatus" NOT NULL DEFAULT 'QUEUED',
    "requestParameters" JSONB NOT NULL,
    "trendKeywordCount" INTEGER NOT NULL DEFAULT 0,
    "discoveredUrlCount" INTEGER NOT NULL DEFAULT 0,
    "importedPostCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_content_ingestion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_trend_keywords" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "seedKeyword" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "trendType" "TravelTrendType" NOT NULL,
    "value" INTEGER,
    "formattedValue" TEXT,
    "sourceJobId" TEXT,
    "sourceLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_trend_keywords_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "posts"
ADD COLUMN "ingestionRunId" TEXT,
ADD COLUMN "externalSourceUrl" TEXT,
ADD COLUMN "externalSourceName" TEXT,
ADD COLUMN "externalPublishedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "travel_content_ingestion_runs_status_createdAt_idx" ON "travel_content_ingestion_runs"("status", "createdAt");

-- A single partial unique index atomically prevents concurrent active runs.
CREATE UNIQUE INDEX "travel_content_ingestion_runs_one_active_idx"
ON "travel_content_ingestion_runs" ((1))
WHERE "status" IN ('QUEUED', 'RUNNING');

-- CreateIndex
CREATE INDEX "travel_content_ingestion_runs_requestedById_createdAt_idx" ON "travel_content_ingestion_runs"("requestedById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "travel_trend_keywords_runId_seedKeyword_trendType_keyword_key" ON "travel_trend_keywords"("runId", "seedKeyword", "trendType", "keyword");

-- CreateIndex
CREATE INDEX "travel_trend_keywords_keyword_trendType_idx" ON "travel_trend_keywords"("keyword", "trendType");

-- CreateIndex
CREATE UNIQUE INDEX "posts_externalSourceUrl_key" ON "posts"("externalSourceUrl");

-- AddForeignKey
ALTER TABLE "travel_content_ingestion_runs" ADD CONSTRAINT "travel_content_ingestion_runs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_trend_keywords" ADD CONSTRAINT "travel_trend_keywords_runId_fkey" FOREIGN KEY ("runId") REFERENCES "travel_content_ingestion_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_ingestionRunId_fkey" FOREIGN KEY ("ingestionRunId") REFERENCES "travel_content_ingestion_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
