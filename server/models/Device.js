import mongoose from "mongoose";
import { ownedByUser } from "../services/ownership.js";

// A phone or computer this app runs on, so one can ask another to take a
// photo (a computer reviewing a receipt asks the phone for a barcode or a
// label). A device is one of the account it registered under (`owner`, see
// services/ownership.js): a computer's request goes to the account's phones,
// with nothing to pair. Each device keeps its id and `secret` itself and
// sends them with its requests; the secret is never handed out again.
// `pushToken` is for notifications, later.
const deviceSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["phone", "computer"], required: true },
    name: { type: String, trim: true, default: "" },
    secret: { type: String, required: true, select: false },
    pushToken: { type: String, default: null },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// (Personal: each record belongs to an account — see services/ownership.js.)
deviceSchema.plugin(ownedByUser);

export default mongoose.model("Device", deviceSchema);
