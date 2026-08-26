import { File } from "expo-file-system";

import { API_BASE_URL } from "@/src/config/api";

export interface ReceiptNutrition {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  fiber: number | null;
  sodium: number | null;
}

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
