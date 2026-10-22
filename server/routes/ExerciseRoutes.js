import express from "express";

import Exercise from "../models/Exercise.js";

const router = express.Router();

// What a list needs (not the instructions).
const LIST_FIELDS = "name core group category equipment primaryMuscles secondaryMuscles level mechanic images track";

/**
 * GET /api/exercises
 * The whole library — the core and the rest — for Gym's Exercises tab to
 * browse (the core) and search (all of it).
 */
router.get("/", async (req, res) => {
  try {
    const exercises = await Exercise.find({ owner: null }).select(LIST_FIELDS).sort({ name: 1 }).lean();
    return res.json({ success: true, data: exercises });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/exercises/:id
 * One exercise, with how it's done.
 */
router.get("/:id", async (req, res) => {
  try {
    const exercise = await Exercise.findOne({ _id: req.params.id, owner: null }).lean();
    if (!exercise) return res.status(404).json({ success: false, message: "Exercise not found" });
    return res.json({ success: true, data: exercise });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
