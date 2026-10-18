import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import Ingredient from "../models/Ingredient.js";
import IngredientCategory from "../models/IngredientCategory.js";
import { parseReceiptImage } from "../services/receiptParsing.js";
import Photo from "../models/Photo.js";
import ReceiptDraft from "../models/ReceiptDraft.js";
import { photoUrl } from "./PhotoRoutes.js";

const router = express.Router();

// Dev convenience only — not part of the real data model. Lets the mobile
// review screen reload the last real Gemini response (server/tmp/ is
// gitignored) while iterating on the UI, instead of re-scanning/re-prompting
// every time.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAST_PARSE_PATH = path.join(__dirname, "../tmp/last-receipt-parse.json");

// The receipt reader, given the catalog to match lines against.
async function readReceipt(imageBase64, mediaType) {
  const [existingIngredients, existingCategories] = await Promise.all([
    Ingredient.find({ isArchived: false })
      .select("name isGeneric category brand genericParent")
      .populate("category", "name")
      .populate("brand", "name")
      .populate("genericParent", "name")
      .lean(),
    IngredientCategory.find({ isArchived: false }).select("name").lean(),
  ]);
  return parseReceiptImage({ imageBase64, mediaType, existingIngredients, existingCategories });
}

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

    const data = await readReceipt(imageBase64, mediaType);

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

// --- Drafts: a receipt scanned on one device and reviewed on any ---------
// (see models/ReceiptDraft.js)

// A draft as listed, without the full reading or review.
const summary = (draft) => {
  const result = draft.result ?? {};
  const review = draft.review ?? {};
  const rows = Array.isArray(review.rows) ? review.rows : null;
  return {
    _id: draft._id,
    status: draft.status,
    source: draft.source,
    error: draft.error,
    photoUrl: draft.photo ? photoUrl(draft.photo) : null,
    storeName: review.storeName || result.storeName || null,
    purchaseDate: review.purchaseDate || result.purchaseDate || null,
    lineCount: rows ? rows.length : Array.isArray(result.lineItems) ? result.lineItems.length : 0,
    reviewing: !!rows,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
};
const full = (draft) => ({ ...summary(draft), result: draft.result, review: draft.review });

/**
 * POST /api/receipts/drafts  { imageBase64, mediaType?, width?, height?, source? }
 * Saves the photo as a draft and answers at once; the receipt is read in
 * the background (the draft goes from "parsing" to "ready" or "failed").
 */
// A receipt photo saved as a draft, read in the background (the phone, or
// whatever sent it, needn't wait). Also used for a receipt the desktop asked
// a paired phone to photograph (see CaptureRoutes.js).
export async function createReceiptDraft({ imageBase64, mediaType = "image/jpeg", width, height, source }) {
  const draft = await ReceiptDraft.create({ source: source === "desktop" ? "desktop" : "phone" });
  const photo = await Photo.create({ data: Buffer.from(imageBase64, "base64"), contentType: mediaType, width: Number(width) || null, height: Number(height) || null, of: { kind: "receipt", id: draft._id } });
  draft.photo = photo._id;
  await draft.save();
  readReceipt(imageBase64, mediaType)
    .then((result) => ReceiptDraft.updateOne({ _id: draft._id, status: "parsing" }, { status: "ready", result }))
    .catch((error) => {
      console.error("Failed to read receipt draft:", error);
      return ReceiptDraft.updateOne({ _id: draft._id, status: "parsing" }, { status: "failed", error: error.message || "Couldn't read the receipt." });
    })
    .catch(() => {});
  return summary(draft);
}

router.post("/drafts", async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (typeof imageBase64 !== "string" || !imageBase64) return res.status(400).json({ success: false, message: "imageBase64 is required." });
    return res.status(201).json({ success: true, data: await createReceiptDraft(req.body) });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/receipts/drafts — those still to review (not done or discarded),
 * newest first.
 */
router.get("/drafts", async (_req, res) => {
  try {
    const drafts = await ReceiptDraft.find({ status: { $in: ["parsing", "ready", "failed"] } }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: drafts.map(summary) });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/receipts/drafts/:id — with the reading and any review so far.
 */
router.get("/drafts/:id", async (req, res) => {
  try {
    const draft = await ReceiptDraft.findById(req.params.id).lean();
    if (!draft) return res.status(404).json({ success: false, message: "Receipt not found" });
    return res.json({ success: true, data: full(draft) });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * PATCH /api/receipts/drafts/:id  { review?, status? } — the review's edits
 * as they're made, and "done" or "discarded" at the end.
 */
router.patch("/drafts/:id", async (req, res) => {
  try {
    const changes = {};
    if (req.body.review !== undefined) changes.review = req.body.review;
    if (["done", "discarded"].includes(req.body.status)) changes.status = req.body.status;
    const draft = await ReceiptDraft.findByIdAndUpdate(req.params.id, changes, { new: true }).lean();
    if (!draft) return res.status(404).json({ success: false, message: "Receipt not found" });
    return res.json({ success: true, data: summary(draft) });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
