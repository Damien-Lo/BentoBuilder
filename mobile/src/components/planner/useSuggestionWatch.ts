import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { addDays } from "@/src/components/calendar/calendarUtils";
import { noteSuggestions, settleSuggestions } from "@/src/components/planner/suggestionRecord";
import { getEventOccurrences, type EventOccurrence } from "@/src/services/calendarApi";
import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import { getMeals, type Meal } from "@/src/services/mealApi";
import { getMealPlanRange, type MealPlanEntry } from "@/src/services/mealPlanApi";
import { getPantryItems } from "@/src/services/pantryApi";
import { getRecipes, type Recipe } from "@/src/services/recipeApi";
import { loadSettings, type AppSettings } from "@/src/services/settingsService";
import type { PantryItem } from "@/src/types/pantry";
import { todayStr } from "@/src/utils/mealPlan";
import { kitchenSessions } from "@/src/utils/planNeeds";
import { suggestMeals } from "@/src/utils/recommend";

interface Loaded {
  around: MealPlanEntry[];
  recipes: Recipe[];
  meals: Meal[];
  ingredients: Ingredient[];
  pantry: PantryItem[];
  settings: AppSettings;
  occurrences: EventOccurrence[];
}

// Suggestions worked out in the background for the day on show, where
// nothing displays them (the phone planner): so that when a meal is logged
// into an empty slot, what was chosen is recorded against what would have
// been offered there. `dayEntries` is that day's plan as the screen has it;
// null while it's loading.
export function useSuggestionWatch(date: string, dayEntries: MealPlanEntry[] | null) {
  const today = todayStr();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useFocusEffect(
    useCallback(() => {
      Promise.all([getMealPlanRange(addDays(today, -180), addDays(today, 21)), getRecipes(), getMeals(), getIngredients(), getPantryItems(), loadSettings(), getEventOccurrences(today, addDays(today, 21))])
        .then(([around, recipes, meals, ingredients, pantry, settings, occurrences]) => setLoaded({ around, recipes, meals, ingredients, pantry, settings, occurrences }))
        .catch(() => {});
    }, [today]),
  );

  const suggestions = useMemo(() => {
    if (!loaded || !dayEntries || date < today) return null;
    const { settings } = loaded;
    return suggestMeals({
      slots: (["breakfast", "lunch", "dinner"] as const).filter((slot) => !dayEntries.some((e) => e.slot === slot)).map((slot) => ({ date, slot })),
      // The day as the screen has it, among everything else as loaded.
      entries: [...loaded.around.filter((e) => e.date !== date), ...dayEntries],
      recipes: loaded.recipes,
      meals: loaded.meals,
      ingredients: loaded.ingredients,
      pantryItems: loaded.pantry,
      conversions: settings.unitConversions,
      goals: { calories: settings.dailyCalorieLimit, protein: settings.dailyProteinLimit, carbs: settings.dailyCarbsLimit, fats: settings.dailyFatsLimit },
      sessions: kitchenSessions(loaded.occurrences, today),
      weekStartDay: settings.weekStartDay,
      today,
    });
  }, [loaded, dayEntries, date, today]);

  useEffect(() => {
    if (!dayEntries) return;
    // First what's been filled since the last look, then what's open now.
    settleSuggestions(dayEntries, [date]);
    if (!suggestions) return;
    noteSuggestions(
      [date],
      [...suggestions].flatMap(([key, offers]) => (offers[0] ? [{ key, offer: offers[0], rank: 0 }] : [])),
      suggestions,
      false,
    );
  }, [suggestions, dayEntries, date]);
}
