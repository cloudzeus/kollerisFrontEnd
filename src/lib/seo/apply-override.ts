import type { SeoFields } from "@/lib/seo/seo-fix-protocol";

/**
 * An override title is the whole `<title>`, shop name included, so it goes in
 * as `absolute`: through the layout's template the name would appear twice.
 */
export function resolveSeoText(
  auto: { title: string; description: string },
  o: SeoFields | null,
  titleSuffix = "",
) {
  const title = (o?.seoTitle ?? auto.title) + titleSuffix;
  return {
    title,
    description: o?.metaDescription ?? auto.description,
    metaTitle: o?.seoTitle ? { absolute: title } : title,
  };
}
