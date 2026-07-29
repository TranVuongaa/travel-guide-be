ALTER TABLE "travel_content_ingestion_runs"
ADD COLUMN "discoveredPlaceCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "importedPlaceCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "updatedPlaceCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "publishedPostCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
ADD COLUMN "leaseToken" TEXT;

CREATE INDEX "travel_content_ingestion_runs_status_leaseExpiresAt_createdAt_idx"
ON "travel_content_ingestion_runs"("status", "leaseExpiresAt", "createdAt");

ALTER TABLE "places"
ADD COLUMN "ingestionRunId" TEXT,
ADD COLUMN "externalSourceUrl" TEXT,
ADD COLUMN "externalSourceName" TEXT,
ADD COLUMN "externalUpdatedAt" TIMESTAMP(3);

CREATE INDEX "places_ingestionRunId_idx" ON "places"("ingestionRunId");
CREATE INDEX "places_externalSourceUrl_idx" ON "places"("externalSourceUrl");

ALTER TABLE "places"
ADD CONSTRAINT "places_ingestionRunId_fkey"
FOREIGN KEY ("ingestionRunId")
REFERENCES "travel_content_ingestion_runs"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
