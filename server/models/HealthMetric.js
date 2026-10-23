import mongoose from "mongoose";

import { ownedByUser } from "../services/ownership.js";

// One health reading: a day's total (steps, active calories, exercise
// minutes, distance), a day's figure (resting heart rate, HRV, VO₂ max), or
// a night's sleep — each kept once, by its `key` ("steps:2026-10-22"), so
// syncing again (from Apple Health, or typed in) updates it rather than
// adding another. `date` is the day it belongs to (a night's sleep: the
// morning it ended).
const healthMetricSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    value: { type: Number, required: true },
    unit: { type: String, trim: true, default: "" },
    start: { type: Date, default: null },
    end: { type: Date, default: null },
    // Where it came from: "apple" (Apple Health), "manual", "orbit".
    source: { type: String, trim: true, default: "apple" },
    // Anything more, by type — a night's sleep stages in minutes.
    detail: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

// (Personal: each belongs to an account — see services/ownership.js.)
healthMetricSchema.plugin(ownedByUser);
healthMetricSchema.index({ owner: 1, key: 1 }, { unique: true });
healthMetricSchema.index({ owner: 1, type: 1, date: -1 });

const HealthMetric = mongoose.model("HealthMetric", healthMetricSchema);
export default HealthMetric;
