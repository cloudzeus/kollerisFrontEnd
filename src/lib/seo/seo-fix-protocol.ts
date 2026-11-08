import { z } from "zod";

/**
 * The `seo-override` protocol between HDCtool and a storefront. Copied verbatim
 * into each storefront repo, like `hdc-signature.ts`: only the store differs.
 */

export const SEO_FIELDS = ["seoTitle", "metaDescription", "faq"] as const;
export type SeoFieldName = (typeof SEO_FIELDS)[number];
export type FaqPair = { q: string; a: string };
export type SeoFields = { seoTitle: string | null; metaDescription: string | null; faq: FaqPair[] | null };

export interface SeoFixStore {
  /** `null`: the page is not supported. */
  allowed(path: string): SeoFieldName[] | null;
  read(path: string): Promise<SeoFields>;
  write(path: string, fields: Partial<SeoFields>, updatedBy: string): Promise<void>;
}

type SeoFixResult = { status: number; body: Record<string, unknown> };

// Rejecting `<` also protects pages that write JSON-LD with plain JSON.stringify.
const plain = (max: number) =>
  z.string().trim().max(max).refine((s) => !s.includes("<"), "Μόνο απλό κείμενο");

const text = (max: number) =>
  plain(max)
    .transform((s) => s || null)
    .nullable()
    .optional();

const fieldsSchema = z.strictObject({
  seoTitle: text(200),
  metaDescription: text(400),
  faq: z
    .array(z.object({ q: plain(300).min(1), a: plain(800).min(1) }))
    .max(8)
    .transform((list) => (list.length ? list : null))
    .nullable()
    .optional(),
});

const path = z
  .string()
  .max(191)
  .regex(/^\/$|^(\/[A-Za-z0-9][A-Za-z0-9._~-]*)+$/);
const updatedBy = z.string().min(1).max(120);

const requestSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("read"), path }),
  z.object({ op: z.literal("apply"), path, fields: fieldsSchema, updatedBy }),
  z.object({ op: z.literal("undo"), path, restore: fieldsSchema, expected: fieldsSchema, updatedBy }),
]);

const refuse = (status: number, error: string): SeoFixResult => ({ status, body: { ok: false, error } });

// [q, a] pairs: JSON read back from the database may order the keys differently.
const comparable = (field: SeoFieldName, value: SeoFields[SeoFieldName]) =>
  JSON.stringify(field === "faq" ? (value as FaqPair[] | null)?.map(({ q, a }) => [q, a]) ?? null : value);

export async function handleSeoFix(body: unknown, store: SeoFixStore): Promise<SeoFixResult> {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return refuse(422, "Άκυρο αίτημα");
  const req = parsed.data;

  const allowed = store.allowed(req.path);
  if (req.op === "read") {
    if (!allowed) return { status: 200, body: { ok: true, supported: false } };
    return { status: 200, body: { ok: true, supported: true, allowed, current: await store.read(req.path) } };
  }

  if (!allowed) return refuse(422, "Η σελίδα δεν υποστηρίζεται");
  const fields: Partial<SeoFields> = req.op === "apply" ? req.fields : req.restore;
  const expected: Partial<SeoFields> = req.op === "undo" ? req.expected : {};
  if (!Object.keys(fields).length || (req.op === "undo" && !Object.keys(expected).length)) {
    return refuse(422, "Δεν δόθηκε κανένα πεδίο");
  }
  const named = [...Object.keys(fields), ...Object.keys(expected)] as SeoFieldName[];
  if (named.some((field) => !allowed.includes(field))) return refuse(422, "Το πεδίο δεν υποστηρίζεται");

  const previous = await store.read(req.path);
  // shortcut: read-then-write is not atomic, a real race needs a row lock if two people ever undo at once.
  const changed = (Object.keys(expected) as SeoFieldName[]).some(
    (field) => comparable(field, previous[field]) !== comparable(field, expected[field] ?? null),
  );
  if (changed) return refuse(409, "Το κείμενο άλλαξε εντωμεταξύ");

  await store.write(req.path, fields, req.updatedBy);
  return { status: 200, body: { ok: true, previous, current: await store.read(req.path) } };
}
