import type { NextRequest } from "next/server";
import { handleVivaEvent, vivaVerificationResponse } from "@/lib/payment/viva-webhook";

/**
 * Viva webhook: the original single endpoint.
 *
 * Kept because it may already be registered in Viva's portal and removing it
 * would silently stop payments being confirmed. Every event now has its own
 * URL under this path; anything still arriving here is treated as a payment,
 * which is what this endpoint has always done.
 *
 * Prefer `/api/webhooks/viva/payment-created` when registering fresh.
 */
export const runtime = "nodejs";

export const GET = vivaVerificationResponse;
export const POST = (request: NextRequest) => handleVivaEvent(request, "paymentCreated");
