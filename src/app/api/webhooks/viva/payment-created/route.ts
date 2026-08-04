import type { NextRequest } from "next/server";
import { handleVivaEvent, vivaVerificationResponse } from "@/lib/payment/viva-webhook";

/**
 * Viva webhook: Transaction Payment Created (1796).
 *
 * One route per event because Viva registers and verifies each URL separately.
 * Everything it does lives in `viva-webhook.ts`.
 */
export const runtime = "nodejs";

export const GET = vivaVerificationResponse;
export const POST = (request: NextRequest) => handleVivaEvent(request, "paymentCreated");
