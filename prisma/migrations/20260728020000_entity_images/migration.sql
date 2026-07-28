-- CreateTable
CREATE TABLE "entity_images" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourcePageUrl" TEXT NOT NULL,
    "altText" TEXT NOT NULL,
    "author" TEXT,
    "licenseName" TEXT NOT NULL,
    "licenseUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "provinceId" TEXT,
    "categoryId" TEXT,
    "placeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_images_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "entity_images_exactly_one_owner_check" CHECK (
        (
            ("provinceId" IS NOT NULL)::integer
            + ("categoryId" IS NOT NULL)::integer
            + ("placeId" IS NOT NULL)::integer
        ) = 1
    ),
    CONSTRAINT "entity_images_sort_order_check" CHECK ("sortOrder" >= 0),
    CONSTRAINT "entity_images_width_check" CHECK ("width" IS NULL OR "width" > 0),
    CONSTRAINT "entity_images_height_check" CHECK ("height" IS NULL OR "height" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "entity_images_provinceId_sortOrder_key" ON "entity_images"("provinceId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "entity_images_categoryId_sortOrder_key" ON "entity_images"("categoryId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "entity_images_placeId_sortOrder_key" ON "entity_images"("placeId", "sortOrder");

-- AddForeignKey
ALTER TABLE "entity_images" ADD CONSTRAINT "entity_images_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "provinces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_images" ADD CONSTRAINT "entity_images_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_images" ADD CONSTRAINT "entity_images_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;
