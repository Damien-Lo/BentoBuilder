import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";

import { getMeals, type Meal, type MealRecipeRef } from "@/src/services/mealApi";
import { addRecipeScore, getRecipeById, getRecipes, type Recipe } from "@/src/services/recipeApi";
import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import { getPantryItems } from "@/src/services/pantryApi";
import type { PantryItem } from "@/src/types/pantry";
import {
  confirmMealPlanEntry,
  createMealPlanEntry,
  deleteMealPlanEntry,
  getMealPlanForDate,
  unconfirmMealPlanEntry,
  type MealPlanEntry,
  type MealPlanEntryStatus,
  type MealSlot,
} from "@/src/services/mealPlanApi";
import { loadSettings, type AppSettings } from "@/src/services/settingsService";
import { RateAndConfirmModal } from "@/src/components/planner/RateAndConfirmModal";
import { ResolveIngredientSourcesModal } from "@/src/components/planner/ResolveIngredientSourcesModal";
import {
  friendlyDayLabel,
  getEntryAvailability,
  getIngredientKcal,
  getMealKcal,
  getRecipeKcal,
  getWeekDates,
  parseLocalDate,
  scaleIngredientNutrition,
  scaleRecipeNutrition,
  SLOT_MAP,
  SLOTS,
  todayStr,
  toDateStr,
  weekRangeLabel,
  type ScaledNutrition,
} from "@/src/utils/mealPlan";
import {
  buildIngredientRequirements,
  getDefaultDeductionInstructions,
  getResolvedDeductionInstructions,
  hasAmbiguity,
  type DeductionInstruction,
  type IngredientRequirement,
} from "@/src/utils/pantryDeduction";
import { getIngredientConversions, type CustomUnitConversion } from "@/src/utils/unitConversion";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_ABBREVS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Nutrition helper ──────────────────────────────────────────────────────────

interface DayNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  sodium: number;
}

function addScaled(totals: { calories: number; protein: number; carbs: number; fats: number; fiber: number; sodium: number }, n: ScaledNutrition) {
  if (n.calories) totals.calories += n.calories;
  if (n.protein)  totals.protein  += n.protein;
  if (n.carbs)    totals.carbs    += n.carbs;
  if (n.fats)     totals.fats     += n.fats;
  if (n.fiber)    totals.fiber    += n.fiber;
  if (n.sodium)   totals.sodium   += n.sodium;
}

function computeDayNutrition(entries: MealPlanEntry[], conversions: CustomUnitConversion[] = []): DayNutrition {
  const totals = { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sodium: 0 };
  for (const entry of entries) {
    if (entry.recipe) {
      addScaled(totals, scaleRecipeNutrition(entry.recipe, entry.recipeServings ?? 1));
      continue;
    }
    if (entry.ingredient) {
      addScaled(totals, scaleIngredientNutrition(
        entry.ingredient,
        entry.ingredientQuantity ?? 0,
        entry.ingredientUnit,
        getIngredientConversions(entry.ingredient, conversions),
      ));
      continue;
    }
    for (const course of entry.meal?.courses ?? []) {
      const recipe = course.recipe;
      if (!recipe || typeof recipe === "string") continue;
      const n = (recipe as MealRecipeRef).nutrition;
      if (!n) continue;
      const s = course.servings ?? 1;
      addScaled(totals, {
        calories: n.calories != null ? n.calories * s : null,
        protein:  n.protein  != null ? n.protein  * s : null,
        carbs:    n.carbs    != null ? n.carbs    * s : null,
        fats:     n.fats     != null ? n.fats     * s : null,
        fiber:    n.fiber    != null ? n.fiber    * s : null,
        sodium:   n.sodium   != null ? n.sodium   * s : null,
      });
    }
  }
  const { calories, protein, carbs, fats, fiber, sodium } = totals;
  return {
    calories: Math.round(calories),
    protein:  Math.round(protein  * 10) / 10,
    carbs:    Math.round(carbs    * 10) / 10,
    fats:     Math.round(fats     * 10) / 10,
    fiber:    Math.round(fiber    * 10) / 10,
    sodium:   Math.round(sodium),
  };
}

