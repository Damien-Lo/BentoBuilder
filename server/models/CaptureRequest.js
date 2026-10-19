import mongoose from "mongoose";
import { ownedByUser } from "../services/ownership.js";

// A computer asking one of its paired phones to use its camera: a product's
// barcode, a nutrition label, or a whole receipt. The phone's "ready"
// screen picks up the oldest one waiting, opens the right camera
// ("capturing") and sends back what it got ("done"):
//   - barcode: { barcode }
//   - label:   { photoUrl, scan } (the label read on the server)
//   - receipt: { draftId } (a receipt draft, read in the background)
// The computer watches the request until then. Unanswered ones expire.
const captureRequestSchema = new mongoose.Schema(
  {
    computer: { type: mongoose.Schema.Types.ObjectId, ref: "Device", required: true },
    phone: { type: mongoose.Schema.Types.ObjectId, ref: "Device", default: null },
    kind: { type: String, enum: ["barcode", "label", "receipt"], required: true },
    // What it's for, shown on the phone ("Barcode for Fish Cake").
    label: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["waiting", "capturing", "done", "cancelled", "failed"], default: "waiting" },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: "" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

captureRequestSchema.index({ computer: 1, status: 1, createdAt: 1 });

// (Personal: each record belongs to an account — see services/ownership.js.)
captureRequestSchema.plugin(ownedByUser);

export default mongoose.model("CaptureRequest", captureRequestSchema);
