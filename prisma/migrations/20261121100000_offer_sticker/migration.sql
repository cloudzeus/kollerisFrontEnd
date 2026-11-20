-- Σειρά εμφάνισης και sticker της προσφοράς HDCtool, πάνω στο προϊόν.
--
-- Προσθετική και μόνο: τέσσερις στήλες που δέχονται NULL. Όσο είναι NULL, η
-- κάρτα δεν δείχνει sticker και η σελίδα προσφοράς κρατά τη σειρά που είχε.

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "offerPosition" INTEGER,
ADD COLUMN     "offerSticker" VARCHAR(40),
ADD COLUMN     "offerStickerUrl" TEXT,
ADD COLUMN     "offerStickerAlt" VARCHAR(80);
