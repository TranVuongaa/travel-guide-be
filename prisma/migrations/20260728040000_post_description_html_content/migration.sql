ALTER TABLE "posts"
ADD COLUMN "description" TEXT;

UPDATE "posts"
SET "description" = left(
  coalesce(
    nullif(
      btrim(
        regexp_replace(
          regexp_replace("content", '<[^>]*>', ' ', 'g'),
          '[[:space:]]+',
          ' ',
          'g'
        )
      ),
      ''
    ),
    'No description available'
  ),
  500
);

ALTER TABLE "posts"
ALTER COLUMN "description" SET NOT NULL;

DROP INDEX "posts_search_text_trgm_idx";

ALTER TABLE "posts"
DROP COLUMN "search_text";

ALTER TABLE "posts"
ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (
  public.normalize_search_text(
    coalesce("title", '') || ' ' ||
    coalesce("description", '') || ' ' ||
    regexp_replace(coalesce("content", ''), '<[^>]*>', ' ', 'g')
  )
) STORED;

CREATE INDEX "posts_search_text_trgm_idx"
ON "posts" USING GIN ("search_text" gin_trgm_ops);
