import mongoose from "mongoose";

// An exercise in Gym's library. The library comes from free-exercise-db
// (data/free-exercise-db, public domain): every one of its exercises is
// here, filled in by services/exerciseCatalog.js when the server connects.
// About 130 of them are the core (data/exerciseCore.js) — shown by default,
// under a clean name; the rest are found by searching.
//
// A library exercise has no `owner` and is everyone's. (Later: exercises
// someone adds for themselves, with their own `owner`.)
const exerciseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Where it came from: its id and name in free-exercise-db (none for
    // someone's own).
    sourceId: { type: String, default: null },
    sourceName: { type: String, default: null },
    // Shown by default (the core), or only when searched for.
    core: { type: Boolean, default: false },
    // The section it's browsed under: the muscle it mainly works, or
    // "cardio".
    group: { type: String, required: true },
    category: { type: String, default: null },
    equipment: { type: String, default: null },
    primaryMuscles: { type: [String], default: [] },
    secondaryMuscles: { type: [String], default: [] },
    level: { type: String, default: null },
    mechanic: { type: String, default: null },
    force: { type: String, default: null },
    // Photos — the start and end of the movement — as paths in
    // free-exercise-db's `exercises/` folder.
    images: { type: [String], default: [] },
    instructions: { type: [String], default: [] },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

exerciseSchema.index({ sourceId: 1 }, { unique: true, partialFilterExpression: { sourceId: { $type: "string" } } });
exerciseSchema.index({ core: 1, group: 1 });

const Exercise = mongoose.model("Exercise", exerciseSchema);
export default Exercise;
