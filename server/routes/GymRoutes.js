import express from "express";

import Exercise from "../models/Exercise.js";
import GymWorkout from "../models/GymWorkout.js";

const router = express.Router();

// Each exercise with what showing it needs: its name, photos and muscles.
const withExercises = (query) => query.populate("exercises.exercise", "name images group primaryMuscles secondaryMuscles equipment");

const sendError = (res, error, status = 400) => res.status(status).json({ success: false, message: error.message || String(error) });

// What a workout is, from what the app sends: only what's known about it,
// and only exercises that exist.
async function workoutFrom(body) {
  const name = String(body.name ?? "").trim();
  if (!name) throw new Error("A workout needs a name.");
  const items = Array.isArray(body.exercises) ? body.exercises : [];
  const ids = items.map((item) => item?.exercise).filter(Boolean);
  const known = new Set((await Exercise.find({ _id: { $in: ids } }).select("_id").lean()).map((e) => String(e._id)));
  const number = (value) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value));
  return {
    name,
    exercises: items
      .filter((item) => known.has(String(item?.exercise)))
      .map((item) => ({
        exercise: item.exercise,
        restSeconds: Math.max(0, Math.round(Number(item.restSeconds ?? 90)) || 0),
        note: String(item.note ?? "").slice(0, 500),
        sets: (Array.isArray(item.sets) ? item.sets : []).slice(0, 50).map((set) => ({ weight: number(set?.weight), reps: number(set?.reps) })),
      })),
  };
}

/** GET /api/gym/workouts — your workouts, the latest changed first. */
router.get("/workouts", async (req, res) => {
  try {
    const workouts = await withExercises(GymWorkout.find({}).sort({ updatedAt: -1 })).lean();
    return res.json({ success: true, data: workouts });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

/** GET /api/gym/workouts/:id */
router.get("/workouts/:id", async (req, res) => {
  try {
    const workout = await withExercises(GymWorkout.findById(req.params.id)).lean();
    if (!workout) return sendError(res, new Error("Workout not found"), 404);
    return res.json({ success: true, data: workout });
  } catch (error) {
    return sendError(res, error);
  }
});

/** POST /api/gym/workouts — a new workout. */
router.post("/workouts", async (req, res) => {
  try {
    const created = await GymWorkout.create(await workoutFrom(req.body));
    const workout = await withExercises(GymWorkout.findById(created._id)).lean();
    return res.status(201).json({ success: true, data: workout });
  } catch (error) {
    return sendError(res, error);
  }
});

/** PUT /api/gym/workouts/:id — a workout, as it now is. */
router.put("/workouts/:id", async (req, res) => {
  try {
    const workout = await GymWorkout.findById(req.params.id);
    if (!workout) return sendError(res, new Error("Workout not found"), 404);
    Object.assign(workout, await workoutFrom(req.body));
    await workout.save();
    return res.json({ success: true, data: await withExercises(GymWorkout.findById(workout._id)).lean() });
  } catch (error) {
    return sendError(res, error);
  }
});

/** DELETE /api/gym/workouts/:id */
router.delete("/workouts/:id", async (req, res) => {
  try {
    const workout = await GymWorkout.findById(req.params.id);
    if (!workout) return sendError(res, new Error("Workout not found"), 404);
    await workout.deleteOne();
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error);
  }
});

export default router;
