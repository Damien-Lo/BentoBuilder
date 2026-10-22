import express from "express";

import Exercise from "../models/Exercise.js";
import GymSession from "../models/GymSession.js";
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

// --- Sessions: the workouts you did ---

const positive = (value) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value));

/**
 * POST /api/gym/sessions — a finished workout: its ticked sets.
 * Body: { workout?, name, startedAt, finishedAt, exercises: [{ exercise, note, sets: [{ weight, reps }] }] }
 */
router.post("/sessions", async (req, res) => {
  try {
    const startedAt = new Date(req.body.startedAt);
    const finishedAt = new Date(req.body.finishedAt ?? Date.now());
    if (Number.isNaN(startedAt.getTime()) || Number.isNaN(finishedAt.getTime()) || finishedAt < startedAt) throw new Error("When the workout started and finished are needed.");
    const items = Array.isArray(req.body.exercises) ? req.body.exercises : [];
    const known = new Set((await Exercise.find({ _id: { $in: items.map((i) => i?.exercise).filter(Boolean) } }).select("_id").lean()).map((e) => String(e._id)));
    const exercises = items
      .filter((item) => known.has(String(item?.exercise)))
      .map((item) => ({
        exercise: item.exercise,
        note: String(item.note ?? "").slice(0, 500),
        sets: (Array.isArray(item.sets) ? item.sets : []).slice(0, 100).map((set) => ({ weight: positive(set?.weight), reps: positive(set?.reps) })).filter((set) => set.reps !== null),
      }))
      .filter((item) => item.sets.length > 0);
    if (!exercises.length) throw new Error("Tick off at least one set first.");
    const workout = req.body.workout && (await GymWorkout.findById(req.body.workout).select("_id"))?._id;
    const session = await GymSession.create({ workout: workout ?? null, name: String(req.body.name ?? "Workout").trim() || "Workout", startedAt, finishedAt, exercises });
    return res.status(201).json({ success: true, data: session });
  } catch (error) {
    return sendError(res, error);
  }
});

/**
 * GET /api/gym/sessions?exercise=<id>
 * Your sessions, the latest first — or, with `exercise`, each session that
 * one was in: when, and its sets in it (what its history and progress are
 * drawn from).
 */
router.get("/sessions", async (req, res) => {
  try {
    const { exercise } = req.query;
    if (exercise) {
      const sessions = await GymSession.find({ "exercises.exercise": exercise }).sort({ finishedAt: -1 }).select("name finishedAt exercises").lean();
      return res.json({
        success: true,
        data: sessions.map((s) => ({
          _id: s._id,
          name: s.name,
          finishedAt: s.finishedAt,
          sets: s.exercises.filter((e) => String(e.exercise) === String(exercise)).flatMap((e) => e.sets),
        })),
      });
    }
    const sessions = await GymSession.find({}).sort({ finishedAt: -1 }).limit(200).populate("exercises.exercise", "name primaryMuscles secondaryMuscles").lean();
    return res.json({ success: true, data: sessions });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

/** GET /api/gym/sessions/:id — one session, every exercise and set in it. */
router.get("/sessions/:id", async (req, res) => {
  try {
    const session = await GymSession.findById(req.params.id).populate("exercises.exercise", "name primaryMuscles secondaryMuscles").lean();
    if (!session) return sendError(res, new Error("Session not found"), 404);
    return res.json({ success: true, data: session });
  } catch (error) {
    return sendError(res, error);
  }
});

/**
 * GET /api/gym/previous?exercises=<id>,<id>
 * For each exercise, the sets from the last time it was done (the
 * "Previous" column while doing a workout).
 */
router.get("/previous", async (req, res) => {
  try {
    const ids = String(req.query.exercises ?? "").split(",").filter(Boolean).slice(0, 50);
    const previous = {};
    await Promise.all(
      ids.map(async (id) => {
        const last = await GymSession.findOne({ "exercises.exercise": id }).sort({ finishedAt: -1 }).select("exercises").lean();
        if (last) previous[id] = last.exercises.filter((e) => String(e.exercise) === id).flatMap((e) => e.sets);
      }),
    );
    return res.json({ success: true, data: previous });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

/** DELETE /api/gym/sessions/:id */
router.delete("/sessions/:id", async (req, res) => {
  try {
    const session = await GymSession.findById(req.params.id);
    if (!session) return sendError(res, new Error("Session not found"), 404);
    await session.deleteOne();
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error);
  }
});

export default router;
