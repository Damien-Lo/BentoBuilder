import WeightEntry from "../models/WeightEntry.js";

// Where a goal weight starts (models/UserProfile.js): your weight when it's
// set — the latest weigh-in — never typed in. A goal moved the same way
// (losing to 85 instead of 88) keeps its start; one that changes direction
// (done losing, now gaining) is a new goal, starting from today's weight,
// and the one before is kept in `pastGoals`. Within a kilo of your weight
// is keeping it ("stay") — the same line the app's Targets draw.

const today = () => new Date().toISOString().slice(0, 10);

export const goalDirection = (goal, weight) =>
  goal == null || weight == null ? null : Math.abs(goal - weight) < 0.9 ? "stay" : goal < weight ? "lose" : "gain";

const latestWeighIn = () => WeightEntry.findOne({ hidden: { $ne: true } }).sort({ date: -1 }).lean();

// The update for the goal weight becoming `goal`: { $set, $push? } — nothing
// when it's the same.
export async function goalChange(profile, goal) {
  const before = profile?.goalWeight ?? null;
  if (goal === before) return null;
  const now = await latestWeighIn();
  const start = profile?.startingWeight ?? null;
  const was = profile?.goalDirection ?? goalDirection(before, start);
  const next = goalDirection(goal, now?.weight ?? start);

  // The same goal, moved the same way: its start stays.
  if (before != null && goal != null && start != null && next != null && next === was) return { $set: { goalWeight: goal, goalDirection: next } };

  const update = {
    $set: { goalWeight: goal, goalDirection: goal == null ? null : next, startingWeight: goal == null ? null : (now?.weight ?? null), startingWeightDate: goal == null ? null : (now?.date ?? today()) },
  };
  // The one before is kept — unless it never got going (no weigh-in since
  // it was set) or was changed the same day (a correction, not a goal).
  const end = now?.date ?? today();
  if (before != null && start != null && profile.startingWeightDate !== end) {
    update.$push = {
      pastGoals: { direction: was, goalWeight: before, startWeight: start, startDate: profile.startingWeightDate ?? null, endWeight: now?.weight ?? null, endDate: end },
    };
  }
  return update;
}

// A goal set before there was any weigh-in starts from the first one after;
// one from before directions were kept is given its own.
export async function fillGoalStart(profile) {
  if (profile?.goalWeight == null) return null;
  if (profile.startingWeight != null) return profile.goalDirection ? null : { $set: { goalDirection: goalDirection(profile.goalWeight, profile.startingWeight) } };
  const first = await WeightEntry.findOne({ hidden: { $ne: true }, ...(profile.startingWeightDate ? { date: { $gte: profile.startingWeightDate } } : {}) }).sort({ date: 1 }).lean();
  if (!first) return null;
  return { $set: { startingWeight: first.weight, startingWeightDate: first.date, goalDirection: goalDirection(profile.goalWeight, first.weight) } };
}
