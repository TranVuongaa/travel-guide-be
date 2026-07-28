CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.normalize_search_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = pg_catalog, public
AS $function$
  SELECT btrim(
    regexp_replace(
      lower(
        public.unaccent(
          'public.unaccent'::regdictionary,
          translate(input, 'Đđ', 'Dd')
        )
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  )
$function$;

ALTER TABLE "users"
ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (
  public.normalize_search_text(
    coalesce("email", '') || ' ' || coalesce("displayName", '')
  )
) STORED;

ALTER TABLE "provinces"
ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (
  public.normalize_search_text(
    coalesce("name", '') || ' ' || coalesce("slug", '')
  )
) STORED;

ALTER TABLE "categories"
ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (
  public.normalize_search_text(
    coalesce("name", '') || ' ' || coalesce("slug", '')
  )
) STORED;

ALTER TABLE "places"
ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (
  public.normalize_search_text(
    coalesce("name", '') || ' ' ||
    coalesce("description", '') || ' ' ||
    coalesce("address", '')
  )
) STORED;

ALTER TABLE "posts"
ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (
  public.normalize_search_text(
    coalesce("title", '') || ' ' || coalesce("content", '')
  )
) STORED;

CREATE INDEX "users_search_text_trgm_idx"
ON "users" USING GIN ("search_text" gin_trgm_ops);

CREATE INDEX "provinces_search_text_trgm_idx"
ON "provinces" USING GIN ("search_text" gin_trgm_ops);

CREATE INDEX "categories_search_text_trgm_idx"
ON "categories" USING GIN ("search_text" gin_trgm_ops);

CREATE INDEX "places_search_text_trgm_idx"
ON "places" USING GIN ("search_text" gin_trgm_ops);

CREATE INDEX "posts_search_text_trgm_idx"
ON "posts" USING GIN ("search_text" gin_trgm_ops);
