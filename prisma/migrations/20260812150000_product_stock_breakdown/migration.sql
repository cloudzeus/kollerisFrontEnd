-- Το `qty` γίνεται ΠΩΛΗΣΙΜΟ (AVAILABLE − RESERVED) και τα ωμά νούμερα
-- ταξιδεύουν δίπλα του. Nullable χωρίς default: NULL σημαίνει «δεν το έχει
-- στείλει ακόμη το HDCtool», που ΔΕΝ είναι το ίδιο με μηδέν — μηδέν σε στήλη
-- αποθέματος διαβάζεται ως «τίποτα», και ακριβώς αυτό εξαφάνισε 98 προϊόντα
-- από τα feed όταν η αντίστοιχη στήλη στο HDCtool μπήκε με DEFAULT 0.
ALTER TABLE "products" ADD COLUMN "qtyOnHand"   DECIMAL(12,2);
ALTER TABLE "products" ADD COLUMN "qtyReserved" DECIMAL(12,2);
ALTER TABLE "products" ADD COLUMN "qtyIncoming" DECIMAL(12,2);
