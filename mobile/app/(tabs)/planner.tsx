import { Ionicons } from "@expo/vector-icons";
import { usePaneDimensions } from "@/src/utils/pane";
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
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";

import { getMeals, type Meal } from "@/src/services/mealApi";
import { getRecipeById, getRecipes, type Recipe } from "@/src/services/recipeApi";
import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
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
import { CreatableStringDropdown, FormInput, PriceInput } from "@/src/components/forms";
import { PhotoCaptureModal } from "@/src/components/PhotoCaptureModal";
import { takePendingNewRestaurant } from "@/src/utils/pendingNewRestaurantStore";
import type { SelectOption } from "@/src/services/optionsApi";
import type { PantryItem } from "@/src/types/pantry";
import {
  createMealPlanEntry,
  deleteMealPlanEntry,
  getLastEntriesBeforeDate,
  getLastUsedMap,
  getMealPlanForDate,
  moveMealPlanEntry,
  setMealPlanEntryPieces,
  unconfirmMealPlanEntry,
  updateMealPlanEntryQuantity,
  type CreateMealPlanEntryInput,
  type LastEntryBySlot,
  type LastUsedMap,
  type MealPlanEntry,
  type MealPlanEntryStatus,
  type MealSlot,
  type RestaurantDishSelection,
} from "@/src/services/mealPlanApi";
import { shortDateLabel } from "@/src/components/calendar/calendarUtils";
import { sortAlphabetically, sortByLastUsed } from "@/src/utils/lastUsedSort";
import { referenceId } from "@/src/utils/pantryDefaults";
import { loadSettings, type AppSettings } from "@/src/services/settingsService";
import { DishQuantityStepper } from "@/src/components/planner/DishQuantityStepper";
import { useEntryConfirm } from "@/src/components/planner/useEntryConfirm";
import { MealSuggestion, SuggestionsToggle, useSuggestionsToggle } from "@/src/components/planner/MealSuggestion";
import { RecipeThumb } from "@/src/components/recipes/RecipeThumb";
import { pieceGroups, usePlanNeeds, withPiece, type PieceChoice } from "@/src/components/planner/usePlanNeeds";
import { useSuggestionWatch } from "@/src/components/planner/useSuggestionWatch";
import { WebWeekPlanScreen } from "@/src/components/planner/web/WebWeekPlanScreen";
import { addToMenu, menuLeft, menuName } from "@/src/services/menuApi";
import { useWideWeb } from "@/src/utils/useWideWeb";
import { type NutritionLimits } from "@/src/components/health/NutritionSummaryCard";
import { NutritionRings } from "@/src/components/planner/NutritionRings";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitPage, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import { StatusBar } from "expo-status-bar";
import { NutritionDetailOverlay, type NutritionDetailPage } from "@/src/components/planner/NutritionDetailOverlay";
import {
  computeConfirmedRecipeNutrition,
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
import { buildIngredientRequirements } from "@/src/utils/pantryDeduction";
import { getIngredientConversions, getRelatedUnits } from "@/src/utils/unitConversion";

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

export default function PlannerScreen() {
  // A desktop browser gets the week laid out; adding food there still opens
  // this screen's own add sheet (`add`), so that case stays on the phone
  // planner below.
  const wide = useWideWeb();
  const { add } = useLocalSearchParams<{ add?: string }>();
  return wide && !add ? <WebWeekPlanScreen /> : <PhonePlannerScreen />;
}

function PhonePlannerScreen() {
  const router = useRouter();
  // The day itself in Orbit's look, light or dark (`oc`: its colours). The
  // sheets over it — adding, an entry's details, moving one — keep the
  // older look for now.
  const { colors: oc, dark } = useOrbitTheme();
  // The add sheet in a desktop browser (it opens from the week plan there).
  const wideAdd = useWideWeb();
  const addGrid = wideAdd ? { numColumns: 3, columnWrapperStyle: { gap: 12 } } : {};
  // (Each card a third of its row, the last row's too.)
  const addCell: StyleProp<ViewStyle> = wideAdd ? { flexBasis: 0, flexGrow: 1, maxWidth: "32.6%", minWidth: 0 } : undefined;
  const dates = useMemo(buildDates, []);
  const today = todayStr();

  const [selectedDate, setSelectedDate] = useState(today);
  // (For callbacks that fire later than the render they were made in.)
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;
  // Opened from a meal in the calendar: on that day, and optionally straight
  // into adding food to a slot (`add`). `t` just makes a repeat request
  // count as new.
  const {
    date: dateParam,
    add: addParam,
    from: fromParam,
    t: requestParam,
  } = useLocalSearchParams<{ date?: string; add?: string; from?: string; t?: string }>();
  const fromCalendar = fromParam === "calendar";
  // The add sheet now showing was opened by the calendar's "Add food":
  // cancelling it goes back there, not to the planner underneath.
  const addForCalendar = useRef(false);
  // Where an add that was started from elsewhere ends up. The calendar is a
  // page back. The desktop week plan is this same route without `add`, and
  // going "back" from a tab would leave the Kitchen altogether, so it is
  // re-opened on the week that was being planned.
  const leaveAddFlow = () => {
    if (fromParam === "web") router.replace({ pathname: "/planner", params: { date: selectedDateRef.current } });
    else router.back();
  };

  // An entry the calendar's "Add food" added as already eaten: go back to
  // the calendar once its confirm (pantry, rating) has finished.
  const returnAfterConfirm = useRef<string | null>(null);
  useEffect(() => {
    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return;
    setSelectedDate(dateParam);
    if (addParam && addParam in SLOT_MAP) {
      openAdd(addParam as MealSlot);
      addForCalendar.current = true;
      // A day still to come is a plan, not something already eaten.
      if (dateParam > today) setAddStatus("planned");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateParam, addParam, requestParam]);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // The day `entries` was last loaded for (null after a failed load).
  const [entriesDate, setEntriesDate] = useState<string | null>(null);
  // The kitchen's tasks (thaw this, there's a shopping trip today), worked
  // out from the plan, the pantry and the calendar.
  const kitchenPlan = usePlanNeeds();
  // On the menu, with servings still to put on a day.
  const menuToPlace = kitchenPlan.menu.filter((m) => m.state === "menu" && menuLeft(m) > 0 && (m.recipe || m.meal));
  // Whether the suggestion cards are on.
  const [showSuggestions, toggleSuggestions] = useSuggestionsToggle();
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
  const { width: windowWidth, height: windowHeight } = usePaneDimensions();

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
  // A recipe waiting on which piece it's to be made with.
  // Whether the meal sheet shows every piece to choose from, and which
  // pieces' options are unfolded (in the sheet and the add step).
  const [showPieces, setShowPieces] = useState(false);
  const [openPieces, setOpenPieces] = useState<string[]>([]);
  const togglePieceGroup = (group: string) => setOpenPieces((prev) => (prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group]));
  // A piece's heading, folding its options to what it's set to; "Not
  // chosen" while it's the planner's to choose.
  const pieceHeading = (group: string, expanded: boolean, now: string | undefined, chosen: boolean) => (
    <Pressable onPress={() => togglePieceGroup(group)} className="mb-1 flex-row items-center py-1 active:opacity-60">
      <Ionicons name={expanded ? "chevron-down" : "chevron-forward"} size={14} color="#94A3B8" />
      <View className="ml-1.5 flex-1">
        <Text className="text-xs font-bold uppercase tracking-wide text-slate-400">{group}</Text>
        {!expanded && !!now && <Text className="text-sm text-slate-700" numberOfLines={1}>{now}</Text>}
      </View>
      {!chosen && (
        <View className="rounded-full bg-amber-100 px-2 py-0.5">
          <Text className="text-[11px] font-bold text-amber-700">Not chosen</Text>
        </View>
      )}
    </Pressable>
  );
  const [pendingPieces, setPendingPieces] = useState<{ recipe: Recipe; servings: number; options: PieceChoice[]; picked: string[]; menuItem?: string } | null>(null);
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
  // A planned meal being moved to another day or meal (or back onto the
  // menu), and where to.
  const [moving, setMoving] = useState<{ entry: MealPlanEntry; date: string; slot: MealSlot } | null>(null);
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

  // Recipes, ingredients and the pantry have all loaded at least once —
  // what marking an entry as eaten works from.
  const [kitchenReady, setKitchenReady] = useState(false);
  const kitchenRetry = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Marking an entry as eaten — shared with the calendar's meal page.
  const {
    confirm: handleConfirmEntry,
    openRateAndConfirm: handleOpenRateAndConfirm,
    modals: confirmModals,
  } = useEntryConfirm({
    allRecipes,
    allIngredients,
    pantryItems,
    settings: appSettings,
    ready: kitchenReady && !!appSettings,
    onStart: entry => swipeableRefs.get(entry._id)?.current?.close(),
    sized: kitchenPlan.sized,
    onConfirmed: updated => {
      setEntries(prev => prev.map(e => (e._id === updated._id ? updated : e)));
      if (returnAfterConfirm.current === updated._id) {
        returnAfterConfirm.current = null;
        leaveAddFlow();
      }
    },
  });

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
      // If any of these fails (the server can be slow to wake), keep trying:
      // confirming an entry waits on all three.
      const loadKitchen = () =>
        Promise.all([
          getRecipes().then(setAllRecipes),
          getIngredients().then(setAllIngredients),
          getPantryItems().then(setPantryItems),
        ]).then(
          () => setKitchenReady(true),
          () => {
            kitchenRetry.current = setTimeout(loadKitchen, 3000);
          },
        );
      void loadKitchen();
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
      return () => {
        if (kitchenRetry.current) clearTimeout(kitchenRetry.current);
      };
    }, []),
  );

  // Load plan for the selected date
  const loadEntries = useCallback(() => {
    setIsLoading(true);
    getMealPlanForDate(selectedDate)
      .then((loaded) => {
        setEntries(loaded);
        setEntriesDate(selectedDate);
      })
      .catch(() => {
        setEntries([]);
        setEntriesDate(null);
      })
      .finally(() => setIsLoading(false));
  }, [selectedDate]);

  // What would be suggested for this day's empty meals, worked out unseen,
  // so that what's logged into them is recorded against it — only once the
  // day's plan has really loaded.
  const suggested = useSuggestionWatch(selectedDate, entriesDate === selectedDate && !isLoading ? entries : null, showSuggestions);

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
    // (Its defaults are local, so this doesn't fail in practice.)
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
    // (What's planned counts at the piece in the pantry it would get.)
    () => computeDayNutrition(kitchenPlan.sized(entries.filter(e => e.status === "planned")), appSettings?.unitConversions ?? []),
    [entries, appSettings, kitchenPlan],
  );
  const last7ConfirmedNutrition = useMemo(
    () => computeDayNutrition(weekEntries.flat().filter(e => e.status === "confirmed"), appSettings?.unitConversions ?? []),
    [weekEntries, appSettings],
  );
  const last7PlannedNutrition = useMemo(
    () => computeDayNutrition(kitchenPlan.sized(weekEntries.flat().filter(e => e.status === "planned")), appSettings?.unitConversions ?? []),
    [weekEntries, appSettings, kitchenPlan],
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

  // The three nutrition cards (the day / its 7-day daily average / the 7-day
  // total) — shared by the swipeable cards and the tap-to-expand overlay.
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
        title: "Daily average",
        subtitle: "Last 7 days",
        confirmed: avgConfirmedNutrition,
        planned: avgPlannedNutrition,
        limits: dailyLimits(1),
        goalScale: 1,
      },
      {
        title: "Last 7 days",
        subtitle: weekRangeLabel(last7Dates),
        confirmed: last7ConfirmedNutrition,
        planned: last7PlannedNutrition,
        limits: dailyLimits(7),
        goalScale: 7,
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
    addForCalendar.current = false;
    setAddSlot(slot);
    setAddStatus("confirmed");
    setAddMode("meal");
    setMealSearch("");
    setRecipeSearch("");
    setIngredientSearch("");
    setRestaurantSearch("");
    setPendingIngredient(null);
    setPendingRestaurantMeal(null);
    setPendingPieces(null);
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
    // Added from the calendar's "Add food": that's where to end up — at
    // once for a plan, or after the confirm steps for something eaten.
    if (addForCalendar.current) {
      addForCalendar.current = false;
      if (wantsConfirmed) returnAfterConfirm.current = entry._id;
      else setTimeout(() => leaveAddFlow(), 0);
    }
    // rateFirst: true — adding something already-confirmed is exactly the
    // moment a rating is easiest to forget (there's no separate swipe
    // gesture prompting for it), so ask here, after any piece-size
    // resolution and before the pantry actually gets touched. Skippable —
    // see RateAndConfirmModal's onSkip.
    if (wantsConfirmed) handleConfirmEntry(entry, true);
    return entry;
  }

  // (`menuItem`: put on the day from the menu — see services/menuApi.ts.)
  async function handleAddEntry(meal: Meal, menuItem?: string) {
    if (saving) return;
    try {
      setSaving(true);
      await createEntry({ date: selectedDate, slot: addSlot, status: addStatus, meal: meal._id, ...(menuItem ? { menuItem } : {}) });
      if (menuItem) kitchenPlan.reload();
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

  // A recipe made with one of several pieces (a bag from a particular
  // steak), planned ahead: which one is asked first — what the meal comes
  // to with each, or the planner's choice. (`pieces` is the answer; eaten
  // now, the piece is asked for as it's logged.)
  async function handleAddRecipeEntry(recipe: Recipe, servings: number, pieces?: string[], menuItem?: string) {
    if (saving) return;
    if (!pieces && addStatus === "planned") {
      const options = kitchenPlan.pieceChoices({ _id: "", date: selectedDate, slot: addSlot, status: "planned", recipe, recipeServings: servings });
      if (pieceGroups(options).some((g) => g.choices.length > 1)) {
        setOpenPieces([]);
        setPendingPieces({ recipe, servings, options, picked: [], menuItem });
        return;
      }
    }
    try {
      setSaving(true);
      await createEntry({
        date: selectedDate,
        slot: addSlot,
        status: addStatus,
        recipe: recipe._id,
        recipeServings: servings,
        ...(pieces?.length ? { pieces } : {}),
        ...(menuItem ? { menuItem } : {}),
      });
      setPendingPieces(null);
      kitchenPlan.reload();
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

  async function handleUnconfirmEntry(entry: MealPlanEntry) {
    swipeableRefs.get(entry._id)?.current?.close();
    try {
      const updated = await unconfirmMealPlanEntry(entry._id);
      setEntries(prev => prev.map(e => (e._id === entry._id ? updated : e)));
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not unconfirm.");
    }
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
        style={{ width: CELL_WIDTH, marginRight: CELL_GAP, alignItems: "center" }}
        accessibilityLabel={friendlyDayLabel(dateStr)}
        accessibilityState={{ selected: isSelected }}
      >
        <Text style={{ marginBottom: 5, fontSize: 11, fontWeight: "600", color: isSelected ? oc.text : oc.faint }}>
          {DAY_ABBREVS[d.getDay()]}
        </Text>
        {/* The chosen day in ink; today, if it isn't chosen, ringed like
            the home screen's chosen section. */}
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isSelected ? oc.ink : "transparent",
            borderWidth: !isSelected && isThisToday ? 2 : 0,
            borderColor: oc.selectedRing,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: isSelected ? oc.onInk : dateStr < today ? oc.muted : oc.text }}>
            {d.getDate()}
          </Text>
        </View>
        <View style={{ marginTop: 5, width: 5, height: 5, borderRadius: 2.5, backgroundColor: isSelected && entries.length > 0 ? oc.ink : "transparent" }} />
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
    setShowPieces(false);
    setOpenPieces([]);
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

  // The units an ingredient can be measured in: its own, those it converts
  // to (grams ↔ ounces…), and any it has a conversion for (a cup of it).
  const unitChoices = (ingredient: Ingredient) => {
    const own = ingredient.defaultPortionUnit ?? "";
    const related = getRelatedUnits(own, getIngredientConversions(ingredient, appSettings?.unitConversions ?? []));
    return related.length ? related : own ? [own] : [];
  };

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
      // deducted once confirmed; until then the recipe's snapshot, at the
      // size of the pantry piece it would get.
      const confirmed = entry.status === "confirmed"
        ? computeConfirmedRecipeNutrition(entry, appSettings?.unitConversions ?? [])
        : null;
      const piece = confirmed ? undefined : kitchenPlan.sized([entry])[0].sizedTo;
      const asWritten = getRecipeKcal(entry.recipe, servings);
      kcal = confirmed ? Math.round(confirmed.calories) : asWritten != null && piece ? Math.max(0, Math.round(asWritten + piece.shift.calories)) : asWritten;
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
          <View className="mb-2 flex-row gap-2">
            <Pressable
              className="w-20 items-center justify-center rounded-2xl bg-red-500 active:bg-red-600"
              style={{ borderRadius: 16 }}
              onPress={() => handleDeleteEntry(entry._id)}
            >
              <Ionicons name="trash-outline" size={20} color="white" />
            </Pressable>
            {/* (Still to come: to another day or meal, or back on the menu.) */}
            {entry.status === "planned" && (
              <Pressable
                className="w-20 items-center justify-center rounded-2xl bg-violet-600 active:opacity-80"
                onPress={() => {
                  swipeableRefs.get(entry._id)?.current?.close();
                  setMoving({ entry, date: entry.date, slot: entry.slot });
                }}
              >
                <Ionicons name="swap-horizontal-outline" size={20} color="white" />
                <Text className="mt-1 text-[10px] font-semibold text-white">Move</Text>
              </Pressable>
            )}
          </View>
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
          // (Planned, not eaten yet: an outline, like a section still to come.)
          style={entry.status === "planned" ? { backgroundColor: "transparent", borderColor: oc.orbit, borderStyle: "dashed", borderRadius: 16 } : { backgroundColor: oc.surface, borderColor: oc.border, borderRadius: 16 }}
          onPress={() => handleOpenEntry(entry)}
        >
          {entry.status === "planned" && (
            <Ionicons name="time-outline" size={16} color={oc.faint} style={{ marginRight: 8 }} />
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
            <Text className="font-semibold text-slate-900" numberOfLines={1} style={{ color: entry.status === "planned" ? oc.icon : oc.text }}>
              {title}
              {/* Filled in by one of your usual meals. */}
              {entry.usual ? "  " : ""}
              {entry.usual && <Ionicons name="repeat" size={13} color={oc.muted} />}
            </Text>
            <Text className="mt-0.5 text-xs text-slate-400" style={{ color: oc.faint }}>
              {subtitle}{entry.status === "planned" ? " · Planned" : ""}
            </Text>
            {entry.status === "planned" && (availability === "yellow" || availability === "red") && (
              <Pressable
                className="mt-1 flex-row items-center self-start"
                hitSlop={6}
                onPress={() => void handleAddMissingToGroceryList(entry)}
              >
                <Ionicons name="cart-outline" size={12} color={oc.accent} />
                <Text className="ml-1 text-xs font-medium text-blue-600" style={{ color: oc.accent }}>Add missing to grocery list</Text>
              </Pressable>
            )}
          </View>
          {kcal != null && (
            <Text className="text-sm font-semibold text-slate-500" style={{ color: oc.muted }}>{kcal} kcal</Text>
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

  // Keeps a pantry piece for a planned meal (or, with none, lets it be
  // chosen again).
  async function choosePiece(entry: MealPlanEntry, pieces: string[]) {
    try {
      await setMealPlanEntryPieces(entry._id, pieces);
      setEditEntry({ ...entry, pieces });
      kitchenPlan.reload();
    } catch (error) {
      Alert.alert("Couldn't change that", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  // A planned meal to the day and meal picked, or back onto the menu (as
  // dragging it does on the desktop week plan).
  async function handleMove(toMenu: boolean) {
    if (!moving || saving) return;
    const { entry, date, slot } = moving;
    try {
      setSaving(true);
      if (toMenu) {
        await addToMenu(entry.recipe ? { recipe: entry.recipe._id } : { meal: entry.meal!._id });
        await deleteMealPlanEntry(entry._id);
        setEntries(prev => prev.filter(e => e._id !== entry._id));
      } else if (date !== entry.date || slot !== entry.slot) {
        const moved = await moveMealPlanEntry(entry._id, date, slot);
        setEntries(prev => (date === selectedDate ? prev.map(e => (e._id === entry._id ? moved : e)) : prev.filter(e => e._id !== entry._id)));
      }
      kitchenPlan.reload();
      setMoving(null);
    } catch (err) {
      Alert.alert("Couldn't move it", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  function renderMoveOverlay() {
    if (!moving) return null;
    const { entry } = moving;
    // The next two weeks, from today.
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = parseLocalDate(today);
      d.setDate(d.getDate() + i);
      return toDateStr(d);
    });
    const dayChip = (date: string) => {
      const d = parseLocalDate(date);
      return { top: date === today ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" }), day: d.getDate() };
    };
    const unchanged = moving.date === entry.date && moving.slot === entry.slot;
    return (
      <View className="absolute inset-0">
        <Pressable className="absolute inset-0 bg-black/40" onPress={() => setMoving(null)} />
        <View className="absolute bottom-0 left-0 right-0 overflow-hidden rounded-t-3xl bg-white pb-8">
          <View className="items-center pt-3">
            <View className="h-1 w-10 rounded-full bg-slate-200" />
          </View>
          <View className="flex-row items-center px-5 pb-2 pt-3">
            <Text className="flex-1 text-lg font-bold text-slate-950" numberOfLines={2}>
              Move {entryDisplayName(entry)}
            </Text>
            <Pressable hitSlop={10} onPress={() => setMoving(null)} className="ml-2 h-8 w-8 items-center justify-center rounded-full active:bg-slate-100">
              <Ionicons name="close" size={20} color="#64748B" />
            </Pressable>
          </View>

          <Text className="mb-2 mt-2 px-5 text-xs font-bold uppercase tracking-wide text-slate-400">Day</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
            {days.map(date => {
              const on = moving.date === date;
              const { top, day } = dayChip(date);
              return (
                <Pressable key={date} onPress={() => setMoving({ ...moving, date })} className={`w-14 items-center rounded-2xl py-2 ${on ? "bg-violet-600" : "bg-slate-100 active:bg-slate-200"}`}>
                  <Text className={`text-[11px] font-semibold ${on ? "text-violet-100" : "text-slate-500"}`}>{top}</Text>
                  <Text className={`mt-0.5 text-base font-bold ${on ? "text-white" : "text-slate-900"}`}>{day}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text className="mb-2 mt-5 px-5 text-xs font-bold uppercase tracking-wide text-slate-400">Meal</Text>
          <View className="flex-row flex-wrap gap-2 px-5">
            {SLOTS.map(slot => {
              const on = moving.slot === slot.id;
              return (
                <Pressable key={slot.id} onPress={() => setMoving({ ...moving, slot: slot.id })} className={`flex-row items-center rounded-full px-4 py-2 ${on ? "bg-violet-600" : "bg-slate-100 active:bg-slate-200"}`}>
                  <Ionicons name={slot.icon} size={14} color={on ? "white" : slot.iconColor} />
                  <Text className={`ml-1.5 text-sm font-semibold ${on ? "text-white" : "text-slate-700"}`}>{slot.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-6 px-5">
            <Pressable
              disabled={saving || unchanged}
              onPress={() => void handleMove(false)}
              className={`items-center rounded-2xl py-4 ${saving || unchanged ? "bg-violet-300" : "bg-violet-600 active:bg-violet-700"}`}
            >
              <Text className="font-semibold text-white">
                {unchanged ? "Pick a day or meal" : `Move to ${friendlyDayLabel(moving.date).toLowerCase() === "today" ? "today" : friendlyDayLabel(moving.date)}, ${SLOT_MAP[moving.slot].label.toLowerCase()}`}
              </Text>
            </Pressable>
            {(entry.recipe || entry.meal) && (
              <Pressable disabled={saving} onPress={() => void handleMove(true)} className="mt-3 flex-row items-center justify-center rounded-2xl border border-violet-200 py-4 active:bg-violet-50">
                <Ionicons name="restaurant-outline" size={16} color="#7C3AED" />
                <Text className="ml-2 font-semibold text-violet-700">Take it off the day, back on the menu</Text>
              </Pressable>
            )}
          </View>
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
    // (Still planned: at the size of the pantry piece it's counted at, for
    // the servings shown.)
    const piece = n && !isIngredient && editEntry.status === "planned" ? kitchenPlan.sized([editEntry])[0].sizedTo : undefined;
    if (n && piece) {
      const per = q / (editEntry.recipeServings || 1);
      for (const m of ["calories", "protein", "carbs", "fats"] as const) if (n[m] != null) n[m] = Math.max(0, n[m]! + piece.shift[m] * per);
    }

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
                {/* Still to come, and made with one of several pieces (a bag
                    from a particular steak; a fillet and a steak): which. */}
                {(() => {
                  const choices = kitchenPlan.pieceChoices(editEntry);
                  const groups = pieceGroups(choices);
                  if (!groups.some((g) => g.choices.length > 1)) return null;
                  const pinned = (editEntry.pieces ?? []).length > 0;
                  const meal = choices.find((c) => c.current)?.calories;
                  // (Folded to what it's counted at, until it's to be changed.)
                  if (!showPieces) {
                    return (
                      <>
                        <Text className="mb-1.5 text-sm font-semibold text-slate-700">{groups.length > 1 ? "Which ones" : "Which one"}</Text>
                        <Pressable onPress={() => setShowPieces(true)} className="mb-6 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 active:bg-slate-50">
                          <View className="flex-1">
                            {groups.map((g) => (
                              <Text key={g.group} className="text-base text-slate-900" numberOfLines={1}>
                                {g.choices.find((c) => c.current)?.label ?? `${g.group}: not chosen`}
                              </Text>
                            ))}
                          </View>
                          {meal != null && <Text className="mr-2 text-sm font-semibold text-slate-500">{meal} kcal</Text>}
                          <Text className="text-sm font-semibold text-blue-600">Change</Text>
                          <Ionicons name="chevron-forward" size={15} color="#2563EB" />
                        </Pressable>
                      </>
                    );
                  }
                  return (
                    <>
                      <Text className="mb-1.5 text-sm font-semibold text-slate-700">{groups.length > 1 ? "Which ones" : "Which one"}</Text>
                      {groups.map((g) => {
                        const expanded = groups.length === 1 || openPieces.includes(g.group);
                        return (
                        <View key={g.group} className="mb-2">
                          {groups.length > 1 && pieceHeading(g.group, expanded, g.choices.find((c) => c.current)?.label, g.choices.some((c) => editEntry.pieces?.includes(c.pantryItemId)))}
                          {expanded && <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            {g.choices.map((c, i) => (
                              <Pressable
                                key={c.pantryItemId}
                                onPress={() => {
                                  if (groups.length === 1) setShowPieces(false);
                                  void choosePiece(editEntry, withPiece(editEntry.pieces, choices, c));
                                }}
                                className={`flex-row items-center px-4 py-3 active:bg-slate-50 ${i > 0 ? "border-t border-slate-100" : ""}`}
                              >
                                {/* (Marked: what's been kept for it; the planner's own pick is labelled.) */}
                                <Ionicons name={c.chosen ? "radio-button-on" : "radio-button-off"} size={20} color={c.chosen ? "#2563EB" : "#94A3B8"} />
                                <View className="ml-3 flex-1">
                                  <Text className="text-base text-slate-900">
                                    {c.label}
                                    {c.current && !g.choices.some((x) => x.chosen) && <Text className="text-xs text-violet-600">  · planner&apos;s pick</Text>}
                                  </Text>
                                  {!!c.elsewhere && (
                                    <Text className="text-xs text-slate-400">
                                      going to {shortDateLabel(c.elsewhere.date)} {c.elsewhere.slot}
                                    </Text>
                                  )}
                                </View>
                                <Text className="text-sm font-semibold text-slate-500">{c.calories} kcal</Text>
                              </Pressable>
                            ))}
                            {/* Or none in particular: the planner's to choose. */}
                            <Pressable
                              onPress={() => {
                                if (groups.length === 1) setShowPieces(false);
                                void choosePiece(editEntry, (editEntry.pieces ?? []).filter((id) => !g.choices.some((c) => c.pantryItemId === id)));
                              }}
                              className="flex-row items-center border-t border-slate-100 px-4 py-3 active:bg-slate-50"
                            >
                              {(() => {
                                const mine = g.choices.some((c) => editEntry.pieces?.includes(c.pantryItemId));
                                return <Ionicons name={mine ? "radio-button-off" : "radio-button-on"} size={20} color={mine ? "#94A3B8" : "#7C3AED"} />;
                              })()}
                              <Text className="ml-3 flex-1 text-base text-violet-700">Let the planner choose</Text>
                            </Pressable>
                          </View>}
                        </View>
                        );
                      })}
                      <View className="mb-6 mt-0.5 flex-row items-center">
                        <Text className="flex-1 text-xs text-slate-400">
                          {pinned ? "Kept for this meal." : "Chosen for you: the best fit for the day, then the soonest to go."}
                        </Text>
                        {pinned && (
                          <Pressable onPress={() => void choosePiece(editEntry, [])} hitSlop={8}>
                            <Text className="text-xs font-semibold text-blue-600">Let the planner choose</Text>
                          </Pressable>
                        )}
                        <Pressable onPress={() => setShowPieces(false)} hitSlop={8} className="ml-3">
                          <Text className="text-xs font-semibold text-slate-500">Done</Text>
                        </Pressable>
                      </View>
                    </>
                  );
                })()}
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
                    <View className="flex-1">
                      <CreatableStringDropdown options={unitChoices(editEntry.ingredient!)} selectedValue={editUnit} placeholder="unit" onSelect={setEditUnit} height={56} />
                    </View>
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
            {editEntry.status === "planned" && (
              <Pressable
                className="mb-3 flex-row items-center justify-center rounded-2xl border border-violet-200 py-4 active:bg-violet-50"
                onPress={() => {
                  setMoving({ entry: editEntry, date: editEntry.date, slot: editEntry.slot });
                  setEditEntry(null);
                }}
              >
                <Ionicons name="swap-horizontal-outline" size={16} color="#7C3AED" />
                <Text className="ml-2 font-semibold text-violet-700">Move to another day or meal…</Text>
              </Pressable>
            )}
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
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]} style={{ backgroundColor: oc.canvas }}>
      <OrbitPage>
      {/* ── Top strip (non-scrolling): part of the page, not a band of its own ── */}
      <View style={{ paddingBottom: 4 }}>
        {/* The month, small, over the days */}
        <View style={{ flexDirection: "row", alignItems: "center", minHeight: 34, paddingHorizontal: 20, paddingTop: 2, paddingBottom: 8 }}>
          {fromCalendar && (
            <Tap
              onPress={() => router.back()}
              accessibilityLabel="Back to the calendar"
              style={{ marginRight: 10, height: 32, flexDirection: "row", alignItems: "center", paddingLeft: 6, paddingRight: 12, borderRadius: 16, backgroundColor: oc.pill }}
            >
              <Ionicons name="chevron-back" size={17} color={oc.onPill} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: oc.onPill }}>Calendar</Text>
            </Tap>
          )}
          <Text style={{ flex: 1, fontSize: 12, fontWeight: "700", letterSpacing: 1.4, color: oc.muted }}>{selectedMonthLabel.toUpperCase()}</Text>
          {!isToday && (
            <Tap onPress={jumpToToday} accessibilityLabel="Back to today" style={{ height: 32, justifyContent: "center", paddingHorizontal: 14, borderRadius: 16, backgroundColor: oc.ink }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: oc.onInk }}>Today</Text>
            </Tap>
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
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* The day, large, and how far through its meals it is */}
        <View style={{ marginBottom: 18, flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 30, fontWeight: "800", letterSpacing: -0.6, color: oc.text }}>
              {friendlyDayLabel(selectedDate)}
            </Text>
            {!isLoading && (
              <Text style={{ marginTop: 2, fontSize: 14, color: oc.muted }}>
                {dayLine(entries, isToday, selectedDate < today)}
              </Text>
            )}
          </View>
          {/* Suggestions for the empty meals, on or off — the orb's. */}
          <SuggestionsToggle on={showSuggestions} onPress={toggleSuggestions} />
        </View>

        {isLoading ? (
          <View className="items-center py-16">
            <ActivityIndicator size="large" color={oc.muted} />
          </View>
        ) : (
          <>
            {/* Daily / daily-average / last-7-days nutrition — swipe to switch */}
            <View style={{ marginBottom: 26 }}>
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
                  <Tap
                    key={page.title}
                    style={{ width: windowWidth - 32 }}
                    pressedStyle={{ opacity: 0.85 }}
                    onPress={() => setNutritionDetailPage(index)}
                  >
                    <NutritionRings
                      title={page.title}
                      subtitle={page.subtitle}
                      confirmed={page.confirmed}
                      planned={page.planned}
                      limits={page.limits}
                    />
                  </Tap>
                ))}
              </ScrollView>

              {/* Page dots */}
              <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={{ height: 6, width: nutritionView === i ? 16 : 6, borderRadius: 3, backgroundColor: nutritionView === i ? oc.ink : oc.track }} />
                ))}
              </View>
            </View>

            {/* The day's meals as a timeline: a node for each on a dotted
                path, like the home screen's orbit — eaten ones filled in,
                the one due now ringed. */}
            {SLOTS.map((slot, slotIndex) => {
              const slotEntries = entriesBySlot.get(slot.id) ?? [];
              // A suggestion to take or leave (nothing, with the cards off).
              const suggestionCard = suggested.offerFor(slot.id) && (
                <MealSuggestion suggested={suggested} slot={slot.id} className={slotEntries.length ? "mt-2" : ""} onPlanned={(added) => setEntries(prev => [...prev, ...added])} />
              );
              const eaten = slotEntries.length > 0 && slotEntries.every(e => e.status === "confirmed");
              const due = isToday && !eaten && slot.id === slotDueNow();
              const last = slotIndex === SLOTS.length - 1;
              return (
                <View key={slot.id} style={{ flexDirection: "row" }}>
                  {/* The path */}
                  <View style={{ width: 34, alignItems: "center" }}>
                    <SlotNode icon={slot.icon} eaten={eaten} due={due} some={slotEntries.length > 0} colors={oc} />
                    {!last && <DottedPath color={oc.orbit} />}
                  </View>

                  <View style={{ flex: 1, marginLeft: 12, paddingBottom: last ? 0 : 22 }}>
                    {/* Slot header */}
                    <View style={{ minHeight: 34, marginBottom: 8, flexDirection: "row", alignItems: "center" }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: oc.text }}>{slot.label}</Text>
                      <Text style={{ marginLeft: 8, fontSize: 12, color: due ? oc.accent : oc.faint, fontWeight: due ? "600" : "400" }}>{due ? "Now" : slot.time}</Text>
                      <View style={{ flex: 1 }} />
                      <Tap
                        onPress={() => openAdd(slot.id)}
                        accessibilityLabel={`Add to ${slot.label.toLowerCase()}`}
                        style={{ height: 30, flexDirection: "row", alignItems: "center", paddingLeft: 9, paddingRight: 12, borderRadius: 15, backgroundColor: oc.pill }}
                      >
                        <Ionicons name="add" size={15} color={oc.onPill} />
                        <Text style={{ marginLeft: 3, fontSize: 13, fontWeight: "600", color: oc.onPill }}>Add</Text>
                      </Tap>
                    </View>

                      {/* Entries */}
                      {slotEntries.length > 0 ? (
                        <>
                          {slotEntries.map(renderEntry)}
                          {suggestionCard}
                        </>
                      ) : suggestionCard ? (
                        suggestionCard
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
                                  style={{ borderRadius: 16 }}
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
                                style={{ borderColor: oc.border, borderRadius: 16, paddingVertical: 16 }}
                              >
                                <Text className="px-6 text-center text-sm text-slate-400" style={{ color: oc.faint }}>
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
                          style={{ borderColor: oc.border, borderRadius: 16, paddingVertical: 16 }}
                        >
                          <Text className="text-sm text-slate-400" style={{ color: oc.faint }}>No {slot.label.toLowerCase()} planned</Text>
                        </Pressable>
                      )}
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
      </OrbitPage>

      {/* (The add sheet is light for now: the clock over it, dark.) */}
      {showAdd && dark && <StatusBar style="dark" />}

      {/* ── Add-to-plan overlay ── plain absolutely-positioned View, no
          RN Modal and no navigation — sidesteps the navigation-context
          crash entirely by never leaving this already-mounted screen. */}
      {showAdd && (
        <SafeAreaView className="absolute inset-0 bg-slate-50" edges={["top", "left", "right"]}>
          {/* (In a desktop browser: a page's width, and the lists as grids.) */}
          <View style={wideAdd ? { flex: 1, width: "100%", maxWidth: 1180, alignSelf: "center" } : { flex: 1 }}>
          {/* Header */}
          <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
            {pendingIngredient || pendingRestaurantMeal || pendingPieces ? (
              <Pressable
                onPress={() => {
                  setPendingIngredient(null);
                  setPendingRestaurantMeal(null);
                  setPendingPieces(null);
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
              onPress={() => {
                setShowAdd(false);
                if (addForCalendar.current) {
                  addForCalendar.current = false;
                  leaveAddFlow();
                }
              }}
              hitSlop={10}
              className="-mr-2 px-2 py-2"
            >
              <Text className="font-semibold text-blue-600">Cancel</Text>
            </Pressable>
          </View>

          {pendingPieces ? (
            /* ── Which piece a recipe is to be made with ── */
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ padding: 16, paddingBottom: 40, ...(wideAdd ? { width: "100%", maxWidth: 640, alignSelf: "center" } : {}) }}
            >
              <View className="mb-5 flex-row items-center rounded-2xl border border-slate-200 bg-white p-4">
                <View className={`h-11 w-11 items-center justify-center rounded-full ${SLOT_MAP[addSlot].chipBg}`}>
                  <Ionicons name="book-outline" size={18} color={SLOT_MAP[addSlot].iconColor} />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="font-semibold text-slate-900">{pendingPieces.recipe.name}</Text>
                  <Text className="mt-0.5 text-xs text-slate-400">
                    {pendingPieces.servings} serving{pendingPieces.servings === 1 ? "" : "s"}
                  </Text>
                </View>
              </View>
              {(() => {
                const groups = pieceGroups(pendingPieces.options);
                const many = groups.length > 1;
                // With one piece to choose, a tap is the choice; with more,
                // each is picked, then added together.
                const pick = (c: PieceChoice) => {
                  if (!many) return void handleAddRecipeEntry(pendingPieces.recipe, pendingPieces.servings, [c.pantryItemId], pendingPieces.menuItem);
                  const next = withPiece(pendingPieces.picked, pendingPieces.options, { ...c, chosen: pendingPieces.picked.includes(c.pantryItemId) });
                  setPendingPieces({ ...pendingPieces, picked: next });
                };
                return (
                  <>
                    <Text className="mb-1.5 text-sm font-semibold text-slate-700">{many ? "Which ones?" : "Which one?"}</Text>
                    {groups.map((g) => {
                      const expanded = !many || openPieces.includes(g.group);
                      const mine = g.choices.find((c) => pendingPieces.picked.includes(c.pantryItemId));
                      return (
                      <View key={g.group} className="mb-2">
                        {many && pieceHeading(g.group, expanded, mine ? mine.label : "The planner's choice", !!mine)}
                        {expanded && <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                          {g.choices.map((c, i) => (
                            <Pressable
                              key={c.pantryItemId}
                              disabled={saving}
                              onPress={() => pick(c)}
                              className={`flex-row items-center px-4 py-3.5 active:bg-slate-50 ${i > 0 ? "border-t border-slate-100" : ""}`}
                            >
                              {many && <Ionicons name={pendingPieces.picked.includes(c.pantryItemId) ? "radio-button-on" : "radio-button-off"} size={20} color={pendingPieces.picked.includes(c.pantryItemId) ? "#2563EB" : "#94A3B8"} style={{ marginRight: 10 }} />}
                              <View className="flex-1">
                                <Text className="text-base text-slate-900">{c.label}</Text>
                                {!!c.elsewhere && (
                                  <Text className="text-xs text-slate-400">
                                    going to {shortDateLabel(c.elsewhere.date)} {c.elsewhere.slot}
                                  </Text>
                                )}
                              </View>
                              <Text className="text-sm font-semibold text-slate-600">{c.calories} kcal</Text>
                              {!many && <Ionicons name="chevron-forward" size={16} color="#94A3B8" style={{ marginLeft: 6 }} />}
                            </Pressable>
                          ))}
                          {/* Or none in particular: the planner's to choose. */}
                          {many && (
                            <Pressable
                              onPress={() => setPendingPieces({ ...pendingPieces, picked: pendingPieces.picked.filter((id) => !g.choices.some((c) => c.pantryItemId === id)) })}
                              className="flex-row items-center border-t border-slate-100 px-4 py-3.5 active:bg-slate-50"
                            >
                              <Ionicons name={mine ? "radio-button-off" : "radio-button-on"} size={20} color={mine ? "#94A3B8" : "#7C3AED"} style={{ marginRight: 10 }} />
                              <Text className="flex-1 text-base text-violet-700">Let the planner choose</Text>
                            </Pressable>
                          )}
                        </View>}
                      </View>
                      );
                    })}
                    {many && (
                      <Pressable
                        disabled={saving}
                        onPress={() => void handleAddRecipeEntry(pendingPieces.recipe, pendingPieces.servings, pendingPieces.picked, pendingPieces.menuItem)}
                        className={`mt-2 items-center rounded-2xl py-3.5 ${saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}
                      >
                        <Text className="font-semibold text-white">{saving ? "Adding…" : "Add to plan"}</Text>
                      </Pressable>
                    )}
                    <Pressable
                      disabled={saving}
                      onPress={() => void handleAddRecipeEntry(pendingPieces.recipe, pendingPieces.servings, [], pendingPieces.menuItem)}
                      className="mt-2 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4 py-3.5 active:bg-slate-50"
                    >
                      <Ionicons name="sparkles-outline" size={16} color="#7C3AED" />
                      <Text className="ml-2 flex-1 text-base text-violet-700">Let the planner choose{many ? " all" : ""}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                    </Pressable>
                    <Text className="mt-1.5 text-xs text-slate-400">
                      {many ? "Any left unpicked are chosen by the planner: the best fit for the day, then the soonest to go." : "The planner picks the best fit for the day, then the soonest to go."} Either way it can be changed from the meal later.
                    </Text>
                  </>
                );
              })()}
            </ScrollView>
          ) : pendingIngredient ? (
            /* ── Ingredient quantity-entry step ── */
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ padding: 16, paddingBottom: 40, ...(wideAdd ? { width: "100%", maxWidth: 640, alignSelf: "center" } : {}) }}
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
                <View className="flex-1">
                  <CreatableStringDropdown options={unitChoices(pendingIngredient)} selectedValue={pendingUnit} placeholder="unit" onSelect={setPendingUnit} height={56} />
                </View>
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
              contentContainerStyle={{ padding: 16, paddingBottom: 40, ...(wideAdd ? { width: "100%", maxWidth: 640, alignSelf: "center" } : {}) }}
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

              {/* What's on the menu, to put on this day (not while searching). */}
              {menuToPlace.length > 0 && !(addMode === "meal" ? mealSearch : addMode === "recipe" ? recipeSearch : addMode === "ingredient" ? ingredientSearch : restaurantSearch) && (
                <View className="border-b border-slate-100 bg-white pb-3">
                  <Text className="mb-2 px-4 text-xs font-bold uppercase tracking-wide text-violet-600">From your menu</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }} keyboardShouldPersistTaps="handled">
                    {menuToPlace.map((item) => {
                      const kcal = item.recipe ? getRecipeKcal(item.recipe, 1) : item.meal ? getMealKcal(item.meal) : null;
                      return (
                        <Pressable
                          key={item._id}
                          disabled={saving}
                          onPress={() => void (item.recipe ? handleAddRecipeEntry(item.recipe, 1, undefined, item._id) : handleAddEntry(item.meal!, item._id))}
                          className="max-w-[220px] flex-row items-center rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 active:bg-violet-100"
                        >
                          <View className="flex-shrink">
                            <Text numberOfLines={1} className="text-sm font-semibold text-slate-900">
                              {menuName(item)}
                            </Text>
                            <Text className="text-xs text-violet-700">
                              {kcal != null ? `${Math.round(kcal)} kcal a serving` : "On your menu"}
                            </Text>
                          </View>
                          <Ionicons name="add-circle-outline" size={20} color="#7C3AED" style={{ marginLeft: 8 }} />
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* List */}
              {addMode === "meal" && (
                <FlatList
                  key={wideAdd ? "grid" : "list"}
                  {...addGrid}
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
                        style={addCell}
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
                  key={wideAdd ? "grid" : "list"}
                  {...addGrid}
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
                      <View className="mb-2 rounded-2xl border border-slate-200 bg-white p-4" style={addCell}>
                        <Pressable
                          className="flex-row items-center active:opacity-70"
                          disabled={saving}
                          onPress={() => void handleAddRecipeEntry(recipe, addServings)}
                        >
                          <RecipeThumb
                            imageUrl={recipe.imageUrl}
                            size={44}
                            fallback={
                              <View className={`h-11 w-11 items-center justify-center rounded-full ${slotCfg.chipBg}`}>
                                <Ionicons name="book-outline" size={18} color={slotCfg.iconColor} />
                              </View>
                            }
                          />
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
                  key={wideAdd ? "grid" : "list"}
                  {...addGrid}
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
                        style={addCell}
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
                  key={wideAdd ? "grid" : "list"}
                  {...addGrid}
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
                        style={addCell}
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
          </View>
        </SafeAreaView>
      )}

      {renderInfoOverlay()}
      {renderEditEntryOverlay()}
      {renderMoveOverlay()}

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

      {confirmModals}

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
});

// "2 of 3 meals eaten · 1 planned", or the like, under the day's name.
function dayLine(entries: MealPlanEntry[], isToday: boolean, past: boolean): string {
  const eaten = entries.filter((e) => e.status === "confirmed").length;
  const planned = entries.length - eaten;
  if (!entries.length) return isToday ? "Nothing logged yet" : past ? "Nothing logged" : "Nothing planned yet";
  const parts = [];
  if (eaten) parts.push(`${eaten} eaten`);
  if (planned) parts.push(`${planned} planned`);
  return parts.join(" · ");
}

// The meal due about now, by the time of day.
function slotDueNow(): MealSlot {
  const hour = new Date().getHours();
  return hour < 11 ? "breakfast" : hour < 16 ? "lunch" : "dinner";
}

// A meal's node on the day's path: filled in once it's all eaten, ringed in
// the assistant's blue when it's the one due now, quiet otherwise.
function SlotNode({ icon, eaten, due, some, colors: oc }: { icon: keyof typeof Ionicons.glyphMap; eaten: boolean; due: boolean; some: boolean; colors: OrbitColors }) {
  return (
    <View
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: eaten ? oc.ink : oc.node,
        borderWidth: eaten ? 0 : due ? 2 : 1,
        borderColor: due ? oc.selectedRing : oc.nodeBorder,
      }}
    >
      <Ionicons name={eaten ? "checkmark" : icon} size={eaten ? 17 : 16} color={eaten ? oc.onInk : due || some ? oc.text : oc.faint} />
    </View>
  );
}

// The dotted path down to the next meal, as long as the meal above is tall.
function DottedPath({ color }: { color: string }) {
  return (
    <View style={{ flex: 1, alignSelf: "stretch", overflow: "hidden", marginTop: 6, marginBottom: 4 }}>
      {/* (Laid over it, so the dots never make the meal any taller.) */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" }}>
        {Array.from({ length: 80 }, (_, i) => (
          <View key={i} style={{ width: 3, height: 3, borderRadius: 1.5, marginBottom: 5, backgroundColor: color }} />
        ))}
      </View>
    </View>
  );
}
