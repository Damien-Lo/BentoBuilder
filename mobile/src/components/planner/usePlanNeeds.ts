import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { addDays } from "@/src/components/calendar/calendarUtils";
import { getEventOccurrences, type EventOccurrence } from "@/src/services/calendarApi";
import { syncGroceryList } from "@/src/services/groceryListApi";
import { getMenu, menuLeft, menuName, type MenuItem } from "@/src/services/menuApi";
import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import { getMealPlanRange, type MealPlanEntry, type PieceSizeInput } from "@/src/services/mealPlanApi";
import { getPantryItems } from "@/src/services/pantryApi";
import { getRecipes, type Recipe } from "@/src/services/recipeApi";
import { loadSettings } from "@/src/services/settingsService";
import type { PantryItem } from "@/src/types/pantry";
import { todayStr } from "@/src/utils/mealPlan";
import { caloriesWithSizes, pieceOptions, pieceSlots, sizePlanned, type PieceSlot } from "@/src/utils/pieceSizing";
import { computePlanNeeds, kitchenSessions, type BuyNeed, type KitchenIssue, type KitchenSession, type KitchenTask, type PrepNeed, type StockCheck } from "@/src/utils/planNeeds";
import type { CustomUnitConversion } from "@/src/utils/unitConversion";

// A piece (or bag made from one) a planned meal could be made with: what
// the meal would come to, whether it's been chosen for it, whether it's the
// one it's counted at now, and the other meal it's going to otherwise.
export interface PieceChoice {
  pantryItemId: string;
  label: string;
  calories: number;
  // Which of the recipe's pieces it's a choice for (its ingredient).
  group: string;
  chosen: boolean;
  current: boolean;
  elsewhere?: MealPlanEntry;
  // The piece's weight (a bag's: the piece it was made from), to copy.
  weight?: { amount: number; unit: string };
}

// A meal's kept pieces with `choice` made for its group (or, if it was the
// one kept, given back to the planner): the others' choices stay.
export function withPiece(kept: string[] | undefined, choices: PieceChoice[], choice: PieceChoice): string[] {
  const group = new Set(choices.filter((c) => c.group === choice.group).map((c) => c.pantryItemId));
  const rest = (kept ?? []).filter((id) => !group.has(id));
  return choice.chosen ? rest : [...rest, choice.pantryItemId];
}

// The choices grouped by what they're for, in the recipe's order.
export function pieceGroups(choices: PieceChoice[]): { group: string; choices: PieceChoice[] }[] {
  const groups: { group: string; choices: PieceChoice[] }[] = [];
  for (const c of choices) {
    const at = groups.find((g) => g.group === c.group);
    if (at) at.choices.push(c);
    else groups.push({ group: c.group, choices: [c] });
  }
  return groups;
}

// How far ahead the plan is read: far enough to see what a session covers
// up to the one after it.
export const NEEDS_HORIZON_DAYS = 21;

interface Loaded {
  entries: MealPlanEntry[];
  recipes: Recipe[];
  ingredients: Ingredient[];
  pantry: PantryItem[];
  conversions: CustomUnitConversion[];
  dayGoal: number | null;
  occurrences: EventOccurrence[];
  menu: MenuItem[];
}

