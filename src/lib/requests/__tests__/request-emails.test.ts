import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => (await import("./request-fakes")).mockModules.prisma());
const { sendMail } = vi.hoisted(() => ({
  sendMail: vi.fn(async (mail: { to: string }) => {
    void mail;
    return { ok: true as const, id: "mg-1" };
  }),
}));
vi.mock("@/lib/mail/client", () => ({ sendMail, mailConfigured: () => true }));

import { TOKEN, resetFakes, seedRequest } from "./request-fakes";
import { sendInternalRequestEmail, sendRequestEmail } from "@/lib/mail/request-emails";

type SentMail = { to: string; subject: string; html: string; text: string; tracking?: boolean; replyTo?: string };
const lastMail = () => sendMail.mock.calls.at(-1)?.[0] as SentMail;

beforeEach(() => {
  resetFakes();
  sendMail.mockClear();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://kolleris.com");
});

describe("request emails", () => {
  it("«received»: the private link, the 24-hour promise, tracking OFF", async () => {
    seedRequest();
    expect(await sendRequestEmail("received", "KOL-20261013-0002")).toEqual({ ok: true, id: "mg-1" });
    const mail = lastMail();
    expect(mail.to).toBe("buyer@example.test");
    expect(mail.tracking).toBe(false);
    expect(mail.subject).toContain("24 ωρών");
    expect(mail.html).toContain(`/aitima/${TOKEN}`);
    expect(mail.text).toContain(`/aitima/${TOKEN}`);
    expect(mail.html).toContain("Πένσα");
  });

  it("«offer»: comparison, total from the stored offer, the link — tracking OFF", async () => {
    seedRequest({
      requestStatus: "OFFERED",
      offerVersion: 1,
      offerExpiresAt: new Date("2026-10-16T10:00:00Z"),
      requestLines: {
        v: 1,
        locale: "en",
        lines: [
          { lineId: "L1", productId: "p1", mtrl: 101, sku: "KN-1", name: "Πένσα", brand: null, imageUrl: null, qty: 2, unitNet: 10, vatRate: 24, stockAtRequest: 0 },
          { lineId: "L2", productId: "p2", mtrl: 102, sku: "KN-2", name: "Κόφτης", brand: null, imageUrl: null, qty: 1, unitNet: 20, vatRate: 24, stockAtRequest: 0 },
        ],
      },
      offerJson: {
        decision: "offer",
        version: 1,
        receivedAt: "2026-10-13T10:00:00.000Z",
        lines: [
          { kind: "alternative", replacesLineId: "L1", mtrl: 109, sku: "KN-9", name: "Πένσα Pro", qty: 2, unitNet: 12, vatRate: 24, leadTimeText: null },
        ],
        removedLineIds: ["L2"],
        leadTimeText: "5–7 εργάσιμες",
        note: "Νέο μοντέλο",
        shippingNet: 4,
        quotedShippingNet: null,
        expiresAt: "2026-10-16T10:00:00.000Z",
      },
    });
    await sendRequestEmail("offer", "KOL-20261013-0002");
    const mail = lastMail();
    expect(mail.tracking).toBe(false);
    // The customer used English: the button opens the English page.
    expect(mail.html).toContain(`/en/aitima/${TOKEN}`);
    expect(mail.html).toContain("Αντί για: Πένσα");
    expect(mail.html).toContain("Δεν διατίθεται");
    expect(mail.html).toContain("5–7 εργάσιμες");
    // 2×12 net = 24 → 29,76 gross + 4 net shipping = 4,96 → 34,72
    expect(mail.text).toContain("34,72 €");
  });

  it("«rejected» carries the reason; «expired» says to get in touch", async () => {
    seedRequest({
      requestStatus: "REJECTED",
      offerJson: { decision: "reject", version: 1, receivedAt: "2026-10-13T10:00:00.000Z", reason: "Εκτός παραγωγής" },
    });
    await sendRequestEmail("rejected", "KOL-20261013-0002");
    expect(lastMail().html).toContain("Εκτός παραγωγής");
    await sendRequestEmail("expired", "KOL-20261013-0002");
    expect(lastMail().subject).toContain("έληξε");
    expect(lastMail().tracking).toBe(false);
  });

  it("no offer, no offer email", async () => {
    seedRequest();
    expect(await sendRequestEmail("offer", "KOL-20261013-0002")).toMatchObject({ ok: false });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("internal email goes to the shop, replies to the customer, links the admin, not the secret page", async () => {
    seedRequest();
    await sendInternalRequestEmail("KOL-20261013-0002");
    const mail = lastMail();
    expect(mail.to).toContain("kolleris.com");
    expect(mail.replyTo).toBe("buyer@example.test");
    expect(mail.html).toContain("/admin/orders/KOL-20261013-0002");
    expect(mail.html).not.toContain(TOKEN);
  });
});
