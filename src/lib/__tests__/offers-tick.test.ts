import { describe, expect, it, vi } from "vitest";

const sync = vi.hoisted(() => ({ syncOffersFromHdctool: vi.fn() }));
vi.mock("@/lib/sync/offers-sync", () => sync);

import { offersTick } from "@/lib/sync/offers-tick";

describe("ο χτύπος των προσφορών", () => {
  it("ρωτά το HDCtool σε κάθε κλήση", async () => {
    sync.syncOffersFromHdctool.mockImplementation(async () => ({ upserted: 1, retired: 0 }));
    await offersTick();
    expect(sync.syncOffersFromHdctool).toHaveBeenCalled();
  });

  /*
   * Ο ΛΟΓΟΣ ΠΟΥ ΥΠΑΡΧΕΙ.
   *
   * Τρέχει μέσα σε timer. Μια σκέτη εξαίρεση από timer είναι unhandled
   * rejection, που ρίχνει τον server — και μια αποτυχία να κατέβουν τα κείμενα
   * μιας προσφοράς δεν είναι λόγος να πάψει να πουλάει το μαγαζί.
   */
  it("σφάλμα δικτύου δεν ανεβαίνει ποτέ έξω", async () => {
    // `mockImplementation`, όχι `mockRejectedValue`: το δεύτερο φτιάχνει το
    // απορριφθέν promise πριν το περιμένει κανείς, και το vitest το βλέπει ως
    // unhandled rejection του ίδιου του test.
    sync.syncOffersFromHdctool.mockImplementation(async () => {
      throw new Error("HDCtool κάτω");
    });
    let threw = false;
    try {
      await offersTick();
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});
