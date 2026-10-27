"use server";

import { redirect } from "next/navigation";
import { hash as hashPassword } from "@node-rs/argon2";
import { sendOrderEmail } from "@/lib/mail/order-email";
import { sendInternalOrderEmail } from "@/lib/mail/order-internal-email";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { STOCK_HOLD_HOURS, holdExpiry } from "@/lib/orders/hold";
import { computeTotals, getCart, getCartToken } from "@/lib/cart/cart";
import { PAYMENT_METHODS, SHIPPING_METHODS, shippingMethodsFor } from "@/lib/cart/options";
import { isUnserviceable, quoteLivePostage } from "@/lib/shipping/acs-live";
import { checkDestination, destinationMessage, shippingCopy } from "@/lib/shipping/destination";
import { validateCountryPostcode } from "@/lib/shipping/countries";
import { isQuoteUnavailable, isRefused, quoteDestination } from "@/lib/shipping/courier-quote";
import { internationalCopy } from "@/lib/shipping/international-copy";
import { createPaymentOrder, isVivaConfigured } from "@/lib/payment/viva";
import { routing, type Locale } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/account/session";
import { parseRequestMode, planCheckout, requestPath } from "@/lib/requests/model";
import { createRequestOrder, type OrderBase } from "@/lib/requests/create";
import { announceNewRequest } from "@/lib/requests/service";
import type { CartLineView } from "@/lib/cart/options";
import { DHL_SHIPPING_METHOD } from "@/lib/cart/options";
import { allowedCountries, isDhlDestination, isEuSalesEnabled } from "@/lib/eu-sales/countries";
import { checkEuVat, quoteDhl as quoteEuDhl, type DhlQuote as EuDhlQuote, type EuVatCheck } from "@/lib/eu-sales/hdctool-eu";
import { normaliseEuVat } from "@/lib/eu-sales/vat-format";
import { resolveVatMode, type CustomerType, type VatMode } from "@/lib/eu-sales/vat-mode";
import { euSalesCopy } from "@/lib/eu-sales/copy";
import { writeEuBuyer } from "@/lib/eu-sales/buyer-cookie";
import { revalidatePath } from "next/cache";
import { chargeableWeight } from "@/lib/shipping/acs-tariff";
import { vatRateForDestination } from "@/lib/shipping/vat";

/**
 * Order placement.
 *
 * Everything is recomputed here from the database — prices, postage, VAT,
 * totals. The form supplies only the address, the choices and the consent. A
 * disabled submit button is a UX affordance; this is the actual control.
 */

const checkoutSchema = z.object({
  email: z.email().max(320),
  phone: z.string().trim().min(8).max(64),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),

  shipLine1: z.string().trim().min(3).max(255),
  shipLine2: z.string().trim().max(255).optional().or(z.literal("")),
  shipCity: z.string().trim().min(2).max(120),
  shipPostcode: z.string().trim().min(4).max(16),
  /**
   * ISO-2. Only read when there is a country selector
   * (INTERNATIONAL_SHIPPING_ENABLED or EU_SALES_ENABLED); otherwise ignored and
   * the order is Greek, as it always was. docs/dhl-express.md §4.
   */
  shipCountry: z.string().trim().max(2).optional().or(z.literal("")),
  /** Νομός. */
  shipRegion: z.string().trim().max(120).optional().or(z.literal("")),
  /** Περιφέρεια. */
  shipAdminRegion: z.string().trim().max(120).optional().or(z.literal("")),

  /**
   * The Greek invoice toggle («Θέλω τιμολόγιο»). Abroad with EU sales it is
   * not read: `customerType` replaces it (intra-EU sales design §3.2).
   */
  wantsInvoice: z.union([z.literal("on"), z.literal("")]).optional(),
  /** EU sales, DHL destinations only: consumer or company. Ignored in Greece. */
  customerType: z.enum(["individual", "company"]).optional().or(z.literal("")),
  /**
   * The VAT mode the summary showed when «Ολοκλήρωση» was pressed. A HINT,
   * never an input to the price: it only lets the server refuse to charge
   * more than was on screen without the customer seeing it first (R11-I2).
   */
  vatModeHint: z.enum(["standard", "intra_eu_exempt"]).optional().or(z.literal("")),
  companyName: z.string().trim().max(255).optional().or(z.literal("")),
  vatNumber: z.string().trim().max(32).optional().or(z.literal("")),
  taxOffice: z.string().trim().max(120).optional().or(z.literal("")),
  companyTrade: z.string().trim().max(255).optional().or(z.literal("")),
  /// Set by the ΑΦΜ lookup when HDCtool already knows this company.
  erpTrdr: z.coerce.number().int().positive().optional().or(z.literal("")),

  shippingMethod: z.string().max(32),
  /* Absent when the whole cart is a back-order request: there is nothing to
     pay yet, so the form does not ask. Falls back to the first method below. */
  paymentMethod: z.string().max(32).optional(),
  /**
   * A cart with some lines in stock and some not: «split» pays and ships the
   * former now and requests the rest; «together» requests everything.
   * docs/backorder-requests.md §1. Ignored when the cart is not mixed.
   */
  requestMode: z.string().max(16).optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  terms: z.union([z.literal("on"), z.literal("")]).optional(),
  locale: z.string().max(5).optional(),

  /**
   * An account, if the customer wants one — optional, and empty for everybody
   * who does not.
   *
   * A guest has already typed their name, phone and address; asking them to
   * type all of it again later to see what they just bought is asking them to
   * do our filing. A password here is consent and a credential in one field,
   * so the account can be created outright — no link, no waiting — because the
   * person is present and chose it themselves.
   *
   * Eight characters is the same floor `setNewPassword` enforces. Kept in step
   * deliberately: a rule that differs by entrance is a rule somebody discovers
   * by being refused.
   */
  password: z.string().min(8).max(200).optional().or(z.literal("")),
});

