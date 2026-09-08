import { describe, expect, it } from "vitest";
import { acsPickupDateFor, athensToday } from "@/lib/courier/pickup-date";

/** Ώρα Ελλάδας → στιγμή. Ιούνιος = EEST (UTC+3), Ιανουάριος = EET (UTC+2). */
const athens = (iso: string, offsetHours: number) =>
  new Date(`${iso}${offsetHours === 3 ? "+03:00" : "+02:00"}`);

describe("acsPickupDateFor", () => {
  it("πριν τις 15:30 μιας εργάσιμης: την ίδια μέρα", () => {
    expect(acsPickupDateFor(athens("2026-06-09T15:29:00", 3))).toBe("2026-06-09");
  });

  it("ακριβώς στις 15:30: επόμενη μέρα", () => {
    expect(acsPickupDateFor(athens("2026-06-09T15:30:00", 3))).toBe("2026-06-10");
  });

  it("Παρασκευή απόγευμα: Δευτέρα, όχι Σάββατο", () => {
    expect(acsPickupDateFor(athens("2026-06-12T18:00:00", 3))).toBe("2026-06-15");
  });

  it("Σάββατο πρωί: Δευτέρα — ο κανόνας δεν περιμένει την ώρα λήξης", () => {
    expect(acsPickupDateFor(athens("2026-06-13T09:00:00", 3))).toBe("2026-06-15");
  });

  it("Κυριακή βράδυ: Δευτέρα", () => {
    expect(acsPickupDateFor(athens("2026-06-14T22:00:00", 3))).toBe("2026-06-15");
  });

  it("01:00 ώρα Ελλάδας: σήμερα, όχι η χθεσινή μέρα του UTC", () => {
    expect(acsPickupDateFor(athens("2026-06-10T01:00:00", 3))).toBe("2026-06-10");
    expect(athensToday(athens("2026-06-10T01:00:00", 3))).toBe("2026-06-10");
  });

  it("χειμώνας (EET, UTC+2): ίδια συμπεριφορά στο όριο", () => {
    expect(acsPickupDateFor(athens("2026-01-08T15:29:00", 2))).toBe("2026-01-08");
    expect(acsPickupDateFor(athens("2026-01-08T15:31:00", 2))).toBe("2026-01-09");
  });

  it("η πραγματική περίπτωση: 17:10 της 8ης Σεπ 2026 → 9 Σεπ", () => {
    // Το αποστολικό 9805563515 εκδόθηκε τότε και πήρε 2026-09-08 (παλιός κώδικας).
    expect(acsPickupDateFor(new Date("2026-09-08T14:10:30.179Z"))).toBe("2026-09-09");
  });
});
