import type { Ingredient } from "@/src/services/ingredientApi";
import type { Meal } from "@/src/services/mealApi";
import type { MealPlanEntry, MealSlot } from "@/src/services/mealPlanApi";
import type { Recipe } from "@/src/services/recipeApi";
import type { PantryItem } from "@/src/types/pantry";

import { computeDayNutrition, scaleIngredientNutrition, scaleRecipeNutrition } from "./mealPlan";
import { pieceSizer, sizePlanned } from "./pieceSizing";
import { computePlanNeeds, type KitchenSession } from "./planNeeds";
import type { CustomUnitConversion } from "./unitConversion";

// What to eat next: suggestions for the empty slots in the plan.
//
// A suggestion is only ever a proposal. It isn't stored, and nothing
// downstream — prep, shopping, the day's totals — counts it until it's
// accepted, at which point it's ordinary planned meals. So the plan can be
// rewritten freely: change your mind, buy something else, and the
// suggestions are simply worked out again.
//
// This is a hand-weighted score, not a trained model (one person's data is
// far too little to train on; what's done with each suggestion is recorded,
// so the weights can be learned from that later). A suggestion is a main —
// a recipe or one of your saved meals — with up to two sides when the main
// leaves room and you've had them together before (rice with a fillet,
// miso soup with a bowl). Each is scored on:
//
//   fit        how close the whole plate's calories are to what that meal
//              has room for;
//   variety    how recently you had (or planned) the main;
//   protein    whether it helps where the last week ran short;
//   rating     how you've rated it (unrated sits in the middle);
//   on hand    whether the pantry covers it — or a shopping trip and prep
//              session are booked in time for what it needs;
//   habit      how often you've had it for that meal before;
//   use up     whether it uses something that's about to expire.
//
// The day is then balanced as a whole. A meal's room is its share of what
// the day has left after everything eaten and planned — the share you
// actually give that meal, learned from your log — and from each empty
// meal's best few, the set shown first is the one that brings the day
// closest to within a tenth of every target, calories above all.
//
// A recipe that takes a whole piece — one fillet, one steak — is counted at
// the size of the piece that's actually in the pantry, each piece going to
// one meal only. So is one that uses a bag already made from such a piece,
// which keeps that piece's figures. With neither there, it's counted as the
// recipe is written.

export interface Goals {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
}

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

// One thing on the plate: a recipe, or a saved meal — or, when you've put
// it beside a suggestion yourself, a portion of an ingredient.
export interface Dish extends Macros {
  key: string;
  name: string;
  recipe?: Recipe;
  meal?: Meal;
  ingredient?: Ingredient;
  // The real piece from the pantry its numbers are sized to, if any.
  piece?: string;
}

export type Factor = "fit" | "variety" | "protein" | "rating" | "onHand" | "habit" | "useUp";

export interface Suggestion extends Macros {
  main: Dish;
  sides: Dish[];
  // 0–1, for ordering, and each factor's own 0–1 behind it.
  score: number;
  factors: Record<Factor, number>;
  // Why, most telling first, in a few words each.
  reasons: string[];
  // The pantry pieces it would use.
  claims: string[];
  // For a meal that already has something planned: the calories already
  // there. With `beside`, the main *is* what's planned, and the offer —
  // and its totals — is only the sides to go with it.
  base?: number;
  beside?: boolean;
  // How many things it needs that aren't in the pantry (to buy or to prep).
  missing?: number;
  // What it would use is still frozen, too late to thaw for the day.
  frozen?: boolean;
}

// The offers by "date|slot", and a way to score what was planned in a slot
// instead of its offer.
export type Suggestions = Map<string, Suggestion[]> & {
  rate: (
    date: string,
    slot: MealSlot,
    planned: MealPlanEntry[],
  ) => {
    score: number;
    factors: Record<Factor, number>;
    calories: number;
  } | null;
  // What else could go beside an offer's main, likeliest first.
  sidesFor: (offer: Suggestion) => Dish[];
  // Anything by name — recipes, saved meals, ingredients (a portion each).
  find: (query: string) => Dish[];
  // The calories a day is aimed at once the week so far is counted, and
  // how far over (+) or under the week had run coming into it.
  aim: (date: string) => { aim: number; carry: number } | null;
};

// How a day's calories are shared between its meals, until your own log
// says how you share them (see `shares` below).
const SLOT_SHARE: Record<MealSlot, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.35,
  snack: 0.05,
};
export const SUGGESTION_WEIGHTS: Record<Factor, number> = {
  fit: 0.22,
  variety: 0.18,
  protein: 0.13,
  rating: 0.13,
  onHand: 0.14,
  habit: 0.1,
  useUp: 0.1,
};

