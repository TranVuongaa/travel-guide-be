ALTER TABLE "places"
ADD COLUMN "content" TEXT;

UPDATE "places"
SET "content" = replace(
  replace(
    replace(
      coalesce(nullif(btrim("description"), ''), "name"),
      '&',
      '&amp;'
    ),
    '<',
    '&lt;'
  ),
  '>',
  '&gt;'
);

ALTER TABLE "places"
ALTER COLUMN "content" SET NOT NULL;

DROP INDEX "places_search_text_trgm_idx";

ALTER TABLE "places"
DROP COLUMN "search_text";

ALTER TABLE "places"
ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (
  public.normalize_search_text(
    coalesce("name", '') || ' ' ||
    coalesce("description", '') || ' ' ||
    coalesce("address", '') || ' ' ||
    regexp_replace(coalesce("content", ''), '<[^>]*>', ' ', 'g')
  )
) STORED;

CREATE INDEX "places_search_text_trgm_idx"
ON "places" USING GIN ("search_text" gin_trgm_ops);
