import { z } from "zod";

// Same model/endpoint/response-schema pattern as receiptParsing.js — kept
// separate rather than merged into that file since the domain is genuinely
// different (estimating a dish from a photo of food vs. transcribing a
// printed receipt), even though the Gemini plumbing is identical.
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

const EstimatedDishSchema = z.object({
  name: z.string(),
  estimatedNutrition: NutritionSchema,
  // Freeform note on what drove the estimate/what's uncertain (e.g. "assumed
  // ~300g portion, sauce quantity not visible") — shown to the user so an
  // estimate never reads as more confident than it is.
  portionNote: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

export const MealPhotoEstimateSchema = z.object({
  dishes: z.array(EstimatedDishSchema),
});

// Plain JSON Schema (Gemini's responseSchema is an OpenAPI-3.0 subset), kept
// in sync with the Zod schema above by hand — see receiptParsing.js for why
// this isn't derived automatically.
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

const MEAL_PHOTO_JSON_SCHEMA = {
  type: "object",
  properties: {
    dishes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          estimatedNutrition: NUTRITION_JSON_SCHEMA,
          portionNote: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["name", "estimatedNutrition", "portionNote", "confidence"],
      },
    },
  },
  required: ["dishes"],
};

function buildPrompt(restaurantName, singleDish) {
  const restaurantContext = restaurantName
    ? `This photo is from a visit to "${restaurantName}". Use any real knowledge you have of this specific restaurant's dishes if you recognize them; otherwise reason from the cuisine/dish type visible.`
    : "No restaurant name was given — reason purely from what's visible in the photo.";

  const scopeInstruction = singleDish
    ? "This photo shows exactly ONE dish the person is logging — return exactly one entry in the dishes array. If multiple components are visible (a protein, a side, a sauce, a garnish), treat them as one combined dish and sum their nutrition into that single entry rather than splitting it up, even if it looks like it could be described as several parts."
    : "Identify each visually distinct dish in the photo (a photo of a single plate is usually one dish; a table spread may show several — list each separately rather than lumping them into one entry).";

  return `You are estimating the nutrition of food shown in a photo, for someone logging what they ate.

${restaurantContext}

1. ${scopeInstruction}
2. For each dish, estimate calories/protein/carbs/fats/fiber/sodium using your general knowledge of similar dishes and visible portion size. Reason about visible ingredients, cooking method (fried/grilled/sauced), and roughly how much is on the plate.
3. Set portionNote to a short, honest caveat about what's uncertain — e.g. sauce/oil quantity not fully visible, portion size assumed from typical serving, some ingredients possibly hidden under others. Never leave it empty; if you're fairly confident, say what made you confident instead (e.g. "standard-looking single restaurant portion").
4. Set confidence to "high" only when the dish is clearly identifiable and portion size is easy to judge, "medium" for a reasonable guess with real uncertainty, "low" when you're genuinely unsure what's in it or the portion is hard to judge.
5. If the photo doesn't clearly show food at all, return an empty dishes array rather than guessing.`;
}

export async function estimateMealPhoto({ imageBase64, mediaType, restaurantName, singleDish }) {
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
          { text: buildPrompt(restaurantName, !!singleDish) },
        ],
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: MEAL_PHOTO_JSON_SCHEMA,
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

  return MealPhotoEstimateSchema.parse(JSON.parse(text));
}
