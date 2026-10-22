import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";

import { addDays, MONTHS_FULL, MONTHS_SHORT, WEEKDAYS_SHORT, weekOf } from "@/src/components/calendar/calendarUtils";
import { entryName } from "@/src/components/calendar/mealFood";
import { useEntryConfirm } from "@/src/components/planner/useEntryConfirm";
import { SidePicker } from "@/src/components/planner/SidePicker";
import { MenuCard, MenuOverlay } from "@/src/components/planner/web/MenuCard";
import { DragSource, DropTarget } from "@/src/components/web/dragDrop";
import { getWebScale } from "@/src/components/web/scale";
import { SessionBooker } from "@/src/components/planner/web/SessionBooker";
import { type PieceChoice } from "@/src/components/planner/usePlanNeeds";
import { AmountPicker, PieceSizePicker } from "@/src/components/planner/PieceSizePicker";
import type { AmountSlot, PieceSlot } from "@/src/utils/pieceSizing";
import { noteSuggestions, recordSuggestion, settleSuggestions, type SuggestionAction } from "@/src/components/planner/suggestionRecord";
import { usePlanNeeds } from "@/src/components/planner/usePlanNeeds";
import { showActions } from "@/src/components/todo/theme";
import { TickRing } from "@/src/components/ui/TickRing";
import { Button, Card, hoverable, WebPage } from "@/src/components/web/ui";
import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import { getMeals, type Meal } from "@/src/services/mealApi";
import { addToMenu, getMenu, menuName, type MenuItem } from "@/src/services/menuApi";
import {
  createMealPlanEntry,
  deleteMealPlanEntry,
  getMealPlanRange,
  moveMealPlanEntry,
  setMealPlanEntryPieces,
  unconfirmMealPlanEntry,
  type MealPlanEntry,
  type PieceSizeInput,
  type MealSlot,
} from "@/src/services/mealPlanApi";
import { getPantryItems } from "@/src/services/pantryApi";
import { getRecipes, type Recipe } from "@/src/services/recipeApi";
import { DEFAULT_SETTINGS, loadSettings, type AppSettings } from "@/src/services/settingsService";
import { stopUsualMeal } from "@/src/services/usualMealApi";
import type { PantryItem } from "@/src/types/pantry";
import { computeDayNutrition, parseLocalDate, SLOTS, todayStr } from "@/src/utils/mealPlan";
import { suggestMeals, type Dish, type Macros, type Suggestion, type Suggestions } from "@/src/utils/recommend";
import { nutrientColor, type MainNutrient } from "@/src/theme/nutrients";
import { OrbitPage, SECTION_PALETTE, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// The planner in a desktop browser: the whole week at once. A column per
// day and a row per meal, each cell holding what's planned or eaten, with
// the day's calories on top and the week's totals down the side. The phone
// planner shows one day at a time, for logging; this is for laying the
// week out. In Orbit's look, in the Kitchen's orange (today, the day picked,
// something being placed); the suggestions as the phone's, and the
// nutrients in their own colours.

type Hover = { hovered?: boolean };
type IconName = keyof typeof Ionicons.glyphMap;
// The Kitchen's pale wash: icon wells, the day picked, where a drop lands;
// fainter, today's column.
const TINT = SECTION_PALETTE.kitchen.tint;
const TODAY_WASH = "rgba(255, 224, 194, 0.3)";
// What's dragged on the week: a menu item, or a planned meal.
type Carried = { menu: MenuItem } | { entry: MealPlanEntry };

const LABEL_WIDTH = 104;
const SUMMARY_WIDTH = 300;
// One page of the numbers card (the card, less its border).
const PAGE_WIDTH = SUMMARY_WIDTH - 2;

export function WebWeekPlanScreen() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
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
    getMenu().then(setMenu).catch(() => {});
  }, []);
  // The menu (see MenuCard), and the item of it being put on a day.
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [placing, setPlacing] = useState<MenuItem | null>(null);
  // What's being dragged — a menu item onto the week, or a planned meal to
  // another day or meal (or back onto the menu) — and the meal it's over.
  const [carrying, setCarrying] = useState<Carried | null>(null);
  const [dropOver, setDropOver] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuChanged = () => {
    getMenu().then(setMenu).catch(() => {});
    plan.reload();
  };

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

  // Something dropped on a day's meal: a menu item is placed there, a
  // planned meal moved there.
  function dropOn(date: string, slot: MealSlot, carried: Carried) {
    if ("menu" in carried) return placeHere(date, slot, carried.menu);
    const { entry } = carried;
    if (entry.date === date && entry.slot === slot) return;
    moveMealPlanEntry(entry._id, date, slot).then(reload, fail);
  }

  // A planned meal dropped on the menu: off its day, and back on the menu
  // to place again later.
  function sideline(entry: MealPlanEntry) {
    const recipe = entry.recipe ? (typeof entry.recipe === "string" ? entry.recipe : entry.recipe._id) : null;
    const meal = entry.meal ? (typeof entry.meal === "string" ? entry.meal : entry.meal._id) : null;
    if (!recipe && !meal) return;
    addToMenu(recipe ? { recipe } : { meal: meal! })
      .then(() => deleteMealPlanEntry(entry._id))
      .then(reload, fail);
  }

  // A serving of a menu item (the one being placed), on this day's meal.
  function placeHere(date: string, slot: MealSlot, item = placing) {
    if (!item) return;
    setPlacing(null);
    createMealPlanEntry({ date, slot, status: "planned", menuItem: item._id, ...(item.recipe ? { recipe: item.recipe._id, recipeServings: 1 } : { meal: item.meal!._id }) }).then(reload, fail);
  }

  const confirm = useEntryConfirm({
    allRecipes: kitchen?.recipes ?? [],
    allIngredients: kitchen?.ingredients ?? [],
    pantryItems: kitchen?.pantry ?? [],
    settings: settingsLoaded ? settings : null,
    ready: !!kitchen && settingsLoaded,
    // (`plan` is set up further down; this is only called once it is.)
    sized: (entries) => plan.sized(entries),
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
      // Still to come, and takes a whole piece (a steak, or a bag made from
      // one) or has lines that ask how much: on a card of its own.
      ...(plan.pieceSlots(entry).length || plan.amountSlots(entry).length ? [{ label: plan.pieceSlots(entry).length ? "Change how big…" : "Change how much…", onPress: () => setChoosing(entry) }] : []),
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
  // The planned meal whose piece is being chosen.
  const [choosing, setChoosing] = useState<MealPlanEntry | null>(null);
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
      menu,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggesting, kitchen, ready, plan.ready, plan.sessions, plan.upcoming, entries, history, week[0], today, settings, menu]);

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
        await createMealPlanEntry({ date, slot, status: "planned", suggested: true, ...(dish === offer.main && offer.menuItem ? { menuItem: offer.menuItem } : {}), ...(dish.recipe ? { recipe: dish.recipe._id, recipeServings: 1 } : dish.ingredient ? { ingredient: dish.ingredient._id, ingredientQuantity: dish.ingredient.defaultPortionAmount || 1, ingredientUnit: dish.ingredient.defaultPortionUnit ?? "" } : { meal: dish.meal!._id }) });
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

  // The week as tall as the window has room for, down to the bottom of the
  // screen: its rows share the height (and grow past it only for a full
  // meal), the menu beside it filling the same.
  const weekRow = useRef<View>(null);
  const { height: windowHeight } = useWindowDimensions();
  const [fitHeight, setFitHeight] = useState(0);
  const fitToWindow = useCallback(() => {
    const node = weekRow.current as unknown as HTMLElement | null;
    if (!node?.getBoundingClientRect || typeof window === "undefined") return;
    // (On screen, the layout is scaled: see web/scale.ts.)
    const scale = getWebScale();
    const top = node.getBoundingClientRect().top;
    setFitHeight(Math.max(0, Math.floor((window.innerHeight - top) / scale) - 24));
  }, []);
  useEffect(fitToWindow, [fitToWindow, windowHeight]);

  const kcalColor = nutrientColor("calories");

  return (
    <OrbitPage>
    <WebPage maxWidth={1760}>
      {/* Toolbar: the week on show as the page's title */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 18, gap: 8 }}>
        <Button label="This week" onPress={() => setFocusDate(today)} />
        <RoundButton icon="chevron-back" label="Previous week" onPress={() => setFocusDate((d) => addDays(d, -7))} colors={c} />
        <RoundButton icon="chevron-forward" label="Next week" onPress={() => setFocusDate((d) => addDays(d, 7))} colors={c} />
        <Text numberOfLines={1} style={{ flex: 1, marginLeft: 8, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>{range}</Text>
        <Button label={suggesting ? "Suggestions on" : "Suggestions off"} icon={suggesting ? "sparkles" : "sparkles-outline"} onPress={() => setSuggesting(!suggesting)} />
        <Button label="Grocery list" icon="cart-outline" onPress={() => router.navigate("/grocery-list")} />
      </View>

      {/* (The side column as tall as the week, its menu filling what's left.) */}
      <View ref={weekRow} onLayout={fitToWindow} style={{ flexDirection: "row", alignItems: "stretch", gap: 16, minHeight: fitHeight }}>
        {/* The week */}
        <View style={{ flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 18, overflow: "hidden" }}>
          {/* Days */}
          <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.border }}>
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
                  style={hoverable(({ hovered }) => ({
                    flex: 1,
                    padding: 10,
                    borderLeftWidth: 1,
                    borderLeftColor: c.border,
                    borderTopWidth: 3,
                    borderTopColor: isToday || chosen ? c.ink : "transparent",
                    backgroundColor: chosen ? TINT : hovered ? c.pill : isToday ? TODAY_WASH : c.surface,
                  }))}
                >
                  <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                    <Text style={{ fontSize: 20, fontWeight: isToday ? "800" : "600", letterSpacing: -0.3, color: isToday ? c.ink : c.text }}>{d.getDate()}</Text>
                    <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: "600", color: isToday ? c.ink : c.muted }}>{WEEKDAYS_SHORT[d.getDay()]}</Text>
                  </View>
                  <Text style={{ marginTop: 4, fontSize: 12, color: c.muted }}>
                    <Text style={{ fontWeight: "700", color: over ? c.danger : c.text }}>{Math.round(done)}</Text>
                    {ahead > 0 && <Text style={{ color: c.faint }}> +{Math.round(ahead)}</Text>} kcal
                  </Text>
                  {/* What the suggestions showing would add, in their colour. */}
                  {suggestedOn(day).calories > 0 && (
                    <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 11, fontWeight: "600", color: c.accent }}>
                      <Ionicons name="sparkles" size={9} color={c.accent} /> +{Math.round(suggestedOn(day).calories)} suggested
                    </Text>
                  )}
                  {/* (The calories' own colour, over the goal too: the number turns red.) */}
                  <View style={{ marginTop: 6, height: 5, borderRadius: 2.5, backgroundColor: c.track, overflow: "hidden", flexDirection: "row" }}>
                    <View style={{ width: pct(done), backgroundColor: kcalColor }} />
                    <View style={{ width: pct(Math.min(ahead, Math.max(0, (goal ?? 0) - done))), backgroundColor: kcalColor, opacity: 0.35 }} />
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* A row per meal */}
          {SLOTS.map((slot, row) => (
            <View key={slot.id} style={{ flexDirection: "row", flexGrow: 1, borderBottomWidth: row < SLOTS.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
              {/* (Its icon in a node, as on the phone's Log.) */}
              <View style={{ width: LABEL_WIDTH, padding: 12 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: c.node, borderWidth: 1, borderColor: c.nodeBorder }}>
                  <Ionicons name={slot.icon} size={16} color={c.icon} />
                </View>
                <Text style={{ marginTop: 8, fontSize: 14, fontWeight: "700", color: c.text }}>{slot.label}</Text>
                <Text style={{ marginTop: 1, fontSize: 12, color: c.faint }}>{slot.time}</Text>
              </View>
              {week.map((day) => {
                const inCell = weekEntries.filter((e) => e.date === day && e.slot === slot.id);
                // (Something to place or move: only on days still to come.)
                const target = (placing || carrying) && day >= today ? (carrying && "entry" in carrying ? "Move here" : "Place here") : null;
                return (
                  <DropTarget
                    key={day}
                    accepts={() => day >= today}
                    onDrop={(carried) => dropOn(day, slot.id, carried as Carried)}
                    onHover={(over) => setDropOver((at) => (over ? `${day}|${slot.id}` : at === `${day}|${slot.id}` ? null : at))}
                    style={{ flex: 1, minHeight: 118, padding: 6, borderLeftWidth: 1, borderLeftColor: c.border, backgroundColor: dropOver === `${day}|${slot.id}` ? TINT : day === today ? TODAY_WASH : c.surface }}
                  >
                    {inCell.map((entry) => {
                      const isEaten = entry.status === "confirmed";
                      return (
                        // (Still to come: dragged to another day or meal, or onto the menu.)
                        // (As on the phone's Log: eaten, a card; planned, a dashed outline.)
                        <DragSource key={entry._id} payload={isEaten ? null : { entry }} onStart={() => setCarrying({ entry })} onEnd={() => (setCarrying(null), setDropOver(null))} style={isEaten ? undefined : ({ cursor: "grab" } as object)}>
                        <Pressable
                          onPress={() => entryMenu(entry)}
                          style={hoverable(({ hovered }) => ({
                            flexDirection: "row",
                            marginBottom: 5,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderStyle: isEaten ? "solid" : "dashed",
                            borderColor: isEaten ? c.border : c.orbit,
                            backgroundColor: hovered ? c.pill : isEaten ? c.surface : "transparent",
                          }))}
                        >
                          <Pressable
                            onPress={() => toggleEaten(entry)}
                            accessibilityLabel={isEaten ? "Mark as not eaten" : "Mark as eaten"}
                            style={{ width: 26, alignItems: "center", paddingTop: 7 }}
                          >
                            <Ionicons name={isEaten ? "checkmark-circle" : "ellipse-outline"} size={16} color={isEaten ? c.ink : c.faint} />
                          </Pressable>
                          <View style={{ flex: 1, paddingVertical: 5, paddingRight: 6 }}>
                            <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: "600", lineHeight: 15, color: isEaten ? c.text : c.icon }}>
                              {entryName(entry)}
                              {entry.usual ? " " : ""}
                              {entry.usual && <Ionicons name="repeat" size={11} color={c.muted} />}
                            </Text>
                            <Text style={{ marginTop: 1, fontSize: 11, color: c.muted }}>{Math.round(kcalOf([entry]))} kcal</Text>
                          </View>
                        </Pressable>
                        </DragSource>
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
                              // (As the phone's suggestion card: the assistant's pale blue, a dashed ring in the Kitchen's colour.)
                              <View key={dish.key} style={{ marginBottom: 4, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: c.selectedRing, backgroundColor: c.accentSoft, paddingLeft: 8, paddingRight: 4, paddingVertical: 5 }}>
                                <Pressable onPress={() => (dish.recipe ? router.push({ pathname: "/recipes/[id]", params: { id: dish.recipe._id } }) : undefined)}>
                                  <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: "600", lineHeight: 15, color: c.text }}>
                                    {index === 0 && <Ionicons name="sparkles" size={10} color={c.accent} />}
                                    {index === 0 ? " " : ""}
                                    {dish.name}
                                  </Text>
                                </Pressable>
                                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 1 }}>
                                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, color: c.muted }}>
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
                                      colors={c}
                                    />
                                  )}
                                  {index > 0 && next && <SuggestionButton icon="swap-horizontal" label={`Swap ${dish.name}`} onPress={() => chooseSide(day, slot.id, offer, rank, dish)} colors={c} />}
                                  {index > 0 && <SuggestionButton icon="close" label={`Drop ${dish.name}`} onPress={() => changeSide(day, slot.id, offer, rank, dish, null)} colors={c} />}
                                </View>
                              </View>
                            );
                          })}
                          {/* The plate as a whole. */}
                          <View style={{ paddingLeft: 4 }}>
                            <Text numberOfLines={2} style={{ fontSize: 11, lineHeight: 14, color: c.muted }}>
                              {offer.sides.length > 0 && <Text style={{ fontWeight: "700", color: c.text }}>{offer.beside ? "+" : ""}{Math.round(offer.calories)} kcal · P {Math.round(offer.protein)} g</Text>}
                              {offer.sides.length > 0 && offer.reasons[0] ? " · " : ""}
                              {offer.reasons[0] ?? ""}
                            </Text>
                            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                              <Pressable
                                onPress={() => void acceptSuggestion(day, slot.id, offer, rank)}
                                accessibilityLabel="Plan it"
                                style={hoverable(({ hovered }) => ({ flexDirection: "row", alignItems: "center", height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: c.ink, opacity: hovered ? 0.85 : 1 }))}
                              >
                                <Ionicons name="checkmark" size={13} color={c.onInk} />
                                <Text style={{ marginLeft: 3, fontSize: 11, fontWeight: "700", color: c.onInk }}>Plan</Text>
                              </Pressable>
                              <View style={{ flex: 1 }} />
                              {offer.sides.length < 3 && sideOptions(day, slot.id, offer).length > 0 && (
                                <SuggestionButton icon="add" label="Add a side" onPress={() => chooseSide(day, slot.id, offer, rank, null)} colors={c} />
                              )}
                              <SuggestionButton
                                icon="close"
                                label="No suggestion here"
                                onPress={() => {
                                  record("dismissed", day, slot.id, offer, rank);
                                  setWaved((prev) => [...prev, key]);
                                }}
                                colors={c}
                              />
                            </View>
                          </View>
                        </View>
                      );
                    })()}
                    {/* (While a menu item's being placed: "Place here", in the Kitchen's colour.) */}
                    <Pressable
                      onPress={() => (placing && target ? placeHere(day, slot.id) : addFood(day, slot.id))}
                      accessibilityLabel={placing && target ? `Place ${menuName(placing)} here` : `Add ${slot.label.toLowerCase()}`}
                      style={hoverable(({ hovered }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: target ? (hovered ? c.selectedRing : TINT) : hovered ? c.pill : "transparent",
                      }))}
                    >
                      {({ hovered }: Hover) => (
                        <>
                          <Ionicons name="add" size={14} color={target ? c.ink : hovered ? c.onPill : c.orbit} />
                          <Text style={{ marginLeft: 2, fontSize: 11, fontWeight: "600", color: target ? c.ink : hovered ? c.onPill : c.faint }}>{target ?? "Add"}</Text>
                        </>
                      )}
                    </Pressable>
                  </DropTarget>
                );
              })}
            </View>
          ))}
        </View>

        {/* The week in numbers */}
        <View style={{ width: SUMMARY_WIDTH, gap: 16, alignSelf: "stretch" }}>
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
                <Legend color={c.surface} border={c.border} label="Eaten" colors={c} />
                <Legend color="transparent" border={c.orbit} dashed label="Planned" colors={c} />
              </View>
              {/* Which page is showing; click to turn (the phone's dots). */}
              {([0, 1] as const).map((n) => (
                <Pressable key={n} onPress={() => turnTo(n)} accessibilityLabel={n ? "The week" : "The day"} style={{ padding: 4 }}>
                  <View style={{ width: page === n ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: page === n ? c.ink : c.track }} />
                </Pressable>
              ))}
            </View>
          </Card>
          {/* The menu, to place from; the kitchen's tasks and what's to prep
              and buy are on the Overview and Prep & shopping. */}
          {/* (Fills what's beside the week without making it taller: a long
              menu scrolls inside.) */}
          <DropTarget
            style={{ flex: 1, minHeight: 220 }}
            accepts={(carried) => "entry" in (carried as Carried) && !!((carried as { entry: MealPlanEntry }).entry.recipe || (carried as { entry: MealPlanEntry }).entry.meal)}
            onDrop={(carried) => sideline((carried as { entry: MealPlanEntry }).entry)}
            onHover={(over) => setDropOver(over ? "menu" : null)}
          >
          <MenuCard
            compact
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            onOpen={() => setMenuOpen(true)}
            menu={menu}
            recipes={kitchen?.recipes ?? []}
            meals={kitchen?.meals ?? []}
            conversions={conversions}
            placing={placing?._id ?? null}
            onPlace={setPlacing}
            onDrag={(item) => (setCarrying(item ? { menu: item } : null), setDropOver(null))}
            onChanged={menuChanged}
          />
          {/* (A planned meal picked up: it can go back on the menu.) */}
          {carrying && "entry" in carrying && (carrying.entry.recipe || carrying.entry.meal) && (
            <View
              pointerEvents="none"
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", padding: 24, borderRadius: 18, borderWidth: 2, borderStyle: "dashed", borderColor: dropOver === "menu" ? c.fill : c.selectedRing, backgroundColor: dropOver === "menu" ? "rgba(255, 224, 194, 0.95)" : "rgba(255, 224, 194, 0.8)" }}
            >
              <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.surface }}>
                <Ionicons name="restaurant-outline" size={21} color={c.ink} />
              </View>
              <Text style={{ marginTop: 8, textAlign: "center", fontSize: 13, fontWeight: "700", color: c.ink }}>Drop here to take it off the day and put it back on the menu</Text>
            </View>
          )}
          </DropTarget>
        </View>
      </View>

      {menuOpen && (
        <MenuOverlay
          menu={menu}
          recipes={kitchen?.recipes ?? []}
          meals={kitchen?.meals ?? []}
          conversions={conversions}
          placing={placing?._id ?? null}
          onPlace={setPlacing}
          onChanged={menuChanged}
          onClose={() => setMenuOpen(false)}
        />
      )}
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
      {choosing && (
        <PieceChooser
          title={entryName(choosing)}
          slots={plan.pieceSlots(choosing)}
          amountSlots={plan.amountSlots(choosing)}
          choices={plan.pieceChoices(choosing)}
          kept={choosing.pieces ?? []}
          keptSizes={choosing.pieceSizes ?? []}
          caloriesFor={(sizes) => plan.sizedCalories(choosing, sizes)}
          onChoose={(pieces, sizes) => {
            setChoosing(null);
            void setMealPlanEntryPieces(choosing._id, pieces, sizes).then(() => {
              plan.reload();
              reload();
            }, fail);
          }}
          onClose={() => setChoosing(null)}
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
    </OrbitPage>
  );
}

