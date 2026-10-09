import MealPlanEntry from "../models/MealPlanEntry.js";
import UsualMeal from "../models/UsualMeal.js";
import { removeMealPlanEntryContributions } from "./groceryContributions.js";

// How far ahead usual meals are filled into the planner, and how long one
// that was never confirmed stays on a past day before it's cleared away.
export const USUAL_FILL_DAYS = 14;
export const USUAL_KEEP_DAYS = 7;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;
const toDate = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const addDays = (s, n) => new Date(toDate(s).getTime() + n * DAY_MS).toISOString().slice(0, 10);
const weekdayOf = (s) => toDate(s).getUTCDay();

// "Today" as the phone sees it when it says, else the server's date.
export function todayFrom(value) {
  return DATE_RE.test(value ?? "") ? value : new Date().toISOString().slice(0, 10);
}

// The fields of a usual that become a planner entry.
export function usualItemFields(source) {
  const fields = {};
  if (source.meal) fields.meal = source.meal._id ?? source.meal;
  if (source.recipe) {
    fields.recipe = source.recipe._id ?? source.recipe;
    fields.recipeServings = source.recipeServings ?? 1;
  }
  if (source.ingredient) {
    fields.ingredient = source.ingredient._id ?? source.ingredient;
    fields.ingredientQuantity = source.ingredientQuantity;
    fields.ingredientUnit = source.ingredientUnit ?? "";
  }
  if (source.restaurantMeal) {
    fields.restaurantMeal = source.restaurantMeal._id ?? source.restaurantMeal;
    fields.restaurantDishSelections = (source.restaurantDishSelections ?? []).map((s) => ({
      dish: s.dish,
      quantity: s.quantity ?? 1,
    }));
  }
  return fields;
}

// Brings the planner into line with the usual meals, as of `today`:
//   - fills in a planned entry for each usual on each of its days from
//     today to USUAL_FILL_DAYS ahead (never a past day, never a day it was
//     removed from, never twice);
//   - clears away ones left unconfirmed more than USUAL_KEEP_DAYS ago.
// Cheap when there's nothing to do, so it runs whenever the planner loads.
export async function syncUsualMeals(today) {
  const usuals = await UsualMeal.find({ active: true, $or: [{ endDate: null }, { endDate: { $gte: today } }] }).lean();
  if (usuals.length > 0) {
    const horizon = addDays(today, USUAL_FILL_DAYS);
    const existing = await MealPlanEntry.find({
      usual: { $in: usuals.map((u) => u._id) },
      date: { $gte: today, $lte: horizon },
    })
      .select("usual date")
      .lean();
    const have = new Set(existing.map((e) => `${e.usual}|${e.date}`));
    // The same food already put in that slot by hand counts too: a usual
    // never doubles up something you'd planned or logged yourself.
    const byHand = await MealPlanEntry.find({ usual: null, isArchived: false, date: { $gte: today, $lte: horizon } })
      .select("date slot meal recipe ingredient restaurantMeal")
      .lean();
    const itemOf = (x) => String(x.meal ?? x.recipe ?? x.ingredient ?? x.restaurantMeal);
    const taken = new Set(byHand.map((e) => `${e.date}|${e.slot}|${itemOf(e)}`));

    const wanted = [];
    for (const usual of usuals) {
      const first = usual.startDate > today ? usual.startDate : today;
      const last = usual.endDate && usual.endDate < horizon ? usual.endDate : horizon;
      const skipped = new Set(usual.skippedDates ?? []);
      for (let date = first; date <= last; date = addDays(date, 1)) {
        if (!usual.weekdays.includes(weekdayOf(date)) || skipped.has(date) || have.has(`${usual._id}|${date}`)) continue;
        if (taken.has(`${date}|${usual.slot}|${itemOf(usual)}`)) continue;
        wanted.push({ date, slot: usual.slot, status: "planned", usual: usual._id, ...usualItemFields(usual) });
      }
    }
    if (wanted.length > 0) {
      // Two loads at once may both try; the unique (usual, date) index lets
      // only one through, and the loser's duplicates are simply dropped.
      await MealPlanEntry.insertMany(wanted, { ordered: false }).catch((error) => {
        if (error?.code !== 11000 && !error?.writeErrors?.every((e) => e.code === 11000)) throw error;
      });
    }
  }

  await removePlanned({ usual: { $ne: null }, date: { $lt: addDays(today, -USUAL_KEEP_DAYS) } });
}

// Deletes planned (never confirmed) entries, with whatever they had put on
// the grocery list.
async function removePlanned(filter) {
  const entries = await MealPlanEntry.find({ ...filter, status: "planned" }).select("_id");
  for (const entry of entries) {
    await removeMealPlanEntryContributions(entry._id).catch(() => {});
  }
  await MealPlanEntry.deleteMany({ _id: { $in: entries.map((e) => e._id) } });
}

// Clears what a usual filled in from `from` on, leaving anything confirmed.
export function removePlannedFrom(usualId, from) {
  return removePlanned({ usual: usualId, date: { $gte: from } });
}
