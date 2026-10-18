import mongoose from "mongoose";

// A phone or computer this app runs on, so one can ask another to take a
// photo (a computer reviewing a receipt asks the phone for a barcode or a
// label). Each device keeps its id and `secret` itself and sends them with
// its requests; the secret is never handed out again.
//
// For now a computer and a phone are linked by pairing once (a QR code the
// phone scans: `pairCode`, short-lived). With accounts, each device will
// simply belong to the account it's signed in to, and pairing goes away —
// the rest (camera requests, the phone's "ready" screen) stays as it is.
// `pushToken` is for notifications, later.
const deviceSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["phone", "computer"], required: true },
    name: { type: String, trim: true, default: "" },
    secret: { type: String, required: true, select: false },
    pairedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: "Device" }],
    pairCode: { type: String, default: null, select: false },
    pairCodeExpiresAt: { type: Date, default: null },
    pushToken: { type: String, default: null },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

deviceSchema.index({ pairCode: 1 }, { sparse: true });

export default mongoose.model("Device", deviceSchema);
