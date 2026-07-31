-- Search-as-you-type indexes.
--
-- The header suggest runs on every keystroke against `searchKey` with a
-- `contains`, which in Postgres is `LIKE '%…%'` — unindexable by a btree, so it
-- was a sequential scan over 5.305 products per character typed. Trigram GIN
-- indexes make an infix LIKE an index scan.
--
-- `pg_trgm` is also what will back fuzzy matching later ("κνιπεξ" → KNIPEX);
-- the extension is the prerequisite for both.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "products_searchKey_trgm_idx"
  ON "products" USING GIN ("searchKey" gin_trgm_ops);

-- Exact-code lookups take the fast path before any trigram work: a customer
-- pasting an SKU is the single most common search on a trade catalogue.
CREATE INDEX IF NOT EXISTS "products_code_idx"  ON "products" ("code");
CREATE INDEX IF NOT EXISTS "products_code1_idx" ON "products" ("code1");
CREATE INDEX IF NOT EXISTS "products_code2_idx" ON "products" ("code2");

CREATE INDEX IF NOT EXISTS "categories_nameEl_trgm_idx"
  ON "categories" USING GIN ("nameEl" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "brands_nameEl_trgm_idx"
  ON "brands" USING GIN ("nameEl" gin_trgm_ops);
