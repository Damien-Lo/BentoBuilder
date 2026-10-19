import mongoose from "mongoose";
import { ownedByUser } from "../services/ownership.js";

// One entry per calendar day — logging again on the same date updates that
// day's weigh-in rather than creating a second entry (see the upsert-by-date
// route in WeightEntryRoutes.js).
const weightEntrySchema = new mongoose.Schema(
  {
    weight: { type: Number, required: true, min: 0 },
    date:   { type: String, required: true }, // YYYY-MM-DD
  },
  { timestamps: true },
);

weightEntrySchema.index({ owner: 1, date: -1 }, { unique: true });

// (Personal: each record belongs to an account — see services/ownership.js.)
weightEntrySchema.plugin(ownedByUser);

const WeightEntry = mongoose.model("WeightEntry", weightEntrySchema);
export default WeightEntry;
