// A parsed receipt is a nested object (line items, nutrition estimates,
// etc.) too large/complex to serialize cleanly through Expo Router's route
// params. Since only one receipt review can be in flight at a time, a
// module-level holder is simpler than wiring up context/global state for
// this one hand-off between the capture screen and the review screen.
//
// "take" (read-and-clear) semantics so a stale result can't linger and
// resurface if the user navigates back to the review route some other way.
import type { ReceiptParseResult } from "@/src/services/receiptApi";

let pendingReceipt: ReceiptParseResult | null = null;

export function setPendingReceipt(result: ReceiptParseResult): void {
  pendingReceipt = result;
}

export function takePendingReceipt(): ReceiptParseResult | null {
  const result = pendingReceipt;
  pendingReceipt = null;
  return result;
}
