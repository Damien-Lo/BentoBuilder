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
  },
  { timestamps: true },
);

gymSessionSchema.index({ finishedAt: -1 });
gymSessionSchema.index({ "exercises.exercise": 1, finishedAt: -1 });

// (Personal: each belongs to an account — see services/ownership.js.)
gymSessionSchema.plugin(ownedByUser);

const GymSession = mongoose.model("GymSession", gymSessionSchema);
export default GymSession;
