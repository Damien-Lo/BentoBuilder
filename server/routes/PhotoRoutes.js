import express from "express";
import mongoose from "mongoose";
import Photo, { PHOTO_TYPES } from "../models/Photo.js";

const router = express.Router();

/**
 * GET /api/photos/:id/:key
 * The image itself, to whoever has its address (see models/Photo.js). A
 * photo never changes once saved (a new one gets a new address), so it can
 * be kept by the browser or phone for good — but only there.
 * (GET /api/photos/:id: a photo from before keys, until it has one.)
 */
async function send(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).end();
    // (Whoever's it is: the key is what opens it.)
    const photo = await Photo.findById(req.params.id, null, { anyOwner: true }).lean();
    if (!photo || (photo.key ?? "") !== (req.params.key ?? "")) return res.status(404).end();
    res.set("Content-Type", PHOTO_TYPES.includes(photo.contentType) ? photo.contentType : "application/octet-stream");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Content-Security-Policy", "default-src 'none'");
    res.set("Cache-Control", "private, max-age=31536000, immutable");
    return res.send(photo.data.buffer ? Buffer.from(photo.data.buffer) : photo.data);
  } catch {
    return res.status(404).end();
  }
}
router.get("/:id/:key", send);
router.get("/:id", send);

export default router;

// A photo's address, as what shows it keeps it (the photo itself, or — for
// one from before keys — its id).
export const photoUrl = (photo) => (photo?.key ? `/api/photos/${photo._id}/${photo.key}` : `/api/photos/${photo?._id ?? photo}`);
// The photo an address points to, if it's one of ours.
export const photoIdFrom = (url) => /^\/api\/photos\/([a-f0-9]{24})(\/[a-f0-9]{32})?$/.exec(url ?? "")?.[1] ?? null;
