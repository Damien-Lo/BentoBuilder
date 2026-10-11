import type { Ingredient } from "@/src/services/ingredientApi";
import type { MealPlanEntry } from "@/src/services/mealPlanApi";
import type { Recipe } from "@/src/services/recipeApi";
import type { PantryItem } from "@/src/types/pantry";

import { countQualifyingPantryPieces, getIngredientStockInUnit } from "./ingredientStock";
import { gatherRows, recipeLineToRow, type RawRow } from "./pantryDeduction";
import { convertUnits, getIngredientConversions, type CustomUnitConversion } from "./unitConversion";

// What the plan needs doing before it can be eaten.
//
// The meal plan is the only thing anyone commits to. From it and the pantry
// this works out, fresh every time, two lists:
//
//   prep   things you make ahead — an ingredient with a recipe that
//          produces it (a vacuum-sealed fillet, a stock) that the plan needs
//          more of than is in stock;
//   buy    plain ingredients the plan (or that prepping) needs and the
//          pantry is short of.
//
// Nothing here is stored. Change the plan or the pantry and the lists
// change with them — which is what lets a recommender or a change of mind
// rewrite the plan without anything downstream being left wrong.
//
// The meals are taken in date order, each claiming stock before the next,
// so two dinners that both want the last of something don't both count it.
// (Unlike the planner's per-meal "add missing to grocery list", which
// looks at one meal alone.)

// A prep session or shopping trip from the Kitchen calendar, today or later.
export interface KitchenSession {
  // (One occurrence of a repeating session: its event and its day.)
  id: string;
  eventId: string;
  kind: "prep" | "shop";
  date: string;
  startMinutes: number;
  endMinutes: number;
  title: string;
}

export interface NeedSource {
  date: string;
  label: string;
}

export interface PrepNeed {
  ingredientId: string;
  name: string;
  recipeId: string;
  recipeName: string;
  // How much more of it the plan needs, in the ingredient's own unit.
  amount: number;
  unit: string;
  // The same, as runs of its recipe (1.5 = one and a half batches).
  batches: number;
  // The first day something needs it.
  neededBy: string;
  for: NeedSource[];
  // The prep session to make it in — the last one on or before the day
  // it's needed — or null when there's none in time.
  session: string | null;
}

export interface BuyNeed {
  ingredientId: string;
  name: string;
  amount: number;
  unit: string;
  // Whole pieces (2 fillets) rather than a measured amount.
  pieces: boolean;
  // The day it has to be in the house: the meal's, or the prep session's
  // when it's for something made ahead.
  neededBy: string;
  for: NeedSource[];
  // The shopping trip to get it on, or null when there's none in time.
  session: string | null;
}

const idOf = (value: unknown): string =>
  typeof value === "string" ? value : typeof value === "object" && value !== null && "_id" in value ? String((value as { _id?: unknown })._id ?? "") : "";

const SLOT_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };

function entryLabel(entry: MealPlanEntry): string {
  return entry.meal?.name ?? entry.recipe?.name ?? entry.ingredient?.name ?? "A meal";
}

