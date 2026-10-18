import crypto from "crypto";
import express from "express";
import Device from "../models/Device.js";

const router = express.Router();

// Pairing codes last this long once shown.
const PAIR_CODE_MINUTES = 10;

// The device a request comes from, by the id and secret it keeps (headers
// x-device-id and x-device-secret). Sets req.device, or answers 401.
export async function deviceAuth(req, res, next) {
  try {
    const id = req.get("x-device-id");
    const secret = req.get("x-device-secret") ?? "";
    if (!id || !/^[a-f0-9]{24}$/.test(id)) return res.status(401).json({ success: false, message: "This device isn't registered." });
    const device = await Device.findById(id).select("+secret");
    const ok = device && device.secret.length === secret.length && crypto.timingSafeEqual(Buffer.from(device.secret), Buffer.from(secret));
    if (!ok) return res.status(401).json({ success: false, message: "This device isn't registered." });
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
 * Registers this device. The secret is only ever returned here: the device
 * keeps it and sends it with its requests.
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
 * GET /api/devices/me — this device and the ones it's paired with.
 */
router.get("/me", deviceAuth, async (req, res) => {
  const paired = await Device.find({ _id: { $in: req.device.pairedWith } }).lean();
  return res.json({ success: true, data: { ...shown(req.device), paired: paired.map(shown) } });
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
 * POST /api/devices/pair-code — a computer's one-time code for a phone to
 * scan (shown as a QR code). Valid for a few minutes; a new one replaces it.
 */
router.post("/pair-code", deviceAuth, async (req, res) => {
  if (req.device.kind !== "computer") return res.status(400).json({ success: false, message: "Only a computer shows a pairing code." });
  const code = crypto.randomBytes(16).toString("base64url");
  const expiresAt = new Date(Date.now() + PAIR_CODE_MINUTES * 60_000);
  await Device.updateOne({ _id: req.device._id }, { pairCode: code, pairCodeExpiresAt: expiresAt });
  return res.json({ success: true, data: { code, expiresAt } });
});

/**
 * POST /api/devices/pair  { code } — a phone pairing with the computer that
 * showed this code. The code is used up.
 */
router.post("/pair", deviceAuth, async (req, res) => {
  try {
    if (req.device.kind !== "phone") return res.status(400).json({ success: false, message: "Only a phone pairs by scanning a code." });
    const code = String(req.body.code ?? "");
    const computer = code ? await Device.findOne({ pairCode: code, pairCodeExpiresAt: { $gt: new Date() } }) : null;
    if (!computer) return res.status(404).json({ success: false, message: "That code has expired or was already used. Show a new one on the computer." });
    await Device.updateOne({ _id: computer._id }, { $addToSet: { pairedWith: req.device._id }, pairCode: null, pairCodeExpiresAt: null });
    await Device.updateOne({ _id: req.device._id }, { $addToSet: { pairedWith: computer._id } });
    return res.json({ success: true, data: shown(computer) });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/devices/paired/:id — unpairs, on both sides.
 */
router.delete("/paired/:id", deviceAuth, async (req, res) => {
  try {
    await Device.updateOne({ _id: req.device._id }, { $pull: { pairedWith: req.params.id } });
    await Device.updateOne({ _id: req.params.id }, { $pull: { pairedWith: req.device._id } });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
