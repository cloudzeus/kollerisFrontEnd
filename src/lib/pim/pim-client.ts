import "server-only";
import { HdctoolError, hdctoolRequest } from "@/lib/hdctool/client";
import type {
  ImageOrderRequest,
  PimWriteResponse,
  PromoRequest,
  SpecClearRequest,
  SpecSaveRequest,
} from "@/lib/pim/contract";

/**
 * PIM writes, through HDCtool.
 *
 * Every method here CHANGES DATA IN THE ERP, not just on the storefront. That
 * is the point — see `contract.ts` — but it is also why each call is a single
 * explicit action rather than a bulk "save everything" payload: a mis-shaped
 * bulk write to a product master is expensive to undo.
 *
 * None of these endpoints exists yet. A 404 becomes `PimMethodMissing` so the
 * admin screens can say exactly which method is outstanding instead of failing
 * as a generic error.
 */

const BASE = "/api/public/pim";

export class PimMethodMissing extends Error {
  constructor(readonly endpoint: string) {
    super(`HDCtool has not implemented ${endpoint} yet`);
    this.name = "PimMethodMissing";
  }
}

async function write<T>(endpoint: string, body: unknown, method = "POST"): Promise<T> {
  try {
    return await hdctoolRequest<T>(endpoint, body, { method });
  } catch (error) {
    if (error instanceof HdctoolError && error.status === 404) {
      throw new PimMethodMissing(endpoint);
    }
    throw error;
  }
}

export const pim = {
  /** H18 — image order + main shot. */
  reorderImages(input: ImageOrderRequest): Promise<PimWriteResponse> {
    return write(`${BASE}/images/order`, input);
  },

  /** H19 — write one spec field across languages. */
  saveSpec(input: SpecSaveRequest): Promise<PimWriteResponse> {
    return write(`${BASE}/specifications`, input);
  },

  /** H19b — clear one spec field everywhere. Not undoable from here. */
  clearSpec(input: SpecClearRequest): Promise<PimWriteResponse> {
    return write(`${BASE}/specifications`, input, "DELETE");
  },

  /** H20 — set or end a promotional price. */
  setPromo(input: PromoRequest): Promise<PimWriteResponse> {
    return write(`${BASE}/promo`, input);
  },
};