export function computePlanNeeds(
  // The meals still to come (planned, not yet eaten).
  entries: MealPlanEntry[],
  recipes: Recipe[],
  ingredients: Ingredient[],
  pantryItems: PantryItem[],
  globalConversions: CustomUnitConversion[],
  // The sessions still to come; without any, everything is unscheduled.
  sessions: KitchenSession[] = [],
): { prep: PrepNeed[]; buy: BuyNeed[] } {
  // The last session of a kind on or before `date`.
  const sessionBy = (kind: KitchenSession["kind"], date: string) =>
    sessions
      .filter((s) => s.kind === kind && s.date <= date)
      .sort((a, b) => b.date.localeCompare(a.date) || b.startMinutes - a.startMinutes)[0] ?? null;

  const recipeMap = new Map(recipes.map((r) => [r._id, r]));
  const ingredientMap = new Map(ingredients.map((i) => [i._id, i]));
  // What's left of each ingredient after the meals so far have claimed
  // theirs: an amount in its own unit, or a count of usable pieces.
  const left = new Map<string, number>();
  const prep = new Map<string, PrepNeed>();
  const buy = new Map<string, BuyNeed>();

  const note = <T extends { amount: number; neededBy: string; for: NeedSource[] }>(need: T, amount: number, source: NeedSource, due: string) => {
    need.amount += amount;
    if (due < need.neededBy) need.neededBy = due;
    if (!need.for.some((f) => f.date === source.date && f.label === source.label)) need.for.push(source);
  };

  // `due` is the day the ingredient has to be on hand: the meal's day, or
  // the prep session's for what goes into something made ahead.
  function require(row: RawRow, source: NeedSource, due: string, making: Set<string>) {
    const ing = ingredientMap.get(row.ingredientId);
    if (!ing || ing.isAlwaysAvailable || !(row.quantity > 0)) return;
    const conversions = getIngredientConversions(ing, globalConversions, ingredients);

    if (row.matchMode === "wholePiece") {
      const key = `${ing._id}|pieces|${row.pieceMinWeight}|${row.pieceMaxWeight}|${row.pieceWeightUnit}`;
      if (!left.has(key)) {
        left.set(key, countQualifyingPantryPieces(ing, row.pieceMinWeight ?? 0, row.pieceMaxWeight ?? Infinity, row.pieceWeightUnit ?? "g", ingredients, pantryItems, globalConversions));
      }
      const have = left.get(key)!;
      const used = Math.min(have, row.quantity);
      left.set(key, have - used);
      const short = row.quantity - used;
      if (short > 0) {
        const trip = sessionBy("shop", due);
        const needKey = `${key}|${trip?.id}`;
        const need = buy.get(needKey) ?? { ingredientId: ing._id, name: ing.name, amount: 0, unit: row.unit || ing.pieceLabel || "piece", pieces: true, neededBy: due, for: [], session: trip?.id ?? null };
        buy.set(needKey, need);
        note(need, short, source, due);
      }
      return;
    }

    // A measured amount, in the ingredient's own unit where it converts.
    const native = ing.defaultPortionUnit || row.unit;
    const converted = convertUnits(row.quantity, row.unit, native, conversions);
    const unit = converted == null ? row.unit : native;
    const needed = converted ?? row.quantity;
    const key = `${ing._id}|${unit}`;
    if (!left.has(key)) left.set(key, getIngredientStockInUnit(ing, unit, ingredients, pantryItems, globalConversions));
    const have = left.get(key)!;
    const used = Math.min(have, needed);
    left.set(key, have - used);
    const short = needed - used;
    if (short <= 1e-6) return;

    const recipe = recipeMap.get(idOf(ing.productionRecipe));
    if (recipe && !making.has(recipe._id) && unit === native) {
      // Something you make. What making that much of it takes is needed
      // in turn — and, when it's made ahead, it goes on the prep list and
      // its ingredients are needed by the session it's made in. (Rice
      // cooked at the meal isn't prep: only its ingredients count.)
      const batchYield = (recipe.servings || 1) * (ing.defaultPortionAmount || 1);
      let madeOn = due;
      if (recipe.madeAhead) {
        const session = sessionBy("prep", due);
        const needKey = `${ing._id}|${session?.id}`;
        const need = prep.get(needKey) ?? { ingredientId: ing._id, name: ing.name, recipeId: recipe._id, recipeName: recipe.name, amount: 0, unit, batches: 0, neededBy: due, for: [], session: session?.id ?? null };
        prep.set(needKey, need);
        note(need, short, source, due);
        need.batches = need.amount / batchYield;
        madeOn = session?.date ?? due;
      }
      const inside = new Set(making).add(recipe._id);
      for (const line of recipe.ingredientList) {
        if (idOf(line.ingredient)) require(recipeLineToRow(line, short / batchYield), source, madeOn, inside);
      }
      return;
    }

    const trip = sessionBy("shop", due);
    const needKey = `${key}|${trip?.id}`;
    const need = buy.get(needKey) ?? { ingredientId: ing._id, name: ing.name, amount: 0, unit, pieces: false, neededBy: due, for: [], session: trip?.id ?? null };
    buy.set(needKey, need);
    note(need, short, source, due);
  }

  const inOrder = [...entries].sort((a, b) => a.date.localeCompare(b.date) || (SLOT_ORDER[a.slot] ?? 9) - (SLOT_ORDER[b.slot] ?? 9));
  for (const entry of inOrder) {
    const source = { date: entry.date, label: entryLabel(entry) };
    for (const row of gatherRows(entry, recipeMap)) require(row, source, entry.date, new Set());
  }

  const soonest = <T extends { neededBy: string; name: string }>(list: T[]) => list.sort((a, b) => a.neededBy.localeCompare(b.neededBy) || a.name.localeCompare(b.name));
  return { prep: soonest([...prep.values()]), buy: soonest([...buy.values()]) };
}

// "1.5 tbsp", "2 fillets", "350 g": an amount short enough to read in a list.
export function needAmountLabel(amount: number, unit: string): string {
  const rounded = amount >= 100 ? Math.round(amount) : amount >= 10 ? Math.round(amount * 10) / 10 : Math.round(amount * 100) / 100;
  return `${rounded} ${unit}${rounded !== 1 && /^(fillet|steak|piece|bag|item|egg|stalk|sheet|cutlet|package|pack|count|bulb|sprig)$/.test(unit) ? "s" : ""}`;
}

// The Kitchen calendar's sessions among a range of event occurrences.
export function kitchenSessions(occurrences: { _id: string; title: string; kitchenKind?: "prep" | "shop" | null; occurrenceDate: string; startMinutes: number; endMinutes: number }[], today: string): KitchenSession[] {
  return occurrences
    .filter((e) => !!e.kitchenKind && e.occurrenceDate >= today)
    .map((e) => ({ id: `${e._id}|${e.occurrenceDate}`, eventId: e._id, kind: e.kitchenKind!, date: e.occurrenceDate, startMinutes: e.startMinutes, endMinutes: e.endMinutes, title: e.title }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes);
}
