import express from "express";

import AddedExercise from "../models/AddedExercise.js";
import Exercise from "../models/Exercise.js";
import { trackFor } from "../services/exerciseCatalog.js";
import { currentScope } from "../services/ownership.js";

const router = express.Router();

// What a list needs (not the instructions).
const LIST_FIELDS = "name core group category equipment primaryMuscles secondaryMuscles level mechanic images track owner";

// The exercises someone can see: the library's (no owner), and their own.
export const visibleExercises = () => ({ owner: { $in: [null, currentScope()?.owner ?? null] } });

// Each with whether it's in their list beyond the core — added from the
// library (`added`), or their own (`custom`).
async function marked(exercises) {
  const added = new Set((await AddedExercise.find({}).select("exercise").lean()).map((a) => String(a.exercise)));
  return exercises.map(({ owner, ...e }) => ({ ...e, added: added.has(String(e._id)), custom: !!owner }));
}

/**
 * GET /api/exercises
 * The whole library — the core and the rest — and your own exercises, for
 * Gym's Exercises tab to browse (your list: the core, what you've added,
 * your own) and search (all of it).
 */
router.get("/", async (req, res) => {
  try {
    const exercises = await Exercise.find(visibleExercises()).select(LIST_FIELDS).sort({ name: 1 }).lean();
    return res.json({ success: true, data: await marked(exercises) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/exercises — your own exercise.
 * Body: { name, track, equipment, primaryMuscles, secondaryMuscles }
 */
const MUSCLES = new Set(["chest", "shoulders", "biceps", "triceps", "forearms", "abdominals", "lats", "middle back", "lower back", "traps", "neck", "glutes", "quadriceps", "hamstrings", "adductors", "abductors", "calves"]);
const TRACKS = new Set(["weight", "bodyweight", "assisted", "duration", "cardio"]);
router.post("/", async (req, res) => {
  try {
    const name = String(req.body.name ?? "").trim().slice(0, 80);
    if (!name) throw new Error("Your exercise needs a name.");
    const muscles = (list) => (Array.isArray(list) ? list.map(String).filter((m) => MUSCLES.has(m)) : []);
    const primaryMuscles = muscles(req.body.primaryMuscles).slice(0, 3);
    const secondaryMuscles = muscles(req.body.secondaryMuscles).filter((m) => !primaryMuscles.includes(m)).slice(0, 6);
    const track = TRACKS.has(req.body.track) ? req.body.track : "weight";
    if (track !== "cardio" && !primaryMuscles.length) throw new Error("Choose the muscle it mainly works.");
    const equipment = String(req.body.equipment ?? "").trim().slice(0, 40) || null;
    const exercise = await Exercise.create({
      name,
      owner: currentScope()?.owner ?? null,
      core: false,
      group: track === "cardio" ? "cardio" : primaryMuscles[0],
      category: track === "cardio" ? "cardio" : "strength",
      equipment,
      primaryMuscles,
      secondaryMuscles,
      track: TRACKS.has(req.body.track) ? track : trackFor(name, { equipment }),
    });
    return res.status(201).json({ success: true, data: { ...exercise.toObject(), owner: undefined, added: false, custom: true } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/** POST /api/exercises/added  { exercise } — a library exercise into your list. */
router.post("/added", async (req, res) => {
  try {
    const exercise = await Exercise.findOne({ _id: req.body.exercise, owner: null }).select("_id").lean();
    if (!exercise) return res.status(404).json({ success: false, message: "Exercise not found" });
    await AddedExercise.updateOne({ exercise: exercise._id }, { $setOnInsert: { exercise: exercise._id } }, { upsert: true });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/** DELETE /api/exercises/added/:id — out of your list again (it stays in the library). */
router.delete("/added/:id", async (req, res) => {
  try {
    await AddedExercise.deleteOne({ exercise: req.params.id });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/** DELETE /api/exercises/:id — one of your own exercises (never the library's). */
router.delete("/:id", async (req, res) => {
  try {
    const owner = currentScope()?.owner;
    const result = owner ? await Exercise.deleteOne({ _id: req.params.id, owner }) : { deletedCount: 0 };
    if (!result.deletedCount) return res.status(404).json({ success: false, message: "Exercise not found" });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/exercises/:id
 * One exercise, with how it's done.
 */
router.get("/:id", async (req, res) => {
  try {
    const exercise = await Exercise.findOne({ _id: req.params.id, ...visibleExercises() }).lean();
    if (!exercise) return res.status(404).json({ success: false, message: "Exercise not found" });
    return res.json({ success: true, data: (await marked([exercise]))[0] });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
