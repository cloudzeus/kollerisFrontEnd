import "server-only";
import { hdctoolRequest } from "@/lib/hdctool/client";
import { isValidAfm, normaliseAfm, type VatCompany, type VatLookupResult } from "@/lib/account/vat";

/**
 * ΑΦΜ lookup, through HDCtool.
 *
 * HDCtool owns this: it resolves an ΑΦΜ against its own `Customer` table first,
 * then SoftOne TRDR, then the AADE registry (`vat.wwa.gr/afm2info`). Doing it
 * there rather than here is what lets an existing Kolleris customer arrive at
 * checkout and be recognised — including their TRDR, which the order push needs
 * so a second customer record is not created in SoftOne.
 *
 * Endpoint: `/api/customers/lookup-by-vat?vat=…`. It authenticates with the same
 * bearer as the rest of the HDCtool surface and works today. Once the public
 * counterpart ships (H8, BACKEND_ALIGNMENT §3) only the path below changes.
 */
const ENDPOINT = "/api/customers/lookup-by-vat";

type HdctoolVatResponse = {
  success: boolean;
  found: boolean;
  source: "database" | "softone" | "wwa" | null;
  afmSearched: string;
  company: {
    name: string | null;
    afm: string | null;
    profession: string | null;
    doy: string | null;
    address: string | null;
    zip: string | null;
    city: string | null;
    trdr: number | null;
    phone01: string | null;
    email: string | null;
  };
};

/**
 * HDCtool returns "" for registry fields that came back nil — the AADE payload
 * encodes those as `{"$":{"xsi:nil":"true"}}`, not as null. Empty string is not
 * a value a form should be prefilled with.
 */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function lookupVat(rawAfm: string): Promise<VatLookupResult> {
  const afm = normaliseAfm(rawAfm);
  if (!isValidAfm(afm)) return { found: false, reason: "invalid" };

  let data: HdctoolVatResponse;
  try {
    data = await hdctoolRequest<HdctoolVatResponse>(`${ENDPOINT}?vat=${afm}`, undefined, {
      method: "GET",
    });
  } catch (error) {
    // A registry that is down must not block the order. The caller falls back
    // to the fields the customer typed by hand.
    console.error("[vat-lookup]", error);
    return { found: false, reason: "unavailable" };
  }

  if (!data.success || !data.found || !data.company?.afm) {
    return { found: false, reason: "not_found" };
  }

  const c = data.company;
  const company: VatCompany = {
    name: clean(c.name),
    afm: clean(c.afm),
    profession: clean(c.profession),
    doy: clean(c.doy),
    address: clean(c.address),
    zip: clean(c.zip),
    city: clean(c.city),
    trdr: c.trdr && c.trdr > 0 ? c.trdr : null,
    phone: clean(c.phone01),
    email: clean(c.email),
  };

  return {
    found: true,
    // `database`/`softone` mean HDCtool already knows this company as a
    // customer; `wwa` means it came fresh from the AADE registry.
    source: data.source === "wwa" ? "aade" : "kolleris",
    company,
  };
}
