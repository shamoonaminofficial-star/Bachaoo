-- Add stable seed slug to FaqEntry
ALTER TABLE "FaqEntry" ADD COLUMN "slug" TEXT;
CREATE UNIQUE INDEX "FaqEntry_slug_key" ON "FaqEntry"("slug");
