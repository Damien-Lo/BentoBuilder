import mongoose from "mongoose";

import { ownedByUser } from "../services/ownership.js";

// A workout you did (from Gym → Workouts → Start): when, for how long, and
// the sets you ticked off for each exercise — what each exercise's history
// and progress are worked out from. (`workout`: the one it was started
// from, if any; its name is kept as it was then.)
const doneSetSchema = new mongoose.Schema(
  {
    weight: { type: Number, default: null, min: 0 }, // lbs
    reps: { type: Number, default: null, min: 0 },
    // For a hold or cardio: how long (seconds) and how far (miles).
    seconds: { type: Number, default: null, min: 0 },
    distance: { type: Number, default: null, min: 0 },
    // A warm-up (not counted toward records), a drop set, a set to failure —
    // or an ordinary one.
    type: { type: String, enum: ["normal", "warmup", "drop", "failure"], default: "normal" },
    // When it was ticked off (since Oct 23, 2026) — what lines your heart
    // rate up with each set.
    doneAt: { type: Date, default: null },
  },
  { _id: false },
);

// What your body did during it, from Apple Health (your Watch), in the
// session's own time: the calories burned moving, your heart rate (its
// average, highest and lowest, and a minute at a time — `hr[i]` the
// average in minute i, 0 for a minute with none), and whether a workout was
// recorded on the Watch for it. Filled in by the phone's sync; null until
// then (or without the Watch).
const vitalsSchema = new mongoose.Schema(
  {
    kcal: { type: Number, default: null, min: 0 },
    avgHr: { type: Number, default: null, min: 0 },
    maxHr: { type: Number, default: null, min: 0 },
    minHr: { type: Number, default: null, min: 0 },
    hr: { type: [Number], default: [] },
    watchWorkout: { type: Boolean, default: false },
    syncedAt: { type: Date, default: null },
  },
  { _id: false },
);

const doneExerciseSchema = new mongoose.Schema(
  {
    exercise: { type: mongoose.Schema.Types.ObjectId, ref: "Exercise", required: true },
    note: { type: String, trim: true, default: "" },
    sets: { type: [doneSetSchema], default: [] },
  },
  { _id: false },
);

const gymSessionSchema = new mongoose.Schema(
  {
    workout: { type: mongoose.Schema.Types.ObjectId, ref: "GymWorkout", default: null },
    name: { type: String, trim: true, default: "Workout" },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    exercises: { type: [doneExerciseSchema], default: [] },
    vitals: { type: vitalsSchema, default: null },
  },
  { timestamps: true },
);

gymSessionSchema.index({ finishedAt: -1 });
gymSessionSchema.index({ "exercises.exercise": 1, finishedAt: -1 });

// (Personal: each belongs to an account — see services/ownership.js.)
gymSessionSchema.plugin(ownedByUser);

const GymSession = mongoose.model("GymSession", gymSessionSchema);
export default GymSession;