/**
 * How long the Viva payment code stays valid: exactly as long as the hold.
 *
 * Derived from `STOCK_HOLD_HOURS` rather than chosen separately. It used to be
 * seven days while the hold was three hours, and a payment link that outlives
 * the hold is worse than a short one — it invites a transfer for goods released
 * to somebody else days earlier, so the money arrives for an order that cannot
 * be filled.
 */
const BANK_TRANSFER_WINDOW_MINUTES = STOCK_HOLD_HOURS * 60;

export type CheckoutState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/** KOL-YYYYMMDD-NNNN, sequential within the day. */
async function nextOrderNumber(): Promise<string> {
  const now = new Date();
  const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const prefix = `KOL-${day}-`;

  const last = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });

  const next = last ? Number.parseInt(last.orderNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function placeOrder(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { error: "Ελέγξτε τα στοιχεία σας.", fieldErrors };
  }
  const input = parsed.data;

  // The checkbox is disabled client-side too, but that is decoration.
  if (input.terms !== "on") {
    return {
      error: "Πρέπει να αποδεχτείτε τους όρους χρήσης.",
      fieldErrors: { terms: "Απαιτείται" },
    };
  }

  const locale = (routing.locales.includes(input.locale as Locale)
    ? input.locale
    : routing.defaultLocale) as Locale;

  /*
   * EU sales (intra-EU sales design §3). With the flag on and a DHL
   * destination (EU minus Greece and Cyprus) the customer is a consumer or a
   * company, and «Θέλω τιμολόγιο» is not read. Greece — and Cyprus, which
   * keeps today's path — never come here: a Greek ΑΦΜ is AADE's, never VIES's,
   * and never exempt (Review Focus 5).
   */
  const euSales = isEuSalesEnabled();
  const countries = allowedCountries();
  const selector = countries.length > 1;
  /*
   * No selector (both flags off): the posted value is ignored and the order is
   * Greek, as it always was. With one, a country not on offer is refused just
   * below — after the invoice check, in the order the action always had. A
   * country not on offer is never a DHL destination under EU sales, so it
   * never reaches the EU path.
   */
  const country = selector ? (input.shipCountry ?? "").trim().toUpperCase() || "GR" : "GR";
  const euBuyer = euSales && countries.includes(country) && isDhlDestination(country);
  const eu = euSalesCopy(locale);

  let customerType: CustomerType | null = null;
  /** The VAT number VIES is asked about: `DE123456789`. */
  let euVat: string | null = null;
  let wantsInvoice: boolean;
  if (euBuyer) {
    if (input.customerType !== "individual" && input.customerType !== "company") {
      return { error: eu.customerTypeRequired, fieldErrors: { customerType: eu.required } };
    }
    customerType = input.customerType;
    if (customerType === "company") {
      if (!input.companyName || !input.vatNumber) {
        return {
          error: eu.companyRequired,
          fieldErrors: {
            ...(input.companyName ? {} : { companyName: eu.required }),
            ...(input.vatNumber ? {} : { vatNumber: eu.required }),
          },
        };
      }
      // A prefix for another country, or no number at all: no VIES call (Review Focus 1).
      const normalised = normaliseEuVat(input.vatNumber, country);
      if (!normalised.ok) {
        return { error: eu.invalidFormat, fieldErrors: { vatNumber: eu.invalidFormat } };
      }
      euVat = normalised.vat;
    }
    wantsInvoice = customerType === "company";
  } else {
    wantsInvoice = input.wantsInvoice === "on";
    if (wantsInvoice && (!input.companyName || !input.vatNumber)) {
      return {
        error: "Για τιμολόγιο χρειάζονται επωνυμία και ΑΦΜ.",
        fieldErrors: {
          ...(input.companyName ? {} : { companyName: "Απαιτείται" }),
          ...(input.vatNumber ? {} : { vatNumber: "Απαιτείται" }),
        },
      };
    }
  }

  /*
   * Greece only (see `lib/shipping/destination`). There is no country field,
   * so an address abroad arrives looking domestic — order KOL-20261013-0002
   * went to Verona that way. Its postcode and its words are what give it
   * away. Checked before anything is priced or written. Collection from the
   * shop ships nothing, so its address is not a destination.
   */
  /*
   * The delivery country (docs/dhl-express.md §4), worked out above. With both
   * flags off there is no selector, the posted field is ignored (Greece), and
   * the checks below are exactly the ones above. With
   * INTERNATIONAL_SHIPPING_ENABLED: Greece and Cyprus go with ACS, the rest of
   * the EU with DHL Express. With EU sales only: Greece, or a DHL destination.
   * Whenever there is a selector the Greek checks speak as they do with one
   * («επιλέξτε τη χώρα»).
   */
  const intl = internationalCopy(locale);
  if (!countries.includes(country)) {
    return { error: intl.country, fieldErrors: { shipCountry: intl.country } };
  }
  const abroad = country !== "GR";
  /* The postcode as the destination country writes it («1012 AB», «00-950»). */
  let shipPostcode = input.shipPostcode;

  if (input.shippingMethod !== "pickup") {
    if (!abroad) {
      const destination = checkDestination(input);
      if (!destination.ok) {
        const message = !selector
          ? destinationMessage(destination, locale)
          : destination.reason === "foreign_address"
            ? intl.foreign
            : intl.unserviceable;
        return { error: message, fieldErrors: { [destination.field]: message } };
      }
    } else if (euBuyer) {
      /*
       * EU sales: no Greek rule abroad, and the postcode is validated by the
       * DHL quote below (HDCtool's `normalizePostcode`). Written the way the
       * country writes it when the shop already knows the format.
       */
      const checked = validateCountryPostcode(country, input.shipPostcode);
      if (checked.ok) shipPostcode = checked.postcode;
    } else {
      const checked = validateCountryPostcode(country, input.shipPostcode);
      if (!checked.ok) {
        return { error: intl.postcode, fieldErrors: { shipPostcode: intl.postcode } };
      }
      shipPostcode = checked.postcode;
    }
  }

  const cartToken = await getCartToken();
  if (!cartToken) return { error: "Το καλάθι σας είναι άδειο." };

  /*
   * Who is placing this, if anyone.
   *
   * The column existed and was never written, so every order ever placed is
   * orphaned from its account and "my orders" had nothing to list. Guests still
   * get null and still get a token, which is what makes the confirmation page
   * work for someone who never registered.
   */
  const customer = await getCurrentUser();

  // Re-priced against the delivery postcode, not the indicative cart quote.
  const cart = await getCart(
    locale,
    shipPostcode,
    abroad ? { country, city: input.shipCity } : undefined,
  );
  if (!cart || cart.lines.length === 0) return { error: "Το καλάθι σας είναι άδειο." };

  /*
   * Back-order requests (docs/backorder-requests.md). Which lines can be paid
   * now and which become a request is decided HERE, from the stock `getCart`
   * has just read — never from what the form believed when it was rendered.
   * The customer's choice only matters for a mixed cart.
   */
  const plan = planCheckout(cart.lines, parseRequestMode(input.requestMode));
  if (!plan.ok) {
    return {
      error: "Επιλέξτε πώς θα προχωρήσει η παραγγελία: τα διαθέσιμα τώρα και τα υπόλοιπα ως αίτημα, ή όλα μαζί ως αίτημα.",
      fieldErrors: { requestMode: "Απαιτείται" },
    };
  }
  const payLines: CartLineView[] = plan.pay;
  const requestLines: CartLineView[] = plan.request;

  /*
   * The methods on offer for the destination. Flag off: the three it always
   * had, with the old fallback to the first. Flag on: a method that does not
   * fit the country (ACS to Italy, DHL to Athens) is refused, not guessed.
   */
  const shipping = euBuyer
    ? // EU sales abroad: DHL Express only, no collection from the shop (§3.1).
      [DHL_SHIPPING_METHOD].find((m) => m.id === input.shippingMethod)
    : selector
      ? shippingMethodsFor(country).find((m) => m.id === input.shippingMethod)
      : (SHIPPING_METHODS.find((m) => m.id === input.shippingMethod) ?? SHIPPING_METHODS[0]);
  if (!shipping) {
    return { error: intl.method, fieldErrors: { shippingMethod: intl.method } };
  }
  const payment =
    PAYMENT_METHODS.find((m) => m.id === input.paymentMethod) ?? PAYMENT_METHODS[0];

  /*
   * Kept as a guard even though nothing is `partnerOnly` any more: the field
   * exists, and the day something is added to it this is what stops a guest
   * reaching it by posting the id.
   */
  if (payment.partnerOnly) {
    return { error: "Ο τρόπος πληρωμής δεν είναι διαθέσιμος για τον λογαριασμό σας." };
  }


  // The lines being shipped now; for a request-only cart, the requested
  // ones — the address is checked either way.
  const parcelLines = payLines.length ? payLines : requestLines;
  const parcel = parcelLines.map((l) => ({
    quantity: l.quantity,
    weight: l.weight,
    width: l.width,
    length: l.length,
    height: l.height,
  }));
  /*
   * EU sales: VIES and DHL are asked again HERE, whatever the form showed or
   * claimed — a «valid» in the browser may be yesterday's, or for a country
   * since switched away from (Review Focus 2, 3). The VAT mode is decided from
   * this answer alone, and an outage means VAT is charged, never an error.
   */
  let vies: EuVatCheck | null = null;
  if (euBuyer && euVat) {
    vies = await checkEuVat(euVat, country);
    if (vies.status === "invalid_format") {
      return { error: eu.invalidFormat, fieldErrors: { vatNumber: eu.invalidFormat } };
    }
  }
  const vatMode: VatMode = euBuyer && customerType
    ? resolveVatMode({
        country,
        customerType,
        vies: vies ? { status: vies.status, checkedAt: vies.checkedAt, country } : null,
      })
    : "standard";

  /*
   * The customer was shown the net and VIES no longer says so (an outage, an
   * invalid number, or this morning's answer is now yesterday's). Charging
   * VAT now would charge more than the screen said. No order: the fresh
   * answer replaces the remembered one, the page re-renders with VAT, and the
   * customer decides knowingly. The server stays the authority either way.
   */
  if (euBuyer && input.vatModeHint === "intra_eu_exempt" && vatMode !== "intra_eu_exempt") {
    if (euVat && vies) {
      await writeEuBuyer({
        customerType: "company",
        vies: { country, vat: euVat, status: vies.status, checkedAt: vies.checkedAt },
      });
    }
    revalidatePath("/", "layout");
    /* What VIES now says, on the banner and on the VAT field (which drops its «✓»). */
    const message = vies?.status === "invalid" ? eu.invalid : eu.unavailable;
    return { error: message, fieldErrors: { vatNumber: message } };
  }

  let euQuote: Extract<EuDhlQuote, { ok: true }> | null = null;
  if (euBuyer) {
    const answer = await quoteEuDhl({
      country,
      postcode: shipPostcode,
      city: input.shipCity,
      weightKg: chargeableWeight(parcel).chargeableKg,
    });
    if (!answer.ok) {
      // Nobody could price it: no order, and the customer is told to call.
      if (answer.reason === "unavailable") return { error: eu.noDhl };
      const message = intl.refused[answer.reason];
      return { error: message, fieldErrors: { shipPostcode: message } };
    }
    euQuote = answer;
  }
  /* The postage VAT rate: Greek 24% for every destination for now (no OSS). */
  const shippingVatRate = vatRateForDestination(country);
  /*
   * What the order row says about VAT must agree with its totals: an exempt
   * order is frozen at 0% everywhere — lines, DHL rate, stored quote (R11-I1).
   */
  const exempt = vatMode === "intra_eu_exempt";

  /*
   * Abroad the price is asked for again HERE, from HDCtool — whatever the form
   * showed is not an input. Greece is the original call, unchanged.
   */
  const quote =
    !euBuyer && shipping.expressMultiplier > 0
      ? abroad
        ? await quoteDestination({
            country,
            postcode: shipPostcode,
            city: input.shipCity,
            items: parcel,
            declaredValue: parcelLines.reduce((sum, l) => sum + l.lineGross, 0),
          })
        : await quoteLivePostage({ items: parcel, postcode: input.shipPostcode })
      : null;

  /*
   * ACS has no station for this postcode — a foreign postcode that happens to
   * look Greek (Verona's 37015 did). There is no price to charge and nowhere
   * to deliver, so no order. An ACS OUTAGE is different: it still prices from
   * the table and the order goes through.
   */
  if (isUnserviceable(quote)) {
    const message = selector ? intl.unserviceable : shippingCopy(locale).unserviceable;
    return { error: message, fieldErrors: { shipPostcode: message } };
  }
  /* DHL said no to the place (422): on the Τ.Κ. field, and no table abroad. */
  if (isRefused(quote)) {
    const message = intl.refused[quote.error];
    return { error: message, fieldErrors: { shipPostcode: message } };
  }
  /* Nobody could price it abroad: blocked, «δοκιμάστε ξανά». */
  if (isQuoteUnavailable(quote)) {
    return { error: intl.unavailable };
  }

  /*
   * One query for the whole basket. `products.mtrl` is the ERP id; a line whose
   * product has since been removed simply keeps null, which is honest — better
   * an unmapped line the push can report than a wrong id it cannot.
   */
  const mtrlRows = await prisma.product.findMany({
    where: { id: { in: cart.lines.map((line) => line.productId) } },
    select: { id: true, mtrl: true },
  });
  const mtrlByProductId = new Map(mtrlRows.map((row) => [row.id, row.mtrl]));

  /*
   * The EU-sales columns. Written whenever EU sales is on (Greece included, so
   * every such order says where it went and how VAT was charged); never with
   * the flag off, so a Greek order is the row it always was.
   */
  const euColumns = euSales
    ? {
        customerType,
        vatMode,
        viesValid: vies?.status === "valid" ? true : vies?.status === "invalid" ? false : null,
        viesName: vies?.name ?? null,
        viesAddress: vies?.address ?? null,
        viesConsultationNumber: vies?.consultationNumber ?? null,
        viesCheckedAt: vies?.checkedAt ? new Date(vies.checkedAt) : null,
      }
    : {};
  /* The DHL price this order is charged, for the intake to book against. */
  const dhlColumns = euQuote
    ? {
        dhlProductCode: euQuote.productCode,
        dhlNetAmount: euQuote.netAmount,
        dhlVatRate: exempt ? 0 : shippingVatRate,
        dhlQuotedAt: new Date(euQuote.quotedAt),
      }
    : {};
  /*
   * Where it goes and who is billed: the same country in this phase (§3.1).
   * `shipCountry` abroad, as before; with EU sales on, both on every order.
   * With EU sales off a row is exactly today's — no `billCountry` key.
   */
  const countryColumns = {
    ...(abroad || euSales ? { shipCountry: country } : {}),
    ...(euSales ? { billCountry: country } : {}),
  };
  /* Abroad with EU sales the VAT number keeps its prefix; no ΔΟΥ, no AADE TRDR. */
  const invoiceColumns = euBuyer
    ? {
        wantsInvoice,
        companyName: wantsInvoice ? input.companyName || null : null,
        vatNumber: wantsInvoice ? euVat : null,
        taxOffice: null,
        companyTrade: null,
        erpTrdr: null,
      }
    : {
        wantsInvoice,
        companyName: wantsInvoice ? input.companyName || null : null,
        vatNumber: wantsInvoice ? input.vatNumber || null : null,
        taxOffice: wantsInvoice ? input.taxOffice || null : null,
        companyTrade: wantsInvoice ? input.companyTrade || null : null,
        erpTrdr: wantsInvoice && typeof input.erpTrdr === "number" ? input.erpTrdr : null,
      };

  /* What a request shares with the order being placed: who, where, invoice. */
  const base: OrderBase = {
    email: input.email,
    phone: input.phone,
    firstName: input.firstName,
    lastName: input.lastName,
    shipLine1: input.shipLine1,
    shipLine2: input.shipLine2 || null,
    shipCity: input.shipCity,
    shipPostcode,
    ...countryColumns,
    shipRegion: input.shipRegion || null,
    shipAdminRegion: input.shipAdminRegion || null,
    ...invoiceColumns,
    ...(euSales ? { customerType } : {}),
    shippingMethod: shipping.id,
    notes: input.notes || null,
  };

  /*
   * Nothing to pay now: the whole cart is a request. No Viva order, no stock
   * hold — the customer gets a link and an answer within 24 hours.
   */
  if (payLines.length === 0) {
    const request = await createRequestOrder({
      orderNumber: await nextOrderNumber(),
      guestToken: randomBytes(24).toString("base64url"),
      customerId: customer?.id ?? null,
      locale,
      base,
      lines: requestLines,
      mtrlByProductId,
      parentOrderNumber: null,
    });
    await prisma.cartLine.deleteMany({ where: { cart: { token: cartToken } } });
    await maybeCreateAccount(input, request.orderNumber);
    await announceNewRequest(request.orderNumber);
    redirect(requestPath(locale, request.requestToken));
  }

  /*
   * Priced on what was SUBMITTED, not on what the cart row remembers.
   *
   * `getCart` reads the shipping and payment method from the Cart row, which is
   * written by the basket page. The checkout form has its own controls and did
   * not write back, so choosing "collect from the shop" here produced an order
   * stamped `pickup` and charged the courier rate that was still sitting in the
   * database. The customer was billed for delivery on an order they came to
   * fetch.
   *
   * The form is the last word and the ids above are already validated against
   * the offered list, so the totals are recomputed from them.
   */
  const totals = await computeTotals(
    payLines,
    shipping.id,
    payment.id,
    shipPostcode,
    abroad ? { country, city: input.shipCity } : undefined,
    /*
     * EU sales abroad: the DHL price asked for above, and the VAT mode the
     * server decided. Exempt removes VAT from the lines, the postage and the
     * fee, so `totalGross` is the net — and that is what Viva charges.
     */
    euQuote ? { vatMode, shipping: { net: euQuote.netAmount, vatRate: shippingVatRate }, country } : {},
  );
  /* The totals re-quote too; if that answer differs in kind, no order. */
  if (abroad && shipping.expressMultiplier > 0 && (totals.quoteUnavailable || totals.unserviceable)) {
    return { error: intl.unavailable };
  }

  const orderNumber = await nextOrderNumber();
  const guestToken = randomBytes(24).toString("base64url");

  const order = await prisma.order.create({
    data: {
      orderNumber,
      guestToken,
      customerId: customer?.id ?? null,
      status: "PENDING_PAYMENT",
      // Every method now settles before or after dispatch, never on it: cash on
      // delivery is not accepted, so ON_DELIVERY can no longer be reached.
      paymentStatus: "PENDING",

      email: input.email,
      phone: input.phone,
      firstName: input.firstName,
      lastName: input.lastName,

      shipLine1: input.shipLine1,
      shipLine2: input.shipLine2 || null,
      shipCity: input.shipCity,
      shipPostcode,
      ...countryColumns,
      shipRegion: input.shipRegion || null,
      shipAdminRegion: input.shipAdminRegion || null,

      ...invoiceColumns,
      ...euColumns,
      ...dhlColumns,

      shippingMethod: shipping.id,
      paymentMethod: payment.id,
      notes: input.notes || null,

      subtotalNet: totals.subtotalNet,
      subtotalGross: totals.subtotalGross,
      shippingNet: totals.shippingNet,
      shippingGross: totals.shippingGross,
      paymentFeeNet: totals.paymentFeeNet,
      paymentFeeGross: totals.paymentFeeGross,
      vatAmount: totals.vatAmount,
      totalGross: totals.totalGross,
      savingsGross: totals.savingsGross,
      shippingQuote: euQuote
        ? JSON.parse(JSON.stringify({ carrier: "DHL", ...euQuote, vatRate: exempt ? 0 : shippingVatRate }))
        : quote
          ? JSON.parse(JSON.stringify(quote))
          : undefined,

      lines: {
        create: payLines.map((line) => ({
          productId: line.productId,
          /*
           * The ERP's own product id, resolved here and frozen with the line.
           *
           * The column existed and nothing ever filled it: 17 order lines, zero
           * with an MTRL. HDCtool's intake reported every one of them as
           * `unmappedLines`, so a document issued from an order would have
           * carried no items — the sale, with nothing sold.
           *
           * Resolved at placement rather than at push, and stored rather than
           * looked up again later, for the same reason as every other value on
           * this row: a product can be relisted under a different MTRL, and an
           * order is a record of what was bought, not of what the catalogue
           * says today.
           */
          mtrl: mtrlByProductId.get(line.productId) ?? null,
          sku: line.sku,
          name: line.name,
          brand: line.brandName,
          imageUrl: line.image,
          quantity: line.quantity,
          /* Κανονική τιμή και ποσοστό χωριστά — όπως τα θέλει η γραμμή του
             παραστατικού, και όπως πρέπει να διαβάζεται η παραγγελία σε έξι
             μήνες, όταν η καμπάνια θα έχει λήξει. */
          unitNet: line.unitNet,
          discountPercent: line.discountPercent,
          offerTitle: line.offerTitle,
          unitGross: (exempt ? line.lineNet : line.lineGross) / line.quantity,
          vatRate: exempt ? 0 : line.vatRate,
          lineNet: line.lineNet,
          lineGross: exempt ? line.lineNet : line.lineGross,
          weightKg: line.weight,
        })),
      },
      history: {
        create: { status: "PENDING_PAYMENT", actor: "customer", note: "Order placed" },
      },
    },
    select: { id: true, orderNumber: true, guestToken: true, totalGross: true },
  });

  // The cart is emptied only after the order row exists — a failure above must
  // leave the customer with their basket intact.
  await prisma.cartLine.deleteMany({ where: { cart: { token: cartToken } } });

  /*
   * Split cart: the lines that were not in stock become a request of their
   * own, pointing at this order. Written after the paid order exists (so it
   * has a number to point at) and before the customer leaves for Viva.
   */
  if (requestLines.length > 0) {
    try {
      const request = await createRequestOrder({
        orderNumber: await nextOrderNumber(),
        guestToken: randomBytes(24).toString("base64url"),
        customerId: customer?.id ?? null,
        locale,
        base,
        lines: requestLines,
        mtrlByProductId,
        parentOrderNumber: order.orderNumber,
      });
      await announceNewRequest(request.orderNumber);
    } catch (error) {
      // The paid half stands on its own; the customer is told on the page.
      console.error(`[checkout] ${order.orderNumber}: back-order request not created`, error);
    }
  }

  await maybeCreateAccount(input, order.orderNumber);

  /*
   * Bank transfer: accepted now, reconciled later, and it needs a reference.
   *
   * The order used to be confirmed with nothing tying a future deposit to it,
   * so matching a bank statement line to an order was a manual search by name
   * and amount. Asking Viva for a payment order gives the customer a code to
   * quote on the transfer, and when the money lands Viva notifies
   * `/api/webhooks/viva` with our order number in `merchantTrns` — the same
   * path a card payment already takes. Reconciliation stops being clerical.
   *
   * Deliberately NOT fatal. The order is placed and the goods are reserved; a
   * Viva outage must not undo that. Without a code the confirmation page simply
   * asks the customer to quote the order number, which is what happened before.
   *
   * The window is long because a transfer is not a card: SEPA credit between
   * Greek banks routinely takes a working day, and a code that expires in half
   * an hour would expire before anyone reached a banking app.
   */
  if (payment.id === "bank") {
    /*
     * Stamp the hold BEFORE anything that can fail.
     *
     * Viva may be unreachable and the email may not send; neither changes the
     * fact that this order is holding stock from now. Writing the deadline
     * first means the shop always knows what it committed to, even for an order
     * whose payment link never got created.
     */
    const reservedUntil = holdExpiry();
    await prisma.order.update({
      where: { id: order.id },
      data: { reservedUntil },
    });

    if (isVivaConfigured()) {
      try {
        const paymentOrder = await createPaymentOrder({
          amountGross: Number(order.totalGross),
          orderNumber: order.orderNumber,
          description: `Kolleris ${order.orderNumber}`,
          locale,
          customer: {
            email: input.email,
            fullName: `${input.firstName} ${input.lastName}`,
            phone: input.phone,
          },
          expiryMinutes: BANK_TRANSFER_WINDOW_MINUTES,
        });
        await prisma.order.update({
          where: { id: order.id },
          data: { vivaOrderCode: paymentOrder.orderCode },
        });
      } catch (error) {
        console.error(`[checkout] no Viva code for ${order.orderNumber}`, error);
      }
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CONFIRMED" },
    });

    /*
     * The email the payment step promises: "Θα λάβετε τα στοιχεία κατάθεσης".
     *
     * For a bank transfer this is not a courtesy — it carries the IBAN and the
     * reference to write on the deposit, without which the money arrives and
     * nobody can tell whose it is. Sent here rather than from the webhook,
     * because the whole point is that it goes out BEFORE the customer pays.
     *
     * Never fatal, and never awaited into the redirect's way for longer than it
     * takes: the order exists and is confirmed. A mail failure is logged and
     * the confirmation page still shows the details on screen.
     */
    const mail = await sendOrderEmail(order.orderNumber);
    if (!mail.ok) {
      console.error(`[checkout] ${order.orderNumber} email not sent: ${mail.error}`);
    }

    /* Και στο κατάστημα, στην ίδια στιγμή. Ξεχωριστή αποστολή και όχι BCC: το
       προσωπικό χρειάζεται άλλα στοιχεία από τον πελάτη — τηλέφωνο, ΑΦΜ, αν
       εισπράχθηκαν τα χρήματα, σύνδεσμο στη διαχείριση. */
    const internal = await sendInternalOrderEmail(order.orderNumber);
    if (!internal.ok) {
      console.error(`[checkout] ${order.orderNumber} internal email not sent: ${internal.error}`);
    }

    redirect(`/checkout/epibebaiosi/${order.orderNumber}?t=${order.guestToken}`);
  }

  // Anything else that settles off-site needs no redirect and no code.
  if (payment.id !== "card" && payment.id !== "iris") {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CONFIRMED" },
    });
    redirect(`/checkout/epibebaiosi/${order.orderNumber}?t=${order.guestToken}`);
  }

  if (!isVivaConfigured()) {
    // The order exists and is recoverable; say so instead of losing it.
    return {
      error:
        "Η πληρωμή με κάρτα δεν είναι διαθέσιμη αυτή τη στιγμή. Η παραγγελία " +
        `${order.orderNumber} καταχωρήθηκε — θα επικοινωνήσουμε μαζί σας.`,
    };
  }

  let checkoutUrl: string;
  try {
    const paymentOrder = await createPaymentOrder({
      amountGross: Number(order.totalGross),
      orderNumber: order.orderNumber,
      description: `Kolleris ${order.orderNumber}`,
      locale,
      customer: {
        email: input.email,
        fullName: `${input.firstName} ${input.lastName}`,
        phone: input.phone,
      },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { vivaOrderCode: paymentOrder.orderCode },
    });
    checkoutUrl = paymentOrder.checkoutUrl;
  } catch (error) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "FAILED",
        history: {
          create: {
            status: "FAILED",
            actor: "system",
            note: error instanceof Error ? error.message : "Viva order failed",
          },
        },
      },
    });
    return {
      error: `Η σύνδεση με την τράπεζα απέτυχε. Η παραγγελία ${order.orderNumber} καταχωρήθηκε — καλέστε μας στο 210 411 1355.`,
    };
  }

  // Outside the try: `redirect` throws by design, and catching it here would
  // turn a successful checkout into an error message.
  redirect(checkoutUrl);
}

