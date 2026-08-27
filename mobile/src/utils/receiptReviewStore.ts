// A parsed receipt is a nested object (line items, nutrition estimates,
// etc.) too large/complex to serialize cleanly through Expo Router's route
// params. Since only one receipt review can be in flight at a time, a
// module-level holder is simpler than wiring up context/global state for
// this one hand-off between the capture screen and the review screen.
//
// "take" (read-and-clear) semantics so a stale result can't linger and
// resurface if the user navigates back to the review route some other way.
import AsyncStorage from "@react-native-async-storage/async-storage";

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

// The review screen's in-progress edits (checked items, matched-ingredient
// picks, storage location/expiry choices, etc.) — persisted to disk so
// closing and reopening the app resumes the same review instead of losing
// it. Unlike pendingReceipt above (an in-memory same-session hand-off), this
// survives an actual app restart. `rows` is left loosely typed here since
// its real shape (ReviewRow) belongs to the review screen, not this util.
const DRAFT_KEY = "@bentobuilder/receiptReviewDraft";

export interface ReceiptReviewDraft {
  rows: unknown[];
  storeId: string;
  storeName: string;
  storeDraft: string;
  purchaseDate: string;
}

export async function saveReviewDraft(draft: ReceiptReviewDraft): Promise<void> {
  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export async function loadReviewDraft(): Promise<ReceiptReviewDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as ReceiptReviewDraft) : null;
  } catch {
    return null;
  }
}

export async function clearReviewDraft(): Promise<void> {
  await AsyncStorage.removeItem(DRAFT_KEY);
}
