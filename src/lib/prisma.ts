import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Η δεξαμενή συνδέσεων.
 *
 * ── Τι έσπαγε ──────────────────────────────────────────────────────────────
 *
 * Ο adapter έπαιρνε μόνο `connectionString`, δηλαδή ένα `pg.PoolConfig` με όλα
 * τα υπόλοιπα στις προεπιλογές — και η προεπιλογή του `pg` είναι **δέκα**
 * συνδέσεις.
 *
 * Δέκα, για μια αρχική σελίδα που τρέχει εννέα ερωτήματα παράλληλα. Και μέχρι
 * το `prefetch={false}` κάθε επίσκεψη παρήγαγε 34 ταυτόχρονες αποδόσεις, η
 * καθεμιά με τη δική της δέσμη ερωτημάτων: εκατοντάδες ερωτήματα σε ουρά πάνω
 * σε δέκα συνδέσεις.
 *
 * Αυτό δεν φαίνεται ως σφάλμα βάσης. Φαίνεται ως αργή σελίδα, μέχρι που η ουρά
 * ξεπερνά το χρονικό όριο του gateway και βγαίνει **502 Bad Gateway** — που
 * είναι ακριβώς αυτό που έβγαλε η παραγωγή στις 18:50 UTC.
 *
 * ── Γιατί όχι απλώς «πολύ μεγάλη» ──────────────────────────────────────────
 *
 * Η δεξαμενή είναι ανά ΔΙΕΡΓΑΣΙΑ. Δύο αντίγραφα με max 50 ζητούν 100 συνδέσεις
 * από έναν Postgres που από προεπιλογή δέχεται 100 συνολικά, μαζί με ό,τι άλλο
 * μιλά στην ίδια βάση. Το 20 είναι διπλάσιο από τη μεγαλύτερη δέσμη που
 * εκδίδει μία σελίδα και αφήνει περιθώριο για ταυτόχρονους επισκέπτες, χωρίς
 * να μεταφέρει το πρόβλημα στη βάση. Ρυθμίζεται με `DATABASE_POOL_MAX` για
 * όταν αλλάξει ο αριθμός των αντιγράφων.
 *
 * ── Τα χρονικά όρια είναι μέρος της λύσης ──────────────────────────────────
 *
 * Χωρίς `connectionTimeoutMillis`, ένα αίτημα που δεν βρίσκει σύνδεση περιμένει
 * για πάντα και κρατά ζωντανή μια σύνδεση HTTP — έτσι μια στιγμιαία αιχμή
 * γίνεται μόνιμο μπλοκάρισμα. Με όριο, το αίτημα αποτυγχάνει γρήγορα, η σελίδα
 * δείχνει σφάλμα και ο διακομιστής συνέρχεται μόνος του.
 *
 * Το `statement_timeout` είναι η ίδια ιδέα στη μεριά της βάσης: ένα ερώτημα που
 * ξέφυγε δεν κρατά σύνδεση δεσμευμένη επ' αόριστον.
 */
const poolMax = Number(process.env.DATABASE_POOL_MAX ?? 20);

/**
 * PgBouncer (θύρα 6432) δεν δέχεται το `statement_timeout` ως παράμετρο
 * εκκίνησης της σύνδεσης: απαντά «unsupported startup parameter» και η σύνδεση
 * αποτυγχάνει — όλο το κατάστημα πέφτει. Πίσω από PgBouncer το όριο ορίζεται
 * στη βάση (`ALTER DATABASE … SET statement_timeout`) και όχι από εδώ.
 *
 * Αναγνώριση: `DATABASE_POOLER=pgbouncer`, ή `pgbouncer=true` στο URL, ή θύρα 6432.
 */
export function behindPgBouncer(url = process.env.DATABASE_URL, pooler = process.env.DATABASE_POOLER): boolean {
  if (pooler?.trim().toLowerCase() === "pgbouncer") return true;
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.searchParams.get("pgbouncer") === "true" || u.port === "6432";
  } catch {
    return false;
  }
}

/** Το URL χωρίς παραμέτρους που καταλαβαίνει μόνο ο Prisma (ο `pg` τις στέλνει ως ρυθμίσεις). */
function connectionUrl(url = process.env.DATABASE_URL): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.delete("pgbouncer");
    return u.toString();
  } catch {
    return url;
  }
}

const statementTimeout = Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? 15_000);

const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: connectionUrl(),
      max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 20,
      /* Δεν βρέθηκε σύνδεση σε 10s: αποτυχία, όχι αναμονή. */
      connectionTimeoutMillis: 10_000,
      /* Αδρανείς συνδέσεις επιστρέφουν στη βάση αντί να λιμνάζουν. */
      idleTimeoutMillis: 30_000,
      /* Ένα ερώτημα άνω των 15s είναι σφάλμα, όχι υπομονή — εκτός PgBouncer (βλ. πάνω). */
      ...(behindPgBouncer() || !(statementTimeout > 0) ? {} : { statement_timeout: statementTimeout }),
    }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Survive HMR in dev without opening a new pool on every reload.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
