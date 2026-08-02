-- CreateEnum
CREATE TYPE "OfferScope" AS ENUM ('products', 'brand', 'category');

-- CreateEnum
CREATE TYPE "OfferDiscount" AS ENUM ('percent', 'amount', 'bogo', 'none');

-- AlterTable
-- `titleEl` is added WITH a default so the existing rows survive the NOT NULL,
-- filled from `title`, and only then stripped of the default. Prisma's own diff
-- dropped `title` and demanded a non-null `titleEl` in one step, which would
-- have failed on a populated table — or worse, succeeded on an empty one and
-- lost the column the next deploy.
ALTER TABLE "offers"
  ADD COLUMN "titleEl"       VARCHAR(160) NOT NULL DEFAULT '',
  ADD COLUMN "titleEn"       VARCHAR(160) NOT NULL DEFAULT '',
  ADD COLUMN "titleIt"       VARCHAR(160) NOT NULL DEFAULT '',
  ADD COLUMN "descriptionEl" VARCHAR(400) NOT NULL DEFAULT '',
  ADD COLUMN "descriptionEn" VARCHAR(400) NOT NULL DEFAULT '',
  ADD COLUMN "descriptionIt" VARCHAR(400) NOT NULL DEFAULT '',
  ADD COLUMN "scope"          "OfferScope"    NOT NULL DEFAULT 'products',
  ADD COLUMN "productSlugs"   TEXT[],
  ADD COLUMN "brandSlug"      VARCHAR(140),
  ADD COLUMN "categorySlug"   VARCHAR(140),
  ADD COLUMN "discount"       "OfferDiscount" NOT NULL DEFAULT 'percent',
  ADD COLUMN "discountValue"  DECIMAL(10,2),
  ADD COLUMN "bogoBuy"        INTEGER,
  ADD COLUMN "bogoFree"       INTEGER,
  ADD COLUMN "maxPerCustomer" INTEGER,
  ADD COLUMN "maxTotal"       INTEGER,
  ADD COLUMN "usedCount"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "video"          TEXT;

UPDATE "offers" SET "titleEl" = "title";

ALTER TABLE "offers" ALTER COLUMN "titleEl" DROP DEFAULT;
ALTER TABLE "offers" DROP COLUMN "title";
