import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";

import { addDays } from "@/src/components/calendar/calendarUtils";
import { getEventOccurrences, type EventOccurrence } from "@/src/services/calendarApi";
import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import { getMealPlanRange, type MealPlanEntry } from "@/src/services/mealPlanApi";
import { getPantryItems } from "@/src/services/pantryApi";
import { getRecipes, type Recipe } from "@/src/services/recipeApi";
import { loadSettings } from "@/src/services/settingsService";
import type { PantryItem } from "@/src/types/pantry";
import { todayStr } from "@/src/utils/mealPlan";
import { sizePlanned } from "@/src/utils/pieceSizing";
import { computePlanNeeds, kitchenSessions, type BuyNeed, type KitchenIssue, type KitchenSession, type KitchenTask, type PrepNeed, type StockCheck } from "@/src/utils/planNeeds";
import type { CustomUnitConversion } from "@/src/utils/unitConversion";

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
}

// What the planned meals of the next few weeks need prepping and buying,
// each thing set against the prep session or shopping trip it falls to
// (see utils/planNeeds.ts). Loaded on coming to the screen and on `reload`;
// nothing is stored — it's worked out from the plan, the pantry and the
// Kitchen calendar as they stand.
//
// `sized` gives back plan entries with each meal still to come counted at
// the pantry piece it would get (MealPlanEntry.sizedTo), for a day's totals.
export function usePlanNeeds(): { ready: boolean; today: string; sessions: KitchenSession[]; prep: PrepNeed[]; buy: BuyNeed[]; checks: StockCheck[]; tasks: KitchenTask[]; issues: KitchenIssue[]; reload: () => void; sized: (entries: MealPlanEntry[]) => MealPlanEntry[] } {
  const today = todayStr();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const reload = useCallback(() => {
    const to = addDays(today, NEEDS_HORIZON_DAYS);
    Promise.all([getMealPlanRange(today, to), getRecipes(), getIngredients(), getPantryItems(), loadSettings(), getEventOccurrences(today, to)])
      .then(([entries, recipes, ingredients, pantry, settings, occurrences]) => setLoaded({ entries, recipes, ingredients, pantry, conversions: settings.unitConversions, dayGoal: settings.dailyCalorieLimit, occurrences }))
      .catch(() => {});
  }, [today]);
  useFocusEffect(reload);

  return useMemo(() => {
    if (!loaded) return { ready: false, today, sessions: [], prep: [], buy: [], checks: [], tasks: [], issues: [], reload, sized: (entries: MealPlanEntry[]) => entries };
    const sessions = kitchenSessions(loaded.occurrences, today);
    // (Each meal with the piece it would get, so that's the one to thaw.)
    const sized = sizePlanned(loaded.entries, loaded.recipes, loaded.ingredients, loaded.pantry, loaded.conversions, today, loaded.dayGoal).entries;
    const needs = computePlanNeeds(
      sized.filter((e) => e.status === "planned" && e.date >= today),
      loaded.recipes,
      loaded.ingredients,
      loaded.pantry,
      loaded.conversions,
      sessions,
      today,
    );
    const sizes = new Map(sized.filter((e) => e.sizedTo).map((e) => [e._id, e.sizedTo]));
    return { ready: true, today, sessions, ...needs, reload, sized: (entries: MealPlanEntry[]) => entries.map((e) => (sizes.has(e._id) ? { ...e, sizedTo: sizes.get(e._id) } : e)) };
  }, [loaded, today, reload]);
}