// A round button for an arrow, like the phone's way back.
function RoundButton({ icon, label, onPress, colors: c }: { icon: IconName; label: string; onPress: () => void; colors: OrbitColors }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={hoverable(({ hovered }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border, backgroundColor: hovered ? c.pill : c.surface }))}
    >
      <Ionicons name={icon} size={18} color={c.text} />
    </Pressable>
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
  const { colors: c } = useOrbitTheme();
  // Calories as the phone's ring of marks (NutritionRings), what's left of
  // the goal in it; the macros as a bar each, in their own colours.
  const kcal = eaten.calories ?? 0;
  const kcalPlanned = planned.calories ?? 0;
  const kcalGoal = goal(settings.dailyCalorieLimit);
  const share = (n: number, of: number | null) => (of && of > 0 ? n / of : 0);
  // (A little over isn't flagged: within 5% reads as on target.)
  const kcalOver = kcalGoal != null && kcal > kcalGoal * 1.05;
  const left = kcalGoal != null ? kcalGoal - kcal : null;
  return (
    <View style={{ width: PAGE_WIDTH, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14 }}>
      <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }}>{title}</Text>
      <Text style={{ marginTop: 1, fontSize: 12, color: c.muted }}>{subtitle}</Text>
      <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center" }}>
        <View style={{ width: 104, height: 104, alignItems: "center", justifyContent: "center" }}>
          <TickRing size={104} value={share(kcal, kcalGoal)} extra={share(kcalPlanned, kcalGoal)} marks={44} tick={7} color={nutrientColor("calories")} track={c.track} />
          <Text style={{ fontSize: 22, fontWeight: "800", letterSpacing: -0.5, color: kcalOver ? c.danger : c.text }}>{Math.round(kcal)}</Text>
          <Text style={{ fontSize: 11, fontWeight: left != null ? "600" : "400", color: kcalOver ? c.danger : c.muted }}>
            {left != null ? `${Math.abs(Math.round(left))} ${left < 0 ? "over" : "left"}` : "kcal"}
          </Text>
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          {kcalPlanned > 0 && (
            <Text style={{ marginBottom: 3, fontSize: 13, fontWeight: "700", color: c.text }}>
              +{Math.round(kcalPlanned)}
              <Text style={{ fontWeight: "500", color: c.muted }}> kcal planned</Text>
            </Text>
          )}
          <Text style={{ fontSize: 12, lineHeight: 16, color: c.muted }}>
            {[line, settings.dailyCalorieLimit ? `goal ${settings.dailyCalorieLimit}${days === 1 ? " kcal" : ""}` : ""].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </View>
      {shifted && (
        <Text style={{ marginTop: 8, fontSize: 12, lineHeight: 16, color: c.muted }}>
          <Ionicons name="sparkles" size={10} color={c.accent} /> Suggesting towards <Text style={{ fontWeight: "700", color: c.text }}>{Math.round(shifted.aim)} kcal</Text>: the week is {Math.abs(Math.round(shifted.carry))} kcal {shifted.carry > 0 ? "over" : "under"} so far
        </Text>
      )}
      <View style={{ marginTop: 6 }}>
        <MacroBar nutrient="protein" label="Protein" value={eaten.protein ?? 0} planned={planned.protein ?? 0} goal={goal(settings.dailyProteinLimit)} colors={c} />
        <MacroBar nutrient="carbs" label="Carbs" value={eaten.carbs ?? 0} planned={planned.carbs ?? 0} goal={goal(settings.dailyCarbsLimit)} colors={c} />
        <MacroBar nutrient="fats" label="Fats" value={eaten.fats ?? 0} planned={planned.fats ?? 0} goal={goal(settings.dailyFatsLimit)} colors={c} />
      </View>
      {/* Where the suggestions on show would take it (as the phone's suggestion card). */}
      {!!suggested && suggested.calories > 0 && (
        <View style={{ marginTop: 14, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: c.selectedRing, backgroundColor: c.accentSoft, paddingHorizontal: 10, paddingVertical: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: c.text }}>
            <Ionicons name="sparkles" size={11} color={c.accent} /> With the suggestions
          </Text>
          <Text style={{ marginTop: 2, fontSize: 11, color: c.muted }}>
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
              <Text key={label} style={{ fontSize: 12, color: c.muted }}>
                <Text style={{ fontWeight: "700", color: sum.over ? c.danger : c.text }}>{sum.total}</Text>
                {sum.target != null ? ` / ${Math.round(sum.target)}` : ""} {label}
              </Text>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// A macro against its goal, as on the phone's Log: eaten in its own colour,
// what's planned faded after it; over the goal, the number turns red (the
// bar keeps its colour).
function MacroBar({ nutrient, label, value, planned, goal, colors: c }: { nutrient: MainNutrient; label: string; value: number; planned: number; goal: number | null; colors: OrbitColors }) {
  const of = goal && goal > 0 ? goal : null;
  const pct = (n: number) => `${Math.max(0, Math.min(100, of ? (n / of) * 100 : 0))}%` as const;
  // (A little over isn't flagged: within 5% reads as on target.)
  const over = !!of && value > of * 1.05;
  const tone = nutrientColor(nutrient);
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text style={{ flex: 1, fontSize: 12.5, fontWeight: "600", color: c.text }}>{label}</Text>
        <Text style={{ fontSize: 12, fontWeight: "700", color: over ? c.danger : c.text }}>{Math.round(value)}</Text>
        <Text style={{ fontSize: 11, color: c.faint }}>
          {of ? ` / ${Math.round(of)} g` : " g"}
          {planned > 0 ? ` +${Math.round(planned)}` : ""}
        </Text>
      </View>
      <View style={{ marginTop: 4, height: 5, borderRadius: 2.5, overflow: "hidden", flexDirection: "row", backgroundColor: c.track }}>
        <View style={{ width: pct(value), backgroundColor: tone }} />
        <View style={{ width: pct(Math.min(planned, Math.max(0, (of ?? 0) - value))), backgroundColor: tone, opacity: 0.35 }} />
      </View>
    </View>
  );
}

// A small round button on a suggestion (another, swap, drop, add a side).
function SuggestionButton({ icon, label, onPress, colors: c }: { icon: IconName; label: string; onPress: () => void; colors: OrbitColors }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={hoverable(({ hovered }) => ({ width: 24, height: 22, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: hovered ? c.pill : "transparent" }))}
    >
      <Ionicons name={icon} size={14} color={c.accent} />
    </Pressable>
  );
}

function Legend({ color, border, dashed, label, colors: c }: { color: string; border: string; dashed?: boolean; label: string; colors: OrbitColors }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={{ width: 16, height: 12, borderRadius: 4, backgroundColor: color, borderWidth: 1, borderColor: border, borderStyle: dashed ? "dashed" : "solid" }} />
      <Text style={{ marginLeft: 6, fontSize: 11, color: c.muted }}>{label}</Text>
    </View>
  );
}

