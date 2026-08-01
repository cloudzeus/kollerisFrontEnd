-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "folder" VARCHAR(40) NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER NOT NULL,
    "uploadedBy" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_url_key" ON "media_assets"("url");

-- CreateIndex
CREATE INDEX "media_assets_kind_createdAt_idx" ON "media_assets"("kind", "createdAt");