/*
 * Shared by the ordinary order and the request-only checkout: both have a
 * customer who may have typed a password.
 */
async function maybeCreateAccount(
  input: { password?: string; email: string; firstName: string; lastName: string; phone: string },
  orderNumber: string,
): Promise<void> {
  /*
   * An account, when the customer asked for one by typing a password.
   *
   * Created outright rather than by emailing a link: the person is here, they
   * chose the password themselves, and everything a registration needs — name,
   * phone, email — they have just typed. Making them confirm by email what
   * they did thirty seconds ago on the same screen is ceremony.
   *
   * The order is attached, and so is every earlier guest order sharing the
   * address, so their history is complete from the first visit rather than
   * starting at this purchase.
   *
   * Deliberately NOT fatal and deliberately last. The order exists and is paid
   * for; an account is a convenience layered on top, and a duplicate email or a
   * hashing hiccup must never cost somebody the thing they actually came for.
   */
  if (input.password) {
    try {
      const email = input.email.trim().toLowerCase();
      const taken = await prisma.customer.findUnique({ where: { email }, select: { id: true } });
      if (!taken) {
        const created = await prisma.customer.create({
          data: {
            email,
            passwordHash: await hashPassword(input.password),
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            /*
             * Retail, always — even when this order carried a ΑΦΜ.
             *
             * A company account grants partner pricing and credit and exists
             * only once somebody has approved it. Nobody gets one by ticking
             * "invoice" at checkout; that route is /b2b, and it goes through
             * a person.
             */
            accountType: "individual",
            status: "active",
          },
          select: { id: true },
        });

        await prisma.order.updateMany({
          where: { email: { equals: email, mode: "insensitive" }, customerId: null },
          data: { customerId: created.id },
        });
      }
    } catch (error) {
      console.error(`[checkout] ${orderNumber}: account not created`, error);
    }
  }
}
