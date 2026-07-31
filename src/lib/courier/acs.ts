import "server-only";
import { hdctoolRequest } from "@/lib/hdctool/client";

/**
 * The ACS dispatch desk, through HDCtool.
 *
 * The eshop holds no ACS credentials: HDCtool has had the full set for months
 * and issues Magento vouchers with them. Everything here is one call to
 * `/api/public/courier/operations` with an `op`.
 *
 * Every function returns a discriminated result rather than throwing. A courier
 * API is unavailable often enough that a dispatch screen has to render the
 * failure next to the parcel it belongs to, not replace itself with an error
 * page in the middle of someone's morning.
 */

export type AcsResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(op: string, params: Record<string, unknown> = {}): Promise<AcsResult<T>> {
  try {
    const response = await hdctoolRequest<{ success: boolean; error?: string } & Record<string, unknown>>(
      "/api/public/courier/operations",
      { op, ...params },
    );
    if (!response.success) return { ok: false, error: response.error ?? "Η ACS απέρριψε το αίτημα." };
    return { ok: true, data: response as T };
  } catch (error) {
    console.error("[acs]", op, error);
    return {
      ok: false,
      error:
        error instanceof Error && error.message.includes("422")
          ? error.message
          : "Η ACS δεν απαντά αυτή τη στιγμή.",
    };
  }
}

export type AcsVoucher = {
  voucherNo: string;
  recipient?: string | null;
  address?: string | null;
  area?: string | null;
  zipCode?: string | null;
  weight?: number | null;
  items?: number | null;
  codAmount?: number | null;
  status?: string | null;
  statusDate?: string | null;
  delivered?: boolean;
  pickupListNo?: string | null;
};

export type AcsPickupList = {
  massNumber?: string | null;
  pickupDate?: string | null;
  vouchers?: number | null;
  printed?: boolean;
};

export type AcsCheckpoint = {
  date?: string | null;
  action?: string | null;
  location?: string | null;
  notes?: string | null;
};

/** Everything sent on one day, with its current status. */
export async function listVouchers(pickupDate: string) {
  return call<{ vouchers: AcsVoucher[] }>("vouchers", { pickupDate });
}

export async function listPickupLists(pickupDate: string) {
  return call<{ lists: AcsPickupList[] }>("pickupLists", { pickupDate });
}

/**
 * Close the day.
 *
 * Irreversible: once a pickup list is issued the courier expects those parcels
 * and the vouchers on it can no longer be cancelled. The screen confirms first.
 */
export async function issuePickupList(pickupDate: string) {
  return call<{ result: unknown }>("issuePickupList", { pickupDate });
}

export async function createVoucher(voucher: Record<string, unknown>) {
  return call<{ result: { voucherNo?: string; error?: string } }>("createVoucher", { voucher });
}

export async function cancelVoucher(voucherNo: string) {
  return call<Record<string, never>>("deleteVoucher", { voucherNo });
}

/** `printType` 1 is thermal label, 2 is A4. */
export async function printVoucher(voucherNo: string, printType: 1 | 2 = 1) {
  return call<{ filename: string; pdfBase64: string }>("printVoucher", { voucherNo, printType });
}

export async function printPickupList(massNumber: string, pickupDate: string) {
  return call<{ filename: string; pdfBase64: string }>("printPickupList", {
    massNumber,
    pickupDate,
  });
}

export async function trackVoucher(voucherNo: string) {
  return call<{ checkpoints: AcsCheckpoint[] }>("tracking", { voucherNo });
}
