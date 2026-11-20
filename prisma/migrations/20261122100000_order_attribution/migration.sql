-- Από πού ήρθε κάθε παραγγελία (utm, gclid/fbclid, GA4 client/session id).
--
-- Προσθετική και μόνο: μία στήλη που δέχεται NULL. Οι παλιές παραγγελίες και
-- όσες γίνονται χωρίς συγκατάθεση cookies μένουν NULL.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "attribution" JSONB;
