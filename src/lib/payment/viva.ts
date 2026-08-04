import type { Locale } from "@/i18n/routing";
import "server-only";

/**
 * Viva Wallet — Smart Checkout.
 *
 * Flow: OAuth2 client-credentials token → create a payment order → redirect the
 * customer to Viva's hosted checkout → Viva calls our webhook and returns the
 * customer to the confirmation page.
 *
 * Card details never touch this application. That is the point of the hosted
 * checkout: no PAN in our logs, no PCI scope beyond SAQ-A.
 *
 * Credentials are issued in the Viva self-care portal (Settings → API Access).
 * They are currently unset — `assertConfigured()` fails loudly rather than
 * letting the checkout appear to work and die at the redirect.
 */

/*
 * Demo unless told otherwise — the safe default for a file that can charge a
 * card. A demo account is a separate registration with its own credentials, so
 * flipping this without swapping the keys fails authentication rather than
 * quietly charging anyone. Test cards and the amounts that force each decline
 * are in TESTING.md next to this file.
 */
const ENVIRONMENT = (process.env.VIVA_ENVIRONMENT ?? "demo").toLowerCase();
const IS_PRODUCTION = ENVIRONMENT === "production";

const ACCOUNTS_URL = IS_PRODUCTION
  ? "https://accounts.vivapayments.com"
  : "https://demo-accounts.vivapayments.com";
const API_URL = IS_PRODUCTION
  ? "https://api.vivapayments.com"
  : "https://demo-api.vivapayments.com";
const CHECKOUT_URL = IS_PRODUCTION
  ? "https://www.vivapayments.com"
  : "https://demo.vivapayments.com";

export class VivaNotConfiguredError extends Error {
  constructor() {
    super(
      "Viva Wallet is not configured: set VIVA_CLIENT_ID, VIVA_CLIENT_SECRET and VIVA_SOURCE_CODE.",
    );
    this.name = "VivaNotConfiguredError";
  }
}

export class VivaError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "VivaError";
  }
}

export function isVivaConfigured(): boolean {
  return Boolean(
    process.env.VIVA_CLIENT_ID &&
      process.env.VIVA_CLIENT_SECRET &&
      process.env.VIVA_SOURCE_CODE,
  );
}

function assertConfigured() {
  if (!isVivaConfigured()) throw new VivaNotConfiguredError();
}

// Tokens last ~1h; cached in module scope so a burst of orders shares one.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  assertConfigured();

  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const basic = Buffer.from(
    `${process.env.VIVA_CLIENT_ID}:${process.env.VIVA_CLIENT_SECRET}`,
  ).toString("base64");

  const response = await fetch(`${ACCOUNTS_URL}/connect/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new VivaError(
      `Viva token request failed (${response.status})`,
      response.status,
    );
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

/**
 * Viva's own culture codes.
 *
 * The payment page is the last screen of the purchase and it was Greek for
 * everyone — an English customer who read the whole shop in English arrived at
 * a Greek card form. Viva names its languages as full culture codes, so the
 * site's two-letter locale has to be mapped rather than passed through.
 */
const VIVA_LANGUAGE: Record<Locale, string> = {
  el: "el-GR",
  en: "en-US",
  it: "it-IT",
};

export type CreatePaymentOrderInput = {
  /** GROSS amount in euros. Converted to cents here — Viva works in minor units. */
  amountGross: number;
  orderNumber: string;
  customer: {
    email: string;
    fullName: string;
    phone?: string | null;
    countryCode?: string;
  };
  /** Free text shown on the Viva checkout page and the statement. */
  description: string;
  /** The language the customer was shopping in. */
  locale: Locale;
  /** Minutes the payment link stays valid. */
  expiryMinutes?: number;
};

export type PaymentOrder = {
  /** The numeric order code Viva returns; also the value in the redirect URL. */
  orderCode: string;
  /** Where to send the customer to pay. */
  checkoutUrl: string;
};

export async function createPaymentOrder(
  input: CreatePaymentOrderInput,
): Promise<PaymentOrder> {
  const token = await getAccessToken();

  // Viva takes minor units. Rounding here rather than trusting a float keeps
  // the charged amount identical to the total shown at checkout.
  const amountCents = Math.round((input.amountGross + Number.EPSILON) * 100);

  const response = await fetch(`${API_URL}/checkout/v2/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amountCents,
      customerTrns: input.description,
      customer: {
        email: input.customer.email,
        fullName: input.customer.fullName,
        phone: input.customer.phone ?? undefined,
        countryCode: input.customer.countryCode ?? "GR",
        requestLang: VIVA_LANGUAGE[input.locale] ?? VIVA_LANGUAGE.el,
      },
      paymentTimeout: (input.expiryMinutes ?? 30) * 60,
      preauth: false,
      allowRecurring: false,
      maxInstallments: 0,
      paymentNotification: true,
      disableExactAmount: false,
      disableCash: true,
      disableWallet: false,
      sourceCode: process.env.VIVA_SOURCE_CODE,
      merchantTrns: input.orderNumber,
      tags: ["eshop", input.orderNumber],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new VivaError(
      `Viva order creation failed (${response.status}) ${detail.slice(0, 200)}`,
      response.status,
    );
  }

  const data = (await response.json()) as { orderCode: number };
  const orderCode = String(data.orderCode);

  return {
    orderCode,
    checkoutUrl: paymentPageUrl(orderCode),
  };
}

/**
 * The Viva payment page for a code we already have.
 *
 * Derived rather than stored. `createPaymentOrder` returns this URL, but only
 * the code is kept on the order — the URL is a pure function of it, and a second
 * copy in the database is a second thing that can fall out of step when the
 * environment changes from demo to production.
 *
 * Viva emails the same link when the order is created with
 * `paymentNotification: true`, which every order here is. This is for the
 * confirmation page, so a customer who closed the email is not stuck.
 */
export function paymentPageUrl(orderCode: string): string {
  return `${CHECKOUT_URL}/web/checkout?ref=${orderCode}`;
}

export type VivaTransaction = {
  statusId: string;
  amount: number;
  merchantTrns: string | null;
  orderCode: number | null;
};

/**
 * Reads a transaction back from Viva.
 *
 * The webhook body is not trusted on its own — anything arriving over HTTP can
 * be forged. Every payment is confirmed by asking Viva directly before an order
 * is marked paid.
 */
export async function getTransaction(transactionId: string): Promise<VivaTransaction> {
  const token = await getAccessToken();

  const response = await fetch(`${API_URL}/checkout/v2/transactions/${transactionId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new VivaError(
      `Viva transaction lookup failed (${response.status})`,
      response.status,
    );
  }

  const data = (await response.json()) as {
    statusId: string;
    amount: number;
    merchantTrns?: string;
    orderCode?: number;
  };

  return {
    statusId: data.statusId,
    amount: data.amount,
    merchantTrns: data.merchantTrns ?? null,
    orderCode: data.orderCode ?? null,
  };
}

/** `F` is Viva's "payment successful" status. */
export const VIVA_STATUS_PAID = "F";
