import crypto from "crypto";
import express from "express";
import Device from "../models/Device.js";

// The phones and computers someone uses BentoBuilder on (see
// models/Device.js). A device registers itself once, under the account
// it's signed in to, and keeps its id and secret; from then on it's one of
// that account's devices — so a computer can ask "my phone" for a photo
// with nothing to pair.
const router = express.Router();

// The device a request comes from, by the id and secret it keeps (headers
// x-device-id and x-device-secret), among the account's devices. Sets
// req.device. One it doesn't know — never registered, registered under
// another account, or forgotten — is answered 404 with code
// "unknown-device", so the app registers it again. (Not 401: that's the
// account's session, and would sign the person out.)
export async function deviceAuth(req, res, next) {
  try {
    const unknown = () => res.status(404).json({ success: false, code: "unknown-device", message: "This device isn't registered." });
    const id = req.get("x-device-id");
    const secret = req.get("x-device-secret") ?? "";
    if (!id || !/^[a-f0-9]{24}$/.test(id)) return unknown();
    const device = await Device.findById(id).select("+secret");
    const ok = device && device.secret.length === secret.length && crypto.timingSafeEqual(Buffer.from(device.secret), Buffer.from(secret));
    if (!ok) return unknown();
    // (Last seen, at most once a minute.)
    if (Date.now() - (device.lastSeenAt?.getTime() ?? 0) > 60_000) await Device.updateOne({ _id: device._id }, { lastSeenAt: new Date() });
    req.device = device;
    next();
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

const shown = (device) => ({ _id: device._id, kind: device.kind, name: device.name, lastSeenAt: device.lastSeenAt });

/**
 * POST /api/devices  { kind: "phone" | "computer", name? }
 * Registers this device, as one of the account's. The secret is only ever
 * returned here: the device keeps it and sends it with its requests.
 */
router.post("/", async (req, res) => {
  try {
    const kind = req.body.kind === "phone" ? "phone" : "computer";
    const secret = crypto.randomBytes(24).toString("hex");
    const device = await Device.create({ kind, name: String(req.body.name ?? "").slice(0, 60) || (kind === "phone" ? "Phone" : "Computer"), secret });
    return res.status(201).json({ success: true, data: { ...shown(device), secret } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/devices/me — this device, and the account's others.
 */
router.get("/me", deviceAuth, async (req, res) => {
  const others = await Device.find({ _id: { $ne: req.device._id } }).sort({ lastSeenAt: -1 }).lean();
  // (`paired` too, the same list: what app builds from before accounts read.)
  return res.json({ success: true, data: { ...shown(req.device), others: others.map(shown), paired: others.map(shown) } });
});

/**
 * PATCH /api/devices/me  { name }
 */
router.patch("/me", deviceAuth, async (req, res) => {
  const name = String(req.body.name ?? "").trim().slice(0, 60);
  if (name) await Device.updateOne({ _id: req.device._id }, { name });
  return res.json({ success: true });
});

/**
 * DELETE /api/devices/:id — forgets another of the account's devices (one
 * no longer used). If it's used again, it registers afresh.
 */
router.delete("/:id", deviceAuth, async (req, res) => {
  try {
    if (String(req.params.id) === String(req.device._id)) return res.status(400).json({ success: false, message: "That's this device." });
    const gone = await Device.deleteOne({ _id: req.params.id });
    if (!gone.deletedCount) return res.status(404).json({ success: false, message: "That device isn't there." });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
