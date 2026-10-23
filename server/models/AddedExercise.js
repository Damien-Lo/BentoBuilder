import mongoose from "mongoose";

import { ownedByUser } from "../services/ownership.js";

// A library exercise someone has added to their own list in Gym →
// Exercises (beyond the core, which everyone has): one record each.
const addedExerciseSchema = new mongoose.Schema(
  {
    exercise: { type: mongoose.Schema.Types.ObjectId, ref: "Exercise", required: true },
  },
  { timestamps: true },
);

// (Personal: each belongs to an account — see services/ownership.js.)
addedExerciseSchema.plugin(ownedByUser);
addedExerciseSchema.index({ owner: 1, exercise: 1 }, { unique: true });

const AddedExercise = mongoose.model("AddedExercise", addedExerciseSchema);
export default AddedExercise;
