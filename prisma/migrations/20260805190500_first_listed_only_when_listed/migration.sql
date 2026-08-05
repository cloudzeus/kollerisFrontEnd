-- `firstListedAt` means "the day a customer could first see this product", so a
-- product that has never been listed must not carry one. The previous migration
-- backfilled every row from `erpInsertedAt`, including the 45 rows the shop has
-- never shown; those are cleared here so the sync stamps them on the day they
-- are actually published.
UPDATE "products" SET "firstListedAt" = NULL WHERE NOT "isActive";
