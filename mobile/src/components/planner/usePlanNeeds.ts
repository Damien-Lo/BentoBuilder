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
import { pieceOptions, sizePlanned } from "@/src/utils/pieceSizing";
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
}

// What the planned meals of the next few weeks need prepping and buying,
// each thing set against the prep session or shopping trip it falls to
// (see utils/planNeeds.ts). Loaded on coming to the screen and on `reload`;
// nothing is stored — it's worked out from the plan, the pantry and the
// Kitchen calendar as they stand.
//
// `sized` gives back plan entries with each meal still to come counted at
// the pantry piece it would get (MealPlanEntry.sizedTo), for a day's totals.
export function usePlanNeeds(): { ready: boolean; today: string; sessions: KitchenSession[]; prep: PrepNeed[]; buy: BuyNeed[]; checks: StockCheck[]; tasks: KitchenTask[]; issues: KitchenIssue[]; reload: () => void; sized: (entries: MealPlanEntry[]) => MealPlanEntry[]; upcoming: MealPlanEntry[]; pieceChoices: (entry: MealPlanEntry) => PieceChoice[] } {
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
    if (!loaded) return { ready: false, today, sessions: [], prep: [], buy: [], checks: [], tasks: [], issues: [], reload, sized: (entries: MealPlanEntry[]) => entries, upcoming: [], pieceChoices: () => [] };
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
    return { ready: true, today, sessions, ...needs, reload, upcoming, pieceChoices, sized: (entries: MealPlanEntry[]) => entries.map((e) => (sizes.has(e._id) ? { ...e, sizedTo: sizes.get(e._id) } : e)) };
  }, [loaded, today, reload]);
}
