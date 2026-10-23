import CalendarEvent from "../models/CalendarEvent.js";
import EventCalendar from "../models/EventCalendar.js";
import GymWorkout from "../models/GymWorkout.js";
import { occurrenceDates, plannedWorkoutOn } from "../routes/CalendarRoutes.js";

// A Watch workout (from Apple Health) ticks off the training time it was
// for: on its day, a Gym calendar slot whose planned workout is cardio or a
// sport of the same kind — Badminton for a badminton workout, Run for a
// run. (Lifting is ticked off by the Gym session instead.) Said kind is
// read from the routine's cardio exercises' names.

// Apple's workout types (HKWorkoutActivityType), by what a cardio
// exercise's name says it is.
const KINDS = [
  [/badminton/i, 4],
  [/basketball/i, 6],
  [/box/i, 8],
  [/cycl|bike|spin/i, 13],
  [/elliptical/i, 16],
  [/hik/i, 24],
  [/row/i, 35],
  [/run|jog/i, 37],
  [/football|soccer/i, 41],
  [/squash/i, 43],
  [/stair/i, 44],
  [/swim/i, 46],
  [/table tennis|ping/i, 47],
  [/tennis/i, 48],
  [/volleyball/i, 51],
  [/walk/i, 52],
  [/yoga/i, 57],
];

// The Apple workout types a routine's cardio exercises are.
function kindsOf(routine) {
  const kinds = new Set();
  for (const item of routine?.exercises ?? []) {
    const ex = item.exercise;
    if (!ex || ex.track !== "cardio") continue;
    for (const [pattern, kind] of KINDS) if (pattern.test(ex.name)) kinds.add(kind);
  }
  return kinds;
}

// `workouts`: Watch workout readings ({ date, detail: { activity } }) just synced.
export async function matchWatchWorkouts(workouts) {
  const done = workouts.filter((w) => w.type === "workout" && Number.isFinite(Number(w.detail?.activity)));
  if (!done.length) return 0;
  const gym = await EventCalendar.findOne({ isGym: true }).select("_id");
  if (!gym) return 0;
  let marked = 0;
  for (const date of new Set(done.map((w) => w.date))) {
    const events = (await CalendarEvent.find({ calendar: gym._id, date: { $lte: date }, $or: [{ repeat: { $ne: null } }, { endDate: { $gte: date } }] })).filter((e) => occurrenceDates(e.toObject(), date, date).includes(date));
    const types = new Set(done.filter((w) => w.date === date).map((w) => Number(w.detail.activity)));
    for (const event of events) {
      if (event.gymDone.some((d) => d.date === date) || event.gymSkipped.includes(date)) continue;
      const planned = plannedWorkoutOn(event, date);
      if (!planned) continue;
      const routine = await GymWorkout.findById(planned).populate("exercises.exercise", "name track").lean();
      if (![...kindsOf(routine)].some((k) => types.has(k))) continue;
      event.gymDone.push({ date, session: null });
      await event.save();
      marked++;
    }
  }
  return marked;
}
