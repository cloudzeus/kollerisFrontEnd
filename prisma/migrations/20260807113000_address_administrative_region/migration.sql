-- Περιφέρεια, alongside the νομός that was already stored.
--
-- Two separate administrative levels, and the geocoder returns both: for a
-- Piraeus address, νομός = "Πειραιώς" and περιφέρεια = "Αττικής". One column
-- could only ever hold whichever the form last wrote, and the existing one is
-- already labelled Νομός everywhere it is shown.
--
-- Nullable with no backfill: every row written before now has a νομός at best,
-- and inventing a περιφέρεια for it from the postcode would be a guess stored
-- as a fact. It fills in as addresses are next edited.
ALTER TABLE "customer_addresses" ADD COLUMN "adminRegion" VARCHAR(120);
ALTER TABLE "orders" ADD COLUMN "shipAdminRegion" VARCHAR(120);
