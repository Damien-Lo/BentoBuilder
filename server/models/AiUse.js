import mongoose from "mongoose";
import { ownedByUser } from "../services/ownership.js";

// How many photos a person has had read by the AI service on a day (a
// receipt, a nutrition label, a meal) — each one costs money, so there's a
// daily allowance (services/aiAllowance.js).
const aiUseSchema = new mongoose.Schema(
  {
    day: { type: String, required: true }, // YYYY-MM-DD (UTC)
    count: { type: Number, default: 0 },
  },
  { timestamps: true },
);

aiUseSchema.plugin(ownedByUser);
aiUseSchema.index({ owner: 1, day: 1 }, { unique: true });

export default mongoose.model("AiUse", aiUseSchema);
