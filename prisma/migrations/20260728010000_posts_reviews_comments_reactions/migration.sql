-- CreateEnum
CREATE TYPE "PostSource" AS ENUM ('SYSTEM', 'USER');

-- CreateEnum
CREATE TYPE "CommentTargetType" AS ENUM ('POST', 'REVIEW');

-- CreateEnum
CREATE TYPE "ReactionTargetType" AS ENUM ('POST', 'REVIEW', 'COMMENT');

-- CreateEnum
CREATE TYPE "ReactionType" AS ENUM ('LIKE', 'LOVE', 'WOW', 'SAD', 'ANGRY');

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "placeId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" "PostSource" NOT NULL DEFAULT 'USER',
    "status" "ContentStatus" NOT NULL DEFAULT 'PENDING',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'PENDING',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "targetType" "CommentTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'PENDING',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "ReactionTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" "ReactionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "posts_status_deletedAt_createdAt_id_idx" ON "posts"("status", "deletedAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "posts_authorId_deletedAt_createdAt_id_idx" ON "posts"("authorId", "deletedAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "posts_placeId_status_deletedAt_createdAt_id_idx" ON "posts"("placeId", "status", "deletedAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "posts_source_status_createdAt_id_idx" ON "posts"("source", "status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_placeId_authorId_key" ON "reviews"("placeId", "authorId");

-- CreateIndex
CREATE INDEX "reviews_placeId_status_deletedAt_createdAt_id_idx" ON "reviews"("placeId", "status", "deletedAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "reviews_authorId_deletedAt_createdAt_id_idx" ON "reviews"("authorId", "deletedAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "comments_targetType_targetId_parentId_status_createdAt_id_idx" ON "comments"("targetType", "targetId", "parentId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "comments_authorId_deletedAt_createdAt_id_idx" ON "comments"("authorId", "deletedAt", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_userId_targetType_targetId_key" ON "reactions"("userId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "reactions_targetType_targetId_type_idx" ON "reactions"("targetType", "targetId", "type");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
