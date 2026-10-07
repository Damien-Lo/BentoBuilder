import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";

import { getMeals, type Meal } from "@/src/services/mealApi";
import { addRecipeScore, getRecipeById, getRecipes, type Recipe } from "@/src/services/recipeApi";
import { addIngredientScore, getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import { getPantryItems } from "@/src/services/pantryApi";
import {
  estimateDishesFromPhoto,
  getRestaurantMeals,
  updateRestaurantMeal,
  type Dish,
  type DishInput,
  type DishNutrition,
  type RestaurantMeal,
} from "@/src/services/restaurantMealApi";
import { upsertMealPlanEntryContribution } from "@/src/services/groceryListApi";
import { FormInput, PriceInput } from "@/src/components/forms";
import { PhotoCaptureModal } from "@/src/components/PhotoCaptureModal";
import { takePendingNewRestaurant } from "@/src/utils/pendingNewRestaurantStore";
import type { SelectOption } from "@/src/services/optionsApi";
import type { PantryItem } from "@/src/types/pantry";
import {
  confirmMealPlanEntry,
  createMealPlanEntry,
  deleteMealPlanEntry,
  getLastEntriesBeforeDate,
  getLastUsedMap,
  getMealPlanForDate,
  unconfirmMealPlanEntry,
  updateMealPlanEntryQuantity,
  type CreateMealPlanEntryInput,
  type LastEntryBySlot,
  type LastUsedMap,
  type ConfirmedNutrition,
  type MealPlanEntry,
  type MealPlanEntryStatus,
  type MealSlot,
  type RestaurantDishSelection,
} from "@/src/services/mealPlanApi";
import { sortAlphabetically, sortByLastUsed } from "@/src/utils/lastUsedSort";
import { referenceId } from "@/src/utils/pantryDefaults";
import { loadSettings, type AppSettings } from "@/src/services/settingsService";
import { DishQuantityStepper } from "@/src/components/planner/DishQuantityStepper";
import { RateAndConfirmModal } from "@/src/components/planner/RateAndConfirmModal";
import { shouldAutoPromptRating, updateRatingPrompt, type RatingPromptAction } from "@/src/utils/ratingPrompt";
import { ResolveIngredientSourcesModal } from "@/src/components/planner/ResolveIngredientSourcesModal";
import { NutritionSummaryCard, type NutritionLimits } from "@/src/components/health/NutritionSummaryCard";
import { NutritionDetailOverlay, type NutritionDetailPage } from "@/src/components/planner/NutritionDetailOverlay";
import {
  computeConfirmedRecipeNutrition,
  computeConfirmNutrition,
  computeDayNutrition,
  friendlyDayLabel,
  getEntryAvailability,
  getIngredientKcal,
  courseAmountLabel,
  courseName,
  courseNutrition,
  getMealKcal,
  getRecipeKcal,
  getRestaurantMealKcal,
  getRollingDates,
  parseLocalDate,
  scaleIngredientNutrition,
  scaleRecipeNutrition,
  SLOT_MAP,
  SLOTS,
  todayStr,
  toDateStr,
  weekRangeLabel,
} from "@/src/utils/mealPlan";
import { divideNutritionTotals } from "@/src/utils/nutrition";
import {
  applyAmountOverrides,
  buildIngredientRequirements,
  getDefaultDeductionInstructions,
  getExpandedRows,
  getResolvedDeductionInstructions,
  hasAmbiguity,
  requirementNeedsResolution,
  type AmountOverride,
  type DeductionInstruction,
  type IngredientRequirement,
  type ManualPieceInput,
} from "@/src/utils/pantryDeduction";
import { getIngredientConversions } from "@/src/utils/unitConversion";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_ABBREVS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  // Opened on a particular day (from a meal in the calendar).
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  useEffect(() => {
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) setSelectedDate(dateParam);
  }, [dateParam]);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [allMeals, setAllMeals] = useState<Meal[]>([]);
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [allRestaurantMeals, setAllRestaurantMeals] = useState<RestaurantMeal[]>([]);
  const [lastUsed, setLastUsed] = useState<LastUsedMap>({ meal: {}, recipe: {}, ingredient: {}, restaurantMeal: {} });
  const [lastEntryBySlot, setLastEntryBySlot] = useState<LastEntryBySlot | null>(null);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  // Daily / weekly nutrition card paging
  const [nutritionView, setNutritionView] = useState<0 | 1 | 2>(0);
  const [weekEntries, setWeekEntries] = useState<MealPlanEntry[][]>([]);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Add-to-plan overlay (plain local state — no navigation involved)
  const [showAdd, setShowAdd] = useState(false);
  const [addSlot, setAddSlot] = useState<MealSlot>("breakfast");
  const [addStatus, setAddStatus] = useState<MealPlanEntryStatus>("confirmed");
  // Per-recipe "servings to add" overrides for the recipe picker below —
  // keyed by recipe id so scrolling/re-rendering the list doesn't lose them.
  const [addRecipeServingsById, setAddRecipeServingsById] = useState<Record<string, number>>({});
  const [addMode, setAddMode] = useState<"meal" | "recipe" | "ingredient" | "restaurant">("meal");
  const [mealSearch, setMealSearch] = useState("");
  const [recipeSearch, setRecipeSearch] = useState("");
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [restaurantSearch, setRestaurantSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // Ingredient quantity-entry step — set once a user picks an ingredient,
  // cleared to go back to the ingredients list.
  const [pendingIngredient, setPendingIngredient] = useState<Ingredient | null>(null);
  const [pendingQuantity, setPendingQuantity] = useState("1");
  const [pendingUnit, setPendingUnit] = useState("");

  // Restaurant dish-selection step — set once a user picks a restaurant,
  // cleared to go back to the restaurants list. Starts with nothing
  // selected (not "all dishes") so logging a visit is always a deliberate
  // choice of what was actually eaten, not an accidental full-menu count.
  const [pendingRestaurantMeal, setPendingRestaurantMeal] = useState<RestaurantMeal | null>(null);
  // dish _id -> quantity; presence in the map is "selected", same role the
  // old Set<string> played, but now carries how many of each too. Keyed by
  // a staged dish's temp key (see stagedNewDishes) until confirm remaps it
  // to the real id the server assigns.
  const [selectedDishQuantities, setSelectedDishQuantities] = useState<Map<string, number>>(new Map());
  // A dish ordered today that isn't on this restaurant's menu yet, typed
  // inline while picking what was eaten — kept purely local (never written
  // to the restaurant record) until the whole visit is actually confirmed,
  // so backing out of the add-to-plan flow never leaves an orphaned menu
  // item behind for something that was never actually logged.
  const [stagedNewDishes, setStagedNewDishes] = useState<
    { key: string; name: string; price: string; nutrition: DishNutrition }[]
  >([]);
  const [showAddDishForm, setShowAddDishForm] = useState(false);
  const [newDishName, setNewDishName] = useState("");
  const [newDishPrice, setNewDishPrice] = useState("");
  // The visible/editable calories text mirrors newDishNutrition.calories;
  // the rest of newDishNutrition only ever gets filled by a photo estimate
  // (this lightweight form has no fields for protein/carbs/fats/fiber/
  // sodium) but is still carried through to the staged dish so that data
  // isn't thrown away just because the form doesn't display it.
  const [newDishCalories, setNewDishCalories] = useState("");
  const [newDishNutrition, setNewDishNutrition] = useState<DishNutrition>({});
  const [showDishScanModal, setShowDishScanModal] = useState(false);
  const [estimatingDish, setEstimatingDish] = useState(false);

  // Tapping an ingredient/recipe entry opens this overlay instead of
  // navigating straight to the catalog page - shows and lets you edit how
  // much of it was actually eaten *for this one entry*, with a button to
  // still reach the full catalog page from here. Meal/restaurant entries
  // keep navigating directly (no analogous single-quantity field to edit).
  const [editEntry, setEditEntry] = useState<MealPlanEntry | null>(null);
  const [editQuantity, setEditQuantity] = useState("1");
  const [editUnit, setEditUnit] = useState("");
  // Restaurant entries edit differently (per-dish quantity, not one scalar)
  // - same dish-id -> quantity map shape as the add-flow's
  // selectedDishQuantities, seeded from the entry's existing selections.
  const [editDishQuantities, setEditDishQuantities] = useState<Map<string, number>>(new Map());
  const [editSaving, setEditSaving] = useState(false);

  // Expanded info overlay for a meal/recipe/ingredient row
  const [infoItem, setInfoItem] = useState<
    | { type: "meal"; data: Meal }
    | { type: "recipe"; data: Recipe }
    | { type: "ingredient"; data: Ingredient }
    | { type: "restaurant"; data: RestaurantMeal }
    | null
  >(null);
  const [infoLoading, setInfoLoading] = useState(false);

  // Rate-then-confirm overlay for a planned recipe entry — swiping it reveals
  // a "Rate" button alongside the plain "Confirm" one. Also used, in the
  // opposite order (resolve piece size first, then rate), when adding an
  // entry directly as confirmed — see handleConfirmEntry's rateFirst param.
  const [rateConfirmEntry, setRateConfirmEntry] = useState<MealPlanEntry | null>(null);
  const [ratingSaving, setRatingSaving] = useState(false);
  // Set only for the "rate after resolving" order — holds everything
  // finishRating needs to actually confirm once rating is done/skipped, so
  // it isn't recomputed (and doesn't need to re-derive whether resolution
  // was needed) after the rating step closes.
  const [pendingRatingConfirm, setPendingRatingConfirm] = useState<{
    entry: MealPlanEntry;
    instructions: DeductionInstruction[];
    manualPieceEntries: ManualPieceInput[];
    confirmedNutrition: ConfirmedNutrition;
  } | null>(null);

  // Resolve-sources overlay — only shown when confirming an entry whose
  // pantry deduction has a genuine choice (2+ possible sources) for at
  // least one ingredient.
  const [pendingConfirmEntry, setPendingConfirmEntry] = useState<MealPlanEntry | null>(null);
  // The full requirement list for pendingConfirmEntry — needed so resolving
  // just the ambiguous ones (below) can still auto-drain everything else
  // instead of silently skipping it. ambiguousRequirements is the filtered
  // subset actually rendered in the resolve-sources overlay.
  const [pendingRequirements, setPendingRequirements] = useState<IngredientRequirement[]>([]);
  const [ambiguousRequirements, setAmbiguousRequirements] = useState<IngredientRequirement[]>([]);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolvingSaving, setResolvingSaving] = useState(false);
  // Whether resolving pendingConfirmEntry's ambiguity should lead straight
  // to confirming (the manual toggle/swipe path) or to the rating prompt
  // first (the "just added, already confirmed" path) — see handleConfirmEntry.
  const [pendingRateFirst, setPendingRateFirst] = useState(false);

  const dateStripRef = useRef<FlatList<string>>(null);
  // One ref object per entry's swipeable row (ReanimatedSwipeable's `ref`
  // prop is typed as a ref object, not a callback) — created on first use
  // and reused across renders, so each row keeps pointing at the same one.
  const swipeableRefs = useRef(new Map<string, RefObject<SwipeableMethods | null>>()).current;
  function swipeableRefFor(entryId: string): RefObject<SwipeableMethods | null> {
    let ref = swipeableRefs.get(entryId);
    if (!ref) {
      ref = { current: null };
      swipeableRefs.set(entryId, ref);
    }
    return ref;
  }

  // Load available meals/recipes/ingredients for the add overlay — on every
  // focus, not just mount, so something added elsewhere (a new ingredient
  // from the Kitchen section, a pantry change, etc.) shows up here without
  // needing to leave and re-enter the whole Kitchen section to force a
  // remount. Matches the pattern RecipesMainPage already uses for the same
  // reason. Pantry items are loaded here too, purely for the planned-entry
  // availability icon.
  useFocusEffect(
    useCallback(() => {
      getMeals().then(setAllMeals).catch(() => {});
      getRecipes().then(setAllRecipes).catch(() => {});
      getIngredients().then(setAllIngredients).catch(() => {});
      getPantryItems().then(setPantryItems).catch(() => {});
      getRestaurantMeals().then(setAllRestaurantMeals).catch(() => {});
      getLastUsedMap().then(setLastUsed).catch(() => {});

      // Coming back from "Add a new restaurant" specifically when it was
      // reached from this screen's own add-to-plan flow (restaurant-meals/
      // add.tsx only stashes a hand-off when it was opened with
      // ?from=planner, not from the Eating Out catalog or Recipes tab) -
      // reopen straight into the dish-picker instead of leaving the user
      // to find and re-tap the restaurant they just created. Whatever was
      // entered as the menu while creating it is almost always also what
      // was actually ordered today, so it's pre-selected (still freely
      // editable) rather than making the user re-check it all.
      const newRestaurant = takePendingNewRestaurant();
      if (newRestaurant) {
        resetDishPickerDrafts();
        setSelectedDishQuantities(new Map(newRestaurant.dishes.map(d => [d._id, 1])));
        setPendingRestaurantMeal(newRestaurant);
        setShowAdd(true);
      }
    }, []),
  );

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

  // The most recent prior entry per slot, strictly before the selected date
  // — powers the "swipe to add yesterday's breakfast again" quick-add on an
  // empty slot. Refetches whenever the selected date changes, since "before"
  // moves with it.
  useEffect(() => {
    getLastEntriesBeforeDate(selectedDate).then(setLastEntryBySlot).catch(() => setLastEntryBySlot(null));
  }, [selectedDate]);

  useEffect(() => {
    loadSettings().then(setAppSettings).catch(() => {});
  }, []);

  // Load the rolling 7-day window (for the "last 7 days" and daily-average
  // nutrition cards) ending at the selected date — a rolling window, not
  // the calendar week containing it, so it tracks backwards with whatever
  // date you're looking at rather than jumping around at week boundaries.
  const last7Dates = useMemo(
    () => getRollingDates(selectedDate, 7),
    [selectedDate],
  );

  useEffect(() => {
    Promise.all(last7Dates.map(d => getMealPlanForDate(d)))
      .then(setWeekEntries)
      .catch(() => setWeekEntries(last7Dates.map(() => [])));
    // `entries` is included so that adding/deleting/toggling an item on the
    // selected day (which updates `entries` locally, not `last7Dates`) also
    // refreshes the rolling total instead of leaving it stale.
  }, [last7Dates, entries]);

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
  const last7ConfirmedNutrition = useMemo(
    () => computeDayNutrition(weekEntries.flat().filter(e => e.status === "confirmed"), appSettings?.unitConversions ?? []),
    [weekEntries, appSettings],
  );
  const last7PlannedNutrition = useMemo(
    () => computeDayNutrition(weekEntries.flat().filter(e => e.status === "planned"), appSettings?.unitConversions ?? []),
    [weekEntries, appSettings],
  );
  // Per-day average across the same rolling window, for the third
  // nutrition-card page - divides the 7-day totals down to a daily figure
  // so it can be read against the same daily limits as the "today" card.
  const avgConfirmedNutrition = useMemo(
    () => divideNutritionTotals(last7ConfirmedNutrition, last7Dates.length),
    [last7ConfirmedNutrition, last7Dates.length],
  );
  const avgPlannedNutrition = useMemo(
    () => divideNutritionTotals(last7PlannedNutrition, last7Dates.length),
    [last7PlannedNutrition, last7Dates.length],
  );

  // The three nutrition cards (day / last 7 days / 7-day daily average) —
  // shared by the swipeable cards and the tap-to-expand overlay.
  const nutritionPages = useMemo<NutritionDetailPage[]>(() => {
    const dailyLimits = (scale: number): NutritionLimits => {
      const s = (value: number | null | undefined) => (value != null ? value * scale : null);
      return {
        calories: s(appSettings?.dailyCalorieLimit),
        protein: s(appSettings?.dailyProteinLimit),
        carbs: s(appSettings?.dailyCarbsLimit),
        fats: s(appSettings?.dailyFatsLimit),
        fiber: s(appSettings?.dailyFiberLimit),
        sodium: s(appSettings?.dailySodiumLimit),
      };
    };
    return [
      { title: "Daily nutrition", confirmed: confirmedNutrition, planned: plannedNutrition, limits: dailyLimits(1), goalScale: 1 },
      {
        title: "Last 7 days",
        subtitle: weekRangeLabel(last7Dates),
        confirmed: last7ConfirmedNutrition,
        planned: last7PlannedNutrition,
        limits: dailyLimits(7),
        goalScale: 7,
      },
      {
        title: "Daily average",
        subtitle: "Last 7 days",
        confirmed: avgConfirmedNutrition,
        planned: avgPlannedNutrition,
        limits: dailyLimits(1),
        goalScale: 1,
      },
    ];
  }, [
    appSettings,
    confirmedNutrition,
    plannedNutrition,
    last7Dates,
    last7ConfirmedNutrition,
    last7PlannedNutrition,
    avgConfirmedNutrition,
    avgPlannedNutrition,
  ]);
  // Which card's expanded view is open, if any.
  const [nutritionDetailPage, setNutritionDetailPage] = useState<number | null>(null);
  const nutritionPagerRef = useRef<ScrollView>(null);

  const entriesBySlot = useMemo(() => {
    const map = new Map<MealSlot, MealPlanEntry[]>();
    for (const slot of SLOTS) map.set(slot.id, []);
    for (const e of entries) {
      map.get(e.slot)?.push(e);
    }
    return map;
  }, [entries]);

  // Browsing (no search text) sorts by most-recently-used-in-the-planner;
  // once you're actively searching, alphabetical is easier to scan for a
  // known name.
  const filteredMeals = useMemo(() => {
    const q = mealSearch.trim().toLowerCase();
    if (!q) return sortByLastUsed(allMeals, lastUsed.meal, m => m._id, m => m.name);
    return sortAlphabetically(allMeals.filter(m => m.name.toLowerCase().includes(q)), m => m.name);
  }, [allMeals, mealSearch, lastUsed.meal]);

  const filteredRecipes = useMemo(() => {
    const q = recipeSearch.trim().toLowerCase();
    if (!q) return sortByLastUsed(allRecipes, lastUsed.recipe, r => r._id, r => r.name);
    return sortAlphabetically(allRecipes.filter(r => r.name.toLowerCase().includes(q)), r => r.name);
  }, [allRecipes, recipeSearch, lastUsed.recipe]);

  // Recipes that produce another ingredient (a raw prep step, e.g. "Sous
  // Vide Filet Mignon Prep" makes "Vacuum-Sealed Filet Mignon") - flagged
  // in the add-recipe picker below so it's not confused for the finished,
  // directly-eaten dish at a glance. Reuses the reverse Ingredient ->
  // productionRecipe link RecipesMainPage.tsx already keys its own "Meal
  // Preps" filter tab off of - no new data.
  const producingRecipeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const ingredient of allIngredients) {
      const recipeId = referenceId(ingredient.productionRecipe);
      if (recipeId) ids.add(recipeId);
    }
    return ids;
  }, [allIngredients]);

  const filteredIngredients = useMemo(() => {
    const q = ingredientSearch.trim().toLowerCase();
    if (!q) return sortByLastUsed(allIngredients, lastUsed.ingredient, i => i._id, i => i.name);
    return sortAlphabetically(allIngredients.filter(i => i.name.toLowerCase().includes(q)), i => i.name);
  }, [allIngredients, ingredientSearch, lastUsed.ingredient]);

  const filteredRestaurantMeals = useMemo(() => {
    const q = restaurantSearch.trim().toLowerCase();
    if (!q) return sortByLastUsed(allRestaurantMeals, lastUsed.restaurantMeal, r => r._id, r => r.restaurantName);
    return sortAlphabetically(
      allRestaurantMeals.filter(
        r =>
          r.restaurantName.toLowerCase().includes(q) ||
          r.dishes.some(d => d.name.toLowerCase().includes(q)),
      ),
      r => r.restaurantName,
    );
  }, [allRestaurantMeals, restaurantSearch, lastUsed.restaurantMeal]);

  // Local-only dish-picker state (staged new dishes + the inline form that
  // stages them) - reset everywhere selectedDishQuantities itself resets,
  // so a leftover draft never carries over into a different restaurant or
  // a later add-to-plan session.
  function resetDishPickerDrafts() {
    setStagedNewDishes([]);
    setShowAddDishForm(false);
    setNewDishName("");
    setNewDishPrice("");
    setNewDishCalories("");
    setNewDishNutrition({});
  }

  function openAdd(slot: MealSlot) {
    setAddSlot(slot);
    setAddStatus("confirmed");
    setAddMode("meal");
    setMealSearch("");
    setRecipeSearch("");
    setIngredientSearch("");
    setRestaurantSearch("");
    setPendingIngredient(null);
    setPendingRestaurantMeal(null);
    setSelectedDishQuantities(new Map());
    resetDishPickerDrafts();
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

  function openRestaurantInfo(restaurantMeal: RestaurantMeal) {
    setInfoItem({ type: "restaurant", data: restaurantMeal });
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

  // Creating directly with status "confirmed" used to skip pantry
  // deduction and the ambiguity/resolve-sources overlay entirely — only
  // the separate planned -> confirmed toggle (handleConfirmEntry) ever ran
  // buildIngredientRequirements. Unified here: always create as "planned",
  // then — only if the caller actually wanted it confirmed — immediately
  // run the exact same confirm pipeline that toggle uses, so both paths to
  // "confirmed" behave identically (real deduction, same overlay when
  // needed) instead of diverging based on how "confirmed" was reached.
  async function createEntry(input: CreateMealPlanEntryInput): Promise<MealPlanEntry> {
    const wantsConfirmed = input.status === "confirmed";
    const entry = await createMealPlanEntry({ ...input, status: "planned" });
    setEntries(prev => [...prev, entry]);
    // rateFirst: true — adding something already-confirmed is exactly the
    // moment a rating is easiest to forget (there's no separate swipe
    // gesture prompting for it), so ask here, after any piece-size
    // resolution and before the pantry actually gets touched. Skippable —
    // see RateAndConfirmModal's onSkip.
    if (wantsConfirmed) handleConfirmEntry(entry, true);
    return entry;
  }

  async function handleAddEntry(meal: Meal) {
    if (saving) return;
    try {
      setSaving(true);
      await createEntry({ date: selectedDate, slot: addSlot, status: addStatus, meal: meal._id });
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
      await createEntry({
        date: selectedDate,
        slot: addSlot,
        status: addStatus,
        recipe: recipe._id,
        recipeServings: servings,
      });
      setShowAdd(false);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not add recipe.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddRestaurantEntry(restaurantMeal: RestaurantMeal, selections: RestaurantDishSelection[]) {
    if (saving || selections.length === 0) return;
    try {
      setSaving(true);
      await createEntry({
        date: selectedDate,
        slot: addSlot,
        status: addStatus,
        restaurantMeal: restaurantMeal._id,
        restaurantDishSelections: selections,
      });
      setPendingRestaurantMeal(null);
      setSelectedDishQuantities(new Map());
      resetDishPickerDrafts();
      setShowAdd(false);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not add restaurant meal.");
    } finally {
      setSaving(false);
    }
  }

  // Stages a dish typed inline (not yet on this restaurant's menu) as
  // "selected" under a temp key, same as tapping an existing dish's
  // checkbox — nothing is written to the restaurant record until confirm.
  function addStagedDish() {
    const name = newDishName.trim();
    if (!name) return;
    const key = `staged-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setStagedNewDishes(prev => [...prev, { key, name, price: newDishPrice, nutrition: newDishNutrition }]);
    setSelectedDishQuantities(prev => {
      const next = new Map(prev);
      next.set(key, 1);
      return next;
    });
    setNewDishName("");
    setNewDishPrice("");
    setNewDishCalories("");
    setNewDishNutrition({});
    setShowAddDishForm(false);
  }

  // singleDish: true tells the model this photo is of exactly the one dish
  // being staged (same signal add.tsx's per-dish-card scan button sends),
  // not a possible multi-dish table spread.
  function handleDishPhotoCaptured(photoUri: string) {
    setShowDishScanModal(false);
    setEstimatingDish(true);
    estimateDishesFromPhoto(photoUri, pendingRestaurantMeal?.restaurantName, true)
      .then((estimated) => {
        if (estimated.length === 0) {
          Alert.alert(
            "No dish recognized",
            "Couldn't identify any food in that photo — try again, or fill this in manually.",
          );
          return;
        }
        const [d] = estimated;
        setNewDishName(d.name);
        setNewDishNutrition(d.estimatedNutrition);
        setNewDishCalories(d.estimatedNutrition.calories != null ? String(d.estimatedNutrition.calories) : "");
        setShowAddDishForm(true);
      })
      .catch((error) => {
        Alert.alert(
          "Couldn't estimate photo",
          error instanceof Error ? error.message : "Something went wrong reading that photo.",
        );
      })
      .finally(() => setEstimatingDish(false));
  }

  function removeStagedDish(key: string) {
    setStagedNewDishes(prev => prev.filter(d => d.key !== key));
    setSelectedDishQuantities(prev => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }

  // Confirms the current restaurant dish-picker step: if anything was
  // staged inline, persists those to the restaurant's actual menu FIRST
  // (a single PATCH replacing dishes with the existing list + the staged
  // ones appended — the route does a full replace, not a push), remaps
  // selectedDishQuantities from each staged dish's temp key to the real id
  // the server assigns, then hands off to handleAddRestaurantEntry exactly
  // as if every dish had already existed on the menu.
  async function handleConfirmRestaurantVisit() {
    if (!pendingRestaurantMeal || saving) return;

    let restaurantMeal = pendingRestaurantMeal;
    let quantities = selectedDishQuantities;

    if (stagedNewDishes.length > 0) {
      setSaving(true);
      try {
        // Existing dishes are passed through completely unchanged (real
        // _id and scores included) - the route replaces the whole array,
        // so sending anything less would silently mint fresh ids for
        // every dish already on the menu and orphan every past visit's
        // restaurantDishSelections that reference the old ones.
        const dishInputs: (DishInput | Dish)[] = [
          ...pendingRestaurantMeal.dishes,
          ...stagedNewDishes.map((d): DishInput => ({
            name: d.name,
            price: d.price.trim() ? Number(d.price) : undefined,
            nutrition: d.nutrition,
          })),
        ];
        restaurantMeal = await updateRestaurantMeal(pendingRestaurantMeal._id, { dishes: dishInputs });
        setAllRestaurantMeals(prev => prev.map(r => (r._id === restaurantMeal._id ? restaurantMeal : r)));

        // The route replaces the whole array, but preserves order - the
        // newly-created dishes are exactly the tail past the original count.
        const newRealDishes = restaurantMeal.dishes.slice(pendingRestaurantMeal.dishes.length);
        quantities = new Map(selectedDishQuantities);
        stagedNewDishes.forEach((staged, i) => {
          const qty = quantities.get(staged.key);
          quantities.delete(staged.key);
          const real = newRealDishes[i];
          if (real && qty != null) quantities.set(real._id, qty);
        });
      } catch (err) {
        Alert.alert("Error", err instanceof Error ? err.message : "Could not save the new dish.");
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    await handleAddRestaurantEntry(
      restaurantMeal,
      [...quantities.entries()].map(([dish, quantity]) => ({ dish, quantity })),
    );
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
      await createEntry({
        date: selectedDate,
        slot: addSlot,
        status: addStatus,
        ingredient: pendingIngredient._id,
        ingredientQuantity: quantity,
        ingredientUnit: pendingUnit.trim(),
      });
      setPendingIngredient(null);
      setShowAdd(false);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not add ingredient.");
    } finally {
      setSaving(false);
    }
  }

  async function performConfirm(
    entry: MealPlanEntry,
    instructions: DeductionInstruction[],
    manualPieceEntries: ManualPieceInput[] = [],
    confirmedNutrition?: ConfirmedNutrition,
  ) {
    swipeableRefs.get(entry._id)?.current?.close();
    try {
      const updated = await confirmMealPlanEntry(entry._id, instructions, manualPieceEntries, confirmedNutrition);
      setEntries(prev => prev.map(e => (e._id === entry._id ? updated : e)));
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not confirm.");
    }
  }

  async function handleUnconfirmEntry(entry: MealPlanEntry) {
    swipeableRefs.get(entry._id)?.current?.close();
    try {
      const updated = await unconfirmMealPlanEntry(entry._id);
      setEntries(prev => prev.map(e => (e._id === entry._id ? updated : e)));
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not unconfirm.");
    }
  }

  // Whether adding this as already-eaten should ask for a rating: only for a
  // recipe or directly-logged ingredient, and only when it's due (never
  // rated, changed since, or not rated for a while — see
  // utils/ratingPrompt.ts). A meal or restaurant visit just confirms.
  function wantsAutoRating(entry: MealPlanEntry): boolean {
    const timing = appSettings
      ? {
          cooldownDays: appSettings.ratingCooldownDays,
          settledCooldownDays: appSettings.ratingSettledCooldownDays,
          skipBackoffDays: appSettings.ratingSkipBackoffDays,
        }
      : undefined;
    if (entry.recipe) return shouldAutoPromptRating(entry.recipe, Date.now(), timing);
    if (entry.ingredient) return shouldAutoPromptRating(entry.ingredient, Date.now(), timing);
    return false;
  }

  // Once instructions/nutrition are settled (no ambiguity, or the overlay
  // just resolved it), either confirm right away (the manual toggle/swipe
  // path) or — rateFirst — prompt for a rating first, skippable, since
  // adding something already-confirmed has no separate gesture prompting
  // for one and is exactly where a rating is easiest to forget. Recipes and
  // directly-logged ingredients (e.g. a protein shake) get rated — a
  // restaurant visit or multi-course meal just confirms.
  function finishConfirm(
    entry: MealPlanEntry,
    instructions: DeductionInstruction[],
    manualPieceEntries: ManualPieceInput[],
    confirmedNutrition: ConfirmedNutrition,
    rateFirst: boolean,
  ) {
    if (rateFirst && wantsAutoRating(entry)) {
      setPendingRatingConfirm({ entry, instructions, manualPieceEntries, confirmedNutrition });
      setRateConfirmEntry(entry);
      return;
    }
    void performConfirm(entry, instructions, manualPieceEntries, confirmedNutrition);
  }

  // Confirming deducts pantry stock. Most of the time that's fully
  // automatic (nearest-expiry order) — the resolve-sources overlay only
  // appears when at least one ingredient genuinely has more than one
  // pantry source to choose from, or (wholePiece only) an outright
  // shortfall with nothing in pantry to cover part or all of what's
  // needed, which is where the overlay's "type a weight instead" fallback
  // comes in. rateFirst carries through to the resolve overlay too (see
  // pendingRateFirst) so piece-size resolution always happens before
  // rating, never after.
  function handleConfirmEntry(entry: MealPlanEntry, rateFirst = false) {
    const conversions = appSettings?.unitConversions ?? [];
    const requirements = buildIngredientRequirements(
      entry, recipeMap, ingredientMap, allIngredients, pantryItems, conversions,
    );

    if (hasAmbiguity(requirements)) {
      swipeableRefs.get(entry._id)?.current?.close();
      setPendingConfirmEntry(entry);
      setPendingRequirements(requirements);
      setAmbiguousRequirements(requirements.filter(requirementNeedsResolution));
      setPendingRateFirst(rateFirst);
      setShowResolveModal(true);
      return;
    }

    const instructions = getDefaultDeductionInstructions(requirements);
    const rows = getExpandedRows(entry, recipeMap, ingredientMap, allIngredients, pantryItems, conversions);
    const confirmedNutrition = computeConfirmNutrition(
      requirements, rows, instructions, [], ingredientMap, pantryItems, conversions,
    );
    finishConfirm(entry, instructions, [], confirmedNutrition, rateFirst);
  }

  // Adds this entry's pantry shortfall to the grocery list — a manual,
  // re-pressable check (current pantry vs. just this entry's need, no
  // awareness of other entries' claims on the same stock). Idempotent per
  // entry server-side, so re-pressing closer to shopping day just refreshes
  // the amounts rather than duplicating them.
  async function handleAddMissingToGroceryList(entry: MealPlanEntry) {
    const conversions = appSettings?.unitConversions ?? [];
    const requirements = buildIngredientRequirements(
      entry, recipeMap, ingredientMap, allIngredients, pantryItems, conversions,
    );

    const shortfalls = requirements
      .map(r => ({
        ...r,
        shortfall: Math.max(0, r.neededQuantity - r.groups.reduce((sum, g) => sum + g.totalAvailable, 0)),
      }))
      .filter(r => r.shortfall > 0);

    if (shortfalls.length === 0) {
      Alert.alert("Nothing missing", "Everything needed for this is already in your pantry.");
      return;
    }

    try {
      await Promise.all(
        shortfalls.map(r =>
          upsertMealPlanEntryContribution({
            mealPlanEntry: entry._id,
            ingredient: r.ingredientId,
            name: r.ingredientName,
            amount: r.shortfall,
            unit: r.unit,
          }),
        ),
      );
      Alert.alert("Added to grocery list", `${shortfalls.length} item${shortfalls.length === 1 ? "" : "s"} added or updated.`);
    } catch (err) {
      Alert.alert("Could not update grocery list", err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function handleToggleEntryStatus(entry: MealPlanEntry) {
    if (entry.status === "planned") {
      handleConfirmEntry(entry);
    } else {
      void handleUnconfirmEntry(entry);
    }
  }

  async function handleResolvedConfirm(
    selections: Record<string, string[]>,
    manualPieceEntries: ManualPieceInput[],
    amountOverrides: Record<string, AmountOverride>,
  ) {
    if (!pendingConfirmEntry) return;
    setResolvingSaving(true);
    try {
      const conversions = appSettings?.unitConversions ?? [];
      // Amounts typed in for askAmount lines replace the recipe's nominal
      // ones for both the deduction and the nutrition snapshot.
      const { requirements, rows } = applyAmountOverrides(
        pendingRequirements,
        getExpandedRows(pendingConfirmEntry, recipeMap, ingredientMap, allIngredients, pantryItems, conversions),
        amountOverrides,
        ingredientMap,
        allIngredients,
        conversions,
      );
      // The FULL requirement list (not just the ambiguous subset rendered
      // in the overlay) so requirements that never needed a choice still
      // get auto-drained here — passing only the ambiguous ones would
      // silently skip deducting everything else.
      const instructions = getResolvedDeductionInstructions(requirements, selections);
      const confirmedNutrition = computeConfirmNutrition(
        requirements, rows, instructions, manualPieceEntries, ingredientMap, pantryItems, conversions,
      );
      const entry = pendingConfirmEntry;
      const rateFirst = pendingRateFirst;
      setShowResolveModal(false);
      setPendingConfirmEntry(null);
      setPendingRequirements([]);
      setPendingRateFirst(false);

      // rateFirst carried through from handleConfirmEntry — piece-size
      // resolution just finished, so the rating prompt (skippable) comes
      // next, before the pantry actually gets touched.
      if (rateFirst && wantsAutoRating(entry)) {
        setPendingRatingConfirm({ entry, instructions, manualPieceEntries, confirmedNutrition });
        setRateConfirmEntry(entry);
      } else {
        await performConfirm(entry, instructions, manualPieceEntries, confirmedNutrition);
      }
    } finally {
      setResolvingSaving(false);
    }
  }

  function handleOpenRateAndConfirm(entry: MealPlanEntry) {
    swipeableRefs.get(entry._id)?.current?.close();
    setRateConfirmEntry(entry);
  }

  // Shared by both routes into this modal: the "Rate & Confirm" swipe
  // action (rates, then resolves + confirms from scratch — pendingRatingConfirm
  // is null there) and the "add as confirmed" rateFirst path (piece size
  // already resolved before rating ever showed — everything needed to
  // confirm is already stashed, so this just finishes it).
  function finishRating() {
    const entry = rateConfirmEntry;
    const pending = pendingRatingConfirm;
    setRateConfirmEntry(null);
    setPendingRatingConfirm(null);
    if (!entry) return;
    if (pending) {
      void performConfirm(pending.entry, pending.instructions, pending.manualPieceEntries, pending.confirmedNutrition);
    } else {
      handleConfirmEntry(entry);
    }
  }

  async function handleSubmitRateAndConfirm(value: number) {
    const recipeId = rateConfirmEntry?.recipe?._id;
    const ingredientId = rateConfirmEntry?.ingredient?._id;
    if (!recipeId && !ingredientId) return;
    setRatingSaving(true);
    try {
      if (recipeId) await addRecipeScore(recipeId, value);
      else if (ingredientId) await addIngredientScore(ingredientId, value);
      finishRating();
    } catch (err) {
      Alert.alert(
        "Couldn't save rating",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setRatingSaving(false);
    }
  }

  // Confirms without saving a rating — pantry deduction (or the piece-size
  // choice already made) still needs to happen either way; only the score
  // is skipped.
  function handleSkipRating() {
    // Only a skipped *automatic* prompt counts toward backing off.
    if (pendingRatingConfirm) recordRatingPrompt(pendingRatingConfirm.entry, "skip");
    finishRating();
  }

  function handleNeverAskRating() {
    if (pendingRatingConfirm) recordRatingPrompt(pendingRatingConfirm.entry, "disable");
    finishRating();
  }

  // Fire-and-forget: a failure here only means being asked again sooner,
  // never worth blocking the confirm over.
  function recordRatingPrompt(entry: MealPlanEntry, action: RatingPromptAction) {
    const target = entry.recipe
      ? { kind: "recipe" as const, id: entry.recipe._id }
      : entry.ingredient
        ? { kind: "ingredient" as const, id: entry.ingredient._id }
        : null;
    if (target) void updateRatingPrompt(target.kind, target.id, action).catch(() => {});
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

  // Display name for the swipe-to-add hint - same "what is this entry"
  // logic as renderEntry's title, but a single string rather than a
  // title/subtitle split, and including which dish(es) for a restaurant
  // visit since "Wagaya" alone doesn't say what was actually ordered.
  function entryDisplayName(entry: MealPlanEntry): string {
    if (entry.recipe) return entry.recipe.name;
    if (entry.ingredient) return entry.ingredient.name;
    if (entry.restaurantMeal) {
      const quantityByDish = new Map((entry.restaurantDishSelections ?? []).map(s => [s.dish, s.quantity]));
      const dishNames = (entry.restaurantMeal.dishes ?? [])
        .filter(d => quantityByDish.has(d._id))
        .map(d => d.name);
      return dishNames.length
        ? `${entry.restaurantMeal.restaurantName}: ${dishNames.join(", ")}`
        : entry.restaurantMeal.restaurantName;
    }
    return entry.meal?.name ?? "";
  }

  // "yesterday" / "N days ago", relative to the day currently being viewed
  // (not always today) - matches this file's existing pattern of following
  // the selected date rather than assuming it's the current day.
  function daysAgoLabel(fromDateStr: string, toDateStr: string): string {
    const days = Math.round((parseLocalDate(toDateStr).getTime() - parseLocalDate(fromDateStr).getTime()) / 86400000);
    return days === 1 ? "yesterday" : `${days} days ago`;
  }

  async function handleQuickAddFromLastEntry(slot: MealSlot, lastEntry: MealPlanEntry) {
    if (saving) return;
    try {
      setSaving(true);
      const input: CreateMealPlanEntryInput = { date: selectedDate, slot, status: "confirmed" };
      if (lastEntry.recipe) {
        input.recipe = lastEntry.recipe._id;
        input.recipeServings = lastEntry.recipeServings;
      } else if (lastEntry.ingredient) {
        input.ingredient = lastEntry.ingredient._id;
        input.ingredientQuantity = lastEntry.ingredientQuantity;
        input.ingredientUnit = lastEntry.ingredientUnit;
      } else if (lastEntry.restaurantMeal) {
        input.restaurantMeal = lastEntry.restaurantMeal._id;
        input.restaurantDishSelections = lastEntry.restaurantDishSelections;
      } else if (lastEntry.meal) {
        input.meal = lastEntry.meal._id;
      }
      await createEntry(input);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not add this item.");
    } finally {
      setSaving(false);
    }
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
      setEditEntry(entry);
      setEditQuantity(String(entry.recipeServings ?? 1));
    } else if (entry.ingredient) {
      setEditEntry(entry);
      setEditQuantity(String(entry.ingredientQuantity ?? 1));
      setEditUnit(entry.ingredientUnit ?? "");
    } else if (entry.restaurantMeal) {
      setEditEntry(entry);
      setEditDishQuantities(new Map((entry.restaurantDishSelections ?? []).map(s => [s.dish, s.quantity])));
    } else if (entry.meal) {
      router.push({ pathname: "/meals/[id]", params: { id: entry.meal._id } });
    }
  }

  // Jumps from the entry-edit overlay to the underlying catalog page - what
  // tapping the entry used to do directly.
  function handleViewFullItem() {
    if (!editEntry) return;
    if (editEntry.recipe) {
      // A confirmed entry's real nutrition (computeConfirmNutrition, from
      // the actual weights used) can differ from the recipe's own generic
      // cached snapshot (its assumed/authored amounts) — pass it through so
      // the catalog page can show this specific meal's real numbers instead
      // of implying the snapshot is what got eaten.
      const logged = editEntry.status === "confirmed" ? editEntry.confirmedNutrition : null;
      router.push({
        pathname: "/recipes/[id]",
        params: {
          id: editEntry.recipe._id,
          ...(logged
            ? {
                loggedCalories: String(logged.calories),
                loggedProtein: String(logged.protein),
                loggedCarbs: String(logged.carbs),
                loggedFats: String(logged.fats),
                loggedFiber: String(logged.fiber),
                loggedSodium: String(logged.sodium),
              }
            : {}),
        },
      });
    } else if (editEntry.ingredient) {
      router.push({ pathname: "/ingredients/edit/[id]", params: { id: editEntry.ingredient._id } });
    } else if (editEntry.restaurantMeal) {
      router.push({ pathname: "/restaurant-meals/[id]", params: { id: editEntry.restaurantMeal._id } });
    }
    setEditEntry(null);
  }

  async function handleSaveEntryQuantity() {
    if (!editEntry || editSaving) return;

    let updatedPromise: Promise<MealPlanEntry>;
    if (editEntry.restaurantMeal) {
      if (editDishQuantities.size === 0) return;
      const selections: RestaurantDishSelection[] = [...editDishQuantities.entries()].map(
        ([dish, quantity]) => ({ dish, quantity }),
      );
      updatedPromise = updateMealPlanEntryQuantity(editEntry._id, { restaurantDishSelections: selections });
    } else {
      const q = Number(editQuantity);
      if (!Number.isFinite(q) || q <= 0) return;
      updatedPromise = editEntry.ingredient
        ? updateMealPlanEntryQuantity(editEntry._id, { ingredientQuantity: q, ingredientUnit: editUnit })
        : updateMealPlanEntryQuantity(editEntry._id, { recipeServings: q });
    }

    setEditSaving(true);
    try {
      const updated = await updatedPromise;
      setEntries(prev => prev.map(e => (e._id === updated._id ? updated : e)));
      setEditEntry(null);
    } catch (err) {
      Alert.alert("Couldn't update", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setEditSaving(false);
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
      // Same source as the day total — exact figure from what was really
      // deducted once confirmed, the recipe's snapshot until then.
      const confirmed = entry.status === "confirmed"
        ? computeConfirmedRecipeNutrition(entry, appSettings?.unitConversions ?? [])
        : null;
      kcal = confirmed ? Math.round(confirmed.calories) : getRecipeKcal(entry.recipe, servings);
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
    } else if (entry.restaurantMeal) {
      const selections = entry.restaurantDishSelections ?? [];
      const quantityByDish = new Map(selections.map(s => [s.dish, s.quantity]));
      const eatenDishes = (entry.restaurantMeal.dishes ?? []).filter(d => quantityByDish.has(d._id));
      title = entry.restaurantMeal.restaurantName;
      subtitle = eatenDishes.length
        ? `Eating out · ${eatenDishes
            .map(d => {
              const qty = quantityByDish.get(d._id) ?? 1;
              return qty !== 1 ? `${d.name} ×${qty}` : d.name;
            })
            .join(", ")}`
        : "Eating out";
      kcal = getRestaurantMealKcal(entry.restaurantMeal, selections);
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
        ref={swipeableRefFor(entry._id)}
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
          entry.status === "planned" && (entry.recipe || entry.ingredient) ? (
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
            {entry.status === "planned" && (availability === "yellow" || availability === "red") && (
              <Pressable
                className="mt-1 flex-row items-center self-start"
                hitSlop={6}
                onPress={() => void handleAddMissingToGroceryList(entry)}
              >
                <Ionicons name="cart-outline" size={12} color="#2563EB" />
                <Text className="ml-1 text-xs font-medium text-blue-600">Add missing to grocery list</Text>
              </Pressable>
            )}
          </View>
          {kcal != null && (
            <Text className="text-sm font-semibold text-slate-500">{kcal} kcal</Text>
          )}
        </Pressable>
      </ReanimatedSwipeable>
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
          const courseCal = courseNutrition(course, appSettings?.unitConversions ?? [])?.calories;
          return (
            <View key={course._id} className="mb-2 rounded-2xl bg-slate-50 px-4 py-3">
              <Text className="text-sm font-semibold text-slate-900">{course.label}</Text>
              <Text className="mt-0.5 text-xs text-slate-500">
                {courseName(course)} · {courseAmountLabel(course)}
                {courseCal != null && ` · ${Math.round(courseCal)} kcal`}
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

  function renderRestaurantMealInfo(restaurantMeal: RestaurantMeal) {
    const kcal = getRestaurantMealKcal(restaurantMeal);
    const tags = (restaurantMeal.tags ?? []).filter((t): t is SelectOption => typeof t !== "string");
    return (
      <View>
        {tags.length > 0 && (
          <View className="mb-4 flex-row flex-wrap gap-1.5">
            {tags.map(tag => (
              <View key={tag._id} className="rounded-full bg-emerald-50 px-2.5 py-1">
                <Text className="text-xs font-semibold text-emerald-700">{tag.name}</Text>
              </View>
            ))}
          </View>
        )}

        {!!restaurantMeal.notes && (
          <Text className="mb-4 text-sm leading-5 text-slate-600">{restaurantMeal.notes}</Text>
        )}

        {infoRow("Total calories", kcal, kcal != null ? " kcal" : "")}

        <Text className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">
          Dishes ({restaurantMeal.dishes.length})
        </Text>
        {restaurantMeal.dishes.map(dish => (
          <View key={dish._id} className="mb-2 rounded-2xl bg-slate-50 px-4 py-3">
            <Text className="text-sm font-semibold text-slate-900">{dish.name}</Text>
            {dish.nutrition?.calories != null && (
              <Text className="mt-0.5 text-xs text-slate-500">{dish.nutrition.calories} kcal</Text>
            )}
          </View>
        ))}
      </View>
    );
  }

  function renderInfoOverlay() {
    if (!infoItem) return null;
    const icon =
      infoItem.type === "meal" ? "restaurant-outline"
      : infoItem.type === "recipe" ? "book-outline"
      : infoItem.type === "restaurant" ? "restaurant-outline"
      : "nutrition-outline";
    const title = infoItem.type === "restaurant" ? infoItem.data.restaurantName : infoItem.data.name;

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
              {title}
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
            {infoItem.type === "restaurant" && renderRestaurantMealInfo(infoItem.data)}
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

  // ── Edit-entry overlay: how much of this ingredient/recipe was eaten,
  // for this one meal-plan entry specifically ── same bottom-sheet pattern
  // as renderInfoOverlay above.
  function renderEditEntryOverlay() {
    if (!editEntry) return null;
    const isIngredient = !!editEntry.ingredient;
    const isRestaurant = !!editEntry.restaurantMeal;
    const title = isRestaurant
      ? editEntry.restaurantMeal!.restaurantName
      : isIngredient
        ? editEntry.ingredient!.name
        : editEntry.recipe!.name;
    const icon = isRestaurant ? "restaurant-outline" : isIngredient ? "nutrition-outline" : "book-outline";

    const q = Number(editQuantity);
    const validQty = Number.isFinite(q) && q > 0;
    const n = isRestaurant || !validQty
      ? null
      : isIngredient
        ? scaleIngredientNutrition(
            editEntry.ingredient!,
            q,
            editUnit,
            getIngredientConversions(editEntry.ingredient!, appSettings?.unitConversions ?? []),
          )
        : scaleRecipeNutrition(editEntry.recipe!, q);

    // A confirmed recipe entry's real nutrition (from the actual
    // ingredients/weights used — see computeConfirmNutrition) can differ
    // from the recipe's own generic snapshot at its logged servings — show
    // both, rather than only the generic one this overlay used to display
    // (which quietly ignored anything confirmed).
    const isConfirmedRecipe = !isIngredient && !isRestaurant && editEntry.status === "confirmed";
    const loggedNutrition = isConfirmedRecipe ? (editEntry.confirmedNutrition ?? null) : null;
    const originalNutrition = isConfirmedRecipe
      ? scaleRecipeNutrition(editEntry.recipe!, editEntry.recipeServings ?? 1)
      : null;

    // Restaurant nutrition is computed from the whole selection map (each
    // dish x its own quantity), not a single scalar like the other two types.
    const restaurantDishes = isRestaurant ? editEntry.restaurantMeal!.dishes : [];
    const restaurantSelections: RestaurantDishSelection[] = [...editDishQuantities.entries()].map(
      ([dish, quantity]) => ({ dish, quantity }),
    );
    const selectedRestaurantDishes = restaurantDishes.filter(d => editDishQuantities.has(d._id));
    const restaurantQtyOf = (d: { _id: string }) => editDishQuantities.get(d._id) ?? 1;
    const restaurantKcal = isRestaurant
      ? getRestaurantMealKcal(editEntry.restaurantMeal!, restaurantSelections)
      : null;

    // Label, true (logged) value, unit, and — only for a confirmed recipe
    // with a real logged total — the recipe's own original assumed value,
    // rendered as "original → true log" so it's obvious the two can differ.
    const rows: [string, number | null | undefined, string, number | null | undefined][] = isRestaurant
      ? [
          ["Calories", restaurantKcal, "kcal", undefined],
          ["Protein",  selectedRestaurantDishes.reduce((s, d) => s + (d.nutrition?.protein ?? 0) * restaurantQtyOf(d), 0), "g", undefined],
          ["Carbs",    selectedRestaurantDishes.reduce((s, d) => s + (d.nutrition?.carbs ?? 0) * restaurantQtyOf(d), 0),   "g", undefined],
          ["Fats",     selectedRestaurantDishes.reduce((s, d) => s + (d.nutrition?.fats ?? 0) * restaurantQtyOf(d), 0),    "g", undefined],
          ["Fiber",    selectedRestaurantDishes.reduce((s, d) => s + (d.nutrition?.fiber ?? 0) * restaurantQtyOf(d), 0),   "g", undefined],
          ["Sodium",   selectedRestaurantDishes.reduce((s, d) => s + (d.nutrition?.sodium ?? 0) * restaurantQtyOf(d), 0),  "mg", undefined],
        ]
      : loggedNutrition
        ? [
            ["Calories", loggedNutrition.calories, "kcal", originalNutrition?.calories],
            ["Protein",  loggedNutrition.protein,  "g",    originalNutrition?.protein],
            ["Carbs",    loggedNutrition.carbs,    "g",    originalNutrition?.carbs],
            ["Fats",     loggedNutrition.fats,     "g",    originalNutrition?.fats],
            ["Fiber",    loggedNutrition.fiber,    "g",    originalNutrition?.fiber],
            ["Sodium",   loggedNutrition.sodium,   "mg",   originalNutrition?.sodium],
          ]
        : [
            ["Calories", n?.calories, "kcal", undefined],
            ["Protein",  n?.protein,  "g", undefined],
            ["Carbs",    n?.carbs,    "g", undefined],
            ["Fats",     n?.fats,     "g", undefined],
            ["Fiber",    n?.fiber,    "g", undefined],
            ["Sodium",   n?.sodium,   "mg", undefined],
          ];

    // A confirmed recipe entry's *displayed* nutrition actually comes from
    // real stockDeductions (computeConfirmedRecipeNutrition), not
    // recipeServings - so editing servings here wouldn't visibly change
    // anything, and pretending it would is misleading. Ingredients and
    // restaurant visits don't have that indirection (their stored
    // quantity/selections directly ARE the displayed nutrition), so they
    // stay editable either way - ingredients get a note that pantry stock
    // itself isn't retroactively adjusted; restaurant visits never touch
    // pantry stock at all, so no note is needed there.
    const recipeConfirmedLocked = !isIngredient && !isRestaurant && editEntry.status === "confirmed"
      && !!editEntry.stockDeductions?.length;

    const canSave = isRestaurant ? editDishQuantities.size > 0 : validQty;

    return (
      <View className="absolute inset-0">
        <Pressable className="absolute inset-0 bg-black/40" onPress={() => setEditEntry(null)} />
        <View
          className="absolute bottom-0 left-0 right-0 overflow-hidden rounded-t-3xl bg-white"
          style={{ maxHeight: windowHeight * 0.85 }}
        >
          <View className="items-center pt-3">
            <View className="h-1 w-10 rounded-full bg-slate-200" />
          </View>
          <View className="flex-row items-center border-b border-slate-100 px-5 pb-4 pt-3">
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
              <Ionicons name={icon} size={20} color="#2563EB" />
            </View>
            <Text className="ml-3 flex-1 text-lg font-bold text-slate-950" numberOfLines={2}>
              {title}
            </Text>
            <Pressable
              hitSlop={10}
              onPress={() => setEditEntry(null)}
              className="ml-2 h-8 w-8 items-center justify-center rounded-full active:bg-slate-100"
            >
              <Ionicons name="close" size={20} color="#64748B" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            {recipeConfirmedLocked ? (
              <View className="mb-5 rounded-2xl bg-slate-50 px-4 py-3">
                <Text className="text-sm text-slate-600">
                  This meal is confirmed — the nutrition below reflects exactly what was really used,
                  not the servings number below it. Unconfirm the entry first if you need to change
                  servings and have it actually affect the logged nutrition.
                </Text>
              </View>
            ) : null}

            {isRestaurant ? (
              <>
                <Text className="mb-1.5 text-sm font-semibold text-slate-700">What did you get?</Text>
                <View className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  {restaurantDishes.map((dish, i) => {
                    const qty = editDishQuantities.get(dish._id);
                    const checked = qty != null;
                    return (
                      <View
                        key={dish._id}
                        className={`px-4 py-3.5 ${i < restaurantDishes.length - 1 ? "border-b border-slate-100" : ""}`}
                      >
                        <Pressable
                          className="flex-row items-center justify-between active:opacity-70"
                          onPress={() => {
                            setEditDishQuantities(prev => {
                              const next = new Map(prev);
                              if (next.has(dish._id)) next.delete(dish._id);
                              else next.set(dish._id, 1);
                              return next;
                            });
                          }}
                        >
                          <View className="flex-1 flex-row items-center">
                            <Ionicons
                              name={checked ? "checkbox" : "square-outline"}
                              size={22}
                              color={checked ? "#2563EB" : "#94A3B8"}
                            />
                            <View className="ml-3 flex-1">
                              <Text className="font-semibold text-slate-900">{dish.name}</Text>
                              {dish.nutrition?.calories != null && (
                                <Text className="mt-0.5 text-xs text-slate-400">{dish.nutrition.calories} kcal each</Text>
                              )}
                            </View>
                          </View>
                        </Pressable>

                        {checked && (
                          <View className="mt-2 flex-row items-center justify-end">
                            <Text className="mr-2 text-xs font-medium text-slate-400">Quantity</Text>
                            <DishQuantityStepper
                              value={qty}
                              onChange={next =>
                                setEditDishQuantities(prev => new Map(prev).set(dish._id, next))
                              }
                              onRemove={() =>
                                setEditDishQuantities(prev => {
                                  const next = new Map(prev);
                                  next.delete(dish._id);
                                  return next;
                                })
                              }
                            />
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                <Text className="mb-1.5 text-sm font-semibold text-slate-700">
                  {isIngredient ? "Quantity eaten" : "Servings eaten"}
                </Text>
                {isIngredient ? (
                  <View className="mb-6 flex-row gap-2">
                    <TextInput
                      value={editQuantity}
                      onChangeText={setEditQuantity}
                      keyboardType="decimal-pad"
                      placeholder="1"
                      placeholderTextColor="#94A3B8"
                      className="h-14 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
                    />
                    <TextInput
                      value={editUnit}
                      onChangeText={setEditUnit}
                      placeholder="unit (g, cup, …)"
                      placeholderTextColor="#94A3B8"
                      className="h-14 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
                    />
                  </View>
                ) : (
                  <TextInput
                    value={editQuantity}
                    onChangeText={setEditQuantity}
                    keyboardType="decimal-pad"
                    placeholder="1"
                    placeholderTextColor="#94A3B8"
                    editable={!recipeConfirmedLocked}
                    className={`mb-6 h-14 rounded-2xl border border-slate-200 px-4 text-base text-slate-950 ${
                      recipeConfirmedLocked ? "bg-slate-100" : "bg-white"
                    }`}
                  />
                )}
              </>
            )}

            {/* Live nutrition preview for this entry — for a confirmed
                recipe with a real logged total, "original" is the recipe's
                own generic estimate at its logged servings, shown only
                when it actually differs from what was really used. */}
            <View className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {rows.map(([label, value, unit, original], i) => {
                const roundedValue = value != null ? Math.round(value * 10) / 10 : null;
                const roundedOriginal = original != null ? Math.round(original * 10) / 10 : null;
                const showComparison = roundedOriginal != null && roundedValue != null
                  && roundedOriginal !== roundedValue;
                return (
                  <View
                    key={label}
                    className={`flex-row items-center justify-between px-4 py-3 ${
                      i < rows.length - 1 ? "border-b border-slate-100" : ""
                    }`}
                  >
                    <Text className="text-base text-slate-600">{label}</Text>
                    <Text className="text-base font-semibold text-slate-900">
                      {showComparison
                        ? `${roundedOriginal} → ${roundedValue} ${unit}`
                        : roundedValue != null
                          ? `${roundedValue} ${unit}`
                          : "—"}
                    </Text>
                  </View>
                );
              })}
            </View>
            {loggedNutrition && (
              <Text className="-mt-4 mb-6 text-xs leading-4 text-slate-400">
                Original → true log: the recipe&apos;s own estimate vs. what you actually
                confirmed (real weights used, per-ingredient).
              </Text>
            )}

            {!recipeConfirmedLocked && isIngredient && editEntry.status === "confirmed" && (
              <Text className="mb-4 text-xs text-slate-400">
                Note: this updates the logged amount only — it won&apos;t adjust pantry stock, which was
                already deducted when this entry was confirmed.
              </Text>
            )}

            <Pressable
              disabled={editSaving || recipeConfirmedLocked || !canSave}
              className={`mb-3 items-center rounded-2xl py-4 ${
                editSaving || recipeConfirmedLocked || !canSave ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
              }`}
              onPress={() => void handleSaveEntryQuantity()}
            >
              <Text className="font-semibold text-white">{editSaving ? "Saving…" : "Save changes"}</Text>
            </Pressable>
            <Pressable
              className="items-center rounded-2xl border border-slate-200 py-4 active:bg-slate-50"
              onPress={handleViewFullItem}
            >
              <Text className="font-semibold text-slate-700">View full item</Text>
            </Pressable>
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
            {/* Daily / last-7-days / daily-average nutrition — swipe to switch */}
            <View className="mb-5">
              <ScrollView
                ref={nutritionPagerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={e => {
                  const page = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
                  setNutritionView(page >= 2 ? 2 : page === 1 ? 1 : 0);
                }}
                style={{ width: windowWidth - 32 }}
              >
                {nutritionPages.map((page, index) => (
                  <Pressable
                    key={page.title}
                    style={{ width: windowWidth - 32 }}
                    className="active:opacity-80"
                    onPress={() => setNutritionDetailPage(index)}
                  >
                    <NutritionSummaryCard
                      title={page.title}
                      subtitle={page.subtitle}
                      confirmed={page.confirmed}
                      planned={page.planned}
                      limits={page.limits}
                    />
                  </Pressable>
                ))}
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
                <View
                  className="h-1.5 w-1.5 rounded-full bg-slate-200"
                  style={nutritionView === 2 ? pageDotStyles.active : undefined}
                />
              </View>
            </View>

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
                  ) : lastEntryBySlot?.[slot.id] ? (
                    (() => {
                      const lastEntry = lastEntryBySlot[slot.id]!;
                      const name = entryDisplayName(lastEntry);
                      const when = daysAgoLabel(lastEntry.date, selectedDate);
                      return (
                        <ReanimatedSwipeable
                          friction={2}
                          leftThreshold={40}
                          renderLeftActions={() => (
                            <Pressable
                              className="mb-0 flex-1 items-center justify-center rounded-2xl bg-emerald-500 px-4 active:bg-emerald-600"
                              onPress={() => void handleQuickAddFromLastEntry(slot.id, lastEntry)}
                            >
                              <Ionicons name="repeat-outline" size={18} color="white" />
                              <Text className="mt-1 text-center text-xs font-semibold text-white">
                                Add &quot;{name}&quot;
                              </Text>
                            </Pressable>
                          )}
                        >
                          <Pressable
                            onPress={() => openAdd(slot.id)}
                            className="items-center rounded-2xl border border-dashed border-slate-200 py-5 active:bg-slate-50"
                          >
                            <Text className="px-6 text-center text-sm text-slate-400">
                              Swipe to add {slot.label.toLowerCase()} from {when}: &quot;{name}&quot;
                            </Text>
                          </Pressable>
                        </ReanimatedSwipeable>
                      );
                    })()
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
            {pendingIngredient || pendingRestaurantMeal ? (
              <Pressable
                onPress={() => {
                  setPendingIngredient(null);
                  setPendingRestaurantMeal(null);
                  setSelectedDishQuantities(new Map());
                  resetDishPickerDrafts();
                }}
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
          ) : pendingRestaurantMeal ? (
            /* ── Restaurant dish-selection step ── which dish(es) from this
               visit were actually eaten, so nutrition doesn't count the
               whole menu. Starts empty; nothing pre-checked. */
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled"
            >
              <View className="mb-5 flex-row items-center rounded-2xl border border-slate-200 bg-white p-4">
                <View className={`h-11 w-11 items-center justify-center rounded-full ${SLOT_MAP[addSlot].chipBg}`}>
                  <Ionicons name="restaurant-outline" size={18} color={SLOT_MAP[addSlot].iconColor} />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="font-semibold text-slate-900">{pendingRestaurantMeal.restaurantName}</Text>
                  <Text className="mt-0.5 text-xs text-slate-400">Select what you actually ate</Text>
                </View>
              </View>

              <Text className="mb-1.5 text-sm font-semibold text-slate-700">Dishes</Text>
              <View className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {pendingRestaurantMeal.dishes.map((dish, i) => {
                  const qty = selectedDishQuantities.get(dish._id);
                  const checked = qty != null;
                  return (
                    <View
                      key={dish._id}
                      className={`px-4 py-3.5 ${
                        i < pendingRestaurantMeal.dishes.length - 1 ? "border-b border-slate-100" : ""
                      }`}
                    >
                      <Pressable
                        className="flex-row items-center justify-between active:opacity-70"
                        onPress={() => {
                          setSelectedDishQuantities(prev => {
                            const next = new Map(prev);
                            if (next.has(dish._id)) next.delete(dish._id);
                            else next.set(dish._id, 1);
                            return next;
                          });
                        }}
                      >
                        <View className="flex-1 flex-row items-center">
                          <Ionicons
                            name={checked ? "checkbox" : "square-outline"}
                            size={22}
                            color={checked ? "#2563EB" : "#94A3B8"}
                          />
                          <View className="ml-3 flex-1">
                            <Text className="font-semibold text-slate-900">{dish.name}</Text>
                            {dish.nutrition?.calories != null && (
                              <Text className="mt-0.5 text-xs text-slate-400">{dish.nutrition.calories} kcal each</Text>
                            )}
                          </View>
                        </View>
                        {dish.price != null && (
                          <Text className="text-sm font-semibold text-slate-500">${dish.price.toFixed(2)}</Text>
                        )}
                      </Pressable>

                      {checked && (
                        <View className="mt-2 flex-row items-center justify-end">
                          <Text className="mr-2 text-xs font-medium text-slate-400">Quantity</Text>
                          <DishQuantityStepper
                            value={qty}
                            onChange={next =>
                              setSelectedDishQuantities(prev => new Map(prev).set(dish._id, next))
                            }
                            onRemove={() =>
                              setSelectedDishQuantities(prev => {
                                const next = new Map(prev);
                                next.delete(dish._id);
                                return next;
                              })
                            }
                          />
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* Staged locally — not yet on this restaurant's real menu.
                    Saved to the restaurant record only once the visit is
                    actually confirmed below. */}
                {stagedNewDishes.map((dish, i) => {
                  const qty = selectedDishQuantities.get(dish.key) ?? 1;
                  return (
                    <View
                      key={dish.key}
                      className={`bg-blue-50/40 px-4 py-3.5 ${
                        i < stagedNewDishes.length - 1 || pendingRestaurantMeal.dishes.length > 0
                          ? "border-b border-slate-100"
                          : ""
                      }`}
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1 flex-row items-center">
                          <Ionicons name="checkbox" size={22} color="#2563EB" />
                          <View className="ml-3 flex-1">
                            <View className="flex-row items-center">
                              <Text className="font-semibold text-slate-900">{dish.name}</Text>
                              <Text className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-blue-600">
                                New
                              </Text>
                            </View>
                            {dish.nutrition.calories != null && (
                              <Text className="mt-0.5 text-xs text-slate-400">{dish.nutrition.calories} kcal each</Text>
                            )}
                          </View>
                        </View>
                        {!!dish.price.trim() && (
                          <Text className="text-sm font-semibold text-slate-500">
                            ${Number(dish.price).toFixed(2)}
                          </Text>
                        )}
                        <Pressable hitSlop={8} className="ml-2" onPress={() => removeStagedDish(dish.key)}>
                          <Ionicons name="close-circle-outline" size={20} color="#94A3B8" />
                        </Pressable>
                      </View>

                      <View className="mt-2 flex-row items-center justify-end">
                        <Text className="mr-2 text-xs font-medium text-slate-400">Quantity</Text>
                        <DishQuantityStepper
                          value={qty}
                          onChange={next =>
                            setSelectedDishQuantities(prev => new Map(prev).set(dish.key, next))
                          }
                        />
                      </View>
                    </View>
                  );
                })}
              </View>

              {showAddDishForm ? (
                <View className="mb-6 rounded-2xl border border-dashed border-slate-300 bg-white p-4">
                  <View className="mb-2 flex-row items-center justify-between">
                    <Text className="flex-1 text-xs font-semibold text-slate-500">
                      Not on the menu yet — add what you ordered
                    </Text>
                    <Pressable hitSlop={8} onPress={() => setShowDishScanModal(true)}>
                      <Ionicons name="camera-outline" size={20} color="#2563EB" />
                    </Pressable>
                  </View>
                  <FormInput value={newDishName} placeholder="Dish name" onChangeText={setNewDishName} />
                  <View className="mt-2 flex-row gap-3">
                    <View className="flex-1">
                      <FormInput
                        value={newDishCalories}
                        placeholder="Calories (optional)"
                        keyboardType="decimal-pad"
                        onChangeText={(text) => {
                          setNewDishCalories(text);
                          setNewDishNutrition(prev => ({
                            ...prev,
                            calories: text.trim() ? Number(text) : undefined,
                          }));
                        }}
                      />
                    </View>
                    <View className="flex-1">
                      <PriceInput value={newDishPrice} onChangeText={setNewDishPrice} />
                    </View>
                  </View>
                  {(newDishNutrition.protein != null
                    || newDishNutrition.carbs != null
                    || newDishNutrition.fats != null) && (
                    <Text className="mt-2 text-xs text-slate-400">
                      From photo estimate: {newDishNutrition.protein ?? "—"}g protein, {newDishNutrition.carbs ?? "—"}g carbs, {newDishNutrition.fats ?? "—"}g fat
                    </Text>
                  )}
                  <View className="mt-3 flex-row gap-3">
                    <Pressable
                      className="flex-1 items-center rounded-xl bg-slate-100 py-2.5 active:bg-slate-200"
                      onPress={() => {
                        setShowAddDishForm(false);
                        setNewDishName("");
                        setNewDishPrice("");
                        setNewDishCalories("");
                        setNewDishNutrition({});
                      }}
                    >
                      <Text className="text-sm font-semibold text-slate-600">Cancel</Text>
                    </Pressable>
                    <Pressable
                      disabled={!newDishName.trim()}
                      className={`flex-1 items-center rounded-xl py-2.5 ${
                        newDishName.trim() ? "bg-blue-600 active:bg-blue-700" : "bg-blue-300"
                      }`}
                      onPress={addStagedDish}
                    >
                      <Text className="text-sm font-semibold text-white">Add dish</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  className="mb-6 flex-row items-center justify-center rounded-2xl border border-dashed border-slate-300 py-3.5 active:bg-slate-100"
                  onPress={() => setShowAddDishForm(true)}
                >
                  <Ionicons name="add" size={18} color="#2563EB" />
                  <Text className="ml-2 font-semibold text-blue-700">Add a dish not on this list</Text>
                </Pressable>
              )}

              {/* Live nutrition preview — sum of selected dishes (existing +
                  staged), each scaled by quantity. Computed directly rather
                  than via getRestaurantMealKcal since a staged dish isn't
                  part of pendingRestaurantMeal.dishes yet. */}
              {(() => {
                const qtyOf = (key: string) => selectedDishQuantities.get(key) ?? 1;
                const selectedReal = pendingRestaurantMeal.dishes.filter(d => selectedDishQuantities.has(d._id));
                const selectedStaged = stagedNewDishes.filter(d => selectedDishQuantities.has(d.key));
                // A staged dish can carry a full breakdown (from a photo
                // estimate) or just calories (typed manually) - sum
                // whatever each one actually has, same as a real dish.
                const sumField = (field: keyof DishNutrition) =>
                  selectedReal.reduce((s, d) => s + (d.nutrition?.[field] ?? 0) * qtyOf(d._id), 0)
                  + selectedStaged.reduce((s, d) => s + (d.nutrition[field] ?? 0) * qtyOf(d.key), 0);
                const hasAnyCalorieData = selectedReal.some(d => d.nutrition?.calories != null)
                  || selectedStaged.some(d => d.nutrition.calories != null);
                const kcal = hasAnyCalorieData ? Math.round(sumField("calories")) : null;
                const rows: [string, number | null | undefined, string][] = [
                  ["Calories", kcal, "kcal"],
                  ["Protein",  sumField("protein"), "g"],
                  ["Carbs",    sumField("carbs"),   "g"],
                  ["Fats",     sumField("fats"),    "g"],
                  ["Fiber",    sumField("fiber"),   "g"],
                  ["Sodium",   sumField("sodium"),  "mg"],
                ];
                const selected = [...selectedReal, ...selectedStaged];
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
                          {selected.length && value != null ? `${Math.round(value * 10) / 10} ${unit}` : "—"}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })()}

              <Pressable
                disabled={saving || selectedDishQuantities.size === 0}
                className={`items-center rounded-2xl py-4 ${
                  saving || selectedDishQuantities.size === 0 ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
                }`}
                onPress={() => void handleConfirmRestaurantVisit()}
              >
                <Text className="font-semibold text-white">
                  {saving ? "Adding…" : selectedDishQuantities.size === 0 ? "Select at least one dish" : "Add to plan"}
                </Text>
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

              {/* Meals / Recipes / Ingredients / Eating Out toggle */}
              <View className="border-b border-slate-100 bg-white px-4 pb-3">
                <View className="flex-row rounded-xl bg-slate-100 p-1">
                  {(
                    [
                      ["meal", "Meals"],
                      ["recipe", "Recipes"],
                      ["ingredient", "Ingredients"],
                      ["restaurant", "Eating Out"],
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
                    value={
                      addMode === "meal" ? mealSearch
                      : addMode === "recipe" ? recipeSearch
                      : addMode === "ingredient" ? ingredientSearch
                      : restaurantSearch
                    }
                    onChangeText={
                      addMode === "meal" ? setMealSearch
                      : addMode === "recipe" ? setRecipeSearch
                      : addMode === "ingredient" ? setIngredientSearch
                      : setRestaurantSearch
                    }
                    placeholder={
                      addMode === "meal" ? "Search meals…"
                      : addMode === "recipe" ? "Search recipes…"
                      : addMode === "ingredient" ? "Search ingredients…"
                      : "Search restaurants or dishes…"
                    }
                    placeholderTextColor="#94A3B8"
                    className="ml-3 flex-1 text-base text-slate-900"
                  />
                  {(
                    addMode === "meal" ? mealSearch
                    : addMode === "recipe" ? recipeSearch
                    : addMode === "ingredient" ? ingredientSearch
                    : restaurantSearch
                  ).length > 0 && (
                    <Pressable
                      onPress={() => {
                        if (addMode === "meal") setMealSearch("");
                        else if (addMode === "recipe") setRecipeSearch("");
                        else if (addMode === "ingredient") setIngredientSearch("");
                        else setRestaurantSearch("");
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
                    const isPrep = producingRecipeIds.has(recipe._id);
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
                            <View className="flex-row items-center">
                              <Text className="font-semibold text-slate-900">{recipe.name}</Text>
                              {isPrep && (
                                <View className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5">
                                  <Text className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                    Prep
                                  </Text>
                                </View>
                              )}
                            </View>
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

              {addMode === "restaurant" && (
                <FlatList
                  data={filteredRestaurantMeals}
                  keyExtractor={r => r._id}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 }}
                  ListHeaderComponent={
                    <>
                      {filteredRestaurantMeals.length > 0 && (
                        <Text className="mb-2 px-1 text-xs font-medium text-slate-400">
                          Been here before? Tap it below — you&apos;ll pick just what you had.
                        </Text>
                      )}
                      <Pressable
                        className="mb-2 flex-row items-center justify-center rounded-2xl border border-dashed border-slate-300 py-3.5 active:bg-slate-100"
                        onPress={() => {
                          setShowAdd(false);
                          router.push({ pathname: "/restaurant-meals/add", params: { from: "planner" } });
                        }}
                      >
                        <Ionicons name="add" size={18} color="#2563EB" />
                        <Text className="ml-2 font-semibold text-blue-700">
                          {restaurantSearch.trim() ? `Add "${restaurantSearch.trim()}" as a new restaurant` : "Add a new restaurant"}
                        </Text>
                      </Pressable>
                    </>
                  }
                  renderItem={({ item: restaurantMeal }) => {
                    const kcal = getRestaurantMealKcal(restaurantMeal);
                    const slotCfg = SLOT_MAP[addSlot];
                    return (
                      <Pressable
                        className="mb-2 flex-row items-center rounded-2xl border border-slate-200 bg-white p-4 active:bg-slate-50"
                        disabled={saving}
                        onPress={() => {
                          setSelectedDishQuantities(new Map());
                          resetDishPickerDrafts();
                          setPendingRestaurantMeal(restaurantMeal);
                        }}
                      >
                        <View className={`h-11 w-11 items-center justify-center rounded-full ${slotCfg.chipBg}`}>
                          <Ionicons name="restaurant-outline" size={18} color={slotCfg.iconColor} />
                        </View>
                        <View className="ml-3 flex-1">
                          <Text className="font-semibold text-slate-900">{restaurantMeal.restaurantName}</Text>
                          <Text className="mt-0.5 text-sm text-slate-400" numberOfLines={1}>
                            {restaurantMeal.dishes.map(d => d.name).join(", ") || "No dishes yet"}
                          </Text>
                        </View>
                        {kcal != null && (
                          <Text className="mr-2 text-sm font-semibold text-slate-500">{kcal} kcal</Text>
                        )}
                        <Pressable
                          hitSlop={8}
                          onPress={() => openRestaurantInfo(restaurantMeal)}
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
                      <Text className="mt-4 text-lg font-bold text-slate-900">No restaurant meals yet</Text>
                      <Text className="mt-2 text-center text-slate-500">
                        {restaurantSearch ? "Try a different search." : "Log a visit above to see it here next time."}
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
      {renderEditEntryOverlay()}

      <NutritionDetailOverlay
        visible={nutritionDetailPage != null}
        pages={nutritionPages}
        initialPage={nutritionDetailPage ?? 0}
        settings={appSettings}
        onClose={(page) => {
          setNutritionDetailPage(null);
          // Leave the planner's cards on the view the overlay ended on.
          setNutritionView(page >= 2 ? 2 : page === 1 ? 1 : 0);
          nutritionPagerRef.current?.scrollTo({ x: page * (windowWidth - 32), animated: false });
        }}
      />

      <RateAndConfirmModal
        visible={!!rateConfirmEntry}
        itemName={rateConfirmEntry?.recipe?.name ?? rateConfirmEntry?.ingredient?.name ?? ""}
        saving={ratingSaving}
        // No "back out" option once this was auto-prompted on top of an
        // already-decided confirm (adding directly as confirmed) — dismissing
        // any way then still confirms, via onSkip, same as the explicit
        // button. The pre-existing swipe-to-rate-and-confirm action (nothing
        // stashed in pendingRatingConfirm) keeps its real Cancel.
        allowCancel={!pendingRatingConfirm}
        onCancel={() => {
          setRateConfirmEntry(null);
          setPendingRatingConfirm(null);
        }}
        onSkip={handleSkipRating}
        onNeverAsk={pendingRatingConfirm ? handleNeverAskRating : undefined}
        onConfirm={(value) => void handleSubmitRateAndConfirm(value)}
      />

      <ResolveIngredientSourcesModal
        visible={showResolveModal}
        requirements={ambiguousRequirements}
        saving={resolvingSaving}
        onCancel={() => {
          setShowResolveModal(false);
          setPendingConfirmEntry(null);
          setPendingRequirements([]);
          setPendingRateFirst(false);
        }}
        onConfirm={(selections, manualPieceEntries, amountOverrides) =>
          void handleResolvedConfirm(selections, manualPieceEntries, amountOverrides)
        }
      />

      <PhotoCaptureModal
        visible={showDishScanModal}
        onClose={() => setShowDishScanModal(false)}
        onCaptured={handleDishPhotoCaptured}
        subject="dish photo"
        instructions="Fit just this one dish in frame."
      />

      <Modal visible={estimatingDish} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/50">
          <View className="items-center rounded-3xl bg-white px-8 py-6">
            <ActivityIndicator size="large" />
            <Text className="mt-3 text-base font-semibold text-slate-700">Estimating nutrition...</Text>
          </View>
        </View>
      </Modal>
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
