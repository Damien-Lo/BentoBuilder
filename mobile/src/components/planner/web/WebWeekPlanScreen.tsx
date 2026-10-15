import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { addDays, MONTHS_FULL, MONTHS_SHORT, WEEKDAYS_SHORT, weekOf } from "@/src/components/calendar/calendarUtils";
import { entryName } from "@/src/components/calendar/mealFood";
import { useEntryConfirm } from "@/src/components/planner/useEntryConfirm";
import { SidePicker } from "@/src/components/planner/SidePicker";
import { KitchenTasks } from "@/src/components/planner/KitchenTasks";
import { NeedsSummaryCard } from "@/src/components/planner/web/PrepShopping";
import { SessionBooker } from "@/src/components/planner/web/SessionBooker";
import { noteSuggestions, recordSuggestion, settleSuggestions, type SuggestionAction } from "@/src/components/planner/suggestionRecord";
import { usePlanNeeds } from "@/src/components/planner/usePlanNeeds";
import { showActions } from "@/src/components/todo/theme";
import { compactDate } from "@/src/components/web/fields";
import { Button, Card, CardLink, GoalBar, IconButton, WEB, WebPage } from "@/src/components/web/ui";
import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import { getMeals, type Meal } from "@/src/services/mealApi";
import {
  createMealPlanEntry,
  deleteMealPlanEntry,
  getMealPlanRange,
  setMealPlanEntryPieces,
  unconfirmMealPlanEntry,
  type MealPlanEntry,
  type MealSlot,
} from "@/src/services/mealPlanApi";
import { getPantryItems } from "@/src/services/pantryApi";
import { getRecipes, type Recipe } from "@/src/services/recipeApi";
import { DEFAULT_SETTINGS, loadSettings, type AppSettings } from "@/src/services/settingsService";
import { stopUsualMeal } from "@/src/services/usualMealApi";
import type { PantryItem } from "@/src/types/pantry";
import { computeDayNutrition, parseLocalDate, SLOTS, todayStr } from "@/src/utils/mealPlan";
import { suggestMeals, type Dish, type Macros, type Suggestion, type Suggestions } from "@/src/utils/recommend";

// The planner in a desktop browser: the whole week at once. A column per
// day and a row per meal, each cell holding what's planned or eaten, with
// the day's calories on top and the week's totals down the side. The phone
// planner shows one day at a time, for logging; this is for laying the
// week out.

type Hover = { hovered?: boolean };

const LABEL_WIDTH = 104;
const SUMMARY_WIDTH = 300;
// One page of the numbers card (the card, less its border).
const PAGE_WIDTH = SUMMARY_WIDTH - 2;