function pct(value: number, limit: number | null): number {
  if (!limit || limit <= 0) return 0;
  return Math.min(value / limit, 1);
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Date strip config ─────────────────────────────────────────────────────────

const DAYS_BEFORE = 14;
const DAYS_AFTER  = 45;
const TOTAL_DAYS  = DAYS_BEFORE + 1 + DAYS_AFTER; // 60
const TODAY_INDEX = DAYS_BEFORE;
const CELL_WIDTH  = 52;
const CELL_GAP    = 8;
const CELL_TOTAL  = CELL_WIDTH + CELL_GAP;

function buildDates(): string[] {
  const base = new Date();
  const result: string[] = [];
  for (let i = -DAYS_BEFORE; i <= DAYS_AFTER; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    result.push(toDateStr(d));
  }
  return result;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const dates = useMemo(buildDates, []);
  const today = todayStr();

  const [selectedDate, setSelectedDate] = useState(today);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [allMeals, setAllMeals] = useState<Meal[]>([]);
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  // Daily / weekly nutrition card paging
  const [nutritionView, setNutritionView] = useState<0 | 1>(0);
  const [weekEntries, setWeekEntries] = useState<MealPlanEntry[][]>([]);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Add-to-plan overlay (plain local state — no navigation involved)
  const [showAdd, setShowAdd] = useState(false);
  const [addSlot, setAddSlot] = useState<MealSlot>("breakfast");
  const [addStatus, setAddStatus] = useState<MealPlanEntryStatus>("planned");
  // Per-recipe "servings to add" overrides for the recipe picker below —
  // keyed by recipe id so scrolling/re-rendering the list doesn't lose them.
  const [addRecipeServingsById, setAddRecipeServingsById] = useState<Record<string, number>>({});
  const [addMode, setAddMode] = useState<"meal" | "recipe" | "ingredient">("meal");
  const [mealSearch, setMealSearch] = useState("");
  const [recipeSearch, setRecipeSearch] = useState("");
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // Ingredient quantity-entry step — set once a user picks an ingredient,
  // cleared to go back to the ingredients list.
  const [pendingIngredient, setPendingIngredient] = useState<Ingredient | null>(null);
  const [pendingQuantity, setPendingQuantity] = useState("1");
  const [pendingUnit, setPendingUnit] = useState("");

  // Expanded info overlay for a meal/recipe/ingredient row
  const [infoItem, setInfoItem] = useState<
    | { type: "meal"; data: Meal }
    | { type: "recipe"; data: Recipe }
    | { type: "ingredient"; data: Ingredient }
    | null
  >(null);
  const [infoLoading, setInfoLoading] = useState(false);

  // Rate-then-confirm overlay for a planned recipe entry — swiping it reveals
  // a "Rate" button alongside the plain "Confirm" one.
  const [rateConfirmEntry, setRateConfirmEntry] = useState<MealPlanEntry | null>(null);
  const [ratingSaving, setRatingSaving] = useState(false);

  // Resolve-sources overlay — only shown when confirming an entry whose
  // pantry deduction has a genuine choice (2+ possible sources) for at
  // least one ingredient.
  const [pendingConfirmEntry, setPendingConfirmEntry] = useState<MealPlanEntry | null>(null);
  const [ambiguousRequirements, setAmbiguousRequirements] = useState<IngredientRequirement[]>([]);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolvingSaving, setResolvingSaving] = useState(false);

  const dateStripRef = useRef<FlatList<string>>(null);
  const swipeableRefs = useRef(new Map<string, SwipeableMethods>()).current;

  // Load available meals/recipes/ingredients for the add overlay, once on
  // mount — pantry items are loaded here too, purely for the planned-entry
  // availability icon (not re-fetched reactively, matching these others).
  useEffect(() => {
    getMeals().then(setAllMeals).catch(() => {});
    getRecipes().then(setAllRecipes).catch(() => {});
    getIngredients().then(setAllIngredients).catch(() => {});
    getPantryItems().then(setPantryItems).catch(() => {});
  }, []);

  // Load plan for the selected date
  const loadEntries = useCallback(() => {
    setIsLoading(true);
    getMealPlanForDate(selectedDate)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setIsLoading(false));
  }, [selectedDate]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    loadSettings().then(setAppSettings).catch(() => {});
  }, []);

  // Load the full week (for the weekly nutrition card) whenever the selected
  // date moves into a different week, or the "week starts on" setting changes.
  const weekStartDay = appSettings?.weekStartDay ?? 1;
  const weekDates = useMemo(
    () => getWeekDates(selectedDate, weekStartDay),
    [selectedDate, weekStartDay],
  );

  useEffect(() => {
    Promise.all(weekDates.map(d => getMealPlanForDate(d)))
      .then(setWeekEntries)
      .catch(() => setWeekEntries(weekDates.map(() => [])));
    // `entries` is included so that adding/deleting/toggling an item on the
    // selected day (which updates `entries` locally, not `weekDates`) also
    // refreshes the weekly total instead of leaving it stale.
  }, [weekDates, entries]);

  // Scroll date strip to today on mount
  useEffect(() => {
    setTimeout(() => {
      dateStripRef.current?.scrollToIndex({ index: TODAY_INDEX, animated: false, viewPosition: 0.5 });
    }, 150);
  }, []);

  // Derived
  const selectedD = parseLocalDate(selectedDate);
  const selectedMonthLabel = `${MONTH_NAMES[selectedD.getMonth()]} ${selectedD.getFullYear()}`;
  const isToday = selectedDate === today;
  const confirmedNutrition = useMemo(
    () => computeDayNutrition(entries.filter(e => e.status === "confirmed"), appSettings?.unitConversions ?? []),
    [entries, appSettings],
  );
  const plannedNutrition = useMemo(
    () => computeDayNutrition(entries.filter(e => e.status === "planned"), appSettings?.unitConversions ?? []),
    [entries, appSettings],
  );
  const weeklyConfirmedNutrition = useMemo(
    () => computeDayNutrition(weekEntries.flat().filter(e => e.status === "confirmed"), appSettings?.unitConversions ?? []),
    [weekEntries, appSettings],
  );
  const weeklyPlannedNutrition = useMemo(
    () => computeDayNutrition(weekEntries.flat().filter(e => e.status === "planned"), appSettings?.unitConversions ?? []),
    [weekEntries, appSettings],
  );

  const entriesBySlot = useMemo(() => {
    const map = new Map<MealSlot, MealPlanEntry[]>();
    for (const slot of SLOTS) map.set(slot.id, []);
    for (const e of entries) {
      map.get(e.slot)?.push(e);
    }
    return map;
  }, [entries]);

  const filteredMeals = useMemo(() => {
    const q = mealSearch.trim().toLowerCase();
    if (!q) return allMeals;
    return allMeals.filter(m => m.name.toLowerCase().includes(q));
  }, [allMeals, mealSearch]);

  const filteredRecipes = useMemo(() => {
    const q = recipeSearch.trim().toLowerCase();
    if (!q) return allRecipes;
    return allRecipes.filter(r => r.name.toLowerCase().includes(q));
  }, [allRecipes, recipeSearch]);

  const filteredIngredients = useMemo(() => {
    const q = ingredientSearch.trim().toLowerCase();
    if (!q) return allIngredients;
    return allIngredients.filter(i => i.name.toLowerCase().includes(q));
  }, [allIngredients, ingredientSearch]);

  function openAdd(slot: MealSlot) {
    setAddSlot(slot);
    setAddStatus("planned");
    setAddMode("meal");
    setMealSearch("");
    setRecipeSearch("");
    setIngredientSearch("");
    setPendingIngredient(null);
    setShowAdd(true);
  }

  function openIngredientQuantityStep(ingredient: Ingredient) {
    setPendingIngredient(ingredient);
    setPendingQuantity(String(ingredient.defaultPortionAmount ?? 1));
    setPendingUnit(ingredient.defaultPortionUnit ?? "");
  }

  function openMealInfo(meal: Meal) {
    setInfoItem({ type: "meal", data: meal });
  }

  function openIngredientInfo(ingredient: Ingredient) {
    setInfoItem({ type: "ingredient", data: ingredient });
  }

  async function openRecipeInfo(recipe: Recipe) {
    setInfoItem({ type: "recipe", data: recipe });
    try {
      setInfoLoading(true);
      // The list endpoint doesn't populate ingredientList — fetch the full
      // recipe so the info overlay can show ingredient names.
      const full = await getRecipeById(recipe._id);
      setInfoItem({ type: "recipe", data: full });
    } catch {
      // keep showing the partial data already set above
    } finally {
      setInfoLoading(false);
    }
  }

  async function handleAddEntry(meal: Meal) {
    if (saving) return;
    try {
      setSaving(true);
      const entry = await createMealPlanEntry({ date: selectedDate, slot: addSlot, status: addStatus, meal: meal._id });
      setEntries(prev => [...prev, entry]);
      setShowAdd(false);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not add meal.");
    } finally {
      setSaving(false);
    }
  }

  // Defaults to 1 serving regardless of how many servings the recipe itself
  // makes — adjustable per-row in the add sheet via adjustAddServings
  // before tapping to add.
  function getAddServings(recipe: Recipe): number {
    return addRecipeServingsById[recipe._id] ?? 1;
  }

  function adjustAddServings(recipe: Recipe, delta: number) {
    setAddRecipeServingsById(prev => {
      const current = prev[recipe._id] ?? 1;
      return { ...prev, [recipe._id]: Math.max(1, current + delta) };
    });
  }

  async function handleAddRecipeEntry(recipe: Recipe, servings: number) {
    if (saving) return;
    try {
      setSaving(true);
      const entry = await createMealPlanEntry({
        date: selectedDate,
        slot: addSlot,
        status: addStatus,
        recipe: recipe._id,
        recipeServings: servings,
      });
      setEntries(prev => [...prev, entry]);
      setShowAdd(false);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not add recipe.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddIngredientEntry() {
    if (saving || !pendingIngredient) return;
    const quantity = Number(pendingQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      Alert.alert("Invalid quantity", "Enter a quantity greater than 0.");
      return;
    }
    try {
      setSaving(true);
      const entry = await createMealPlanEntry({
        date: selectedDate,
        slot: addSlot,
        status: addStatus,
        ingredient: pendingIngredient._id,
        ingredientQuantity: quantity,
        ingredientUnit: pendingUnit.trim(),
      });
      setEntries(prev => [...prev, entry]);
      setPendingIngredient(null);
      setShowAdd(false);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not add ingredient.");
    } finally {
      setSaving(false);
    }
  }

  async function performConfirm(entry: MealPlanEntry, instructions: DeductionInstruction[]) {
    swipeableRefs.get(entry._id)?.close();
    try {
      const updated = await confirmMealPlanEntry(entry._id, instructions);
      setEntries(prev => prev.map(e => (e._id === entry._id ? updated : e)));
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not confirm.");
    }
  }

  async function handleUnconfirmEntry(entry: MealPlanEntry) {
    swipeableRefs.get(entry._id)?.close();
    try {
      const updated = await unconfirmMealPlanEntry(entry._id);
      setEntries(prev => prev.map(e => (e._id === entry._id ? updated : e)));
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not unconfirm.");
    }
  }

  // Confirming deducts pantry stock. Most of the time that's fully
  // automatic (nearest-expiry order) — the resolve-sources overlay only
  // appears when at least one ingredient genuinely has more than one
  // pantry source to choose from.
  function handleConfirmEntry(entry: MealPlanEntry) {
    const conversions = appSettings?.unitConversions ?? [];
    const requirements = buildIngredientRequirements(
      entry, recipeMap, ingredientMap, allIngredients, pantryItems, conversions,
    );

    if (hasAmbiguity(requirements)) {
      swipeableRefs.get(entry._id)?.close();
      setPendingConfirmEntry(entry);
      setAmbiguousRequirements(requirements.filter(r => r.groups.length > 1));
      setShowResolveModal(true);
      return;
    }

    void performConfirm(entry, getDefaultDeductionInstructions(requirements));
  }

  function handleToggleEntryStatus(entry: MealPlanEntry) {
    if (entry.status === "planned") {
      handleConfirmEntry(entry);
    } else {
      void handleUnconfirmEntry(entry);
    }
  }

  async function handleResolvedConfirm(selections: Record<string, string[]>) {
    if (!pendingConfirmEntry) return;
    setResolvingSaving(true);
    try {
      const instructions = getResolvedDeductionInstructions(ambiguousRequirements, selections);
      await performConfirm(pendingConfirmEntry, instructions);
      setShowResolveModal(false);
      setPendingConfirmEntry(null);
    } finally {
      setResolvingSaving(false);
    }
  }

  function handleOpenRateAndConfirm(entry: MealPlanEntry) {
    swipeableRefs.get(entry._id)?.close();
    setRateConfirmEntry(entry);
  }

  async function handleSubmitRateAndConfirm(value: number) {
    if (!rateConfirmEntry?.recipe) return;
    setRatingSaving(true);
    try {
      await addRecipeScore(rateConfirmEntry.recipe._id, value);
      const entry = rateConfirmEntry;
      setRateConfirmEntry(null);
      handleConfirmEntry(entry);
    } catch (err) {
      Alert.alert(
        "Couldn't save rating",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setRatingSaving(false);
    }
  }

  function handleDeleteEntry(id: string) {
    Alert.alert("Remove item", "Remove this item from the plan?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void deleteMealPlanEntry(id)
            .then(() => setEntries(prev => prev.filter(e => e._id !== id)))
            .catch(() => Alert.alert("Error", "Could not remove item."));
        },
      },
    ]);
  }

  function jumpToToday() {
    setSelectedDate(today);
    dateStripRef.current?.scrollToIndex({ index: TODAY_INDEX, animated: true, viewPosition: 0.5 });
  }

  // ── Render date cell ──
  function renderDateCell({ item: dateStr, index }: { item: string; index: number }) {
    const d = parseLocalDate(dateStr);
    const isSelected = dateStr === selectedDate;
    const isThisToday = dateStr === today;
    return (
      <Pressable
        onPress={() => {
          setSelectedDate(dateStr);
          dateStripRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
        }}
        style={{ width: CELL_WIDTH, marginRight: CELL_GAP }}
        className="items-center"
      >
        <Text className={`mb-1 text-xs font-medium ${isSelected ? "text-blue-600" : "text-slate-400"}`}>
          {DAY_ABBREVS[d.getDay()]}
        </Text>
        <View
          className={`h-10 w-10 items-center justify-center rounded-full ${
            isSelected ? "bg-blue-600" : isThisToday ? "bg-slate-100" : ""
          }`}
        >
          <Text
            className={`text-base font-bold ${
              isSelected ? "text-white" : isThisToday ? "text-blue-600" : "text-slate-700"
            }`}
          >
            {d.getDate()}
          </Text>
        </View>
        {isSelected && entries.length > 0 && (
          <View className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-600" />
        )}
      </Pressable>
    );
  }

  // Looked up by getEntryAvailability — a course's own recipe ref and a
  // recipe's own ingredientList entries are both unpopulated/thin, so the
  // real Ingredient/Recipe documents (with lowStockThreshold, ingredientList,
  // etc.) come from these separately-loaded full lists instead.
  const ingredientMap = useMemo(
    () => new Map(allIngredients.map(i => [i._id, i])),
    [allIngredients],
  );
  const recipeMap = useMemo(
    () => new Map(allRecipes.map(r => [r._id, r])),
    [allRecipes],
  );

  function handleOpenEntry(entry: MealPlanEntry) {
    if (entry.recipe) {
      router.push({ pathname: "/recipes/[id]", params: { id: entry.recipe._id } });
    } else if (entry.ingredient) {
      router.push({ pathname: "/ingredients/edit/[id]", params: { id: entry.ingredient._id } });
    } else if (entry.meal) {
      router.push({ pathname: "/meals/[id]", params: { id: entry.meal._id } });
    }
  }

  // ── Render entry card ──
  function renderEntry(entry: MealPlanEntry) {
    let title: string;
    let subtitle: string;
    let kcal: number | null;

    if (entry.recipe) {
      const servings = entry.recipeServings ?? 1;
      title = entry.recipe.name;
      subtitle = `Recipe · ${servings} ${servings === 1 ? "serving" : "servings"}`;
      kcal = getRecipeKcal(entry.recipe, servings);
    } else if (entry.ingredient) {
      const qty = entry.ingredientQuantity ?? 0;
      title = entry.ingredient.name;
      subtitle = `Ingredient · ${qty}${entry.ingredientUnit ? ` ${entry.ingredientUnit}` : ""}`;
      kcal = getIngredientKcal(
        entry.ingredient,
        qty,
        entry.ingredientUnit,
        getIngredientConversions(entry.ingredient, appSettings?.unitConversions ?? []),
      );
    } else {
      const courseCount = entry.meal?.courses?.length ?? 0;
      title = entry.meal?.name ?? "";
      subtitle = `${courseCount} ${courseCount === 1 ? "course" : "courses"}`;
      kcal = entry.meal ? getMealKcal(entry.meal) : null;
    }

    const availability = getEntryAvailability(
      entry,
      recipeMap,
      ingredientMap,
      allIngredients,
      pantryItems,
      appSettings?.unitConversions ?? [],
    );
    const availabilityIcon =
      availability === "green"
        ? { name: "checkmark-circle-outline" as const, color: "#34D399" }
        : availability === "yellow"
          ? { name: "alert-circle-outline" as const, color: "#FBBF24" }
          : availability === "red"
            ? { name: "close-circle-outline" as const, color: "#F87171" }
            : null;

    return (
      <ReanimatedSwipeable
        key={entry._id}
        ref={r => {
          if (r) swipeableRefs.set(entry._id, r);
          else swipeableRefs.delete(entry._id);
        }}
        friction={2}
        leftThreshold={40}
        rightThreshold={40}
        renderLeftActions={() => (
          <Pressable
            className="mb-2 w-20 items-center justify-center rounded-2xl bg-red-500 active:bg-red-600"
            onPress={() => handleDeleteEntry(entry._id)}
          >
            <Ionicons name="trash-outline" size={20} color="white" />
          </Pressable>
        )}
        renderRightActions={() =>
          entry.status === "planned" && entry.recipe ? (
            <View className="mb-2 flex-row gap-2">
              <Pressable
                className="w-20 items-center justify-center rounded-2xl bg-blue-600 active:opacity-80"
                onPress={() => handleOpenRateAndConfirm(entry)}
              >
                <Ionicons name="star-outline" size={20} color="white" />
                <Text className="mt-1 text-[10px] font-semibold text-white">Rate</Text>
              </Pressable>
              <Pressable
                className="w-20 items-center justify-center rounded-2xl active:opacity-80"
                style={{ backgroundColor: "#10B981" }}
                onPress={() => void handleToggleEntryStatus(entry)}
              >
                <Ionicons name="checkmark-circle-outline" size={20} color="white" />
                <Text className="mt-1 text-[10px] font-semibold text-white">Confirm</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              className="mb-2 w-20 items-center justify-center rounded-2xl active:opacity-80"
              style={{ backgroundColor: entry.status === "planned" ? "#10B981" : "#94A3B8" }}
              onPress={() => void handleToggleEntryStatus(entry)}
            >
              <Ionicons
                name={entry.status === "planned" ? "checkmark-circle-outline" : "time-outline"}
                size={20}
                color="white"
              />
              <Text className="mt-1 text-[10px] font-semibold text-white">
                {entry.status === "planned" ? "Confirm" : "Unconfirm"}
              </Text>
            </Pressable>
          )
        }
      >
        <Pressable
          className="mb-2 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 active:bg-slate-50"
          style={entry.status === "planned" ? styles.plannedEntry : undefined}
          onPress={() => handleOpenEntry(entry)}
        >
          {entry.status === "planned" && (
            <Ionicons name="time-outline" size={16} color="#94A3B8" style={{ marginRight: 8 }} />
          )}
          {entry.status === "planned" && availabilityIcon && (
            <Ionicons
              name={availabilityIcon.name}
              size={16}
              color={availabilityIcon.color}
              style={{ marginRight: 8 }}
            />
          )}
          <View className="flex-1">
            <Text className="font-semibold text-slate-900" numberOfLines={1}>{title}</Text>
            <Text className="mt-0.5 text-xs text-slate-400">
              {subtitle}{entry.status === "planned" ? " · Planned" : ""}
            </Text>
          </View>
          {kcal != null && (
            <Text className="text-sm font-semibold text-slate-500">{kcal} kcal</Text>
          )}
        </Pressable>
      </ReanimatedSwipeable>
    );
  }

  // ── Render a nutrition summary card (shared by the daily & weekly pages) ──
  // Shows confirmed totals as the solid/main figure and bar segment, with
  // planned totals appended as a lighter "+N" figure and a lighter bar
  // segment continuing on from the confirmed portion.
  function renderNutritionCard(opts: {
    title: string;
    subtitle?: string;
    confirmed: DayNutrition;
    planned: DayNutrition;
    limits: {
      calories: number | null;
      protein: number | null;
      carbs: number | null;
      fats: number | null;
      fiber: number | null;
      sodium: number | null;
    };
  }) {
    const { title, subtitle, confirmed, planned, limits } = opts;

    const confirmedCalPct = pct(confirmed.calories, limits.calories);
    const totalCalPct = pct(confirmed.calories + planned.calories, limits.calories);
    const plannedCalSegment = Math.max(totalCalPct - confirmedCalPct, 0);
    const calOverLimit = confirmedCalPct >= 1;

    const macros = [
      { label: "Protein", confirmedValue: confirmed.protein, plannedValue: planned.protein, unit: "g", limit: limits.protein, bar: "#3B82F6" },
      { label: "Carbs",   confirmedValue: confirmed.carbs,   plannedValue: planned.carbs,   unit: "g", limit: limits.carbs,   bar: "#F59E0B" },
      { label: "Fats",    confirmedValue: confirmed.fats,    plannedValue: planned.fats,    unit: "g", limit: limits.fats,    bar: "#F43F5E" },
      { label: "Fiber",   confirmedValue: confirmed.fiber,   plannedValue: planned.fiber,   unit: "g", limit: limits.fiber,   bar: "#10B981" },
    ] as const;

    const hasSodiumData = confirmed.sodium > 0 || planned.sodium > 0 || limits.sodium != null;

    return (
      <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {/* Calories row */}
        <View className="border-b border-slate-100 px-5 pb-4 pt-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {title}
            </Text>
            {subtitle && (
              <Text className="text-xs font-semibold text-slate-400">{subtitle}</Text>
            )}
          </View>
          <View className="mt-2 flex-row items-end justify-between">
            <View className="flex-row items-end">
              <Text className="text-4xl font-bold text-slate-900">
                {confirmed.calories}
              </Text>
              {planned.calories > 0 && (
                <Text className="mb-1 ml-1 text-lg font-semibold text-slate-300">
                  +{planned.calories}
                </Text>
              )}
              <Text className="mb-1 ml-1.5 text-base text-slate-400">kcal</Text>
            </View>
            {limits.calories != null && (
              <Text className="mb-1 text-sm text-slate-400">
                / {limits.calories} kcal
              </Text>
            )}
          </View>
          {limits.calories != null && (
            <View className="mt-2 h-2 w-full flex-row overflow-hidden rounded-full bg-slate-100">
              <View style={{ width: `${confirmedCalPct * 100}%`, backgroundColor: calOverLimit ? "#F87171" : "#3B82F6" }} />
              <View style={{ width: `${plannedCalSegment * 100}%`, backgroundColor: hexToRgba(calOverLimit ? "#F87171" : "#3B82F6", 0.35) }} />
            </View>
          )}
        </View>

        {/* Macro columns */}
        <View className={`flex-row px-4 pt-4 ${hasSodiumData ? "border-b border-slate-100 pb-4" : "pb-4"}`}>
          {macros.map(({ label, confirmedValue, plannedValue, unit, limit, bar }) => {
            const confirmedF = pct(confirmedValue, limit);
            const totalF = pct(confirmedValue + plannedValue, limit);
            const plannedSegment = Math.max(totalF - confirmedF, 0);
            const over = confirmedF >= 1;
            return (
              <View key={label} className="flex-1 items-center px-1">
                <Text className="text-sm font-bold text-slate-800">
                  {confirmedValue}{unit}
                  {plannedValue > 0 && (
                    <Text className="text-slate-300"> +{plannedValue}{unit}</Text>
                  )}
                </Text>
                <Text className="mt-0.5 text-xs text-slate-400">{label}</Text>
                {limit != null && (
                  <View className="mt-2 h-1.5 w-full flex-row overflow-hidden rounded-full bg-slate-100">
                    <View style={{ height: 6, width: `${confirmedF * 100}%`, backgroundColor: over ? "#F87171" : bar }} />
                    <View style={{ height: 6, width: `${plannedSegment * 100}%`, backgroundColor: hexToRgba(over ? "#F87171" : bar, 0.35) }} />
                  </View>
                )}
                {limit != null && (
                  <Text className="mt-0.5 text-[10px] text-slate-300">
                    /{limit}{unit}
                  </Text>
                )}
              </View>
            );
          })}
        </View>

        {/* Sodium row */}
        {hasSodiumData && (
          <View className="px-5 pb-4 pt-3">
            {(() => {
              const confirmedF = pct(confirmed.sodium, limits.sodium);
              const totalF = pct(confirmed.sodium + planned.sodium, limits.sodium);
              const plannedSegment = Math.max(totalF - confirmedF, 0);
              const over = confirmedF >= 1;
              return (
                <>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-semibold text-slate-500">Sodium</Text>
                    <Text className="text-xs text-slate-400">
                      {confirmed.sodium}
                      {planned.sodium > 0 && ` +${planned.sodium}`} mg
                      {limits.sodium != null && ` / ${limits.sodium} mg`}
                    </Text>
                  </View>
                  {limits.sodium != null && (
                    <View className="mt-1.5 h-1.5 w-full flex-row overflow-hidden rounded-full bg-slate-100">
                      <View style={{ height: 6, width: `${confirmedF * 100}%`, backgroundColor: over ? "#F87171" : "#A855F7" }} />
                      <View style={{ height: 6, width: `${plannedSegment * 100}%`, backgroundColor: hexToRgba(over ? "#F87171" : "#A855F7", 0.35) }} />
                    </View>
                  )}
                </>
              );
            })()}
          </View>
        )}
      </View>
    );
  }

  // ── Expanded info overlay (meal / recipe / ingredient) ──
  function infoRow(label: string, value: string | number | null | undefined, unit = "") {
    if (value == null || value === "") return null;
    return (
      <View className="flex-row items-center justify-between border-b border-slate-100 py-2.5">
        <Text className="text-sm text-slate-500">{label}</Text>
        <Text className="text-sm font-semibold text-slate-900">{value}{unit}</Text>
      </View>
    );
  }

  function renderMealInfo(meal: Meal) {
    const kcal = getMealKcal(meal);
    return (
      <View>
        <View className="mb-4 flex-row flex-wrap gap-1.5">
          <View className="rounded-full bg-slate-100 px-2.5 py-1">
            <Text className="text-xs font-semibold text-slate-600">
              {meal.type === "bento" ? "Bento Box" : "Course-based"}
            </Text>
          </View>
          {(meal.tags ?? []).map(tag => (
            <View key={tag._id} className="rounded-full bg-blue-50 px-2.5 py-1">
              <Text className="text-xs font-semibold text-blue-700">{tag.name}</Text>
            </View>
          ))}
        </View>

        {!!meal.notes && (
          <Text className="mb-4 text-sm leading-5 text-slate-600">{meal.notes}</Text>
        )}

        {infoRow("Total calories", kcal, kcal != null ? " kcal" : "")}

        <Text className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">
          Courses ({meal.courses?.length ?? 0})
        </Text>
        {(meal.courses ?? []).map(course => {
          const recipe = course.recipe;
          const populated = recipe && typeof recipe !== "string" ? recipe : null;
          const courseCal = populated?.nutrition?.calories;
          return (
            <View key={course._id} className="mb-2 rounded-2xl bg-slate-50 px-4 py-3">
              <Text className="text-sm font-semibold text-slate-900">{course.label}</Text>
              <Text className="mt-0.5 text-xs text-slate-500">
                {populated?.name ?? "No recipe selected"} · {course.servings} {course.servings === 1 ? "serving" : "servings"}
                {courseCal != null && ` · ${Math.round(courseCal * course.servings)} kcal`}
              </Text>
            </View>
          );
        })}
      </View>
    );
  }

  function renderRecipeInfo(recipe: Recipe) {
    const n = recipe.nutrition;
    return (
      <View>
        <View className="mb-4 flex-row flex-wrap gap-1.5">
          {(recipe.mealCategory ?? []).map(cat => (
            <View key={cat} className="rounded-full bg-slate-100 px-2.5 py-1">
              <Text className="text-xs font-semibold capitalize text-slate-600">{cat}</Text>
            </View>
          ))}
        </View>

        {!!recipe.description && (
          <Text className="mb-4 text-sm leading-5 text-slate-600">{recipe.description}</Text>
        )}

        {infoRow("Servings", recipe.servings ?? 1)}
        {n && (
          <>
            {infoRow("Calories", n.calories, " kcal")}
            {infoRow("Protein", n.protein, " g")}
            {infoRow("Carbs", n.carbs, " g")}
            {infoRow("Fats", n.fats, " g")}
            {infoRow("Fiber", n.fiber, " g")}
            {infoRow("Sodium", n.sodium, " mg")}
          </>
        )}

        {recipe.ingredientList.length > 0 && (
          <>
            <Text className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">
              Ingredients
            </Text>
            {recipe.ingredientList.map((entry, i) => {
              const ing = entry.ingredient;
              const name = ing && typeof ing !== "string" ? ing.name : "…";
              return (
                <Text key={i} className="py-1 text-sm text-slate-700">
                  • {entry.quantity}{entry.unit ? ` ${entry.unit}` : ""} {name}
                </Text>
              );
            })}
          </>
        )}

        {recipe.instructions.length > 0 && (
          <>
            <Text className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">
              Instructions
            </Text>
            {recipe.instructions.map((step, i) => (
              <Text key={i} className="mb-2 text-sm leading-5 text-slate-700">
                {i + 1}. {step}
              </Text>
            ))}
          </>
        )}
      </View>
    );
  }

  function renderIngredientInfo(ingredient: Ingredient) {
    const n = ingredient.nutrition;
    const categoryName = ingredient.category && typeof ingredient.category !== "string" ? ingredient.category.name : null;
    const brandName = ingredient.brand && typeof ingredient.brand !== "string" ? ingredient.brand.name : null;
    return (
      <View>
        <View className="mb-4 flex-row flex-wrap gap-1.5">
          {!!categoryName && (
            <View className="rounded-full bg-slate-100 px-2.5 py-1">
              <Text className="text-xs font-semibold text-slate-600">{categoryName}</Text>
            </View>
          )}
          {!!brandName && (
            <View className="rounded-full bg-slate-100 px-2.5 py-1">
              <Text className="text-xs font-semibold text-slate-600">{brandName}</Text>
            </View>
          )}
        </View>

        {!!ingredient.description && (
          <Text className="mb-4 text-sm leading-5 text-slate-600">{ingredient.description}</Text>
        )}

        {infoRow(
          "Default portion",
          ingredient.defaultPortionAmount ?? 1,
          ingredient.defaultPortionUnit ? ` ${ingredient.defaultPortionUnit}` : "",
        )}
        {n && (
          <>
            {infoRow("Calories", n.calories, " kcal")}
            {infoRow("Protein", n.protein, " g")}
            {infoRow("Carbs", n.carbs, " g")}
            {infoRow("Fats", n.fats, " g")}
            {infoRow("Fiber", n.fiber, " g")}
            {infoRow("Sodium", n.sodium, " mg")}
          </>
        )}
        {infoRow("Barcode", ingredient.barcode)}
      </View>
    );
  }

  function renderInfoOverlay() {
    if (!infoItem) return null;
    const icon =
      infoItem.type === "meal" ? "restaurant-outline"
      : infoItem.type === "recipe" ? "book-outline"
      : "nutrition-outline";

    return (
      <View className="absolute inset-0">
        <Pressable className="absolute inset-0 bg-black/40" onPress={() => setInfoItem(null)} />
        <View
          className="absolute bottom-0 left-0 right-0 overflow-hidden rounded-t-3xl bg-white"
          style={{ maxHeight: windowHeight * 0.75 }}
        >
          <View className="items-center pt-3">
            <View className="h-1 w-10 rounded-full bg-slate-200" />
          </View>
          <View className="flex-row items-center border-b border-slate-100 px-5 pb-4 pt-3">
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
              <Ionicons name={icon} size={20} color="#2563EB" />
            </View>
            <Text className="ml-3 flex-1 text-lg font-bold text-slate-950" numberOfLines={2}>
              {infoItem.data.name}
            </Text>
            <Pressable
              hitSlop={10}
              onPress={() => setInfoItem(null)}
              className="ml-2 h-8 w-8 items-center justify-center rounded-full active:bg-slate-100"
            >
              <Ionicons name="close" size={20} color="#64748B" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
            {infoItem.type === "meal" && renderMealInfo(infoItem.data)}
            {infoItem.type === "recipe" && renderRecipeInfo(infoItem.data)}
            {infoItem.type === "ingredient" && renderIngredientInfo(infoItem.data)}
            {infoLoading && (
              <View className="mt-3 flex-row items-center justify-center">
                <ActivityIndicator size="small" color="#2563EB" />
                <Text className="ml-2 text-xs text-slate-400">Loading full details…</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      {/* ── Top strip (non-scrolling) ── */}
      <View className="bg-white pb-3 shadow-sm">
        {/* Month header */}
        <View className="flex-row items-center justify-between px-5 pb-3 pt-4">
          <Text className="text-lg font-bold text-slate-900">{selectedMonthLabel}</Text>
          {!isToday && (
            <Pressable
              onPress={jumpToToday}
              className="rounded-xl bg-blue-100 px-3 py-1.5 active:bg-blue-200"
            >
              <Text className="text-xs font-bold text-blue-700">Today</Text>
            </Pressable>
          )}
        </View>

        {/* Date strip */}
        <FlatList
          ref={dateStripRef}
          data={dates}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={d => d}
          renderItem={renderDateCell}
          getItemLayout={(_, index) => ({
            length: CELL_TOTAL,
            offset: CELL_TOTAL * index,
            index,
          })}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => {
              dateStripRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.5 });
            }, 200);
          }}
        />
      </View>

      {/* ── Main scrollable content ── */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Day label */}
        <Text className="mb-5 text-2xl font-bold text-slate-900">
          {friendlyDayLabel(selectedDate)}
        </Text>

        {isLoading ? (
          <View className="items-center py-16">
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : (
          <>
            {/* Slots */}
            {SLOTS.map(slot => {
              const slotEntries = entriesBySlot.get(slot.id) ?? [];
              return (
                <View key={slot.id} className="mb-5">
                  {/* Slot header */}
                  <View className="mb-3 flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <Ionicons name={slot.icon} size={18} color={slot.iconColor} />
                      <Text className="text-sm font-bold text-slate-700">{slot.label}</Text>
                      <Text className="text-xs text-slate-400">{slot.time}</Text>
                    </View>
                    <Pressable
                      onPress={() => openAdd(slot.id)}
                      className="flex-row items-center rounded-xl bg-slate-100 px-3 py-1.5 active:bg-slate-200"
                    >
                      <Ionicons name="add" size={14} color="#2563EB" />
                      <Text className="ml-1 text-xs font-semibold text-blue-600">Add</Text>
                    </Pressable>
                  </View>

                  {/* Entries */}
                  {slotEntries.length > 0 ? (
                    slotEntries.map(renderEntry)
                  ) : (
                    <Pressable
                      onPress={() => openAdd(slot.id)}
                      className="items-center rounded-2xl border border-dashed border-slate-200 py-5 active:bg-slate-50"
                    >
                      <Text className="text-sm text-slate-400">No {slot.label.toLowerCase()} planned</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}

            {/* Daily / weekly nutrition — swipe to switch */}
            <View className="mt-2">
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={e => {
                  const page = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
                  setNutritionView(page === 1 ? 1 : 0);
                }}
                style={{ width: windowWidth - 32 }}
              >
                <View style={{ width: windowWidth - 32 }}>
                  {renderNutritionCard({
                    title: "Daily nutrition",
                    confirmed: confirmedNutrition,
                    planned: plannedNutrition,
                    limits: {
                      calories: appSettings?.dailyCalorieLimit ?? null,
                      protein:  appSettings?.dailyProteinLimit ?? null,
                      carbs:    appSettings?.dailyCarbsLimit   ?? null,
                      fats:     appSettings?.dailyFatsLimit    ?? null,
                      fiber:    appSettings?.dailyFiberLimit   ?? null,
                      sodium:   appSettings?.dailySodiumLimit  ?? null,
                    },
                  })}
                </View>
                <View style={{ width: windowWidth - 32 }}>
                  {renderNutritionCard({
                    title: "Weekly nutrition",
                    subtitle: weekRangeLabel(weekDates),
                    confirmed: weeklyConfirmedNutrition,
                    planned: weeklyPlannedNutrition,
                    limits: {
                      calories: appSettings?.dailyCalorieLimit != null ? appSettings.dailyCalorieLimit * 7 : null,
                      protein:  appSettings?.dailyProteinLimit != null ? appSettings.dailyProteinLimit * 7 : null,
                      carbs:    appSettings?.dailyCarbsLimit   != null ? appSettings.dailyCarbsLimit   * 7 : null,
                      fats:     appSettings?.dailyFatsLimit    != null ? appSettings.dailyFatsLimit    * 7 : null,
                      fiber:    appSettings?.dailyFiberLimit   != null ? appSettings.dailyFiberLimit   * 7 : null,
                      sodium:   appSettings?.dailySodiumLimit  != null ? appSettings.dailySodiumLimit  * 7 : null,
                    },
                  })}
                </View>
              </ScrollView>

              {/* Page dots */}
              <View className="mt-3 flex-row items-center justify-center gap-1.5">
                <View
                  className="h-1.5 w-1.5 rounded-full bg-slate-200"
                  style={nutritionView === 0 ? pageDotStyles.active : undefined}
                />
                <View
                  className="h-1.5 w-1.5 rounded-full bg-slate-200"
                  style={nutritionView === 1 ? pageDotStyles.active : undefined}
                />
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Add-to-plan overlay ── plain absolutely-positioned View, no
          RN Modal and no navigation — sidesteps the navigation-context
          crash entirely by never leaving this already-mounted screen. */}
      {showAdd && (
        <SafeAreaView className="absolute inset-0 bg-slate-50" edges={["top", "left", "right"]}>
          {/* Header */}
          <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
            {pendingIngredient ? (
              <Pressable
                onPress={() => setPendingIngredient(null)}
                hitSlop={10}
                className="-ml-2 flex-1 flex-row items-center px-2 py-2"
              >
                <Ionicons name="chevron-back" size={20} color="#2563EB" />
                <Text className="ml-0.5 font-semibold text-blue-600">Back</Text>
              </Pressable>
            ) : (
              <Text className="flex-1 text-lg font-bold text-slate-950">Add to plan</Text>
            )}
            <Pressable
              onPress={() => setShowAdd(false)}
              hitSlop={10}
              className="-mr-2 px-2 py-2"
            >
              <Text className="font-semibold text-blue-600">Cancel</Text>
            </Pressable>
          </View>

          {pendingIngredient ? (
            /* ── Ingredient quantity-entry step ── */
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled"
            >
              <View className="mb-5 flex-row items-center rounded-2xl border border-slate-200 bg-white p-4">
                <View className={`h-11 w-11 items-center justify-center rounded-full ${SLOT_MAP[addSlot].chipBg}`}>
                  <Ionicons name="nutrition-outline" size={18} color={SLOT_MAP[addSlot].iconColor} />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="font-semibold text-slate-900">{pendingIngredient.name}</Text>
                  <Text className="mt-0.5 text-xs text-slate-400">
                    Default portion: {pendingIngredient.defaultPortionAmount ?? 1}
                    {pendingIngredient.defaultPortionUnit ? ` ${pendingIngredient.defaultPortionUnit}` : ""}
                  </Text>
                </View>
              </View>

              <Text className="mb-1.5 text-sm font-semibold text-slate-700">Quantity</Text>
              <View className="mb-6 flex-row gap-2">
                <TextInput
                  value={pendingQuantity}
                  onChangeText={setPendingQuantity}
                  keyboardType="decimal-pad"
                  placeholder="1"
                  placeholderTextColor="#94A3B8"
                  className="h-14 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
                />
                <TextInput
                  value={pendingUnit}
                  onChangeText={setPendingUnit}
                  placeholder="unit (g, cup, …)"
                  placeholderTextColor="#94A3B8"
                  className="h-14 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
                />
              </View>

              {/* Live nutrition preview */}
              {(() => {
                const q = Number(pendingQuantity);
                const valid = Number.isFinite(q) && q > 0;
                const n = valid
                  ? scaleIngredientNutrition(
                      pendingIngredient,
                      q,
                      pendingUnit,
                      getIngredientConversions(pendingIngredient, appSettings?.unitConversions ?? []),
                    )
                  : null;
                const rows: [string, number | null | undefined, string][] = [
                  ["Calories", n?.calories, "kcal"],
                  ["Protein",  n?.protein,  "g"],
                  ["Carbs",    n?.carbs,    "g"],
                  ["Fats",     n?.fats,     "g"],
                  ["Fiber",    n?.fiber,    "g"],
                  ["Sodium",   n?.sodium,   "mg"],
                ];
                return (
                  <View className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    {rows.map(([label, value, unit], i) => (
                      <View
                        key={label}
                        className={`flex-row items-center justify-between px-4 py-3 ${
                          i < rows.length - 1 ? "border-b border-slate-100" : ""
                        }`}
                      >
                        <Text className="text-base text-slate-600">{label}</Text>
                        <Text className="text-base font-semibold text-slate-900">
                          {value != null ? `${Math.round(value * 10) / 10} ${unit}` : "—"}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })()}

              <Pressable
                disabled={saving}
                className={`items-center rounded-2xl py-4 ${saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}
                onPress={() => void handleAddIngredientEntry()}
              >
                <Text className="font-semibold text-white">{saving ? "Adding…" : "Add to plan"}</Text>
              </Pressable>
            </ScrollView>
          ) : (
            <>
              {/* Date + slot row */}
              <View className="bg-white px-4 pb-4 pt-3">
                <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {friendlyDayLabel(selectedDate)}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-2">
                    {SLOTS.map(slot => (
                      <Pressable
                        key={slot.id}
                        onPress={() => setAddSlot(slot.id)}
                        className={`flex-row items-center rounded-full px-4 py-2 ${
                          addSlot === slot.id ? "bg-blue-600" : "bg-slate-100"
                        }`}
                      >
                        <Ionicons
                          name={slot.icon}
                          size={14}
                          color={addSlot === slot.id ? "white" : slot.iconColor}
                        />
                        <Text
                          className={`ml-1.5 text-sm font-semibold ${
                            addSlot === slot.id ? "text-white" : "text-slate-700"
                          }`}
                        >
                          {slot.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Planned / Confirmed status toggle */}
              <View className="border-b border-slate-100 bg-white px-4 pb-3">
                <View className="flex-row rounded-xl bg-slate-100 p-1">
                  {(
                    [
                      ["planned", "Planned", "time-outline"],
                      ["confirmed", "Confirmed", "checkmark-circle-outline"],
                    ] as const
                  ).map(([status, label, icon]) => (
                    <Pressable
                      key={status}
                      onPress={() => setAddStatus(status)}
                      className="flex-1 flex-row items-center justify-center rounded-lg py-2"
                      style={addStatus === status ? styles.activePill : undefined}
                    >
                      <Ionicons
                        name={icon}
                        size={14}
                        color={addStatus === status ? "#0f172a" : "#64748b"}
                      />
                      <Text
                        className="ml-1.5 text-sm font-semibold"
                        style={addStatus === status ? styles.activePillText : styles.inactivePillText}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Meals / Recipes / Ingredients toggle */}
              <View className="border-b border-slate-100 bg-white px-4 pb-3">
                <View className="flex-row rounded-xl bg-slate-100 p-1">
                  {(
                    [
                      ["meal", "Meals"],
                      ["recipe", "Recipes"],
                      ["ingredient", "Ingredients"],
                    ] as const
                  ).map(([mode, label]) => (
                    <Pressable
                      key={mode}
                      onPress={() => setAddMode(mode)}
                      className="flex-1 items-center rounded-lg py-2"
                      style={addMode === mode ? styles.activePill : undefined}
                    >
                      <Text
                        className="text-sm font-semibold"
                        style={addMode === mode ? styles.activePillText : styles.inactivePillText}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Search */}
              <View className="border-b border-slate-100 bg-white px-4 pb-3">
                <View className="h-11 flex-row items-center rounded-2xl bg-slate-100 px-4">
                  <Ionicons name="search-outline" size={18} color="#64748B" />
                  <TextInput
                    value={addMode === "meal" ? mealSearch : addMode === "recipe" ? recipeSearch : ingredientSearch}
                    onChangeText={addMode === "meal" ? setMealSearch : addMode === "recipe" ? setRecipeSearch : setIngredientSearch}
                    placeholder={addMode === "meal" ? "Search meals…" : addMode === "recipe" ? "Search recipes…" : "Search ingredients…"}
                    placeholderTextColor="#94A3B8"
                    className="ml-3 flex-1 text-base text-slate-900"
                  />
                  {(addMode === "meal" ? mealSearch : addMode === "recipe" ? recipeSearch : ingredientSearch).length > 0 && (
                    <Pressable
                      onPress={() => {
                        if (addMode === "meal") setMealSearch("");
                        else if (addMode === "recipe") setRecipeSearch("");
                        else setIngredientSearch("");
                      }}
                    >
                      <Ionicons name="close-circle" size={18} color="#94A3B8" />
                    </Pressable>
                  )}
                </View>
              </View>

              {/* List */}
              {addMode === "meal" && (
                <FlatList
                  data={filteredMeals}
                  keyExtractor={m => m._id}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 }}
                  renderItem={({ item: meal }) => {
                    const kcal = getMealKcal(meal);
                    const slotCfg = SLOT_MAP[addSlot];
                    return (
                      <Pressable
                        className="mb-2 flex-row items-center rounded-2xl border border-slate-200 bg-white p-4 active:bg-slate-50"
                        disabled={saving}
                        onPress={() => void handleAddEntry(meal)}
                      >
                        <View className={`h-11 w-11 items-center justify-center rounded-full ${slotCfg.chipBg}`}>
                          <Ionicons name={slotCfg.icon} size={18} color={slotCfg.iconColor} />
                        </View>
                        <View className="ml-3 flex-1">
                          <Text className="font-semibold text-slate-900">{meal.name}</Text>
                          <Text className="mt-0.5 text-sm text-slate-400">
                            {meal.courses?.length ?? 0} {(meal.courses?.length ?? 0) === 1 ? "course" : "courses"}
                            {(meal.tags ?? []).length > 0 && ` · ${meal.tags!.map(t => t.name).join(", ")}`}
                          </Text>
                        </View>
                        {kcal != null && (
                          <Text className="mr-2 text-sm font-semibold text-slate-500">{kcal} kcal</Text>
                        )}
                        <Pressable
                          hitSlop={8}
                          onPress={() => openMealInfo(meal)}
                          className="mr-1 h-8 w-8 items-center justify-center rounded-full active:bg-slate-100"
                        >
                          <Ionicons name="information-circle-outline" size={20} color="#94A3B8" />
                        </Pressable>
                        <Ionicons name="add-circle-outline" size={22} color="#2563EB" />
                      </Pressable>
                    );
                  }}
                  ListEmptyComponent={
                    <View className="items-center py-16">
                      <Ionicons name="restaurant-outline" size={42} color="#94A3B8" />
                      <Text className="mt-4 text-lg font-bold text-slate-900">No meals found</Text>
                      <Text className="mt-2 text-center text-slate-500">
                        {mealSearch ? "Try a different search." : "Create meals in the Kitchen tab first."}
                      </Text>
                    </View>
                  }
                />
              )}

              {addMode === "recipe" && (
                <FlatList
                  data={filteredRecipes}
                  keyExtractor={r => r._id}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 }}
                  renderItem={({ item: recipe }) => {
                    const addServings = getAddServings(recipe);
                    const kcal = getRecipeKcal(recipe, addServings);
                    const slotCfg = SLOT_MAP[addSlot];
                    return (
                      <View className="mb-2 rounded-2xl border border-slate-200 bg-white p-4">
                        <Pressable
                          className="flex-row items-center active:opacity-70"
                          disabled={saving}
                          onPress={() => void handleAddRecipeEntry(recipe, addServings)}
                        >
                          <View className={`h-11 w-11 items-center justify-center rounded-full ${slotCfg.chipBg}`}>
                            <Ionicons name="book-outline" size={18} color={slotCfg.iconColor} />
                          </View>
                          <View className="ml-3 flex-1">
                            <Text className="font-semibold text-slate-900">{recipe.name}</Text>
                            <Text className="mt-0.5 text-sm text-slate-400">
                              {recipe.mealCategory?.join(", ") ?? "Recipe"}
                              {recipe.servings != null && ` · makes ${recipe.servings} servings`}
                            </Text>
                          </View>
                          {kcal != null && (
                            <Text className="mr-2 text-sm font-semibold text-slate-500">{kcal} kcal</Text>
                          )}
                          <Pressable
                            hitSlop={8}
                            onPress={() => void openRecipeInfo(recipe)}
                            className="mr-1 h-8 w-8 items-center justify-center rounded-full active:bg-slate-100"
                          >
                            <Ionicons name="information-circle-outline" size={20} color="#94A3B8" />
                          </Pressable>
                          <Ionicons name="add-circle-outline" size={22} color="#2563EB" />
                        </Pressable>

                        <View className="mt-2 flex-row items-center justify-end border-t border-slate-100 pt-2">
                          <Text className="mr-2 text-xs font-medium text-slate-400">Add as</Text>
                          <Pressable
                            hitSlop={8}
                            disabled={saving}
                            onPress={() => adjustAddServings(recipe, -1)}
                            className="h-7 w-7 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200"
                          >
                            <Ionicons name="remove" size={14} color="#475569" />
                          </Pressable>
                          <Text className="mx-2 text-sm font-semibold text-slate-700">
                            {addServings} {addServings === 1 ? "serving" : "servings"}
                          </Text>
                          <Pressable
                            hitSlop={8}
                            disabled={saving}
                            onPress={() => adjustAddServings(recipe, 1)}
                            className="h-7 w-7 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200"
                          >
                            <Ionicons name="add" size={14} color="#475569" />
                          </Pressable>
                        </View>
                      </View>
                    );
                  }}
                  ListEmptyComponent={
                    <View className="items-center py-16">
                      <Ionicons name="book-outline" size={42} color="#94A3B8" />
                      <Text className="mt-4 text-lg font-bold text-slate-900">No recipes found</Text>
                      <Text className="mt-2 text-center text-slate-500">
                        {recipeSearch ? "Try a different search." : "Create recipes in the Kitchen tab first."}
                      </Text>
                    </View>
                  }
                />
              )}

              {addMode === "ingredient" && (
                <FlatList
                  data={filteredIngredients}
                  keyExtractor={i => i._id}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 }}
                  renderItem={({ item: ingredient }) => {
                    const portion = ingredient.defaultPortionAmount ?? 1;
                    const kcal = getIngredientKcal(ingredient, portion, ingredient.defaultPortionUnit);
                    const slotCfg = SLOT_MAP[addSlot];
                    return (
                      <Pressable
                        className="mb-2 flex-row items-center rounded-2xl border border-slate-200 bg-white p-4 active:bg-slate-50"
                        disabled={saving}
                        onPress={() => openIngredientQuantityStep(ingredient)}
                      >
                        <View className={`h-11 w-11 items-center justify-center rounded-full ${slotCfg.chipBg}`}>
                          <Ionicons name="nutrition-outline" size={18} color={slotCfg.iconColor} />
                        </View>
                        <View className="ml-3 flex-1">
                          <Text className="font-semibold text-slate-900">{ingredient.name}</Text>
                          <Text className="mt-0.5 text-sm text-slate-400">
                            {portion}{ingredient.defaultPortionUnit ? ` ${ingredient.defaultPortionUnit}` : ""}
                          </Text>
                        </View>
                        {kcal != null && (
                          <Text className="mr-2 text-sm font-semibold text-slate-500">{kcal} kcal</Text>
                        )}
                        <Pressable
                          hitSlop={8}
                          onPress={() => openIngredientInfo(ingredient)}
                          className="mr-1 h-8 w-8 items-center justify-center rounded-full active:bg-slate-100"
                        >
                          <Ionicons name="information-circle-outline" size={20} color="#94A3B8" />
                        </Pressable>
                        <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
                      </Pressable>
                    );
                  }}
                  ListEmptyComponent={
                    <View className="items-center py-16">
                      <Ionicons name="nutrition-outline" size={42} color="#94A3B8" />
                      <Text className="mt-4 text-lg font-bold text-slate-900">No ingredients found</Text>
                      <Text className="mt-2 text-center text-slate-500">
                        {ingredientSearch ? "Try a different search." : "Create ingredients in the Pantry tab first."}
                      </Text>
                    </View>
                  }
                />
              )}
            </>
          )}
        </SafeAreaView>
      )}

      {renderInfoOverlay()}

      <RateAndConfirmModal
        visible={!!rateConfirmEntry}
        recipeName={rateConfirmEntry?.recipe?.name ?? ""}
        saving={ratingSaving}
        onCancel={() => setRateConfirmEntry(null)}
        onConfirm={(value) => void handleSubmitRateAndConfirm(value)}
      />

      <ResolveIngredientSourcesModal
        visible={showResolveModal}
        requirements={ambiguousRequirements}
        saving={resolvingSaving}
        onCancel={() => {
          setShowResolveModal(false);
          setPendingConfirmEntry(null);
        }}
        onConfirm={(selections) => void handleResolvedConfirm(selections)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  activePill: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  activePillText: {
    color: "#0f172a",
  },
  inactivePillText: {
    color: "#64748b",
  },
  plannedEntry: {
    opacity: 0.55,
  },
});

const pageDotStyles = StyleSheet.create({
  active: {
    width: 16,
    backgroundColor: "#2563EB",
  },
});
