import mongoose from "mongoose";
import { ownedByUser } from "../services/ownership.js";

// One entry per calendar day (Apple Health's, synced, or your own) — logging again on the same date updates that
// day's weigh-in rather than creating a second entry (see the upsert-by-date
// route in WeightEntryRoutes.js).
const weightEntrySchema = new mongoose.Schema(
  {
    weight: { type: Number, required: true, min: 0 }, // kg (pounds before Oct 23, 2026)
    date:   { type: String, required: true }, // YYYY-MM-DD
    // Where it came from: "apple" (synced from Apple Health), "manual"
    // (logged or edited in the app — a sync leaves these alone), or none
    // (from before Apple Health was connected).
    source: { type: String, enum: ["apple", "manual", null], default: null },
    // Out of sight but kept: an entry from before Apple Health, once
    // Apple Health's weights took over, or a synced one you deleted (so the
    // next sync doesn't bring it back).
    hidden: { type: Boolean, default: false },
    // What it was before Apple Health's weight for the day replaced it.
    previousWeight: { type: Number, default: null },
  },
  { timestamps: true },
);

weightEntrySchema.index({ owner: 1, date: -1 }, { unique: true });

// (Personal: each record belongs to an account — see services/ownership.js.)
weightEntrySchema.plugin(ownedByUser);

const WeightEntry = mongoose.model("WeightEntry", weightEntrySchema);
export default WeightEntry;
