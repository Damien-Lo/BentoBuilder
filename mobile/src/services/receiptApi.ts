import { File } from "expo-file-system";

import { API_BASE_URL } from "@/src/config/api";
import type { NullableNutrition } from "@/src/types/nutrition";
import type { ReceiptReviewDraft } from "@/src/utils/receiptReviewStore";

export type ReceiptNutrition = NullableNutrition;

export interface ProposedIngredient {
  name: string;
  categoryId: string | null;
  newCategoryName: string | null;
  isGeneric: boolean;
  genericName: string | null;
  brandName: string | null;
  estimatedNutrition: ReceiptNutrition;
  defaultPortionAmount: number;
  defaultPortionUnit: string;
}

export interface ReceiptLineItem {
  rawText: string;
  matchedIngredientId: string | null;
  proposedIngredient: ProposedIngredient | null;
  quantity: number;
  unit: string;
  // The real net weight/volume of ONE unit of this product, when the
  // printed unit above is just a discrete count (e.g. quantity=1,
  // unit="item" but packageQuantity=500, packageUnit="g") — null when the
  // printed unit is already a real mass/volume unit, or undeterminable.
  packageQuantity: number | null;
  packageUnit: string | null;
  price: number | null;
  confidence: "high" | "medium" | "low";
}

export interface ReceiptParseResult {
  storeName: string | null;
  purchaseDate: string | null;
  lineItems: ReceiptLineItem[];
}

interface ReceiptParseResponse {
  success: boolean;
  data: ReceiptParseResult;
  message?: string;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  if (data === null) {
    throw new Error("The server returned an empty response");
  }

  return data as T;
}

export async function parseReceipt(photoUri: string): Promise<ReceiptParseResult> {
  const imageBase64 = await new File(photoUri).base64();

  const response = await fetch(`${API_BASE_URL}/api/receipts/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mediaType: "image/jpeg" }),
  });

  const result = await parseResponse<ReceiptParseResponse>(response);
  return result.data;
}

// Dev convenience only — the last real Gemini response, saved server-side
// so the review screen can be reworked/reloaded without re-scanning a
// receipt each time. Returns null if nothing's been scanned yet.
export async function getLastParsedReceipt(): Promise<ReceiptParseResult | null> {
  const response = await fetch(`${API_BASE_URL}/api/receipts/last`);
  if (response.status === 404) return null;

  const result = await parseResponse<ReceiptParseResponse>(response);
  return result.data;
}

// --- Drafts: a scan saved on the server to review on any device ----------
// (see server/models/ReceiptDraft.js). The photo is read there in the
// background: "parsing", then "ready" or "failed".

export type ReceiptDraftStatus = "parsing" | "ready" | "failed" | "done" | "discarded";

export interface ReceiptDraftSummary {
  _id: string;
  status: ReceiptDraftStatus;
  source: "phone" | "desktop";
  error: string;
  photoUrl: string | null;
  storeName: string | null;
  purchaseDate: string | null;
  lineCount: number;
  // A review has been started (its edits are saved).
  reviewing: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptDraft extends ReceiptDraftSummary {
  result: ReceiptParseResult | null;
  review: ReceiptReviewDraft | null;
}

async function draftCall<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/receipts/drafts${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  const result = await parseResponse<{ success: boolean; data: T }>(response);
  return result.data;
}

// A photo taken on the phone, saved to review later (on any device).
export async function createReceiptDraft(photoUri: string, source: "phone" | "desktop" = "phone"): Promise<ReceiptDraftSummary> {
  const imageBase64 = await new File(photoUri).base64();
  return draftCall<ReceiptDraftSummary>("", { method: "POST", body: JSON.stringify({ imageBase64, mediaType: "image/jpeg", source }) });
}

export const getReceiptDrafts = () => draftCall<ReceiptDraftSummary[]>("");
export const getReceiptDraft = (id: string) => draftCall<ReceiptDraft>(`/${id}`);
export const saveReceiptDraftReview = (id: string, review: ReceiptReviewDraft) => draftCall<ReceiptDraftSummary>(`/${id}`, { method: "PATCH", body: JSON.stringify({ review }) });
export const finishReceiptDraft = (id: string, status: "done" | "discarded") => draftCall<ReceiptDraftSummary>(`/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
