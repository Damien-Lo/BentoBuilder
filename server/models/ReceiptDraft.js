import mongoose from "mongoose";

// A scanned receipt waiting to be reviewed — kept on the server so the scan
// can be reviewed on any device (a phone scans it, the desktop reviews it).
// The photo is read in the background after it's saved, so the phone that
// took it doesn't have to wait: "parsing" until then, "ready" (or "failed")
// after. `review` holds the review screen's edits as they're made, so a
// review can be left and picked up again, here or elsewhere. Once its items
// are in the pantry it's "done"; thrown away, "discarded".
const receiptDraftSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ["parsing", "ready", "failed", "done", "discarded"], default: "parsing" },
    photo: { type: mongoose.Schema.Types.ObjectId, ref: "Photo", default: null },
    // What the receipt reader returned (see services/receiptParsing.js).
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    // The review's edits in progress (rows, store, purchase date).
    review: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: "" },
    // Where it was scanned from.
    source: { type: String, enum: ["phone", "desktop"], default: "phone" },
  },
  { timestamps: true },
);

receiptDraftSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("ReceiptDraft", receiptDraftSchema);