// What the planned meals of the next few weeks need prepping and buying,
// each thing set against the prep session or shopping trip it falls to
// (see utils/planNeeds.ts). Loaded on coming to the screen and on `reload`;
// nothing is stored — it's worked out from the plan, the pantry and the
// Kitchen calendar as they stand.
//
// `sized` gives back plan entries with each meal still to come counted at
// the pantry piece it would get (MealPlanEntry.sizedTo), for a day's totals.
export function usePlanNeeds(): { ready: boolean; today: string; sessions: KitchenSession[]; prep: PrepNeed[]; buy: BuyNeed[]; checks: StockCheck[]; tasks: KitchenTask[]; issues: KitchenIssue[]; reload: () => void; sized: (entries: MealPlanEntry[]) => MealPlanEntry[]; upcoming: MealPlanEntry[]; pieceChoices: (entry: MealPlanEntry) => PieceChoice[]; pieceSlots: (entry: MealPlanEntry) => PieceSlot[]; sizedCalories: (entry: MealPlanEntry, sizes: PieceSizeInput[]) => number; onList: (need: BuyNeed) => boolean; listSynced: number; menu: MenuItem[] } {
  const today = todayStr();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const reload = useCallback(() => {
    const to = addDays(today, NEEDS_HORIZON_DAYS);
    Promise.all([getMealPlanRange(today, to), getRecipes(), getIngredients(), getPantryItems(), loadSettings(), getEventOccurrences(today, to), getMenu().catch(() => [] as MenuItem[])])
      .then(([entries, recipes, ingredients, pantry, settings, occurrences, menu]) => setLoaded({ entries, recipes, ingredients, pantry, conversions: settings.unitConversions, dayGoal: settings.dailyCalorieLimit, occurrences, menu }))
      .catch(() => {});
  }, [today]);
  useFocusEffect(reload);

  // (Bumped when the grocery list has just been brought in step, so a
  // screen showing it can load it again.)
  const [listSynced, setListSynced] = useState(0);

  const result = useMemo(() => {
    if (!loaded) return { ready: false, today, sessions: [], prep: [], buy: [], planBuy: [] as BuyNeed[], checks: [], tasks: [], issues: [], reload, sized: (entries: MealPlanEntry[]) => entries, upcoming: [], pieceChoices: () => [], pieceSlots: () => [] as PieceSlot[], sizedCalories: () => 0, onList: () => false, listSynced, menu: [] as MenuItem[] };
    const sessions = kitchenSessions(loaded.occurrences, today);
    // (Each meal with the piece it would get, so that's the one to thaw.)
    const sized = sizePlanned(loaded.entries, loaded.recipes, loaded.ingredients, loaded.pantry, loaded.conversions, today, loaded.dayGoal).entries;
    const planned = sized.filter((e) => e.status === "planned" && e.date >= today);
    const planOnly = computePlanNeeds(planned, loaded.recipes, loaded.ingredients, loaded.pantry, loaded.conversions, sessions, today);
    // The menu's servings not yet on a day count as if planned for the day
    // after the next trip (a week on, with none booked): bought on that
    // trip, after what's on days has had its share of the pantry. (Only
    // the prep and shopping: no tasks for them, they've no day yet.)
    const nextTrip = sessions.find((s) => s.kind === "shop");
    const menuDay = nextTrip ? addDays(nextTrip.date, 1) : addDays(today, 7);
    const fromMenu = loaded.menu
      .filter((item) => item.state === "menu" && menuLeft(item) > 0 && (item.recipe || item.meal))
      .map(
        (item) =>
          ({
            _id: `menu:${item._id}`,
            date: menuDay,
            slot: "dinner",
            status: "planned",
            label: menuName(item),
            ...(item.recipe ? { recipe: item.recipe, recipeServings: menuLeft(item) } : { meal: item.meal }),
          }) as MealPlanEntry,
      );
    const withMenu = fromMenu.length ? computePlanNeeds([...planned, ...fromMenu], loaded.recipes, loaded.ingredients, loaded.pantry, loaded.conversions, sessions) : planOnly;
    const needs = { prep: withMenu.prep, buy: withMenu.buy, checks: withMenu.checks, tasks: planOnly.tasks, issues: planOnly.issues };
    const sizes = new Map(sized.filter((e) => e.sizedTo).map((e) => [e._id, e.sizedTo]));
    // (`upcoming`: every meal still to come in the next few weeks.)
    const upcoming = loaded.entries.filter((e) => e.status === "planned" && e.date >= today);
    // A planned meal's pieces to choose from (MealPlanEntry.pieces), and
    // which other meal, if any, each is going to as things stand.
    const going = new Map(sized.flatMap((e) => (e.sizedTo?.claims ?? []).map((id) => [id, e] as const)));
    const pieceChoices = (entry: MealPlanEntry): PieceChoice[] =>
      entry.recipe && entry.status === "planned"
        ? pieceOptions(entry.recipe, loaded.pantry, loaded.recipes, loaded.ingredients, loaded.conversions, entry.recipeServings ?? 1).map((option) => {
            const other = going.get(option.pantryItemId);
            return { ...option, chosen: !!entry.pieces?.includes(option.pantryItemId), current: other?._id === entry._id, elsewhere: other && other._id !== entry._id ? other : undefined };
          })
        : [];
    // The whole pieces a planned meal takes, for asking how big (with what
    // it would come to at a size typed in).
    const slotsOf = (entry: MealPlanEntry): PieceSlot[] => (entry.recipe && entry.status === "planned" ? pieceSlots(entry.recipe, loaded.recipes, loaded.ingredients) : []);
    const sizedCalories = (entry: MealPlanEntry, sizes: PieceSizeInput[]) =>
      entry.recipe ? caloriesWithSizes(entry.recipe, sizes, loaded.pantry, loaded.recipes, loaded.ingredients, loaded.conversions, entry.recipeServings ?? 1) : 0;
    // What goes on the grocery list: what's needed by the next shopping
    // trip (or before any trip at all) — with no trip booked, the next week.
    const onList = (need: BuyNeed) => (nextTrip ? !need.session || need.session === nextTrip.id : need.neededBy <= addDays(today, 7));
    return { ready: true, today, sessions, ...needs, planBuy: planOnly.buy, menu: loaded.menu, reload, upcoming, pieceChoices, pieceSlots: slotsOf, sizedCalories, onList, listSynced, sized: (entries: MealPlanEntry[]) => entries.map((e) => (sizes.has(e._id) ? { ...e, sizedTo: sizes.get(e._id) } : e)) };
  }, [loaded, today, reload, listSynced]);

  // The grocery list kept in step with the plan: whenever what's needed for
  // the next trip changes, it's sent (once, however many screens work it out).
  useEffect(() => {
    if (!result.ready) return;
    type Line = { ingredient: string; name: string; amount: number; unit: string };
    const sum = (list: BuyNeed[]) => {
      const totals = new Map<string, Line>();
      for (const need of list.filter(result.onList)) {
        const key = `${need.ingredientId}|${need.unit}`;
        const at = totals.get(key);
        if (at) at.amount += need.amount;
        else totals.set(key, { ingredient: need.ingredientId, name: need.name, amount: need.amount, unit: need.unit });
      }
      return totals;
    };
    // What the days need is the plan's; what the menu adds on top, the menu's.
    const plan = sum(result.planBuy);
    const all = sum(result.buy);
    const tidy = (lines: Line[]) => lines.map((n) => ({ ...n, amount: Math.round(n.amount * 1000) / 1000 })).filter((n) => n.amount > 0);
    const planNeeds = tidy([...plan.values()]);
    const menuNeeds = tidy([...all.entries()].map(([key, line]) => ({ ...line, amount: line.amount - (plan.get(key)?.amount ?? 0) })));
    const signature = JSON.stringify([planNeeds, menuNeeds]);
    if (signature === lastListSync) return;
    lastListSync = signature;
    Promise.all([syncGroceryList("plan", planNeeds), syncGroceryList("menu", menuNeeds)])
      .then(([a, b]) => a + b > 0 && setListSynced((n) => n + 1))
      .catch(() => {
        lastListSync = null;
      });
  }, [result]);

  return result;
}

// What was last sent to the grocery list (see usePlanNeeds).
let lastListSync: string | null = null;
