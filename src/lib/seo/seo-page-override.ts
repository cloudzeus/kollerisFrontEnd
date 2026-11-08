import "server-only";
import { cache } from "react";
import { Prisma } from "@/generated/prisma/client";
import type { Locale } from "@/i18n/routing";
import { prisma } from "@/lib/prisma";
import type { FaqPair, SeoFieldName, SeoFields, SeoFixStore } from "@/lib/seo/seo-fix-protocol";

/** Which fields each page can show. `null`: the page is not supported. */
export function allowedFieldsForPath(path: string): SeoFieldName[] | null {
  if (path === "/" || /^\/katalogos\/[^/]+$/.test(path)) return ["seoTitle", "metaDescription", "faq"];
  if (/^\/(brands|proion)\/[^/]+$/.test(path)) return ["seoTitle", "metaDescription"];
  return null;
}

type Row = { seoTitle: string | null; metaDescription: string | null; faq: Prisma.JsonValue };

function toFields(row: Row): SeoFields {
  return {
    seoTitle: row.seoTitle,
    metaDescription: row.metaDescription,
    faq: (row.faq as FaqPair[] | null)?.map(({ q, a }) => ({ q, a })) ?? null,
  };
}

export const seoFixStore: SeoFixStore = {
  allowed: allowedFieldsForPath,

  async read(path) {
    const row = await prisma.seoPageOverride.findUnique({ where: { path } });
    return row ? toFields(row) : { seoTitle: null, metaDescription: null, faq: null };
  },

  async write(path, { faq, ...text }, updatedBy) {
    const data = { ...text, updatedBy, ...(faq === undefined ? {} : { faq: faq ?? Prisma.DbNull }) };
    await prisma.seoPageOverride.upsert({ where: { path }, create: { path, ...data }, update: data });
  },
};

/** SEO text is Greek only. Any failure falls back to the page's automatic text. */
export const seoOverrideFor = cache(async (path: string, locale: Locale): Promise<SeoFields | null> => {
  if (locale !== "el") return null;
  try {
    const row = await prisma.seoPageOverride.findUnique({ where: { path } });
    return row && toFields(row);
  } catch (error) {
    console.error("seoOverrideFor", error);
    return null;
  }
});