// Which pieces a planned meal is made with (a bag from one particular
// steak; a fillet and a steak for a surf and turf): for each, the ones there
// are, with what the meal comes to, the one it's counted at marked; or the
// planner's choice. With one to choose, a click is the choice; with more,
// they're saved together.
function PieceChooser({ title, slots, amountSlots, choices, kept, keptSizes, caloriesFor, onChoose, onClose }: { title: string; slots: PieceSlot[]; amountSlots: AmountSlot[]; choices: PieceChoice[]; kept: string[]; keptSizes: PieceSizeInput[]; caloriesFor: (sizes: PieceSizeInput[]) => number; onChoose: (pieces: string[], sizes: PieceSizeInput[]) => void; onClose: () => void }) {
  // How big a planned meal's piece is to be — the same choice as the phone's
  // (PieceSizePicker), saved together.
  const [picked, setPicked] = useState<string[]>(kept);
  const [sizes, setSizes] = useState<PieceSizeInput[]>(keptSizes);
  const { colors: c } = useOrbitTheme();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.scrim, padding: 24 }}>
        <Pressable onPress={() => {}} style={{ width: "100%", maxWidth: 520, maxHeight: "86%", borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
          <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 }}>
            <Text style={{ fontSize: 20, fontWeight: "800", letterSpacing: -0.3, color: c.text }}>{slots.length ? (amountSlots.length ? "How big, and how much?" : "How big?") : "How much?"}</Text>
            <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 13, color: c.muted }}>
              {title}
            </Text>
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 14 }} keyboardShouldPersistTaps="handled">
            <PieceSizePicker
              slots={slots}
              choices={choices.map((c) => ({ ...c, chosen: picked.includes(c.pantryItemId) }))}
              picked={picked}
              sizes={sizes}
              caloriesFor={caloriesFor}
              onChange={(nextPicked, nextSizes) => {
                setPicked(nextPicked);
                setSizes(nextSizes);
              }}
            />
            {amountSlots.length > 0 && (
              <View style={{ marginTop: slots.length ? 14 : 0 }}>
                <AmountPicker slots={amountSlots} sizes={sizes} caloriesFor={caloriesFor} onChange={setSizes} />
              </View>
            )}
          </ScrollView>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: c.border }}>
            <Text style={{ flex: 1, fontSize: 12, color: c.faint }}>Once it&apos;s eaten, the piece really used is logged.</Text>
            <Button label="Cancel" onPress={onClose} />
            <Button label="Save" kind="primary" onPress={() => onChoose(picked, sizes)} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
