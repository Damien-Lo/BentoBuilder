import { z } from "zod";

import {
  GEMINI_NUTRITION_JSON_SCHEMA,
  GeminiNutritionSchema,
  NUTRITION_UNITS,
} from "./geminiNutritionSchema.js";

// Same model/endpoint/response-schema pattern as receiptParsing.js and
// mealPhotoEstimation.js — separate because the task is different: this
// *transcribes* a printed Nutrition Facts / Supplement Facts panel rather
// than estimating from general knowledge, so it must never fill in
// anything the label doesn't show.
const MODEL = "gemini-3.6-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export const NutritionLabelSchema = z.object({
  isNutritionLabel: z.boolean(),
  labelType: z.enum(["nutrition_facts", "supplement_facts", "other"]),
  productName: z.string().nullable(),
  // The serving as printed: household measure ("2/3 cup", "2 softgels",
  // "1 tablet") plus its metric weight/volume when the label gives one.
  servingAmount: z.number().nullable(),
  servingUnit: z.string().nullable(),
  servingMetricAmount: z.number().nullable(),
  servingMetricUnit: z.enum(["g", "ml"]).nullable(),
  servingsPerContainer: z.number().nullable(),
  nutrition: GeminiNutritionSchema,
  notes: z.string(),
});

const NUTRITION_LABEL_JSON_SCHEMA = {
  type: "object",
  properties: {
    isNutritionLabel: { type: "boolean" },
    labelType: { type: "string", enum: ["nutrition_facts", "supplement_facts", "other"] },
    productName: { type: "string", nullable: true },
    servingAmount: { type: "number", nullable: true },
    servingUnit: { type: "string", nullable: true },
    servingMetricAmount: { type: "number", nullable: true },
    servingMetricUnit: { type: "string", enum: ["g", "ml"], nullable: true },
    servingsPerContainer: { type: "number", nullable: true },
    nutrition: GEMINI_NUTRITION_JSON_SCHEMA,
    notes: { type: "string" },
  },
  required: [
    "isNutritionLabel", "labelType", "productName", "servingAmount", "servingUnit",
    "servingMetricAmount", "servingMetricUnit", "servingsPerContainer", "nutrition", "notes",
  ],
};

const PROMPT = `You are transcribing a photo of a food or supplement label (a US "Nutrition Facts" or "Supplement Facts" panel, or an equivalent label from another country) into structured data.

Rules:
1. Transcribe only what is printed. Never estimate or fill in a nutrient from general knowledge — anything not printed on the label is null.
2. All nutrition values are per ONE serving as the label defines it (not per container). If the label only gives values per 100 g / 100 ml (common outside the US), use those and set the serving to 100 g / 100 ml.
3. Serving: servingAmount + servingUnit are the household measure as printed (e.g. 0.67 + "cup" for "2/3 cup", 2 + "softgel", 1 + "tablet", 3 + "gummy"); convert fractions to decimals and use a singular unit. servingMetricAmount + servingMetricUnit are the metric weight/volume in parentheses when printed (e.g. 55 + "g"), otherwise null. If the only serving shown is metric, put it in both.
4. Convert every value into the units listed below. Labels often use other units:
   - Vitamin D in IU: divide by 40 to get mcg.
   - Vitamin A in IU: multiply by 0.3 to get mcg RAE.
   - Vitamin E in IU: multiply by 0.67 (natural d-alpha-tocopherol) or 0.45 (synthetic dl-alpha-tocopherol) to get mg; use 0.67 if the form isn't stated.
   - Folate: use the mcg DFE figure when shown.
   - A value shown only as %DV (no amount): convert with the FDA adult Daily Values — vitamin A 900 mcg, vitamin C 90 mg, vitamin D 20 mcg, vitamin E 15 mg, vitamin K 120 mcg, thiamin 1.2 mg, riboflavin 1.3 mg, niacin 16 mg, vitamin B6 1.7 mg, folate 400 mcg DFE, vitamin B12 2.4 mcg, choline 550 mg, calcium 1300 mg, iron 18 mg, magnesium 420 mg, phosphorus 1250 mg, iodine 150 mcg, zinc 11 mg, selenium 55 mcg, copper 0.9 mg, manganese 2.3 mg, potassium 4700 mg.
   - "Less than 1 g" and similar: use 0.5 of the stated threshold.
5. omega3 is EPA + DHA only: add the two when both are listed. If the label only gives total omega-3 (no EPA/DHA breakdown), set omega3 to null and say so in notes.
6. Set isNutritionLabel to false (and every value to null) if the photo doesn't show a readable nutrition or supplement label. labelType is "supplement_facts" for a Supplement Facts panel, "nutrition_facts" for a Nutrition Facts (or equivalent food) label, else "other".
7. notes: a short plain-English note on anything uncertain — blurry or cut-off rows, unit conversions you had to make, nutrients printed that don't fit any field. Empty string if nothing notable.

${NUTRITION_UNITS}`;

export async function parseNutritionLabel({ imageBase64, mediaType }) {
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
          { text: PROMPT },
        ],
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: NUTRITION_LABEL_JSON_SCHEMA,
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

  return NutritionLabelSchema.parse(JSON.parse(text));
}
