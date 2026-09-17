-- Διαχείριση χρηστών και ρόλων του /admin.
--
-- Και οι δύο αλλαγές είναι προσθετικές: ο παλιός κώδικας δεν διαβάζει ούτε τη
-- στήλη ούτε τον πίνακα, οπότε το migration μπορεί να τρέξει ΠΡΙΝ ανέβει ο
-- νέος κώδικας. Κενός πίνακας σημαίνει «ισχύουν τα προεπιλεγμένα δικαιώματα».

-- Μετά από αλλαγή κωδικού, οι συνεδρίες που άνοιξαν νωρίτερα δεν γίνονται δεκτές.
ALTER TABLE "admin_users" ADD COLUMN "sessionsValidFrom" TIMESTAMP(3);

CREATE TABLE "admin_role_capabilities" (
    "role" "AdminRole" NOT NULL,
    "capabilities" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "admin_role_capabilities_pkey" PRIMARY KEY ("role")
);
