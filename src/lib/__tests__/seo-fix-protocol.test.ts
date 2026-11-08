import { beforeEach, describe, expect, it } from "vitest";
import { handleSeoFix, type SeoFields, type SeoFieldName, type SeoFixStore } from "@/lib/seo/seo-fix-protocol";

const EMPTY: SeoFields = { seoTitle: null, metaDescription: null, faq: null };
const ALL: SeoFieldName[] = ["seoTitle", "metaDescription", "faq"];
const by = "user@example.com";

let state: SeoFields;
let writes: { path: string; fields: Partial<SeoFields>; updatedBy: string }[];

const store: SeoFixStore = {
  allowed: (path) => (path === "/x" ? null : path.startsWith("/proion/") ? ["seoTitle", "metaDescription"] : ALL),
  read: async () => structuredClone(state),
  write: async (path, fields, updatedBy) => {
    writes.push({ path, fields, updatedBy });
    state = { ...state, ...fields };
  },
};

beforeEach(() => {
  state = { ...EMPTY };
  writes = [];
});

describe("handleSeoFix", () => {
  it("read: μη υποστηριζόμενη σελίδα", async () =>
    expect((await handleSeoFix({ op: "read", path: "/x" }, store)).body).toEqual({ ok: true, supported: false }));

  it("read: allowed και current", async () => {
    state.seoTitle = "T";
    const res = await handleSeoFix({ op: "read", path: "/proion/a" }, store);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, supported: true, allowed: ["seoTitle", "metaDescription"], current: { ...EMPTY, seoTitle: "T" } });
  });

  it("apply: επιστρέφει previous και current", async () => {
    state.seoTitle = "old";
    const res = await handleSeoFix({ op: "apply", path: "/a", fields: { seoTitle: "new" }, updatedBy: by }, store);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, previous: { ...EMPTY, seoTitle: "old" }, current: { ...EMPTY, seoTitle: "new" } });
    expect(writes).toEqual([{ path: "/a", fields: { seoTitle: "new" }, updatedBy: by }]);
  });

  it("apply: πεδίο που λείπει μένει ως έχει", async () => {
    state.metaDescription = "keep";
    await handleSeoFix({ op: "apply", path: "/a", fields: { seoTitle: "new" }, updatedBy: by }, store);
    expect(writes[0].fields).not.toHaveProperty("metaDescription");
    expect(state.metaDescription).toBe("keep");
  });

  it("apply: null καθαρίζει το πεδίο", async () => {
    state.seoTitle = "old";
    await handleSeoFix({ op: "apply", path: "/a", fields: { seoTitle: null }, updatedBy: by }, store);
    expect(writes[0].fields).toEqual({ seoTitle: null });
    expect(state.seoTitle).toBeNull();
  });

  it("apply: κενό κείμενο και [] γίνονται null", async () => {
    await handleSeoFix({ op: "apply", path: "/a", fields: { seoTitle: "  ", metaDescription: "", faq: [] }, updatedBy: by }, store);
    expect(writes[0].fields).toEqual({ seoTitle: null, metaDescription: null, faq: null });
  });

  it("apply δύο φορές: ίδιο αποτέλεσμα", async () => {
    const req = { op: "apply", path: "/a", fields: { seoTitle: "new" }, updatedBy: by };
    await handleSeoFix(req, store);
    const second = await handleSeoFix(req, store);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ ok: true, previous: { ...EMPTY, seoTitle: "new" }, current: { ...EMPTY, seoTitle: "new" } });
  });

  it("apply: 422 για πεδίο εκτός allowed, χωρίς write", async () => {
    const res = await handleSeoFix({ op: "apply", path: "/proion/a", fields: { faq: [{ q: "q", a: "a" }] }, updatedBy: by }, store);
    expect(res.status).toBe(422);
    expect(writes).toEqual([]);
  });

  it("apply: 422 για μη υποστηριζόμενη σελίδα", async () => {
    expect((await handleSeoFix({ op: "apply", path: "/x", fields: { seoTitle: "t" }, updatedBy: by }, store)).status).toBe(422);
    expect(writes).toEqual([]);
  });

  it("apply: 422 χωρίς κανένα πεδίο", async () => {
    expect((await handleSeoFix({ op: "apply", path: "/a", fields: {}, updatedBy: by }, store)).status).toBe(422);
    expect(writes).toEqual([]);
  });

  it("apply: 422 για άγνωστο πεδίο ή χωρίς updatedBy", async () => {
    expect((await handleSeoFix({ op: "apply", path: "/a", fields: { h1: "x" }, updatedBy: by }, store)).status).toBe(422);
    expect((await handleSeoFix({ op: "apply", path: "/a", fields: { seoTitle: "t" } }, store)).status).toBe(422);
    expect((await handleSeoFix({ op: "apply", path: "/a", fields: { seoTitle: "t" }, updatedBy: "x".repeat(121) }, store)).status).toBe(422);
    expect(writes).toEqual([]);
  });

  it.each([
    ["seoTitle", "x".repeat(201)],
    ["metaDescription", "x".repeat(401)],
    ["seoTitle", "a<b"],
  ])("422 για %s", async (field, value) => {
    expect((await handleSeoFix({ op: "apply", path: "/a", fields: { [field]: value }, updatedBy: by }, store)).status).toBe(422);
    expect(writes).toEqual([]);
  });

  it("δέχεται τα ακριβή όρια", async () => {
    const faq = Array.from({ length: 8 }, () => ({ q: "q".repeat(300), a: "a".repeat(800) }));
    const fields = { seoTitle: "x".repeat(200), metaDescription: "x".repeat(400), faq };
    expect((await handleSeoFix({ op: "apply", path: "/a", fields, updatedBy: by }, store)).status).toBe(200);
  });

  it("422 για 9 ερωτήσεις, ερώτηση 301, απάντηση 801, `<` σε απάντηση", async () => {
    const pair = { q: "q", a: "a" };
    for (const faq of [Array(9).fill(pair), [{ q: "q".repeat(301), a: "a" }], [{ q: "q", a: "a".repeat(801) }], [{ q: "q", a: "</script>" }]]) {
      expect((await handleSeoFix({ op: "apply", path: "/a", fields: { faq }, updatedBy: by }, store)).status).toBe(422);
    }
    expect(writes).toEqual([]);
  });

  it.each(["x", "/a?b=1", "/a#b", "/../a", "/a//b", "/a/"])("422 για διαδρομή %s", async (path) => {
    expect((await handleSeoFix({ op: "read", path }, store)).status).toBe(422);
    expect((await handleSeoFix({ op: "apply", path, fields: { seoTitle: "t" }, updatedBy: by }, store)).status).toBe(422);
  });

  it("422 για άκυρο σώμα ή άγνωστο op", async () => {
    expect((await handleSeoFix(null, store)).status).toBe(422);
    expect((await handleSeoFix({ op: "drop", path: "/a" }, store)).status).toBe(422);
  });

  it("undo: γράφει restore όταν το expected ταιριάζει", async () => {
    state.seoTitle = "new";
    const res = await handleSeoFix({ op: "undo", path: "/a", restore: { seoTitle: "old" }, expected: { seoTitle: "new" }, updatedBy: by }, store);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, previous: { ...EMPTY, seoTitle: "new" }, current: { ...EMPTY, seoTitle: "old" } });
    expect(writes).toEqual([{ path: "/a", fields: { seoTitle: "old" }, updatedBy: by }]);
  });

  it("undo: 409 χωρίς write όταν το κείμενο άλλαξε", async () => {
    state.seoTitle = "someone else";
    const res = await handleSeoFix({ op: "undo", path: "/a", restore: { seoTitle: "old" }, expected: { seoTitle: "new" }, updatedBy: by }, store);
    expect(res.status).toBe(409);
    expect(writes).toEqual([]);
  });

  it("undo: συγκρίνει μόνο τα πεδία του expected", async () => {
    state = { ...EMPTY, seoTitle: "new", metaDescription: "changed by someone" };
    const res = await handleSeoFix({ op: "undo", path: "/a", restore: { seoTitle: null }, expected: { seoTitle: "new" }, updatedBy: by }, store);
    expect(res.status).toBe(200);
    expect(writes[0].fields).toEqual({ seoTitle: null });
  });

  it("undo: ερωτήσεις με άλλη σειρά κλειδιών ({a,q}) δεν δίνουν 409", async () => {
    state.faq = [{ a: "A", q: "Q" } as { q: string; a: string }];
    const res = await handleSeoFix({ op: "undo", path: "/a", restore: { faq: null }, expected: { faq: [{ q: "Q", a: "A" }] }, updatedBy: by }, store);
    expect(res.status).toBe(200);
  });

  it("undo: 409 όταν άλλαξε η σειρά ή το περιεχόμενο των ερωτήσεων", async () => {
    state.faq = [{ q: "2", a: "b" }, { q: "1", a: "a" }];
    const res = await handleSeoFix({ op: "undo", path: "/a", restore: { faq: null }, expected: { faq: [{ q: "1", a: "a" }, { q: "2", a: "b" }] }, updatedBy: by }, store);
    expect(res.status).toBe(409);
  });

  it("undo: 422 για πεδίο εκτός allowed ή κενό restore, χωρίς write", async () => {
    state.seoTitle = "new";
    expect((await handleSeoFix({ op: "undo", path: "/proion/a", restore: { faq: null }, expected: { seoTitle: "new" }, updatedBy: by }, store)).status).toBe(422);
    expect((await handleSeoFix({ op: "undo", path: "/a", restore: {}, expected: { seoTitle: "new" }, updatedBy: by }, store)).status).toBe(422);
    expect(writes).toEqual([]);
  });
});
