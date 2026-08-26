import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import Ingredient from "../models/Ingredient.js";
import IngredientCategory from "../models/IngredientCategory.js";
import { parseReceiptImage } from "../services/receiptParsing.js";

const router = express.Router();

// Dev convenience only — not part of the real data model. Lets the mobile
// review screen reload the last real Gemini response (server/tmp/ is
// gitignored) while iterating on the UI, instead of re-scanning/re-prompting
// every time.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAST_PARSE_PATH = path.join(__dirname, "../tmp/last-receipt-parse.json");

/**
 * POST /api/receipts/parse
 * Preview only — does not write to the database. Returns matched-or-proposed
 * ingredients per line item; the client commits them via the existing
 * ingredient/store/pantry endpoints once the user confirms.
 */
router.post("/parse", async (req, res) => {
  try {
    const { imageBase64, mediaType } = req.body;

    if (typeof imageBase64 !== "string" || !imageBase64) {
      return res.status(400).json({ success: false, message: "imageBase64 is required." });
    }
    if (typeof mediaType !== "string" || !mediaType) {
      return res.status(400).json({ success: false, message: "mediaType is required." });
    }

    const [existingIngredients, existingCategories] = await Promise.all([
      Ingredient.find({ isArchived: false })
        .select("name isGeneric category brand genericParent")
        .populate("category", "name")
        .populate("brand", "name")
        .populate("genericParent", "name")
        .lean(),
      IngredientCategory.find({ isArchived: false }).select("name").lean(),
    ]);

    const data = await parseReceiptImage({
      imageBase64,
      mediaType,
      existingIngredients,
      existingCategories,
    });

    // Best-effort — never let a disk hiccup fail a real request.
    fs.mkdir(path.dirname(LAST_PARSE_PATH), { recursive: true })
      .then(() => fs.writeFile(LAST_PARSE_PATH, JSON.stringify(data, null, 2)))
      .catch((err) => console.error("Failed to save dev receipt fixture:", err));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Failed to parse receipt:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to parse receipt.",
    });
  }
});

/**
 * GET /api/receipts/last
 * Dev convenience — returns the last real Gemini response saved by /parse,
 * so the review screen can be reloaded/iterated on without a fresh scan.
 * 404 if nothing's been scanned yet.
 */
router.get("/last", async (_req, res) => {
  try {
    const raw = await fs.readFile(LAST_PARSE_PATH, "utf-8");
    return res.status(200).json({ success: true, data: JSON.parse(raw) });
  } catch {
    return res.status(404).json({ success: false, message: "No saved receipt scan yet." });
  }
});

export default router;
