import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { addDays, weekOf } from "@/src/components/calendar/calendarUtils";
import { noteSuggestions, recordSuggestion, settleSuggestions } from "@/src/components/planner/suggestionRecord";
import { getEventOccurrences, type EventOccurrence } from "@/src/services/calendarApi";
import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import { getMeals, type Meal } from "@/src/services/mealApi";
import { createMealPlanEntry, getMealPlanRange, type MealPlanEntry, type MealSlot } from "@/src/services/mealPlanApi";
import { getPantryItems } from "@/src/services/pantryApi";
import { getRecipes, type Recipe } from "@/src/services/recipeApi";
import { loadSettings, type AppSettings } from "@/src/services/settingsService";
import type { PantryItem } from "@/src/types/pantry";
import { todayStr } from "@/src/utils/mealPlan";
import { kitchenSessions } from "@/src/utils/planNeeds";
import { suggestMeals, type Dish, type Suggestion } from "@/src/utils/recommend";

interface Loaded {
  around: MealPlanEntry[];
  recipes: Recipe[];
  meals: Meal[];
  ingredients: Ingredient[];
  pantry: PantryItem[];
  settings: AppSettings;
  occurrences: EventOccurrence[];
}

// The suggestions for the day on show on the phone planner. They're always
// worked out, shown or not: with the toggle off, so that when a meal is
// logged into an empty slot, what was chosen is recorded against what would
// have been offered there; with it on (`showing`), they're also what the
// planner's violet cards display. `dayEntries` is that day's plan as the
// screen has it; null while it's loading.
export function useSuggestionWatch(date: string, dayEntries: MealPlanEntry[] | null, showing: boolean) {
  const today = todayStr();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // Which of a slot's offers is up ("another" turns to the next), the slots
  // where they've been waved away, and an offer's sides as changed by hand
  // — by "date|slot" (and the main, for the sides).
  const [turn, setTurn] = useState<Record<string, number>>({});
  const [waved, setWavedState] = useState<string[]>([]);
  // (Remembered on the device, for the days still to come.)
  useEffect(() => {
    AsyncStorage.getItem("planner.suggestions.waved")
      .then((kept) => {
        const list: unknown = JSON.parse(kept ?? "[]");
        if (Array.isArray(list)) setWavedState((prev) => [...new Set([...prev, ...list.filter((k): k is string => typeof k === "string" && k.slice(0, 10) >= today)])]);
      })
      .catch(() => {});
  }, [today]);
  const setWaved = (update: (prev: string[]) => string[]) =>
    setWavedState((prev) => {
      const next = update(prev);
      AsyncStorage.setItem("planner.suggestions.waved", JSON.stringify(next)).catch(() => {});
      return next;
    });
  const [sideEdits, setSideEdits] = useState<Record<string, Dish[]>>({});

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
    const meals = ["breakfast", "lunch", "dinner"] as const;
    // Worked out for the whole week the day is in, from today on, exactly as
    // the desktop week plan does: what's suggested earlier in the week
    // bears on the day (variety, the pieces in the pantry, the week's
    // calories), so this is what keeps the two showing the same thing.
    const week = weekOf(date, settings.weekStartDay);
    const entries = [...loaded.around.filter((e) => e.date !== date && (e.date < today || week.includes(e.date))), ...dayEntries];
    const days = week.filter((d) => d >= today);
    const there = (day: string, slot: MealSlot) => entries.filter((e) => e.date === day && e.slot === slot);
    return suggestMeals({
      slots: days.flatMap((day) => meals.filter((slot) => !there(day, slot).length).map((slot) => ({ date: day, slot }))),
      // Meals with something planned but nothing eaten can still be added to.
      started: days.flatMap((day) => meals.filter((slot) => there(day, slot).length > 0 && there(day, slot).every((e) => e.status !== "confirmed")).map((slot) => ({ date: day, slot }))),
      entries,
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

  // The offer up for a slot, with any sides you've dropped taken off.
  const offerFor = useCallback(
    (slot: MealSlot): { offer: Suggestion; rank: number; more: boolean } | null => {
      const key = `${date}|${slot}`;
      const offers = (!waved.includes(key) && suggestions?.get(key)) || [];
      if (!offers.length) return null;
      const rank = (turn[key] ?? 0) % offers.length;
      const up = offers[rank];
      const sides = sideEdits[`${key}|${up.main.key}`];
      if (!sides) return { offer: up, rank, more: offers.length > 1 };
      // (Sides for a planned main, all dropped, are no offer.)
      if (up.beside && !sides.length) return null;
      const total = (k: "calories" | "protein" | "carbs" | "fats") => (up.beside ? sides : [up.main, ...sides]).reduce((sum, d) => sum + d[k], 0);
      return { offer: { ...up, sides, reasons: up.reasons.filter((r) => !r.startsWith("fits the")), calories: total("calories"), protein: total("protein"), carbs: total("carbs"), fats: total("fats") }, rank, more: offers.length > 1 };
    },
    [date, suggestions, turn, waved, sideEdits],
  );

  useEffect(() => {
    if (!dayEntries) return;
    // First what's been filled since the last look, then what's open now —
    // noted as seen only when the cards are on.
    settleSuggestions(dayEntries, [date]);
    if (!suggestions) return;
    noteSuggestions(
      [date],
      (["breakfast", "lunch", "dinner"] as const).flatMap((slot) => {
        const up = dayEntries.some((e) => e.slot === slot) ? null : offerFor(slot);
        return up ? [{ key: `${date}|${slot}`, offer: up.offer, rank: up.rank }] : [];
      }),
      suggestions,
      showing,
    );
  }, [suggestions, dayEntries, date, showing, offerFor]);

  return {
    // Nothing to show with the toggle off.
    offerFor: (slot: MealSlot) => (showing ? offerFor(slot) : null),
    another(slot: MealSlot) {
      const up = offerFor(slot);
      if (!up) return;
      recordSuggestion("another", date, slot, up.offer, up.rank);
      setTurn((prev) => ({ ...prev, [`${date}|${slot}`]: (prev[`${date}|${slot}`] ?? 0) + 1 }));
    },
    dismiss(slot: MealSlot) {
      const up = offerFor(slot);
      if (!up) return;
      recordSuggestion("dismissed", date, slot, up.offer, up.rank);
      setWaved((prev) => [...prev, `${date}|${slot}`]);
    },
    // One side changed: swapped (`from` for `to`), dropped (no `to`) or
    // added (no `from`).
    changeSide(slot: MealSlot, from: Dish | null, to: Dish | null) {
      const up = offerFor(slot);
      if (!up) return;
      const sides = from ? up.offer.sides.flatMap((d) => (d.key === from.key ? (to ? [to] : []) : [d])) : to ? [...up.offer.sides, to] : up.offer.sides;
      recordSuggestion(from && to ? "side-swapped" : from ? "side-removed" : "side-added", date, slot, up.offer, up.rank, { chosen: to ? { name: to.name } : undefined, side: { sideFrom: from?.recipe?._id ?? null, sideTo: to?.recipe?._id ?? null } });
      setSideEdits((prev) => ({ ...prev, [`${date}|${slot}|${up.offer.main.key}`]: sides }));
    },
    // For the picker: the likeliest sides for a slot's offer, and anything by name.
    likelySides(slot: MealSlot) {
      const up = offerFor(slot);
      return up && suggestions ? suggestions.sidesFor(up.offer).slice(0, 4) : [];
    },
    findSides(slot: MealSlot, query: string) {
      const up = offerFor(slot);
      return up && suggestions ? suggestions.find(query).filter((d) => d.key !== up.offer.main.key && !up.offer.sides.some((x) => x.key === d.key)) : [];
    },
    // Taking the offer: its dishes become ordinary planned meals (only the
    // sides, where the main is already planned), which are handed back.
    async plan(slot: MealSlot): Promise<MealPlanEntry[]> {
      const up = offerFor(slot);
      if (!up) return [];
      const added: MealPlanEntry[] = [];
      for (const dish of up.offer.beside ? up.offer.sides : [up.offer.main, ...up.offer.sides]) {
        added.push(
          await createMealPlanEntry({
            date,
            slot,
            status: "planned",
            suggested: true,
            ...(dish.recipe ? { recipe: dish.recipe._id, recipeServings: 1 } : dish.ingredient ? { ingredient: dish.ingredient._id, ingredientQuantity: dish.ingredient.defaultPortionAmount || 1, ingredientUnit: dish.ingredient.defaultPortionUnit ?? "" } : { meal: dish.meal!._id }),
          }),
        );
      }
      recordSuggestion("accepted", date, slot, up.offer, up.rank);
      return added;
    },
  };
}
