-- Προσφορά HDCtool (PRICER04) πάνω στο προϊόν.
--
-- Προσθετική και μόνο: πέντε στήλες που δέχονται NULL, και ένα ευρετήριο για
-- τη σελίδα προσφορών. Κάθε υπάρχουσα γραμμή μένει NULL σε όλες και
-- συμπεριφέρεται ακριβώς όπως πριν — η τιμή της προσφοράς ζει στα `priceNet`
-- και `priceList`, που υπάρχουν ήδη.

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "offerBadge" VARCHAR(40),
ADD COLUMN     "offerDiscountPct" DECIMAL(5,2),
ADD COLUMN     "offerEndsAt" TIMESTAMP(3),
ADD COLUMN     "offerSlug" VARCHAR(120),
ADD COLUMN     "price30dLowNet" DECIMAL(12,4);

-- CreateIndex
CREATE INDEX "products_offerSlug_idx" ON "products"("offerSlug");

-- Η καμπάνια που κατέβηκε από το HDCtool, για να ξέρει η σελίδα της ότι η
-- εμβέλειά της είναι το `products.offerSlug` και όχι λίστα slug.
ALTER TABLE "offers" ADD COLUMN     "fromHdctool" BOOLEAN NOT NULL DEFAULT false;
