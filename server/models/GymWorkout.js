import mongoose from "mongoose";

import { ownedByUser } from "../services/ownership.js";

// A workout you've built in Gym → Workouts (a "routine" in Hevy): its
// exercises in order, each with how long to rest between sets, a note, and
// the sets you aim for — weight and reps. Doing it (ticking sets off as you
// go) is a session, kept separately (later).
const setSchema = new mongoose.Schema(
  {
    // In pounds, like the rest of the app's weights. Empty: not set yet.
    weight: { type: Number, default: null, min: 0 },
    reps: { type: Number, default: null, min: 0 },
  },
  { _id: false },
);

const workoutExerciseSchema = new mongoose.Schema(
  {
    exercise: { type: mongoose.Schema.Types.ObjectId, ref: "Exercise", required: true },
    // Rest between sets, in seconds (0: no timer).
    restSeconds: { type: Number, default: 90, min: 0 },
    note: { type: String, trim: true, default: "" },
    sets: { type: [setSchema], default: [] },
  },
  { _id: false },
);

const gymWorkoutSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "A workout needs a name"], trim: true },
    exercises: { type: [workoutExerciseSchema], default: [] },
  },
  { timestamps: true },
);

// (Personal: each belongs to an account — see services/ownership.js.)
gymWorkoutSchema.plugin(ownedByUser);

const GymWorkout = mongoose.model("GymWorkout", gymWorkoutSchema);
export default GymWorkout;