const idOf = (value: unknown): string => (typeof value === "string" ? value : typeof value === "object" && value !== null && "_id" in value ? String((value as { _id?: unknown })._id ?? "") : "");
const clamp = (n: number, low = 0, high = 1) => Math.max(low, Math.min(high, n));
const daysApart = (a: string, b: string) => Math.abs(Math.round((Date.parse(`${a}T12:00:00`) - Date.parse(`${b}T12:00:00`)) / 86_400_000));
const dishKey = (entry: MealPlanEntry) => (entry.recipe ? `r:${idOf(entry.recipe)}` : entry.meal ? `m:${idOf(entry.meal)}` : "");

// A dish as a planned entry would hold it, for the helpers that take entries.
const asEntry = (dish: Dish, date: string, slot: MealSlot) =>
  ({
    _id: "",
    date,
    slot,
    status: "planned",
    ...(dish.recipe
      ? { recipe: dish.recipe, recipeServings: 1 }
      : dish.ingredient
        ? { ingredient: dish.ingredient, ingredientQuantity: dish.ingredient.defaultPortionAmount || 1, ingredientUnit: dish.ingredient.defaultPortionUnit ?? "" }
        : { meal: dish.meal }),
  }) as unknown as MealPlanEntry;

export function suggestMeals({
  slots,
  started = [],
  entries: logged,
  later = [],
  recipes,
  meals,
  ingredients,
  pantryItems,
  conversions,
  goals,
  sessions,
  today,
  weekStartDay = 1,
  count = 4,
}: {
  // The empty slots to fill, in any order.
  slots: { date: string; slot: MealSlot }[];
  // Slots with something planned but not eaten: offered what would go
  // with it, while the meal is well short of its usual size.
  started?: { date: string; slot: MealSlot }[];
  // What's been eaten (as far back as there is) and everything planned.
  entries: MealPlanEntry[];
  // Meals planned after the days being filled. They count for nothing
  // here but the pantry pieces they'll take, which aren't offered.
  later?: MealPlanEntry[];
  recipes: Recipe[];
  meals: Meal[];
  ingredients: Ingredient[];
  pantryItems: PantryItem[];
  conversions: CustomUnitConversion[];
  goals: Goals;
  sessions: KitchenSession[];
  today: string;
  // The day the week starts on (0 = Sunday), for the weekly balance.
  weekStartDay?: number;
  // How many to offer per slot.
  count?: number;
}): Suggestions {
  const out: Suggestions = Object.assign(new Map<string, Suggestion[]>(), {
    rate: () => null,
    sidesFor: () => [],
    find: () => [],
    aim: () => null,
  });
  if (!goals.calories) return out;
  const dayGoal = goals.calories;
  // The meals already planned take their pieces from the pantry first, and
  // count at those; `stock` is what's left for the suggestions.
  const planned = sizePlanned([...logged, ...later], recipes, ingredients, pantryItems, conversions, today, dayGoal);
  const laterIds = new Set(later.map((e) => e._id));
  const entries = planned.entries.filter((e) => !laterIds.has(e._id));
  let stock = planned.stock;

  // --- What there is to suggest ---
  const macros = (entry: MealPlanEntry): Macros => {
    const n = entry.recipe ? scaleRecipeNutrition(entry.recipe, 1) : computeDayNutrition([entry], conversions);
    return {
      calories: n.calories ?? 0,
      protein: n.protein ?? 0,
      carbs: n.carbs ?? 0,
      fats: n.fats ?? 0,
    };
  };
  // Recipes that only make a component for other recipes (a stock, a
  // marinated fillet) are never served. Rice cooked for the meal is.
  const component = new Set(ingredients.filter((i) => !i.isMealPrep && idOf(i.productionRecipe)).map((i) => idOf(i.productionRecipe)));
  const supplement = (recipe: Recipe) => /supplement/i.test(typeof recipe.recipeCategory === "object" && recipe.recipeCategory ? recipe.recipeCategory.name : "");
  const recipeDishes: Dish[] = recipes
    .filter((r) => !r.isArchived && !supplement(r) && !(component.has(r._id) && r.madeAhead))
    .map((recipe) => ({
      key: `r:${recipe._id}`,
      name: recipe.name,
      recipe,
      ...macros({ recipe } as unknown as MealPlanEntry),
    }))
    .filter((d) => d.calories > 0);
  const mealDishes: Dish[] = meals
    .filter((m) => !m.isArchived)
    .map((meal) => ({
      key: `m:${meal._id}`,
      name: meal.name,
      meal,
      ...macros({ meal, status: "planned" } as unknown as MealPlanEntry),
    }))
    .filter((d) => d.calories > 0);

  // --- The real pieces in the pantry ---
  const size = pieceSizer(recipes, ingredients, conversions);
  // A dish at the size of the pieces it would get from `from`, and which.
  const MACROS = ["calories", "protein", "carbs", "fats"] as const;
  const sized = (dish: Dish, from: PantryItem[], want?: { calories: number; date: string }): { dish: Dish; claims: string[] } => {
    if (!dish.recipe) return { dish, claims: [] };
    const { shift, claims, piece } = size(dish.recipe, from, 1, want ? { ...want, base: dish.calories } : {});
    if (!claims.length) return { dish, claims };
    const out = { ...dish, piece };
    for (const m of MACROS) out[m] = Math.max(0, out[m] + shift[m]);
    return { dish: out, claims };
  };

  // --- What the log says about habits ---
  // How often each dish has been had for each meal, and with what.
  const hadFor = new Map<string, number>();
  const hadWith = new Map<string, Map<string, number>>();
  const together = new Map<string, string[]>();
  for (const entry of entries) {
    const key = dishKey(entry);
    if (!key) continue;
    hadFor.set(`${key}|${entry.slot}`, (hadFor.get(`${key}|${entry.slot}`) ?? 0) + 1);
    const plate = `${entry.date}|${entry.slot}`;
    together.set(plate, [...(together.get(plate) ?? []), key]);
  }
  for (const plate of together.values()) {
    for (const a of plate) for (const b of plate) if (a !== b) hadWith.set(a, new Map(hadWith.get(a)).set(b, (hadWith.get(a)?.get(b) ?? 0) + 1));
  }
  // A side is something you've had alongside other things at least once.
  const sideUse = (key: string) => [...(hadWith.get(key)?.values() ?? [])].reduce((sum, n) => sum + n, 0);
  const mostHad = Math.max(1, ...hadFor.values());

  // Where the last week ran short on protein: 0 = on target, 1 = far under.
  const eaten = entries.filter((e) => e.status === "confirmed" && e.date < today && daysApart(e.date, today) <= 7);
  const loggedDays = new Set(eaten.map((e) => e.date)).size;
  const weekTotals = computeDayNutrition(eaten, conversions);
  const proteinShort = goals.protein && loggedDays ? clamp((goals.protein - (weekTotals.protein ?? 0) / loggedDays) / goals.protein, 0, 0.5) * 2 : 0;
  const targetDensity = goals.protein ? goals.protein / dayGoal : 0;

  // Soon-to-expire stock, by ingredient.
  const expiring = new Map<string, string>();
  for (const item of pantryItems) {
    if (!item.expiryDate || (item.quantityAvailable ?? 0) <= 0) continue;
    const date = item.expiryDate.slice(0, 10);
    const id = idOf(item.ingredient);
    if (date >= today && (!expiring.has(id) || date < expiring.get(id)!)) expiring.set(id, date);
  }
  const ingredientName = new Map(ingredients.map((i) => [i._id, i.name]));

  // What's had or planned already; each day's picks join it, so the week
  // isn't filled with one dish.
  const taken: { date: string; key: string }[] = entries.map((e) => ({ date: e.date, key: dishKey(e) })).filter((t) => t.key);

  // How you share a day between its meals: each meal's part of the day's
  // calories, averaged over the days you logged fully. With too few such
  // days, the usual split stands.
  const shares: Record<MealSlot, number> = { ...SLOT_SHARE };
  {
    const perDay = new Map<string, Record<string, number>>();
    for (const e of entries) {
      if (e.status !== "confirmed" || e.date >= today) continue;
      const kcal = computeDayNutrition([e], conversions).calories ?? 0;
      const day = perDay.get(e.date) ?? {};
      day[e.slot] = (day[e.slot] ?? 0) + kcal;
      perDay.set(e.date, day);
    }
    const full = [...perDay.values()].filter((day) => Object.values(day).reduce((sum, n) => sum + n, 0) >= dayGoal * 0.6);
    if (full.length >= 5) {
      for (const slot of Object.keys(shares) as MealSlot[]) {
        shares[slot] = full.reduce((sum, day) => sum + (day[slot] ?? 0) / Object.values(day).reduce((t, n) => t + n, 0), 0) / full.length;
      }
    }
  }

  // How many times each side has gone beside a pick so far.
  const sideCount = new Map<string, number>();

  // Each target, how much it matters, and how near counts as on it:
  // calories within 5%, the rest within 10%.
  const TARGETS: [keyof Macros, number | null, number, number][] = [
    ["calories", dayGoal, 8, 0.05],
    ["protein", goals.protein, 4, 0.1],
    ["carbs", goals.carbs, 0.75, 0.1],
    ["fats", goals.fats, 0.75, 0.1],
  ];
  // How far a day's totals fall outside that.
  // (Calories against the day's own aim: see the weekly balance below.)
  let aim = dayGoal;
  const offTarget = (totals: Macros) =>
    TARGETS.reduce((sum, [key, set, weight, near]) => {
      const goal = key === "calories" ? aim : set;
      return goal ? sum + weight * Math.max(0, Math.abs(totals[key] - goal) / goal - near) : sum;
    }, 0);

  // The week is kept to its calories more tightly than any one day. A day
  // may land 5% either side of its aim, but the aim itself moves against
  // what the week has run over or under so far — eaten, planned and
  // suggested — spread over the days left and never by more than 5% of the
  // goal, so the misses cancel instead of adding up (5% over every day is
  // 700 kcal by the end of a 2,000 kcal week). Days in the past that
  // weren't logged in full say nothing, and are left out.
  const shiftDate = (date: string, days: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const suggestedKcal = new Map<string, number>();
  const weekSoFar = (date: string) => {
    const into = (new Date(`${date}T12:00:00`).getDay() - weekStartDay + 7) % 7;
    let carry = 0;
    for (let back = into; back > 0; back--) {
      const day = shiftDate(date, -back);
      const total = (computeDayNutrition(entries.filter((e) => e.date === day), conversions).calories ?? 0) + (suggestedKcal.get(day) ?? 0);
      if (total >= dayGoal * 0.6) carry += total - dayGoal;
    }
    return { aim: dayGoal - clamp(carry / (7 - into), -dayGoal * 0.05, dayGoal * 0.05), carry };
  };
  const aimFor = (date: string) => weekSoFar(date).aim;


  // What's planned in an entry, as a dish.
  const entryDish = (entry: MealPlanEntry): Dish => {
    const key = dishKey(entry);
    const known = [...recipeDishes, ...mealDishes].find((d) => d.key === key);
    const n = computeDayNutrition([entry], conversions);
    return {
      key,
      name: known?.name ?? entry.ingredient?.name ?? "",
      recipe: known?.recipe,
      meal: known?.meal,
      calories: n.calories ?? 0,
      protein: n.protein ?? 0,
      carbs: n.carbs ?? 0,
      fats: n.fats ?? 0,
    };
  };
  const sum = (dishes: Macros[]): Macros =>
    dishes.reduce<Macros>(
      (t, d) => ({
        calories: t.calories + d.calories,
        protein: t.protein + d.protein,
        carbs: t.carbs + d.carbs,
        fats: t.fats + d.fats,
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 },
    );

  // Sides for a main, while there's room: what you've had with it, or
  // what you often have beside things.
  const besides = (main: Dish, room: number, skip: string[] = [], whatever = false) => {
    const sides: Dish[] = [];
    let left = room;
    while (sides.length < 2 && left > 60) {
      const best = recipeDishes
        // (A side is light on protein, or small: a fillet isn't a side.)
        .filter((d) => d.key !== main.key && !skip.includes(d.key) && !sides.includes(d) && d.calories <= left * 1.2 && sideUse(d.key) > 0 && (d.protein < 12 || d.calories < 150))
        // (Less each time it's already been put beside something this week.)
        .map((d) => ({
          d,
          pull: (hadWith.get(main.key)?.get(d.key) ?? 0) * 3 + Math.min(3, sideUse(d.key)) * 0.5 - (sideCount.get(d.key) ?? 0) * 0.75,
        }))
        // Without having been had together, only a well-used side is added
        // (unless sides are all that's being asked for).
        .filter((s) => whatever || s.pull >= 1.5)
        .sort((a, b) => b.pull - a.pull || Math.abs(left - a.d.calories) - Math.abs(left - b.d.calories))[0];
      if (!best) break;
      sides.push(best.d);
      left -= best.d.calories;
    }
    return sides;
  };

  // How a plate scores for a slot: each factor's 0–1, the weighted score,
  // and why. `planned` is the plate as plan entries; `before` is what was
  // had or planned when the slot came up.
  const rate = (main: Dish, dishes: Dish[], total: Macros, planned: MealPlanEntry[], date: string, slot: MealSlot, room: number, before: { date: string; key: string }[], pantry: PantryItem[]) => {
    const reasons: [number, string][] = [];
    if (main.piece) reasons.push([0.58, `sized to your ${main.piece}`]);

    const fit = 1 - clamp(Math.abs(total.calories - room) / room);
    if (fit > 0.8) reasons.push([fit * 0.6, `fits the ${Math.round(room / 10) * 10} kcal there's room for`]);

    const density = targetDensity && total.calories ? total.protein / total.calories / targetDensity : 1;
    const protein = clamp(0.5 + (density - 1) * 0.5) * (0.5 + proteinShort * 0.5);
    if (proteinShort > 0.2 && density > 1.2) reasons.push([0.5 + proteinShort * 0.4, "high in protein, which you've been short of"]);

    const recent = (main.recipe?.scores ?? []).slice(-3);
    const rated = recent.length ? recent.reduce((sum, s) => sum + s.value, 0) / recent.length : null;
    const rating = rated == null ? 0.55 : clamp(rated / 10);
    if (rated != null && rated >= 7.5) reasons.push([rating * 0.7, `you rated it ${Math.round(rated * 10) / 10}`]);

    // What it would take to have it on that day, were it planned.
    const needs = computePlanNeeds(planned, recipes, ingredients, pantry, conversions, sessions, today);
    // (What it would use is in the freezer, with no time left to thaw it.)
    const frozen = needs.tasks.some((t) => t.kind === "thaw" && t.late);
    const missing = needs.buy.length + needs.prep.length;
    const covered = [...needs.buy, ...needs.prep].every((n) => n.session);
    const onHand = missing === 0 ? 1 : clamp((covered ? 0.7 : 0.3) - (missing - 1) * 0.05, 0.05);
    if (missing === 0) reasons.push([0.75, "everything's in the pantry"]);
    else if (covered) reasons.push([0.3, `needs ${missing} thing${missing === 1 ? "" : "s"}, which your booked trip or prep covers`]);
    else reasons.push([0.1, `needs ${missing} thing${missing === 1 ? "" : "s"} you don't have`]);

    const times = hadFor.get(`${main.key}|${slot}`) ?? 0;
    const habit = clamp(times / Math.min(mostHad, 8));
    if (times >= 3) reasons.push([0.55, `you've had it for ${slot} ${times} times`]);

    const soon = dishes
      .flatMap((d) => d.recipe?.ingredientList ?? [])
      .map((line) => idOf(line.ingredient))
      .filter((id) => expiring.has(id) && daysApart(expiring.get(id)!, date) <= 4);
    const useUp = clamp(soon.length * 0.5);
    if (soon.length) reasons.push([0.9, `uses up ${ingredientName.get(soon[0]) ?? "something"}${soon.length > 1 ? ` and ${soon.length - 1} more` : ""} before it expires`]);

    const nearest = Math.min(...before.filter((t) => t.key === main.key).map((t) => daysApart(t.date, date)), 99);
    const variety = nearest <= 1 ? 0 : nearest <= 3 ? 0.15 : nearest <= 6 ? 0.55 : 1;

    const factors: Record<Factor, number> = {
      fit,
      variety,
      protein,
      rating,
      onHand,
      habit,
      useUp,
    };
    const score = (Object.keys(SUGGESTION_WEIGHTS) as Factor[]).reduce((sum, f) => sum + SUGGESTION_WEIGHTS[f] * factors[f], 0);
    return {
      missing,
      frozen,
      score,
      factors,
      reasons: reasons
        .sort((a, b) => b[0] - a[0])
        .slice(0, 2)
        .map((r) => r[1]),
    };
  };

  // Each open slot's room and what had been taken when it came up, kept so
  // that what's planned there instead can be scored the same way.
  const context = new Map<string, { room: number; before: number }>();

  // What can be had as a snack: recipes marked for it, saved meals and
  // single things (a bar, a shake — one portion) you've had as one.
  const snackPool: Dish[] = [
    ...recipeDishes.filter((d) => d.recipe!.mealCategory?.includes("snack") && (hadFor.get(`${d.key}|snack`) ?? 0) > 0),
    ...mealDishes.filter((d) => (hadFor.get(`${d.key}|snack`) ?? 0) > 0),
    ...[...new Set(entries.filter((e) => e.slot === "snack" && e.ingredient).map((e) => idOf(e.ingredient)))].flatMap((id) => {
      const ingredient = ingredients.find((i) => i._id === id);
      if (!ingredient || ingredient.isArchived) return [];
      const n = scaleIngredientNutrition(ingredient, ingredient.defaultPortionAmount || 1);
      const dish: Dish = { key: `i:${id}`, name: ingredient.name, ingredient, calories: n.calories ?? 0, protein: n.protein ?? 0, carbs: n.carbs ?? 0, fats: n.fats ?? 0 };
      // (Not a vitamin or a cup of tea.)
      return dish.calories >= 50 ? [dish] : [];
    }),
  ];
  const snackTimes = (key: string) => (key.startsWith("i:") ? entries.filter((e) => e.slot === "snack" && idOf(e.ingredient) === key.slice(2)).length : (hadFor.get(`${key}|snack`) ?? 0));

  // A meal with something planned is still offered more while it holds
  // less than this much of its usual size.
  const STARTED_BELOW = 0.6;

  for (const date of [...new Set([...slots, ...started].map((s) => s.date))].sort()) {
    aim = aimFor(date);
    const dayEntries = entries.filter((e) => e.date === date);
    const n = computeDayNutrition(dayEntries, conversions);
    const committed: Macros = {
      calories: n.calories ?? 0,
      protein: n.protein ?? 0,
      carbs: n.carbs ?? 0,
      fats: n.fats ?? 0,
    };
    const shortlist = new Map<MealSlot, Suggestion[]>();
    const rooms = new Map<MealSlot, number>();

    // What's already in the started meals; a main among it is the largest
    // thing with a main's protein.
    const begun = new Map<MealSlot, { dishes: Dish[]; calories: number; main: Dish | null }>();
    for (const s of started.filter((x) => x.date === date)) {
      // (A meal out comes as it comes: nothing is offered beside it.)
      if (dayEntries.some((e) => e.slot === s.slot && e.restaurantMeal)) continue;
      const dishes = dayEntries.filter((e) => e.slot === s.slot).map(entryDish);
      const main = dishes.filter((d) => d.protein >= (s.slot === "breakfast" ? 8 : 12) && d.calories >= 150).sort((x, y) => y.calories - x.calories)[0] ?? null;
      begun.set(s.slot, { dishes, calories: sum(dishes).calories, main });
    }
    let open = [...slots.filter((s) => s.date === date).map((s) => s.slot), ...begun.keys()];
    // A meal's room is its part of what the day has left once everything
    // outside the open meals is counted — but never much more than you'd
    // usually eat at it: a light day so far isn't made up for with one
    // enormous dinner.
    const roomOf = (slot: MealSlot) => {
      const fixed = committed.calories - open.reduce((t, o) => t + (begun.get(o)?.calories ?? 0), 0);
      const openShare = open.reduce((t, o) => t + shares[o], 0) || 1;
      return Math.max(150, Math.min(((aim - fixed) * shares[slot]) / openShare, dayGoal * shares[slot] * 1.3));
    };
    // (A started meal that's near enough full is left alone.)
    const full = open.filter((slot) => begun.has(slot) && begun.get(slot)!.calories >= roomOf(slot) * STARTED_BELOW);
    open = open.filter((slot) => !full.includes(slot));

    for (const slot of open) {
      const base = begun.get(slot);
      const whole = roomOf(slot);
      rooms.set(slot, whole);
      // What there's room for beyond what's planned there.
      const room = whole - (base?.calories ?? 0);
      context.set(`${date}|${slot}`, { room, before: taken.length });
      const scored: Suggestion[] = [];

      // A main is planned: only sides to go with it.
      if (base?.main) {
        const sides = besides(base.main, room, base.dishes.map((d) => d.key), true);
        if (sides.length) {
          const rated = rate(base.main, [...base.dishes, ...sides], sum([...base.dishes, ...sides]), [...dayEntries.filter((e) => e.slot === slot), ...sides.map((d) => asEntry(d, date, slot))], date, slot, whole, taken, stock);
          scored.push({
            main: base.main,
            sides,
            ...sum(sides),
            ...rated,
            reasons: [base.main.name ? `goes with your ${base.main.name}` : "goes with what you've planned"],
            claims: [],
            base: base.calories,
            beside: true,
          });
        }
        shortlist.set(slot, scored);
        continue;
      }

      const mains = [
        // A recipe says which meals it's for; a saved meal is offered where you've had it.
        ...recipeDishes.filter((d) => !d.recipe!.mealCategory?.length || d.recipe!.mealCategory.includes(slot)),
        ...mealDishes.filter((d) => (hadFor.get(`${d.key}|${slot}`) ?? 0) > 0),
      ];
      for (const candidate of mains) {
        // (A main is most of a plate; with sides planned already, the rest of it.)
        const { dish: main, claims } = sized(candidate, stock, { calories: base ? room : room * 0.75, date });
        // A side or a bowl of rice isn't a meal on its own.
        if (main.calories < room * 0.3 || main.protein < (slot === "breakfast" ? 8 : 12)) continue;
        if (base?.dishes.some((d) => d.key === main.key)) continue;

        // Sides while there's room — unless sides are what's planned
        // already, and this is the main to go with them.
        const sides = main.recipe && !base ? besides(main, room - main.calories) : [];
        const plate = [main, ...sides];
        const total = sum(plate);
        const rated = rate(
          main,
          plate,
          total,
          plate.map((d) => asEntry(d, date, slot)),
          date,
          slot,
          room,
          taken,
          stock,
        );
        if (rated.frozen) continue;
        const had = base ? base.dishes.reduce((t, d) => t + (hadWith.get(main.key)?.get(d.key) ?? 0), 0) : 0;
        if (had) {
          rated.score += Math.min(1, had / 3) * 0.15;
          rated.reasons.unshift(`you've had it with ${base!.dishes.find((d) => hadWith.get(main.key)?.get(d.key))!.name}`);
        }
        scored.push({
          main,
          sides,
          ...total,
          ...rated,
          claims,
          ...(base ? { base: base.calories } : {}),
        });
      }

      shortlist.set(slot, scored.sort((x, y) => y.score - x.score).slice(0, 6));
    }

    // Of each meal's best few, the set that lands the day nearest its
    // targets goes first; the rest stay behind it, in their own order.
    let chosen: Suggestion[] = [];
    let chosenValue = -Infinity;
    const pick = (index: number, picked: Suggestion[]) => {
      if (index === open.length) {
        const totals = picked.reduce(
          (sum, p) => ({
            calories: sum.calories + p.calories,
            protein: sum.protein + p.protein,
            carbs: sum.carbs + p.carbs,
            fats: sum.fats + p.fats,
          }),
          committed,
        );
        const value = picked.reduce((sum, p) => sum + p.score, 0) - 6 * offTarget(totals);
        if (value > chosenValue) {
          chosenValue = value;
          chosen = picked;
        }
        return;
      }
      const options = shortlist.get(open[index]) ?? [];
      // (Not the same thing twice in a day, nor the same piece.)
      const free = options.filter((option) => !picked.some((p) => (p.main.key && p.main.key === option.main.key) || p.claims.some((c) => option.claims.includes(c))));
      // (A meal with nothing left to choose from doesn't hold up the rest.)
      if (!free.length) pick(index + 1, picked);
      for (const option of free) pick(index + 1, [...picked, option]);
    };
    pick(0, []);

    // (Whether a snack could still be suggested for the day.)
    const snackOpen = snackPool.length > 0 && !dayEntries.some((e) => e.slot === "snack");

    // Then the sides are tuned to what the day is still short of or over
    // on: one added or taken away at a time, while that brings the day
    // nearer its targets and no plate grows past what its meal has room for.
    const dayTotals = () =>
      chosen.reduce(
        (sum, p) => ({
          calories: sum.calories + p.calories,
          protein: sum.protein + p.protein,
          carbs: sum.carbs + p.carbs,
          fats: sum.fats + p.fats,
        }),
        committed,
      );
    const shift = (totals: Macros, d: Dish, sign: number): Macros => ({
      calories: totals.calories + sign * d.calories,
      protein: totals.protein + sign * d.protein,
      carbs: totals.carbs + sign * d.carbs,
      fats: totals.fats + sign * d.fats,
    });
    for (let round = 0; round < 10; round++) {
      const totals = dayTotals();
      const off = offTarget(totals);
      if (off === 0) break;
      const onDay = new Set([...dayEntries.map(dishKey), ...chosen.flatMap((p) => [p.main.key, ...p.sides.map((d) => d.key)])]);
      let best: {
        plate: Suggestion;
        side: Dish;
        sign: number;
        gain: number;
      } | null = null;
      for (const plate of chosen) {
        if (!plate.main.recipe) continue;
        const slot = open.find((o) => shortlist.get(o)?.includes(plate))!;
        for (const side of plate.sides) {
          const gain = off - offTarget(shift(totals, side, -1));
          if (gain > (best?.gain ?? 0.01)) best = { plate, side, sign: -1, gain };
        }
        // (A third side only where there's no snack to close the gap with.)
        if (plate.sides.length >= (snackOpen ? 2 : 3)) continue;
        for (const side of recipeDishes) {
          if (onDay.has(side.key) || sideUse(side.key) <= 0 || !(side.protein < 12 || side.calories < 150)) continue;
          if (plate.calories + (plate.base ?? 0) + side.calories > (rooms.get(slot) ?? 0) * 1.35) continue;
          const gain = off - offTarget(shift(totals, side, 1)) - (sideCount.get(side.key) ?? 0) * 0.02;
          if (gain > (best?.gain ?? 0.01)) best = { plate, side, sign: 1, gain };
        }
      }
      if (!best) break;
      const { plate, side, sign } = best;
      plate.sides = sign > 0 ? [...plate.sides, side] : plate.sides.filter((d) => d !== side);
      Object.assign(plate, shift(plate, side, sign));
      const room = rooms.get(open.find((o) => shortlist.get(o)?.includes(plate))!) ?? 0;
      if (Math.abs(plate.calories + (plate.base ?? 0) - room) > room * 0.2) plate.reasons = plate.reasons.filter((r) => !r.startsWith("fits the"));
    }

    for (const slot of open) {
      // (Sides for a planned main, all tuned away, are no offer at all.)
      const mine = shortlist.get(slot) ?? [];
      const first = chosen.find((c) => mine.includes(c));
      // (Nor what another meal that day has been given, or its piece.)
      const elsewhere = chosen.filter((c) => c !== first && !c.beside);
      const options = mine.filter((o) => (!o.beside || o.sides.length) && !elsewhere.some((c) => (c.main.key && c.main.key === o.main.key) || c.claims.some((id) => o.claims.includes(id))));
      out.set(`${date}|${slot}`, (first ? [first, ...options.filter((o) => o !== first)] : options).slice(0, count));
      if (first) {
        suggestedKcal.set(date, (suggestedKcal.get(date) ?? 0) + first.calories);
        if (!first.beside) taken.push({ date, key: first.main.key });
        stock = stock.filter((p) => !first.claims.includes(p._id));
        for (const side of first.sides) sideCount.set(side.key, (sideCount.get(side.key) ?? 0) + 1);
      }
    }

    // What the day is still short of, once its meals are settled, is
    // offered as a snack: the one (of those you have) that brings the day
    // nearest its targets.
    const settled = dayTotals();
    const gap = aim - settled.calories;
    if (snackOpen && gap > aim * 0.05) {
      const off = offTarget(settled);
      const snacks = snackPool
        .filter((d) => d.calories <= gap * 1.3 + 50)
        .map((d) => ({ d, gain: off - offTarget(shift(settled, d, 1)) + Math.min(5, snackTimes(d.key)) * 0.02 }))
        .filter((x) => x.gain > 0.02)
        .sort((x, y) => y.gain - x.gain)
        .slice(0, count)
        .map(({ d }) => {
          const rated = rate(d, [d], d, [asEntry(d, date, "snack")], date, "snack", Math.max(gap, 50), taken, stock);
          return { main: d, sides: [], calories: d.calories, protein: d.protein, carbs: d.carbs, fats: d.fats, ...rated, reasons: [`closes the ${Math.round(gap / 10) * 10} kcal the day is short`, ...rated.reasons], claims: [] } as Suggestion;
        });
      if (snacks.length) {
        out.set(`${date}|snack`, snacks);
        suggestedKcal.set(date, (suggestedKcal.get(date) ?? 0) + snacks[0].calories);
        taken.push({ date, key: snacks[0].main.key });
      }
    }
  }
  // What was planned in a slot instead of its suggestion, scored as the
  // suggestion was: the pair is what the weights can later be fitted to.
  out.rate = (date, slot, planned) => {
    const at = context.get(`${date}|${slot}`);
    if (!at || !planned.length) return null;
    const dishes: Dish[] = planned.map(entryDish);
    const main = dishes.reduce((most, d) => (d.calories > most.calories ? d : most));
    const total = dishes.reduce(
      (sum, d) => ({
        calories: sum.calories + d.calories,
        protein: sum.protein + d.protein,
        carbs: sum.carbs + d.carbs,
        fats: sum.fats + d.fats,
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 },
    );
    const { score, factors } = rate(main, dishes, total, planned, date, slot, at.room, taken.slice(0, at.before), pantryItems);
    return { score, factors, calories: total.calories };
  };
  out.sidesFor = (offer) =>
    !offer.main.recipe
      ? []
      : recipeDishes
          .filter((d) => d.key !== offer.main.key && !offer.sides.some((s) => s.key === d.key) && sideUse(d.key) > 0 && (d.protein < 12 || d.calories < 150))
          .map((d) => ({
            d,
            pull: (hadWith.get(offer.main.key)?.get(d.key) ?? 0) * 3 + Math.min(3, sideUse(d.key)) * 0.5,
          }))
          .sort((a, b) => b.pull - a.pull)
          .map((s) => s.d);
  out.aim = weekSoFar;
  out.find = (query) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const portions: Dish[] = ingredients
      .filter((i) => !i.isArchived && i.name.toLowerCase().includes(q))
      .map((ingredient) => {
        const n = scaleIngredientNutrition(ingredient, ingredient.defaultPortionAmount || 1);
        return {
          key: `i:${ingredient._id}`,
          name: ingredient.name,
          ingredient,
          calories: n.calories ?? 0,
          protein: n.protein ?? 0,
          carbs: n.carbs ?? 0,
          fats: n.fats ?? 0,
        };
      });
    // Names that start with it before names that only contain it.
    const starts = (d: Dish) => (d.name.toLowerCase().startsWith(q) ? 0 : 1);
    return [...recipeDishes, ...mealDishes]
      .filter((d) => d.name.toLowerCase().includes(q))
      .concat(portions)
      .sort((a, b) => starts(a) - starts(b));
  };
  return out;
}
