-- Three more plain-text fields written from HDCtool. Additive only: NULL keeps today's page.

-- AlterTable
ALTER TABLE "seo_page_overrides" ADD COLUMN     "h1" VARCHAR(120),
ADD COLUMN     "intro" VARCHAR(400),
ADD COLUMN     "ogDescription" VARCHAR(200);
