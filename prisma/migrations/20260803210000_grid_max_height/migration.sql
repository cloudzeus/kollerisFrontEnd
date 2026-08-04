-- A ceiling on how tall a banner grid may render.
-- Nullable with no default: existing templates keep behaving exactly as before,
-- which is what "no ceiling" already meant.
ALTER TABLE "grid_templates" ADD COLUMN "maxHeight" INTEGER;
