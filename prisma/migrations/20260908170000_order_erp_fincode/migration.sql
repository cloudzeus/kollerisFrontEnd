-- Ο αριθμός παραστατικού («ΠΑΡΚ000123»), δίπλα στο εσωτερικό FINDOC.
ALTER TABLE "orders" ADD COLUMN "erpFincode" VARCHAR(32);
