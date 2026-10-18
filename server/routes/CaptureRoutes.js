import express from "express";
import CaptureRequest from "../models/CaptureRequest.js";
import Photo from "../models/Photo.js";
import { parseNutritionLabel } from "../services/nutritionLabelParsing.js";
import { deviceAuth } from "./DeviceRoutes.js";
import { photoUrl } from "./PhotoRoutes.js";
import { createReceiptDraft } from "./ReceiptRoutes.js";

// A computer asking a paired phone to take a photo (see
// models/CaptureRequest.js). Every call is from a registered device.
const router = express.Router();
router.use(deviceAuth);

// Unanswered requests lapse after this long.
const REQUEST_MINUTES = 10;

// (A request whose time is up, marked as such.)
async function current(request) {
  if (request && ["waiting", "capturing"].includes(request.status) && request.expiresAt < new Date()) {
    request.status = "failed";
    request.error = "Nobody answered on the phone in time.";
    await request.save();
  }
  return request;
}

const mine = (req, request) => request && (String(request.computer) === String(req.device._id) || (request.phone && String(request.phone) === String(req.device._id)) || req.device.pairedWith.some((id) => String(id) === String(request.computer)));

/**
 * POST /api/capture  { kind, label? } — from a computer with a paired phone.
 */
router.post("/", async (req, res) => {
  try {
    if (req.device.kind !== "computer") return res.status(400).json({ success: false, message: "Only a computer asks for a photo." });
    if (!req.device.pairedWith.length) return res.status(400).json({ success: false, message: "Pair a phone first." });
    if (!["barcode", "label", "receipt"].includes(req.body.kind)) return res.status(400).json({ success: false, message: "Unknown kind of photo." });
    // (One at a time: anything still open from this computer is dropped.)
    await CaptureRequest.updateMany({ computer: req.device._id, status: { $in: ["waiting", "capturing"] } }, { status: "cancelled" });
    const request = await CaptureRequest.create({ computer: req.device._id, kind: req.body.kind, label: String(req.body.label ?? "").slice(0, 80), expiresAt: new Date(Date.now() + REQUEST_MINUTES * 60_000) });
    return res.status(201).json({ success: true, data: request });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/capture/next — for a phone: the oldest request waiting from a
 * computer it's paired with (null if none).
 */
router.get("/next", async (req, res) => {
  try {
    if (req.device.kind !== "phone") return res.status(400).json({ success: false, message: "Only a phone answers requests." });
    const waiting = await CaptureRequest.find({ computer: { $in: req.device.pairedWith }, status: "waiting" }).sort({ createdAt: 1 });
    for (const request of waiting) {
      if ((await current(request)).status === "waiting") return res.json({ success: true, data: request });
    }
    return res.json({ success: true, data: null });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/capture/:id — where a request has got to.
 */
router.get("/:id", async (req, res) => {
  try {
    const request = await current(await CaptureRequest.findById(req.params.id));
    if (!mine(req, request)) return res.status(404).json({ success: false, message: "Request not found" });
    return res.json({ success: true, data: request });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/capture/:id  { reason? } — called off (by the computer, or
 * the phone); with a reason, it failed (the phone couldn't send it), and
 * the computer is told why.
 */
router.delete("/:id", async (req, res) => {
  try {
    const request = await CaptureRequest.findById(req.params.id);
    if (!mine(req, request)) return res.status(404).json({ success: false, message: "Request not found" });
    if (["waiting", "capturing"].includes(request.status)) {
      const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 200) : "";
      request.status = reason ? "failed" : "cancelled";
      request.error = reason;
      await request.save();
    }
    return res.json({ success: true, data: request });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/capture/:id/claim — the phone has opened its camera for it.
 */
router.post("/:id/claim", async (req, res) => {
  try {
    const request = await current(await CaptureRequest.findById(req.params.id));
    if (req.device.kind !== "phone" || !mine(req, request)) return res.status(404).json({ success: false, message: "Request not found" });
    if (request.status !== "waiting") return res.status(409).json({ success: false, message: "That request is no longer waiting." });
    request.status = "capturing";
    request.phone = req.device._id;
    await request.save();
    return res.json({ success: true, data: request });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/capture/:id/result — what the phone got:
 *   { barcode } for a barcode; { imageBase64, mediaType?, width?, height? }
 *   for a label (read here) or a receipt (saved as a draft, read in the
 *   background).
 */
router.post("/:id/result", async (req, res) => {
  try {
    const request = await current(await CaptureRequest.findById(req.params.id));
    if (req.device.kind !== "phone" || !mine(req, request)) return res.status(404).json({ success: false, message: "Request not found" });
    if (!["waiting", "capturing"].includes(request.status)) return res.status(409).json({ success: false, message: "That request is no longer open." });
    request.phone = req.device._id;

    if (request.kind === "barcode") {
      const barcode = String(req.body.barcode ?? "").trim();
      if (!barcode) return res.status(400).json({ success: false, message: "barcode is required." });
      request.result = { barcode };
    } else {
      const { imageBase64, mediaType = "image/jpeg", width, height } = req.body;
      if (typeof imageBase64 !== "string" || !imageBase64) return res.status(400).json({ success: false, message: "imageBase64 is required." });
      if (request.kind === "receipt") {
        const draft = await createReceiptDraft({ imageBase64, mediaType, width, height, source: "phone" });
        request.result = { draftId: draft._id };
      } else {
        const photo = await Photo.create({ data: Buffer.from(imageBase64, "base64"), contentType: mediaType, width: Number(width) || null, height: Number(height) || null, of: { kind: "label", id: request._id } });
        try {
          const scan = await parseNutritionLabel({ imageBase64, mediaType });
          request.result = { photoUrl: photoUrl(photo._id), scan };
        } catch (error) {
          request.status = "failed";
          request.error = error.message || "Couldn't read the label.";
          request.result = { photoUrl: photoUrl(photo._id) };
          await request.save();
          return res.json({ success: true, data: request });
        }
      }
    }
    request.status = "done";
    await request.save();
    return res.json({ success: true, data: request });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