export function WebWeekPlanScreen() {
  const router = useRouter();
  const today = todayStr();
  // `date`: the day to open on — set on the way back from adding food, so
  // the week that was being planned is still the one on show.
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const [focusDate, setFocusDate] = useState(dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [loadedWeek, setLoadedWeek] = useState<string | null>(null);
  // What marking an entry as eaten works from.
  const [kitchen, setKitchen] = useState<{ recipes: Recipe[]; ingredients: Ingredient[]; pantry: PantryItem[]; meals: Meal[] } | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const week = useMemo(() => weekOf(focusDate, settings.weekStartDay), [focusDate, settings.weekStartDay]);

  const loadWeek = useCallback((days: string[]) => {
    getMealPlanRange(days[0], days[6])
      .then((loaded) => {
        setEntries(loaded);
        setLoadedWeek(days[0]);
      })
      .catch((error) => Alert.alert("Couldn't load the plan", error instanceof Error ? error.message : "Something went wrong."));
  }, []);

  const loadKitchen = useCallback(() => {
    Promise.all([getRecipes(), getIngredients(), getPantryItems(), getMeals()])
      .then(([recipes, ingredients, pantry, meals]) => setKitchen({ recipes, ingredients, pantry, meals }))
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings()
        .then((s) => {
          setSettings(s);
          setSettingsLoaded(true);
        })
        .catch(() => setSettingsLoaded(true));
      loadKitchen();
    }, [loadKitchen]),
  );
  // (Re)load whenever the week on show changes, and on coming back to it.
  useFocusEffect(
    useCallback(() => {
      if (settingsLoaded) loadWeek(week);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settingsLoaded, week[0], loadWeek]),
  );
  useEffect(() => {
    if (settingsLoaded) loadWeek(week);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week[0]]);

  const reload = () => {
    loadWeek(week);
    loadKitchen();
    plan.reload();
    loadHistory();
  };

  const confirm = useEntryConfirm({
    allRecipes: kitchen?.recipes ?? [],
    allIngredients: kitchen?.ingredients ?? [],
    pantryItems: kitchen?.pantry ?? [],
    settings: settingsLoaded ? settings : null,
    ready: !!kitchen && settingsLoaded,
    onConfirmed: reload,
  });

  const fail = (error: unknown) => Alert.alert("Couldn't update", error instanceof Error ? error.message : "Something went wrong.");
  const conversions = settings.unitConversions;
  const kcalOf = (list: MealPlanEntry[]) => computeDayNutrition(list, conversions).calories ?? 0;

  function addFood(date: string, slot: MealSlot) {
    // The phone planner's own add sheet, on that day and meal; it comes back
    // here when done.
    router.push({ pathname: "/planner", params: { date, add: slot, from: "web", t: String(Date.now()) } });
  }

  function openItem(entry: MealPlanEntry) {
    if (entry.recipe) router.push({ pathname: "/recipes/[id]", params: { id: entry.recipe._id } });
    else if (entry.meal) router.push({ pathname: "/meals/[id]", params: { id: entry.meal._id } });
    else if (entry.ingredient) router.push({ pathname: "/ingredients/edit/[id]", params: { id: entry.ingredient._id } });
    else if (entry.restaurantMeal) router.push({ pathname: "/restaurant-meals/[id]", params: { id: entry.restaurantMeal._id } });
  }

  function toggleEaten(entry: MealPlanEntry) {
    if (entry.status === "confirmed") unconfirmMealPlanEntry(entry._id).then(reload, fail);
    else confirm.confirm(entry, true);
  }

  function entryMenu(entry: MealPlanEntry) {
    const usualId = entry.usual;
    showActions(entryName(entry), [
      { label: entry.status === "confirmed" ? "Mark as not eaten" : "Mark as eaten", onPress: () => toggleEaten(entry) },
      { label: "Open", onPress: () => openItem(entry) },
      // Still to come, and made with one of several pieces: which.
      ...plan.pieceChoices(entry).length > 1
        ? plan.pieceChoices(entry).map((c) => ({
            label: `${c.current ? "✓ " : ""}${c.label} · ${c.calories} kcal${c.elsewhere ? ` (going to ${compactDate(c.elsewhere.date)} ${c.elsewhere.slot})` : ""}`,
            onPress: () => void setMealPlanEntryPieces(entry._id, c.chosen ? [] : [c.pantryItemId]).then(() => {
              plan.reload();
              reload();
            }, fail),
          }))
        : [],
      ...(usualId
        ? [
            { label: "Remove just this day", destructive: true, onPress: () => void deleteMealPlanEntry(entry._id).then(reload, fail) },
            { label: "Stop having this from this day on", destructive: true, onPress: () => void stopUsualMeal(usualId, entry.date).then(reload, fail) },
          ]
        : [{ label: "Remove", destructive: true, onPress: () => void deleteMealPlanEntry(entry._id).then(reload, fail) }]),
    ]);
  }

  const a = parseLocalDate(week[0]);
  const b = parseLocalDate(week[6]);
  const range =
    a.getMonth() === b.getMonth()
      ? `${MONTHS_FULL[a.getMonth()]} ${a.getDate()}–${b.getDate()}, ${b.getFullYear()}`
      : `${MONTHS_SHORT[a.getMonth()]} ${a.getDate()} – ${MONTHS_SHORT[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;

  const ready = loadedWeek === week[0];
  // (What's planned counts at the piece in the pantry it would get.)
  // What the coming weeks' planned meals need prepping and buying, each
  // thing under the prep session or shopping trip it falls to.
  const plan = usePlanNeeds();
  // (Sized against everything planned from today, not just this week's.)
  const sizedEntries = plan.sized(entries);
  const weekEntries = ready ? sizedEntries.filter((e) => e.date >= week[0] && e.date <= week[6]) : [];
  const eaten = computeDayNutrition(weekEntries.filter((e) => e.status === "confirmed"), conversions);
  const planned = computeDayNutrition(weekEntries.filter((e) => e.status === "planned"), conversions);
  const loggedDays = week.filter((d) => weekEntries.some((e) => e.date === d && e.status === "confirmed")).length;

  // Suggestions for the empty meals from today on (see utils/recommend.ts):
  // proposals only — nothing counts one until it's accepted.
  const [suggesting, setSuggestingState] = useState(() => {
    try {
      return globalThis.localStorage?.getItem("web.suggestions") !== "off";
    } catch {
      return true;
    }
  });
  const setSuggesting = (on: boolean) => {
    setSuggestingState(on);
    try {
      globalThis.localStorage?.setItem("web.suggestions", on ? "on" : "off");
    } catch {
      // Not remembered, but still applied.
    }
  };
  // What you've been eating, as far back as half a year: last week for
  // the balance, all of it for what you tend to have and with what.
  const [history, setHistory] = useState<MealPlanEntry[]>([]);
  const loadHistory = useCallback(() => {
    getMealPlanRange(addDays(today, -180), addDays(today, -1)).then(setHistory).catch(() => {});
  }, [today]);
  useFocusEffect(loadHistory);
  // Which of a slot's suggestions is showing ("another" turns to the next),
  // and the slots where they've been waved away.
  const [turn, setTurn] = useState<Record<string, number>>({});
  // (Remembered in the browser, for the days still to come.)
  const [waved, setWavedState] = useState<string[]>(() => {
    try {
      const kept: unknown = JSON.parse(globalThis.localStorage?.getItem("web.suggestions.waved") ?? "[]");
      return Array.isArray(kept) ? kept.filter((k): k is string => typeof k === "string" && k.slice(0, 10) >= todayStr()) : [];
    } catch {
      return [];
    }
  });
  const setWaved = (update: (prev: string[]) => string[]) =>
    setWavedState((prev) => {
      const next = update(prev);
      try {
        globalThis.localStorage?.setItem("web.suggestions.waved", JSON.stringify(next));
      } catch {
        // Not remembered, but still applied.
      }
      return next;
    });
  // The sides of an offer as changed by hand, and the ones turned down
  // there (so a swap moves on to the next, not back), by "date|slot|main".
  const [sideEdits, setSideEdits] = useState<Record<string, Dish[]>>({});
  const [picking, setPicking] = useState<{ date: string; slot: MealSlot; offer: Suggestion; rank: number; from: Dish | null } | null>(null);
  const [sidesPassed, setSidesPassed] = useState<Record<string, string[]>>({});

  const [adding, setAdding] = useState<"prep" | "shop" | null>(null);
  const suggestions = useMemo(() => {
    if (!suggesting || !kitchen || !ready || !plan.ready) return Object.assign(new Map<string, Suggestion[]>(), { rate: () => null, sidesFor: () => [], find: () => [], aim: () => null }) as Suggestions;
    const empty = week
      .filter((d) => d >= today)
      .flatMap((date) => (["breakfast", "lunch", "dinner"] as const).filter((slot) => !weekEntries.some((e) => e.date === date && e.slot === slot)).map((slot) => ({ date, slot })));
    // Meals with something planned but nothing eaten can still be added to.
    const started = week
      .filter((d) => d >= today)
      .flatMap((date) => (["breakfast", "lunch", "dinner"] as const).filter((slot) => { const there = weekEntries.filter((e) => e.date === date && e.slot === slot); return there.length > 0 && there.every((e) => e.status !== "confirmed"); }).map((slot) => ({ date, slot })));
    return suggestMeals({
      slots: empty,
      started,
      // (History runs up to yesterday; the week adds today onwards.)
      entries: [...history, ...weekEntries.filter((e) => e.date >= today)],
      later: plan.upcoming.filter((e) => e.date > week[6]),
      recipes: kitchen.recipes,
      meals: kitchen.meals,
      ingredients: kitchen.ingredients,
      pantryItems: kitchen.pantry,
      conversions,
      goals: { calories: settings.dailyCalorieLimit, protein: settings.dailyProteinLimit, carbs: settings.dailyCarbsLimit, fats: settings.dailyFatsLimit },
      sessions: plan.sessions,
      weekStartDay: settings.weekStartDay,
      today,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggesting, kitchen, ready, plan.ready, plan.sessions, plan.upcoming, entries, history, week[0], today, settings]);

  // The suggestion showing in a slot (if any), and where it stands among
  // that slot's offers.
  const offerFor = (date: string, slot: MealSlot) => {
    const key = `${date}|${slot}`;
    const offers = waved.includes(key) ? [] : suggestions.get(key) ?? [];
    const rank = offers.length ? (turn[key] ?? 0) % offers.length : 0;
    const shown = offers[rank] ?? null;
    // With the sides as you've changed them, if you have.
    const sides = shown ? sideEdits[`${key}|${shown.main.key}`] : undefined;
    const offer = shown && sides ? { ...shown, sides, reasons: shown.reasons.filter((r) => !r.startsWith("fits the")), ...(shown.beside ? sides : [shown.main, ...sides]).reduce((sum, d) => ({ calories: sum.calories + d.calories, protein: sum.protein + d.protein, carbs: sum.carbs + d.carbs, fats: sum.fats + d.fats }), { calories: 0, protein: 0, carbs: 0, fats: 0 }) } : shown;
    // (Sides for a planned main, all dropped, are no offer.)
    return { key, offers, rank, offer: offer?.beside && !offer.sides.length ? null : offer };
  };

  // The sides that could still go beside an offer, likeliest first.
  const sideOptions = (date: string, slot: MealSlot, offer: Suggestion) => {
    const all = suggestions.sidesFor(offer);
    const fresh = all.filter((d) => !(sidesPassed[`${date}|${slot}|${offer.main.key}`] ?? []).includes(d.key));
    return fresh.length ? fresh : all;
  };

  // Choosing the side yourself (to swap `from` for, or to add with no
  // `from`): see SidePicker.
  const chooseSide = (date: string, slot: MealSlot, offer: Suggestion, rank: number, from: Dish | null) => setPicking({ date, slot, offer, rank, from });

  // One side of an offer changed: swapped for the next that could go
  // there (`to` given, `from` given), dropped, or added.
  const changeSide = (date: string, slot: MealSlot, offer: Suggestion, rank: number, from: Dish | null, to: Dish | null) => {
    const sides = from ? offer.sides.flatMap((d) => (d === from ? (to ? [to] : []) : [d])) : to ? [...offer.sides, to] : offer.sides;
    const plate = `${date}|${slot}|${offer.main.key}`;
    setSideEdits((prev) => ({ ...prev, [plate]: sides }));
    if (from) setSidesPassed((prev) => ({ ...prev, [plate]: [...(prev[plate] ?? []), from.key] }));
    record(from && to ? "side-swapped" : from ? "side-removed" : "side-added", date, slot, offer, rank, to ? { name: to.name } : undefined, { sideFrom: from?.recipe?._id ?? null, sideTo: to?.recipe?._id ?? null });
  };
  // What a day's showing suggestions would add, were they all taken.
  const suggestedOn = (date: string): Macros =>
    (["breakfast", "lunch", "dinner", "snack"] as const)
      .map((slot) => offerFor(date, slot).offer)
      .reduce((sum, o) => (o ? { calories: sum.calories + o.calories, protein: sum.protein + o.protein, carbs: sum.carbs + o.carbs, fats: sum.fats + o.fats } : sum), { calories: 0, protein: 0, carbs: 0, fats: 0 });

  const record = (action: SuggestionAction, date: string, slot: MealSlot, offer: Suggestion, rank: number, chosen?: { name: string }, side?: { sideFrom: string | null; sideTo: string | null }) =>
    recordSuggestion(action, date, slot, offer, rank, { chosen, side });

  // A suggestion was showing and you put something else there instead: the
  // most telling thing there is about what it should have offered. Noticed
  // when the plan comes back with that slot filled by hand (see
  // suggestionRecord.ts, which keeps what was on offer while this screen is
  // away at the add sheet).
  useEffect(() => {
    if (!suggesting || !kitchen || !ready || !plan.ready) return;
    settleSuggestions(weekEntries, week);
    noteSuggestions(
      week,
      week.flatMap((date) =>
        (["breakfast", "lunch", "dinner"] as const).flatMap((slot) => {
          const { key, offer, rank } = offerFor(date, slot);
          // (An offer to add to a meal that's already started isn't replaced by what's there.)
          return offer && !weekEntries.some((e) => e.date === date && e.slot === slot) ? [{ key, offer, rank }] : [];
        }),
      ),
      suggestions,
      true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, suggestions, turn, waved]);

  // Taking a suggestion plans the main and its sides as ordinary meals.
  async function acceptSuggestion(date: string, slot: MealSlot, offer: Suggestion, rank: number) {
    try {
      for (const dish of offer.beside ? offer.sides : [offer.main, ...offer.sides]) {
        await createMealPlanEntry({ date, slot, status: "planned", suggested: true, ...(dish.recipe ? { recipe: dish.recipe._id, recipeServings: 1 } : dish.ingredient ? { ingredient: dish.ingredient._id, ingredientQuantity: dish.ingredient.defaultPortionAmount || 1, ingredientUnit: dish.ingredient.defaultPortionUnit ?? "" } : { meal: dish.meal!._id }) });
      }
      record("accepted", date, slot, offer, rank);
      reload();
    } catch (error) {
      Alert.alert("Couldn't add it", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  // The numbers card has two pages, swiped between: one day (shown first),
  // and the week.
  // Clicking a day at the top of the grid picks it and turns to its page.
  const [page, setPage] = useState<0 | 1>(0);
  const [pickedDay, setPickedDay] = useState(today);
  const pickedDayShown = week.includes(pickedDay) ? pickedDay : week.includes(today) ? today : week[0];
  const pager = useRef<ScrollView>(null);
  const turnTo = (next: 0 | 1) => {
    setPage(next);
    pager.current?.scrollTo({ x: next * PAGE_WIDTH, animated: true });
  };
  const pickedEntries = weekEntries.filter((e) => e.date === pickedDayShown);
  const dayEaten = computeDayNutrition(pickedEntries.filter((e) => e.status === "confirmed"), conversions);
  const dayPlanned = computeDayNutrition(pickedEntries.filter((e) => e.status === "planned"), conversions);
  const dayCount = pickedEntries.filter((e) => e.status === "confirmed").length;
  const longDay = (date: string) => {
    const d = parseLocalDate(date);
    return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  };

  return (
    <WebPage maxWidth={1760}>
      {/* Toolbar */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16, gap: 8 }}>
        <Button label="This week" onPress={() => setFocusDate(today)} />
        <IconButton icon="chevron-back" label="Previous week" onPress={() => setFocusDate((d) => addDays(d, -7))} />
        <IconButton icon="chevron-forward" label="Next week" onPress={() => setFocusDate((d) => addDays(d, 7))} />
        <Text style={{ flex: 1, marginLeft: 6, fontSize: 20, fontWeight: "700", color: WEB.text }}>{range}</Text>
        <Button label={suggesting ? "Suggestions on" : "Suggestions off"} icon={suggesting ? "sparkles" : "sparkles-outline"} onPress={() => setSuggesting(!suggesting)} />
        <Button label="Grocery list" icon="cart-outline" onPress={() => router.navigate("/grocery-list")} />
      </View>

      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
        {/* The week */}
        <View style={{ flex: 1, backgroundColor: WEB.card, borderWidth: 1, borderColor: WEB.border, borderRadius: 16, overflow: "hidden" }}>
          {/* Days */}
          <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: WEB.border }}>
            <View style={{ width: LABEL_WIDTH }} />
            {week.map((day) => {
              const d = parseLocalDate(day);
              const isToday = day === today;
              const dayEntries = weekEntries.filter((e) => e.date === day);
              const done = kcalOf(dayEntries.filter((e) => e.status === "confirmed"));
              const ahead = kcalOf(dayEntries.filter((e) => e.status === "planned"));
              const goal = settings.dailyCalorieLimit;
              const pct = (n: number) => `${Math.max(0, Math.min(100, goal ? (n / goal) * 100 : 0))}%` as const;
              const over = !!goal && done > goal * 1.05;
              const chosen = page === 0 && day === pickedDayShown;
              return (
                <Pressable
                  key={day}
                  onPress={() => {
                    setPickedDay(day);
                    turnTo(0);
                  }}
                  accessibilityLabel={`Show ${longDay(day)}`}
                  style={({ hovered }: { hovered?: boolean }) => ({
                    flex: 1,
                    padding: 10,
                    borderLeftWidth: 1,
                    borderLeftColor: WEB.border,
                    borderTopWidth: 3,
                    borderTopColor: isToday || chosen ? WEB.blue : "transparent",
                    backgroundColor: chosen ? "#DBEAFE" : hovered ? "#EEF2F7" : isToday ? "#F8FBFF" : WEB.card,
                  })}
                >
                  <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                    <Text style={{ fontSize: 20, fontWeight: isToday ? "700" : "500", color: isToday ? WEB.blue : WEB.text }}>{d.getDate()}</Text>
                    <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: "600", color: isToday ? WEB.blue : WEB.muted }}>{WEEKDAYS_SHORT[d.getDay()]}</Text>
                  </View>
                  <Text style={{ marginTop: 4, fontSize: 12, color: WEB.muted }}>
                    <Text style={{ fontWeight: "700", color: over ? WEB.red : WEB.text }}>{Math.round(done)}</Text>
                    {ahead > 0 && <Text style={{ color: WEB.faint }}> +{Math.round(ahead)}</Text>} kcal
                  </Text>
                  {/* What the suggestions showing would add, in their colour. */}
                  {suggestedOn(day).calories > 0 && (
                    <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 11, fontWeight: "600", color: "#7C3AED" }}>
                      <Ionicons name="sparkles" size={9} color="#7C3AED" /> +{Math.round(suggestedOn(day).calories)} suggested
                    </Text>
                  )}
                  <View style={{ marginTop: 5, height: 5, borderRadius: 3, backgroundColor: "#EEF2F7", overflow: "hidden", flexDirection: "row" }}>
                    <View style={{ width: pct(done), backgroundColor: over ? WEB.red : WEB.blue }} />
                    <View style={{ width: pct(Math.min(ahead, Math.max(0, (goal ?? 0) - done))), backgroundColor: WEB.blue, opacity: 0.3 }} />
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* A row per meal */}
          {SLOTS.map((slot, row) => (
            <View key={slot.id} style={{ flexDirection: "row", borderBottomWidth: row < SLOTS.length - 1 ? 1 : 0, borderBottomColor: WEB.border }}>
              <View style={{ width: LABEL_WIDTH, padding: 12 }}>
                <Ionicons name={slot.icon} size={18} color={slot.iconColor} />
                <Text style={{ marginTop: 4, fontSize: 13, fontWeight: "700", color: WEB.body }}>{slot.label}</Text>
              </View>
              {week.map((day) => {
                const inCell = weekEntries.filter((e) => e.date === day && e.slot === slot.id);
                return (
                  <View
                    key={day}
                    style={{ flex: 1, minHeight: 118, padding: 6, borderLeftWidth: 1, borderLeftColor: WEB.border, backgroundColor: day === today ? "#F8FBFF" : WEB.card }}
                  >
                    {inCell.map((entry) => {
                      const isEaten = entry.status === "confirmed";
                      return (
                        <Pressable
                          key={entry._id}
                          onPress={() => entryMenu(entry)}
                          style={({ hovered }: Hover) => ({
                            flexDirection: "row",
                            marginBottom: 5,
                            borderRadius: 9,
                            borderWidth: 1,
                            borderStyle: isEaten ? "solid" : "dashed",
                            borderColor: isEaten ? "#BBF7D0" : "#CBD5E1",
                            backgroundColor: hovered ? "#F1F5F9" : isEaten ? "#F0FDF4" : "#FFFFFF",
                          })}
                        >
                          <Pressable
                            onPress={() => toggleEaten(entry)}
                            accessibilityLabel={isEaten ? "Mark as not eaten" : "Mark as eaten"}
                            style={{ width: 26, alignItems: "center", paddingTop: 7 }}
                          >
                            <Ionicons name={isEaten ? "checkmark-circle" : "ellipse-outline"} size={16} color={isEaten ? WEB.green : WEB.faint} />
                          </Pressable>
                          <View style={{ flex: 1, paddingVertical: 5, paddingRight: 6 }}>
                            <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: "600", lineHeight: 15, color: WEB.text }}>
                              {entryName(entry)}
                              {entry.usual ? " " : ""}
                              {entry.usual && <Ionicons name="repeat" size={11} color={WEB.blue} />}
                            </Text>
                            <Text style={{ marginTop: 1, fontSize: 11, color: WEB.muted }}>{Math.round(kcalOf([entry]))} kcal</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                    {/* Nothing planned: a suggestion, to take or leave. */}
                    {(() => {
                      const { key, offers, rank, offer } = offerFor(day, slot.id);
                      if (!offer) return null;
                      return (
                        // One plate, shown as a card a dish: the main can be turned
                        // over for another plate, a side swapped or dropped, and the
                        // strip beneath plans or waves away the lot.
                        <View style={{ marginBottom: 5 }}>
                          {(offer.beside ? offer.sides : [offer.main, ...offer.sides]).map((dish, position) => {
                            // (Beside a planned main, every card is a side.)
                            const index = offer.beside ? position + 1 : position;
                            const next = index ? (sideOptions(day, slot.id, offer)[0] ?? null) : null;
                            return (
                              <View key={dish.key} style={{ marginBottom: 4, borderRadius: 9, borderWidth: 1, borderStyle: "dashed", borderColor: "#C4B5FD", backgroundColor: "#F5F3FF", paddingLeft: 8, paddingRight: 4, paddingVertical: 5 }}>
                                <Pressable onPress={() => (dish.recipe ? router.push({ pathname: "/recipes/[id]", params: { id: dish.recipe._id } }) : undefined)}>
                                  <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: "600", lineHeight: 15, color: "#5B21B6" }}>
                                    {index === 0 && <Ionicons name="sparkles" size={10} color="#7C3AED" />}
                                    {index === 0 ? " " : ""}
                                    {dish.name}
                                  </Text>
                                </Pressable>
                                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 1 }}>
                                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, color: "#7C3AED" }}>
                                    {Math.round(dish.calories)} kcal · P {Math.round(dish.protein)} g
                                  </Text>
                                  {index === 0 && offers.length > 1 && (
                                    <SuggestionButton
                                      icon="refresh"
                                      label="Another"
                                      onPress={() => {
                                        record("another", day, slot.id, offer, rank);
                                        setTurn((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
                                      }}
                                    />
                                  )}
                                  {index > 0 && next && <SuggestionButton icon="swap-horizontal" label={`Swap ${dish.name}`} onPress={() => chooseSide(day, slot.id, offer, rank, dish)} />}
                                  {index > 0 && <SuggestionButton icon="close" label={`Drop ${dish.name}`} onPress={() => changeSide(day, slot.id, offer, rank, dish, null)} />}
                                </View>
                              </View>
                            );
                          })}
                          {/* The plate as a whole. */}
                          <View style={{ paddingLeft: 4 }}>
                            <Text numberOfLines={2} style={{ fontSize: 11, lineHeight: 14, color: "#7C3AED" }}>
                              {offer.sides.length > 0 && <Text style={{ fontWeight: "700" }}>{offer.beside ? "+" : ""}{Math.round(offer.calories)} kcal · P {Math.round(offer.protein)} g</Text>}
                              {offer.sides.length > 0 && offer.reasons[0] ? " · " : ""}
                              {offer.reasons[0] ?? ""}
                            </Text>
                            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}>
                              <Pressable
                                onPress={() => void acceptSuggestion(day, slot.id, offer, rank)}
                                accessibilityLabel="Plan it"
                                style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", height: 24, paddingHorizontal: 9, borderRadius: 7, backgroundColor: hovered ? "#6D28D9" : "#7C3AED" })}
                              >
                                <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                                <Text style={{ marginLeft: 3, fontSize: 11, fontWeight: "700", color: "#FFFFFF" }}>Plan</Text>
                              </Pressable>
                              <View style={{ flex: 1 }} />
                              {offer.sides.length < 3 && sideOptions(day, slot.id, offer).length > 0 && (
                                <SuggestionButton icon="add" label="Add a side" onPress={() => chooseSide(day, slot.id, offer, rank, null)} />
                              )}
                              <SuggestionButton
                                icon="close"
                                label="No suggestion here"
                                onPress={() => {
                                  record("dismissed", day, slot.id, offer, rank);
                                  setWaved((prev) => [...prev, key]);
                                }}
                              />
                            </View>
                          </View>
                        </View>
                      );
                    })()}
                    <Pressable
                      onPress={() => addFood(day, slot.id)}
                      accessibilityLabel={`Add ${slot.label.toLowerCase()}`}
                      style={({ hovered }: Hover) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        height: 26,
                        borderRadius: 8,
                        backgroundColor: hovered ? WEB.blueSoft : "transparent",
                      })}
                    >
                      {({ hovered }: Hover) => (
                        <>
                          <Ionicons name="add" size={14} color={hovered ? WEB.blue : "#CBD5E1"} />
                          <Text style={{ marginLeft: 2, fontSize: 11, fontWeight: "600", color: hovered ? WEB.blue : "#CBD5E1" }}>Add</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        {/* The week in numbers */}
        <View style={{ width: SUMMARY_WIDTH, gap: 16 }}>
          <Card padded={false}>
            <ScrollView
              ref={pager}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={32}
              onScroll={(e) => {
                const next = e.nativeEvent.contentOffset.x > PAGE_WIDTH / 2 ? 1 : 0;
                if (next !== page) setPage(next);
              }}
            >
              <Numbers
                title={longDay(pickedDayShown)}
                subtitle={`${pickedDayShown === today ? "Today · " : ""}${dayCount} eaten${pickedEntries.length > dayCount ? `, ${pickedEntries.length - dayCount} planned` : ""}`}
                eaten={dayEaten}
                planned={dayPlanned}
                days={1}
                settings={settings}
                line={pickedEntries.length ? "" : "Nothing planned or eaten"}
                suggested={suggestedOn(pickedDayShown)}
                week={pickedDayShown >= today ? suggestions.aim(pickedDayShown) : null}
              />
              <Numbers
                title="This week"
                subtitle={`${loggedDays} of 7 days logged`}
                eaten={eaten}
                planned={planned}
                days={7}
                settings={settings}
                suggested={week.map(suggestedOn).reduce((sum, m) => ({ calories: sum.calories + m.calories, protein: sum.protein + m.protein, carbs: sum.carbs + m.carbs, fats: sum.fats + m.fats }), { calories: 0, protein: 0, carbs: 0, fats: 0 })}
                line={loggedDays > 0 ? `${Math.round((eaten.calories ?? 0) / loggedDays)} kcal a day on logged days` : "Nothing logged yet"}
              />
            </ScrollView>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingBottom: 14 }}>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 14 }}>
                <Legend color="#F0FDF4" border="#BBF7D0" label="Eaten" />
                <Legend color="#FFFFFF" border="#CBD5E1" dashed label="Planned" />
              </View>
              {/* Which page is showing; click to turn. */}
              {([0, 1] as const).map((n) => (
                <Pressable key={n} onPress={() => turnTo(n)} accessibilityLabel={n ? "The week" : "The day"} style={{ padding: 4 }}>
                  <View style={{ width: page === n ? 16 : 7, height: 7, borderRadius: 4, backgroundColor: page === n ? WEB.blue : "#CBD5E1" }} />
                </Pressable>
              ))}
            </View>
          </Card>
          {/* What the meals still to come need doing first (see planNeeds.ts). */}
          {/* What the kitchen needs doing, and what's wrong with the plan: the
              lists in full are on the Prep & shopping page. */}
          <Card title="Kitchen tasks" subtitle="Today and tomorrow" action={<CardLink label="Overview" onPress={() => router.push("/kitchen")} />} padded={false}>
            <KitchenTasks plan={plan} days={1} onChanged={reload} />
          </Card>
          <NeedsSummaryCard side="prep" plan={plan} onOpen={() => router.push("/kitchen/needs")} onBook={() => setAdding("prep")} />
          <NeedsSummaryCard side="buy" plan={plan} onOpen={() => router.push("/kitchen/needs")} onBook={() => setAdding("shop")} />
        </View>
      </View>

      {confirm.modals}
      {picking && (
        <SidePicker
          title={picking.from ? `Swap ${picking.from.name} for` : `Add beside ${picking.offer.main.name}`}
          likely={suggestions.sidesFor(picking.offer).slice(0, 4)}
          find={(query) => suggestions.find(query).filter((d) => d.key !== picking.offer.main.key && !picking.offer.sides.some((s) => s.key === d.key))}
          onPick={(dish) => {
            changeSide(picking.date, picking.slot, picking.offer, picking.rank, picking.from, dish);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
      {adding && (
        <SessionBooker
          kind={adding}
          today={today}
          // The week being planned, unless that's behind us.
          start={week[6] >= today ? week[0] : today}
          onClose={() => {
            setAdding(null);
            plan.reload();
          }}
        />
      )}
    </WebPage>
  );
}

// One page of the numbers card: what was eaten (and what's still planned)
// against the goals for that many days.
function Numbers({
  title,
  subtitle,
  eaten,
  planned,
  days,
  settings,
  line,
  suggested,
  week,
}: {
  title: string;
  subtitle: string;
  eaten: ReturnType<typeof computeDayNutrition>;
  planned: ReturnType<typeof computeDayNutrition>;
  days: number;
  settings: AppSettings;
  line: string;
  // What the suggestions on show would add, if there are any.
  suggested?: Macros;
  // The day's calorie aim once the week so far is counted (see the weekly
  // balance in utils/recommend.ts), where it differs from the plain goal.
  week?: { aim: number; carry: number } | null;
}) {
  const goal = (n: number | null) => (n != null ? n * days : null);
  // Eaten, planned and suggested together, against a goal.
  const withAll = (key: keyof Macros, target: number | null) => {
    const total = Math.round((eaten[key] ?? 0) + (planned[key] ?? 0) + (suggested?.[key] ?? 0));
    return { total, over: target != null && total > target * 1.05, target };
  };
  const shifted = week && settings.dailyCalorieLimit && Math.abs(week.aim - settings.dailyCalorieLimit) >= 10 ? week : null;
  return (
    <View style={{ width: PAGE_WIDTH, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14 }}>
      <Text style={{ fontSize: 15, fontWeight: "700", color: WEB.text }}>{title}</Text>
      <Text style={{ marginTop: 1, marginBottom: 10, fontSize: 12, color: WEB.muted }}>{subtitle}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text style={{ fontSize: 28, fontWeight: "700", color: WEB.text }}>{Math.round(eaten.calories ?? 0)}</Text>
        {(planned.calories ?? 0) > 0 && <Text style={{ marginLeft: 6, fontSize: 15, fontWeight: "600", color: WEB.faint }}>+{Math.round(planned.calories ?? 0)}</Text>}
        <Text style={{ marginLeft: 6, fontSize: 13, color: WEB.muted }}>kcal</Text>
      </View>
      <Text style={{ marginTop: 2, fontSize: 12, color: WEB.muted }}>
        {[line, settings.dailyCalorieLimit ? `goal ${settings.dailyCalorieLimit}${days === 1 ? " kcal" : ""}` : ""].filter(Boolean).join(" · ")}
      </Text>
      {shifted && (
        <Text style={{ marginTop: 2, fontSize: 12, lineHeight: 16, color: "#7C3AED" }}>
          <Ionicons name="sparkles" size={10} color="#7C3AED" /> Suggesting towards <Text style={{ fontWeight: "700" }}>{Math.round(shifted.aim)} kcal</Text>: the week is {Math.abs(Math.round(shifted.carry))} kcal {shifted.carry > 0 ? "over" : "under"} so far
        </Text>
      )}
      <GoalBar label="Calories" value={eaten.calories ?? 0} planned={planned.calories ?? 0} goal={goal(settings.dailyCalorieLimit)} unit="kcal" />
      <GoalBar label="Protein" value={eaten.protein ?? 0} planned={planned.protein ?? 0} goal={goal(settings.dailyProteinLimit)} unit="g" />
      <GoalBar label="Carbs" value={eaten.carbs ?? 0} planned={planned.carbs ?? 0} goal={goal(settings.dailyCarbsLimit)} unit="g" color="#D97706" />
      <GoalBar label="Fats" value={eaten.fats ?? 0} planned={planned.fats ?? 0} goal={goal(settings.dailyFatsLimit)} unit="g" color="#DB2777" />
      {/* Where the suggestions on show would take it. */}
      {!!suggested && suggested.calories > 0 && (
        <View style={{ marginTop: 14, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: "#C4B5FD", backgroundColor: "#F5F3FF", paddingHorizontal: 10, paddingVertical: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#5B21B6" }}>
            <Ionicons name="sparkles" size={11} color="#7C3AED" /> With the suggestions
          </Text>
          <Text style={{ marginTop: 2, fontSize: 11, color: "#7C3AED" }}>
            they add {Math.round(suggested.calories)} kcal · P {Math.round(suggested.protein)} · C {Math.round(suggested.carbs)} · F {Math.round(suggested.fats)} g
          </Text>
          <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 2 }}>
            {(
              [
                ["kcal", withAll("calories", shifted ? shifted.aim : goal(settings.dailyCalorieLimit))],
                ["P", withAll("protein", goal(settings.dailyProteinLimit))],
                ["C", withAll("carbs", goal(settings.dailyCarbsLimit))],
                ["F", withAll("fats", goal(settings.dailyFatsLimit))],
              ] as const
            ).map(([label, sum]) => (
              <Text key={label} style={{ fontSize: 12, color: "#5B21B6" }}>
                <Text style={{ fontWeight: "700", color: sum.over ? WEB.red : "#5B21B6" }}>{sum.total}</Text>
                {sum.target != null ? ` / ${Math.round(sum.target)}` : ""} {label}
              </Text>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function SuggestionButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ hovered }: { hovered?: boolean }) => ({ width: 24, height: 22, alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: hovered ? "#DDD6FE" : "transparent" })}
    >
      <Ionicons name={icon} size={14} color="#6D28D9" />
    </Pressable>
  );
}

function Legend({ color, border, dashed, label }: { color: string; border: string; dashed?: boolean; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={{ width: 16, height: 12, borderRadius: 4, backgroundColor: color, borderWidth: 1, borderColor: border, borderStyle: dashed ? "dashed" : "solid" }} />
      <Text style={{ marginLeft: 6, fontSize: 11, color: WEB.muted }}>{label}</Text>
    </View>
  );
}
