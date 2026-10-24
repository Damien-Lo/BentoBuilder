import mongoose from "mongoose";

import { historySchema } from "./Restaurant.js";

// A restaurant chain (Chipotle, Shake Shack): one menu for all its locations.
// Public and wiki-style, like a restaurant (see Restaurant.js). A location is
// a Restaurant whose `chain` is this; the menu's dishes point here.
const chainSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Chain name is required"], trim: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true },
    cuisine: { type: String, trim: true, default: "" },
    website: { type: String, trim: true, default: "" },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    history: { type: [historySchema], default: [] },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

chainSchema.index({ normalizedName: 1 }, { unique: true });

export default mongoose.model("Chain", chainSchema);
