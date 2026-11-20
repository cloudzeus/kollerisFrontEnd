import "server-only";
import { cookies, headers } from "next/headers";
import {
  ATTR_COOKIE,
  fbcValue,
  gaClientId,
  gaSessionId,
  gaStreamCookieName,
  parseAttrCookie,
  type OrderAttribution,
} from "@/lib/analytics/attribution";

const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-EGS1JNM4EC";

/**
 * Τη στιγμή της παραγγελίας: ό,τι χρειάζεται για να πούμε από πού ήρθε και για
 * να σταλεί η αγορά από τον server. null χωρίς `k_attr` = χωρίς συγκατάθεση.
 */
export async function readOrderAttribution(): Promise<OrderAttribution | null> {
  const jar = await cookies();
  const raw = jar.get(ATTR_COOKIE)?.value;
  const attr = raw === undefined ? null : (parseAttrCookie(raw) ?? {});
  if (!attr) return null;
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
  const out: OrderAttribution = {
    ...attr,
    consent: "granted",
    gaClientId: gaClientId(jar.get("_ga")?.value),
    gaSessionId: gaSessionId(jar.get(gaStreamCookieName(MEASUREMENT_ID))?.value),
    fbp: jar.get("_fbp")?.value?.slice(0, 200) || undefined,
    fbc: fbcValue(jar.get("_fbc")?.value, attr.fbclid, attr.ts),
    ip: ip?.slice(0, 64),
    ua: h.get("user-agent")?.slice(0, 400) || undefined,
  };
  // Χωρίς τα undefined, για καθαρό JSON στη βάση.
  return JSON.parse(JSON.stringify(out)) as OrderAttribution;
}
