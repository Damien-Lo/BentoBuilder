import { z } from "zod";

const MODEL = "gemini-3.6-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const NutritionSchema = z.object({
  calories: z.number().nullable(),
  protein: z.number().nullable(),
  carbs: z.number().nullable(),
  fats: z.number().nullable(),
  fiber: z.number().nullable(),
  sodium: z.number().nullable(),
});

const ProposedIngredientSchema = z.object({
  name: z.string(),
  categoryId: z.string().nullable(),
  newCategoryName: z.string().nullable(),
  isGeneric: z.boolean(),
  genericName: z.string().nullable(),
  brandName: z.string().nullable(),
  estimatedNutrition: NutritionSchema,
  defaultPortionAmount: z.number(),
  defaultPortionUnit: z.string(),
});

const ReceiptLineItemSchema = z.object({
  rawText: z.string(),
  matchedIngredientId: z.string().nullable(),
  proposedIngredient: ProposedIngredientSchema.nullable(),
  quantity: z.number(),
  unit: z.string(),
  price: z.number().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
});

export const ReceiptParseSchema = z.object({
  storeName: z.string().nullable(),
  purchaseDate: z.string().nullable(),
  lineItems: z.array(ReceiptLineItemSchema),
});

// Plain JSON Schema (Gemini's responseSchema is an OpenAPI-3.0 subset — plain
// "nullable: true" alongside a base type, not JSON Schema's type-array union
// style). Kept in sync with ReceiptParseSchema above by hand; the schema is
// small enough that duplicating it once is simpler than adding a Zod->JSON
// Schema conversion dependency for this one call site.
const NUTRITION_JSON_SCHEMA = {
  type: "object",
  properties: {
    calories: { type: "number", nullable: true },
    protein: { type: "number", nullable: true },
    carbs: { type: "number", nullable: true },
    fats: { type: "number", nullable: true },
    fiber: { type: "number", nullable: true },
    sodium: { type: "number", nullable: true },
  },
  required: ["calories", "protein", "carbs", "fats", "fiber", "sodium"],
};

const RECEIPT_JSON_SCHEMA = {
  type: "object",
  properties: {
    storeName: { type: "string", nullable: true },
    purchaseDate: { type: "string", nullable: true },
    lineItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rawText: { type: "string" },
          matchedIngredientId: { type: "string", nullable: true },
          proposedIngredient: {
            type: "object",
            nullable: true,
            properties: {
              name: { type: "string" },
              categoryId: { type: "string", nullable: true },
              newCategoryName: { type: "string", nullable: true },
              isGeneric: { type: "boolean" },
              genericName: { type: "string", nullable: true },
              brandName: { type: "string", nullable: true },
              estimatedNutrition: NUTRITION_JSON_SCHEMA,
              defaultPortionAmount: { type: "number" },
              defaultPortionUnit: { type: "string" },
            },
            required: [
              "name", "categoryId", "newCategoryName", "isGeneric",
              "genericName", "brandName", "estimatedNutrition",
              "defaultPortionAmount", "defaultPortionUnit",
            ],
          },
          quantity: { type: "number" },
          unit: { type: "string" },
          price: { type: "number", nullable: true },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: [
          "rawText", "matchedIngredientId", "proposedIngredient",
          "quantity", "unit", "price", "confidence",
        ],
      },
    },
  },
  required: ["storeName", "purchaseDate", "lineItems"],
};

function buildPrompt(existingIngredients, existingCategories) {
  const ingredientList = existingIngredients
    .map((ing) => {
      const parts = [ing.name];
      if (ing.brand?.name) parts.push(`brand: ${ing.brand.name}`);
      if (ing.genericParent?.name) parts.push(`generic parent: ${ing.genericParent.name}`);
      parts.push(ing.isGeneric ? "generic" : "specific/branded");
      return `- ${ing._id}: ${parts.join(", ")} [${ing.category?.name ?? "uncategorized"}]`;
    })
    .join("\n");

  const categoryList = existingCategories.map((c) => `- ${c._id}: ${c.name}`).join("\n");

  return `You are extracting purchased grocery line items from a photo of a receipt.

EXISTING INGREDIENT CATALOG (id: name, brand/generic info [category]):
${ingredientList}

EXISTING CATEGORIES (id: name):
${categoryList}

For each purchased product line on the receipt (skip tax, subtotal, total, tender/change, coupons, and any non-product lines):
1. Try to match it against the existing ingredient catalog above. Prefer matching a specific/branded ingredient if the receipt text implies a specific brand; otherwise match the closest generic ingredient. Only set matchedIngredientId when you're genuinely confident it's the same product — otherwise leave it null and propose a new ingredient instead.
2. If nothing fits, propose a new ingredient: decide isGeneric vs a specific brand the same way a careful shopper would (only mark isGeneric: false when the receipt text clearly names a specific brand/product, not just a category of food). Pick categoryId from the existing list above whenever anything reasonably fits; only set newCategoryName when truly nothing does. Estimate nutrition using your general knowledge of the product (typical/label values), and a sensible defaultPortionAmount/defaultPortionUnit.
3. Set confidence to "high" when the line item and its match/proposal are unambiguous, "medium" when reasonably sure but worth a glance, and "low" when the receipt text is unclear, abbreviated cryptically, or you're genuinely guessing.
4. Extract quantity, unit (best guess, e.g. "lb", "item", "oz"), and price per line as printed.
5. Also extract the store name and purchase date from the receipt header if visible.

IMPORTANT — do not transcribe any payment card numbers, loyalty/rewards account numbers, phone numbers, or email addresses into your output, even if visible on the receipt. Only extract product/purchase information.`;
}

export async function parseReceiptImage({ imageBase64, mediaType, existingIngredients, existingCategories }) {
  if (!process.env.GOOGLE_AI_API_KEY) {
    throw new Error("GOOGLE_AI_API_KEY is missing from server/.env");
  }

  const response = await fetch(`${API_URL}?key=${process.env.GOOGLE_AI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType: mediaType, data: imageBase64 } },
          { text: buildPrompt(existingIngredients, existingCategories) },
        ],
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RECEIPT_JSON_SCHEMA,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(`Gemini API error: ${error?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini response had no content — the model may have declined or returned an empty result");
  }

  return ReceiptParseSchema.parse(JSON.parse(text));
}
