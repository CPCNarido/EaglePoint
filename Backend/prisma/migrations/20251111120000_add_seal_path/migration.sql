-- Add seal_path column to SiteConfig so backend can store server-relative path to seal image
ALTER TABLE "public"."SiteConfig" ADD COLUMN IF NOT EXISTS "seal_path" TEXT;
