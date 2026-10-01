import "server-only";
import { cookies } from "next/headers";
import { PER_ROW_OPTIONS } from "@/lib/catalog/plp-options";
import { DEFAULT_PER_ROW, PER_ROW_COOKIE } from "@/lib/catalog/listing-query";

/**
 * Products per row: a display preference, read from a cookie.
 *
 * It used to be `?perRow=`, which made every density a different URL and so a
 * different full server render of the same products — four times the facet
 * space for a scraper to walk. The proxy now turns `?perRow=` into this cookie
 * and redirects to the URL without it, so the density links keep working with
 * no client JavaScript.
 */
export async function getPerRow(): Promise<number> {
  const value = Number((await cookies()).get(PER_ROW_COOKIE)?.value);
  return (PER_ROW_OPTIONS as readonly number[]).includes(value) ? value : DEFAULT_PER_ROW;
}
