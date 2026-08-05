-- The first backfill dated every product by `erpInsertedAt`, which is when the
-- warehouse bought it. For a product the shop started showing this week that is
-- the wrong answer twice over: it hides a real arrival, and it files it under a
-- month three years gone.
--
-- The projection already records the better answer. A row is created here the
-- first time a product qualifies for the shop, so `createdAt` IS the day it
-- first became visible — for every row except the original import, which
-- created 5.287 rows in one pass on 26 July 2026 and says nothing about when
-- any of them was first sold online. Those keep their ERP date; everything
-- added since gets its real listing date.
--
-- Measured before writing: 5.287 rows from the import, 62 from 4 August, 3.928
-- from 5 August.
UPDATE "products"
   SET "firstListedAt" = "createdAt"
 WHERE "createdAt" > TIMESTAMP '2026-07-27 00:00:00';
