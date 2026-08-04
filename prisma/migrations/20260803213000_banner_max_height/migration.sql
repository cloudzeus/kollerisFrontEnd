-- The ceiling moves from the grid template to the banner.
--
-- A template is a reusable shape: the same three-cell hero is 520px in one zone
-- and 40vh in another, so the height is not a property of the shape. It now
-- lives inside the banner's draft/published JSON, which also means changing it
-- is an edit that gets previewed and published like any other.
--
-- Nothing to migrate: the column was added minutes ago and no row ever set it.
ALTER TABLE "grid_templates" DROP COLUMN "maxHeight";
