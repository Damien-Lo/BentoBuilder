import express from "express";
import mongoose from "mongoose";
import Photo from "../models/Photo.js";

const router = express.Router();

/**
 * GET /api/photos/:id
 * The image itself. A photo never changes once saved (a new one gets a new
 * address), so it can be kept by the browser or phone for good.
 */
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).end();
    const photo = await Photo.findById(req.params.id).lean();
    if (!photo) return res.status(404).end();
    res.set("Content-Type", photo.contentType || "image/jpeg");
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    return res.send(photo.data.buffer ? Buffer.from(photo.data.buffer) : photo.data);
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;

// A photo's address, as what shows it keeps it.
export const photoUrl = (id) => `/api/photos/${id}`;
// The photo an address points to, if it's one of ours.
export const photoIdFrom = (url) => /^\/api\/photos\/([a-f0-9]{24})$/.exec(url ?? "")?.[1] ?? null;
