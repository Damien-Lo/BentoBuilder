import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WebRecipesScreen } from "@/src/components/recipes/web/WebRecipesScreen";
import { RecipeThumb } from "@/src/components/recipes/RecipeThumb";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitPage, useOrbitTheme } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";
import { usePaneDimensions } from "@/src/utils/pane";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  deleteRecipe,
  getRecipes,
  type MealCategory,
  type Recipe,
} from "@/src/services/recipeApi";
import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import { deleteMeal, getMeals, type Meal } from "@/src/services/mealApi";
import {
  deleteRestaurantMeal,
  getRestaurantMeals,
  type RestaurantMeal,
} from "@/src/services/restaurantMealApi";
import { getLastUsedMap, type LastUsedMap } from "@/src/services/mealPlanApi";
import { sortAlphabetically, sortByLastUsed } from "@/src/utils/lastUsedSort";
import { getPantryItems } from "@/src/services/pantryApi";
import type { PantryItem } from "@/src/types/pantry";
import { loadSettings } from "@/src/services/settingsService";
import { convertUnits, getIngredientConversions, type CustomUnitConversion } from "@/src/utils/unitConversion";
import { countQualifyingPantryPieces, getIngredientStockInUnit } from "@/src/utils/ingredientStock";
import { referenceId } from "@/src/utils/pantryDefaults";
import { getMealKcal } from "@/src/utils/mealPlan";

type SortMode = "category" | "meal" | "mealPrep";

type RecipeGroup = {
  key: string;
  label: string;
  items: Recipe[];
};

const MEAL_CATEGORY_ORDER: MealCategory[] = ["breakfast", "lunch", "dinner", "snack"];

const MEAL_CATEGORY_LABEL: Record<MealCategory, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

function getRecipeCategoryName(recipe: Recipe): string {
  if (!recipe.recipeCategory || typeof recipe.recipeCategory === "string") return "";
  return recipe.recipeCategory.name ?? "";
}

function getMealLabel(mealCategory: MealCategory | MealCategory[]): string {
  const cats = Array.isArray(mealCategory) ? mealCategory : [mealCategory];
  return cats.map((c) => MEAL_CATEGORY_LABEL[c] ?? c).join(", ");
}

// Generic ingredients (e.g. "Soy Sauce") never hold pantry stock directly —
// availability comes from aggregating their specific/branded variants (see
// getIngredientStockInUnit) — and an ingredient marked "always available"
// (e.g. tap water) always reads as sufficient regardless of pantry quantity.
// A recipe line's unit also doesn't have to match how it's stocked (e.g. "2
// cups" soy sauce checked against pantry stock recorded in mL), so both the
// stock total and the low-stock threshold are converted at comparison time.
function getMealAvailability(
  meal: Meal,
  recipeMap: Map<string, Recipe>,
  ingredientMap: Map<string, Ingredient>,
  allIngredients: Ingredient[],
  pantryItems: PantryItem[],
  customConversions: CustomUnitConversion[],
): "green" | "yellow" | "red" | null {
  if (!meal.courses?.length) return null;
  let overall: "green" | "yellow" | "red" | null = null;
  for (const course of meal.courses) {
    // An ingredient course checks as a single plain-quantity line.
    const courseIngredientId = course.ingredient
      ? typeof course.ingredient === "string" ? course.ingredient : course.ingredient._id
      : "";
    const courseIngredientEntry = courseIngredientId
      ? {
          ingredient: courseIngredientId,
          quantity: course.quantity ?? 0,
          unit: course.unit || ingredientMap.get(courseIngredientId)?.defaultPortionUnit || "",
          matchMode: "quantity" as const,
          pieceMinWeight: undefined,
          pieceMaxWeight: undefined,
          pieceWeightUnit: undefined,
        }
      : null;
    const ref = course.recipe;
    const recipe = ref ? recipeMap.get(typeof ref === "string" ? ref : ref._id) : undefined;
    const lines = courseIngredientEntry ? [courseIngredientEntry] : recipe?.ingredientList ?? [];
    if (!lines.length) continue;
    for (const entry of lines) {
      const ingId = typeof entry.ingredient === "string"
        ? entry.ingredient
        : (entry.ingredient as { _id: string })._id;
      const ing = ingredientMap.get(ingId);
      if (!ing) continue;

      let state: "green" | "yellow" | "red";
      if (entry.matchMode === "wholePiece") {
        // Counts real qualifying pantry pieces instead of pooling a total
        // weight — an undersized/oversized piece doesn't count. No
        // low-stock threshold here (it's expressed in the ingredient's
        // native weight unit, not a piece count): green with pieces to
        // spare, yellow exactly enough, red on a genuine shortfall.
        const qualifying = countQualifyingPantryPieces(
          ing,
          entry.pieceMinWeight ?? 0,
          entry.pieceMaxWeight ?? 0,
          entry.pieceWeightUnit || "g",
          allIngredients,
          pantryItems,
          customConversions,
        );
        const remaining = qualifying - entry.quantity;
        state = remaining > 0 ? "green" : remaining >= 0 ? "yellow" : "red";
      } else {
        const inStock = getIngredientStockInUnit(ing, entry.unit, allIngredients, pantryItems, customConversions);
        const remaining = inStock - entry.quantity;
        const rawThreshold = ing.lowStockThreshold ?? 0;
        const threshold = ing.defaultPortionUnit
          ? (convertUnits(
              rawThreshold,
              ing.defaultPortionUnit,
              entry.unit,
              getIngredientConversions(ing, customConversions, allIngredients),
            ) ?? rawThreshold)
          : rawThreshold;
        state = remaining > threshold ? "green" : remaining >= 0 ? "yellow" : "red";
      }

      if (overall === null) overall = state;
      else if (state === "red") { overall = "red"; break; }
      else if (state === "yellow" && overall === "green") overall = "yellow";
    }
  }
  return overall;
}

function getMealCalories(meal: Meal): number | null {
  return getMealKcal(meal);
}

export default function RecipesMainPage() {
  // A desktop browser gets a wall of cards; the phone's lists are below.
  const wide = useWideWeb();
  return wide ? <WebRecipesScreen /> : <PhoneRecipesMainPage />;
}

// (In Orbit's look, light or dark, in the Kitchen's colour.)
function PhoneRecipesMainPage() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const { width: screenWidth } = usePaneDimensions();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [customUnitConversions, setCustomUnitConversions] = useState<CustomUnitConversion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("category");
  const [statusFilter, setStatusFilter] = useState<"all" | "wantToTry" | "confirmed">("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [activePage, setActivePage] = useState<"meals" | "recipes" | "restaurant">("meals");
  const scrollRef = useRef<ScrollView>(null);
  const [mealSearchText, setMealSearchText] = useState("");
  const [isMealSearchActive, setIsMealSearchActive] = useState(false);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [restaurantSearchText, setRestaurantSearchText] = useState("");
  const [isRestaurantSearchActive, setIsRestaurantSearchActive] = useState(false);
  const [restaurantMeals, setRestaurantMeals] = useState<RestaurantMeal[]>([]);
  const [lastUsed, setLastUsed] = useState<LastUsedMap>({ meal: {}, recipe: {}, ingredient: {}, restaurantMeal: {} });

  const isFirstLoad = useRef(true);

  // Meals is the default landing page, but it's the middle page now
  // (Restaurants | Meals | Recipes) — scroll there once loading finishes,
  // not on mount: while isLoading is true this screen renders a spinner
  // with no ScrollView at all, so scrollRef isn't attached to anything yet
  // and a mount-time scroll would silently no-op.
  useEffect(() => {
    if (isLoading) return;
    setTimeout(() => {
      scrollRef.current?.scrollTo({ x: screenWidth, animated: false });
    }, 50);
  }, [isLoading]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const showSpinner = isFirstLoad.current;
      if (showSpinner) setIsLoading(true);

      async function load() {
        try {
          const [loaded, loadedIngredients, loadedPantry, loadedSettings] = await Promise.all([
            getRecipes(),
            getIngredients(),
            getPantryItems(),
            loadSettings(),
          ]);
          if (!cancelled) {
            setRecipes(Array.isArray(loaded) ? loaded : []);
            setIngredients(Array.isArray(loadedIngredients) ? loadedIngredients : []);
            setPantryItems(Array.isArray(loadedPantry) ? loadedPantry : []);
            setCustomUnitConversions(loadedSettings.unitConversions ?? []);
          }
        } catch (error) {
          console.error("Error loading recipes:", error);
          if (!cancelled && showSpinner) setRecipes([]);
        } finally {
          if (!cancelled) {
            isFirstLoad.current = false;
            setIsLoading(false);
          }
        }
      }

      void load();
      return () => { cancelled = true; };
    }, []),
  );

  const ingredientMap = useMemo(
    () => new Map(ingredients.map((i) => [i._id, i])),
    [ingredients],
  );

  // Keyed by recipe _id — gives us full ingredientList for meal availability checks
  const recipeMap = useMemo(
    () => new Map(recipes.map((r) => [r._id, r])),
    [recipes],
  );

  // Reset to all collapsed when switching sort mode
  const handleSortMode = (mode: SortMode) => {
    setSortMode(mode);
    setExpandedGroups(new Set());
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredRecipes = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return recipes.filter((recipe) => {
      if (statusFilter === "wantToTry" && recipe.isConfirmed) return false;
      if (statusFilter === "confirmed" && !recipe.isConfirmed) return false;
      if (!query) return true;
      const mealCats = Array.isArray(recipe.mealCategory)
        ? recipe.mealCategory.join(" ")
        : recipe.mealCategory;
      const tagNames = Array.isArray(recipe.tags)
        ? recipe.tags
            .map((tag) => (typeof tag === "object" && tag !== null ? tag.name : ""))
            .filter(Boolean)
        : [];
      return [
        recipe.name,
        recipe.description ?? "",
        getRecipeCategoryName(recipe),
        mealCats,
        ...tagNames,
      ].some((v) => v.toLowerCase().includes(query));
    });
  }, [recipes, searchText, statusFilter]);

  // Recipes whose produced ingredient is flagged isMealPrep — a finished
  // dish you reheat/eat directly (e.g. Okonomiyaki), as opposed to a
  // component ingredient like Dashi Stock. The link lives on the
  // Ingredient (productionRecipe), not the Recipe.
  const mealPrepRecipeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const ingredient of ingredients) {
      if (!ingredient.isMealPrep) continue;
      const recipeId = referenceId(ingredient.productionRecipe);
      if (recipeId) ids.add(recipeId);
    }
    return ids;
  }, [ingredients]);

  const groupedRecipes = useMemo<RecipeGroup[]>(() => {
    if (sortMode === "mealPrep") {
      const items = filteredRecipes.filter((recipe) => mealPrepRecipeIds.has(recipe._id));
      return [{ key: "mealPrep", label: "Meal Preps", items }];
    }

    if (sortMode === "meal") {
      const groups = new Map<MealCategory, Recipe[]>();
      for (const recipe of filteredRecipes) {
        const cats = Array.isArray(recipe.mealCategory)
          ? recipe.mealCategory
          : [recipe.mealCategory];
        for (const cat of cats) {
          const existing = groups.get(cat);
          if (existing) existing.push(recipe);
          else groups.set(cat, [recipe]);
        }
      }
      return MEAL_CATEGORY_ORDER.filter((cat) => groups.has(cat)).map((cat) => ({
        key: cat,
        label: MEAL_CATEGORY_LABEL[cat],
        items: groups.get(cat)!,
      }));
    }

    // Group by recipe category
    const groups = new Map<string, Recipe[]>();
    for (const recipe of filteredRecipes) {
      const cat = getRecipeCategoryName(recipe) || "Uncategorised";
      const existing = groups.get(cat);
      if (existing) existing.push(recipe);
      else groups.set(cat, [recipe]);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        if (a === "Uncategorised") return 1;
        if (b === "Uncategorised") return -1;
        return a.localeCompare(b);
      })
      .map(([cat, items]) => ({ key: cat, label: cat, items }));
  }, [filteredRecipes, sortMode, mealPrepRecipeIds]);

  const allOpen = groupedRecipes.length > 0 && groupedRecipes.every((g) => expandedGroups.has(g.key));

  const closeSearch = () => {
    Keyboard.dismiss();
    setIsSearchActive(false);
    setSearchText("");
  };

  const handleHorizontalScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const pageIndex = Math.round(
      event.nativeEvent.contentOffset.x / screenWidth,
    );
    setActivePage(pageIndex === 0 ? "restaurant" : pageIndex === 1 ? "meals" : "recipes");
    Keyboard.dismiss();
    setIsSearchActive(false);
    setSearchText("");
    setIsMealSearchActive(false);
    setMealSearchText("");
    setIsRestaurantSearchActive(false);
    setRestaurantSearchText("");
  };

  const handleDeleteRecipe = (id: string, name: string) => {
    Alert.alert("Delete recipe", `Delete "${name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deleteRecipe(id)
            .then(() => setRecipes((prev) => prev.filter((r) => r._id !== id)))
            .catch((err: unknown) => {
              Alert.alert("Error", err instanceof Error ? err.message : "Could not delete recipe.");
            });
        },
      },
    ]);
  };

  useFocusEffect(
    useCallback(() => {
      getMeals()
        .then(setMeals)
        .catch(() => {});
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      getRestaurantMeals()
        .then(setRestaurantMeals)
        .catch(() => {});
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      getLastUsedMap()
        .then(setLastUsed)
        .catch(() => {});
    }, []),
  );

  // Browse view (the main swipeable page) sorts by most-recently-used-in-
  // the-planner; the search overlay below stays alphabetical regardless of
  // query text, since you're hunting for a known name there, not browsing.
  const mealsForBrowse = useMemo(
    () => sortByLastUsed(meals, lastUsed.meal, m => m._id, m => m.name),
    [meals, lastUsed.meal],
  );

  const filteredMeals = useMemo(() => {
    const query = mealSearchText.trim().toLowerCase();
    const list = !query
      ? meals
      : meals.filter(m => {
          const tagNames = (m.tags ?? []).map(t => t.name);
          return [m.name, ...tagNames].some(v => v.toLowerCase().includes(query));
        });
    return sortAlphabetically(list, m => m.name);
  }, [meals, mealSearchText]);

  const restaurantMealsForBrowse = useMemo(
    () => sortByLastUsed(restaurantMeals, lastUsed.restaurantMeal, r => r._id, r => r.restaurantName),
    [restaurantMeals, lastUsed.restaurantMeal],
  );

  const filteredRestaurantMeals = useMemo(() => {
    const query = restaurantSearchText.trim().toLowerCase();
    const list = !query
      ? restaurantMeals
      : restaurantMeals.filter(
          r =>
            r.restaurantName.toLowerCase().includes(query) ||
            r.dishes.some(d => d.name.toLowerCase().includes(query)),
        );
    return sortAlphabetically(list, r => r.restaurantName);
  }, [restaurantMeals, restaurantSearchText]);

  const handleDeleteMeal = (id: string, name: string) => {
    Alert.alert("Delete meal", `Delete "${name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deleteMeal(id)
            .then(() => setMeals(prev => prev.filter(m => m._id !== id)))
            .catch((err: unknown) => {
              Alert.alert("Error", err instanceof Error ? err.message : "Could not delete meal.");
            });
        },
      },
    ]);
  };

  const handleArchiveRestaurantMeal = (item: RestaurantMeal) => {
    Alert.alert(`Archive "${item.restaurantName}"?`, "You can restore it later from Settings > Archive.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive",
        style: "destructive",
        onPress: () => {
          void deleteRestaurantMeal(item._id)
            .then(() => setRestaurantMeals(prev => prev.filter(r => r._id !== item._id)))
            .catch((err: unknown) => {
              Alert.alert("Error", err instanceof Error ? err.message : "Could not archive.");
            });
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.canvas }}>
        <ActivityIndicator size="large" color={c.muted} />
        <Text style={{ marginTop: 12, color: c.muted }}>Loading recipes...</Text>
      </SafeAreaView>
    );
  }

  // Pieces in Orbit's look, shared by the three pages.
  const card: ViewStyle = { backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border };
  const row: ViewStyle = { ...card, marginBottom: 10, flexDirection: "row", alignItems: "center", padding: 14 };
  const searchRow: ViewStyle = { marginBottom: 8, flexDirection: "row", alignItems: "center", borderRadius: 16, backgroundColor: c.canvas, padding: 12 };
  const nameText: TextStyle = { fontSize: 16, fontWeight: "700", color: c.text };
  const detail: TextStyle = { marginTop: 2, fontSize: 14, color: c.muted };
  // A round tile with the list's icon, the section's colour on it.
  const tile = (icon: keyof typeof Ionicons.glyphMap, size = 40) => (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: c.pill }}>
      <Ionicons name={icon} size={size > 40 ? 21 : 18} color={c.ink} />
    </View>
  );
  // A swipe away (delete, archive): red, as everywhere.
  const swipeAction = (icon: keyof typeof Ionicons.glyphMap, onPress: () => void) => (
    <Pressable className="mb-2.5 w-20 items-center justify-center rounded-2xl bg-red-500 active:bg-red-600" style={{ borderRadius: 18 }} onPress={onPress}>
      <Ionicons name={icon} size={22} color="white" />
    </Pressable>
  );
  const pageTitle = (title: string, count: string) => (
    <View>
      <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>{title}</Text>
      <Text style={{ marginTop: 2, fontSize: 14, color: c.muted }}>{count}</Text>
    </View>
  );
  // Which of the three pages this is (0 restaurants, 1 meals, 2 recipes).
  const dots = (active: number) =>
    [0, 1, 2].map((i) => (
      <View key={i} style={{ marginLeft: i ? 8 : 0, height: 8, width: i === active ? 24 : 8, borderRadius: 4, backgroundColor: i === active ? c.ink : c.orbit }} />
    ));
  const hint: TextStyle = { marginLeft: 12, fontSize: 12, fontWeight: "500", color: c.faint };
  // A row of choices, the chosen one in the section's colour.
  const segments = <T extends string>(options: [T, string][], value: T, onChange: (next: T) => void, stretch: boolean) => (
    <View style={{ flexDirection: "row", padding: 3, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
      {options.map(([option, label]) => {
        const chosen = option === value;
        return (
          <Tap
            key={option}
            onPress={() => onChange(option)}
            style={[{ alignItems: "center", justifyContent: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 11, backgroundColor: chosen ? c.ink : "transparent" }, stretch && { flex: 1 }]}
            pressedStyle={chosen ? { opacity: 0.85 } : { backgroundColor: c.pill }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: chosen ? c.onInk : c.muted }}>{label}</Text>
          </Tap>
        );
      })}
    </View>
  );
  const emptyCard = (icon: keyof typeof Ionicons.glyphMap, title: string, text: string) => (
    <View style={{ ...card, alignItems: "center", paddingHorizontal: 24, paddingVertical: 56 }}>
      <Ionicons name={icon} size={42} color={c.faint} />
      <Text style={{ marginTop: 16, fontSize: 18, fontWeight: "700", color: c.text }}>{title}</Text>
      <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: c.muted }}>{text}</Text>
    </View>
  );
  const searchEmpty = (title: string) => (
    <View style={{ alignItems: "center", paddingHorizontal: 24, paddingVertical: 56 }}>
      <Ionicons name="search-outline" size={42} color={c.faint} />
      <Text style={{ marginTop: 16, fontSize: 18, fontWeight: "700", color: c.text }}>{title}</Text>
      <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: c.muted }}>Try searching with different keywords.</Text>
    </View>
  );
  // The floating bar at the top of each page: search (which opens over the
  // page, with its results) and +.
  const searchPanel = ({ open, value, onChangeText, onFocus, placeholder, onAdd, title, onCancel, results }: { open: boolean; value: string; onChangeText: (text: string) => void; onFocus: () => void; placeholder: string; onAdd: () => void; title: string; onCancel: () => void; results: ReactNode }) => (
    <View className="shadow-lg" style={[{ position: "absolute", left: 16, right: 16, top: 12, zIndex: 20, overflow: "hidden", borderRadius: 24, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }, open && { bottom: 16 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 10 }}>
        <View style={{ height: 48, flex: 1, flexDirection: "row", alignItems: "center", borderRadius: 16, backgroundColor: c.pill, paddingHorizontal: 14 }}>
          <Ionicons name="search-outline" size={20} color={c.muted} />
          <TextInput value={value} onChangeText={onChangeText} onFocus={onFocus} placeholder={placeholder} placeholderTextColor={c.faint} style={{ marginLeft: 10, flex: 1, fontSize: 16, color: c.text }} />
          {value.length > 0 && (
            <Pressable onPress={() => onChangeText("")}>
              <Ionicons name="close-circle" size={20} color={c.faint} />
            </Pressable>
          )}
        </View>
        <Tap onPress={onAdd} accessibilityLabel="Add" style={{ marginLeft: 10, width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.ink }} pressedStyle={{ opacity: 0.85 }}>
          <Ionicons name="add" size={28} color={c.onInk} />
        </Tap>
      </View>

      {open && (
        <View style={{ flex: 1, borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: 14, paddingBottom: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: c.text }}>{title}</Text>
            <Pressable onPress={onCancel} hitSlop={8}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: c.accent }}>Cancel</Text>
            </Pressable>
          </View>
          {results}
        </View>
      )}
    </View>
  );
  const scrim = (onPress: () => void) => <Pressable style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 10, backgroundColor: c.scrim }} onPress={onPress} />;
  const closeMealSearch = () => {
    setIsMealSearchActive(false);
    setMealSearchText("");
    Keyboard.dismiss();
  };
  const closeRestaurantSearch = () => {
    setIsRestaurantSearchActive(false);
    setRestaurantSearchText("");
    Keyboard.dismiss();
  };

  const recipeCard = (recipe: Recipe) => {
    let availability: "green" | "yellow" | "red" | null = null;
    for (const entry of recipe.ingredientList) {
      const ingId = typeof entry.ingredient === "string"
        ? entry.ingredient
        : (entry.ingredient as { _id: string })._id;
      const ing = ingredientMap.get(ingId);
      if (!ing) continue;

      let state: "green" | "yellow" | "red";
      if (entry.matchMode === "wholePiece") {
        const qualifying = countQualifyingPantryPieces(
          ing,
          entry.pieceMinWeight ?? 0,
          entry.pieceMaxWeight ?? 0,
          entry.pieceWeightUnit || "g",
          ingredients,
          pantryItems,
          customUnitConversions,
        );
        const remaining = qualifying - entry.quantity;
        state = remaining > 0 ? "green" : remaining >= 0 ? "yellow" : "red";
      } else {
        const inStock = getIngredientStockInUnit(ing, entry.unit, ingredients, pantryItems, customUnitConversions);
        const remaining = inStock - entry.quantity;
        const rawThreshold = ing.lowStockThreshold ?? 0;
        const threshold = ing.defaultPortionUnit
          ? (convertUnits(
              rawThreshold,
              ing.defaultPortionUnit,
              entry.unit,
              getIngredientConversions(ing, customUnitConversions, ingredients),
            ) ?? rawThreshold)
          : rawThreshold;
        state = remaining > threshold ? "green" : remaining >= 0 ? "yellow" : "red";
      }

      if (availability === null) availability = state;
      else if (state === "red") { availability = "red"; break; }
      else if (state === "yellow" && availability === "green") availability = "yellow";
    }
    const dotColor =
      availability === "green" ? "#34D399" :
      availability === "yellow" ? "#FBBF24" :
      availability === "red" ? "#F87171" : null;

    return (
      <ReanimatedSwipeable
        key={recipe._id}
        friction={2}
        rightThreshold={40}
        renderLeftActions={() => swipeAction("trash-outline", () => handleDeleteRecipe(recipe._id, recipe.name))}
      >
        <Tap
          style={row}
          pressedStyle={{ backgroundColor: c.pill }}
          onPress={() => router.push({ pathname: "/recipes/[id]", params: { id: recipe._id } })}
        >
          <RecipeThumb imageUrl={recipe.imageUrl} size={40} fallback={tile("book-outline")} />

          <View style={{ marginLeft: 14, flex: 1 }}>
            <Text style={nameText}>{recipe.name}</Text>
            {sortMode === "category" ? (
              <Text style={detail}>{getMealLabel(recipe.mealCategory)}</Text>
            ) : getRecipeCategoryName(recipe) ? (
              <Text style={detail}>{getRecipeCategoryName(recipe)}</Text>
            ) : recipe.description ? (
              <Text style={detail} numberOfLines={1}>{recipe.description}</Text>
            ) : null}
          </View>

          <View style={{ alignItems: "flex-end" }}>
            {recipe.nutrition?.calories ? (
              <>
                <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }}>
                  {Math.round(recipe.nutrition.calories)} kcal
                </Text>
                <Text style={{ fontSize: 12, color: c.faint }}>per serving</Text>
              </>
            ) : (
              <Text style={{ fontSize: 14, color: c.faint }}>
                {recipe.ingredientList.length}{" "}
                {recipe.ingredientList.length === 1 ? "ingredient" : "ingredients"}
              </Text>
            )}
          </View>

          {dotColor && (
            <View style={{ marginLeft: 12, width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor }} />
          )}
          <Ionicons name="chevron-forward" size={18} color={c.faint} style={{ marginLeft: 8 }} />
        </Tap>
      </ReanimatedSwipeable>
    );
  };

  return (
    <OrbitPage>
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={{ flex: 1 }}>
        {/* Horizontal paging scroll — Page 1: Restaurants, Page 2: Meals, Page 3: Recipes */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          onMomentumScrollEnd={handleHorizontalScrollEnd}
        >
          {/* Page 1: Restaurant meals */}
          <View style={{ width: screenWidth, flex: 1 }}>
            <FlatList
              data={restaurantMealsForBrowse}
              keyExtractor={(r) => r._id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: 96,
                paddingBottom: 120,
              }}
              ListHeaderComponent={
                <View style={{ marginBottom: 16 }}>
                  {pageTitle("Restaurants", `${restaurantMeals.length} ${restaurantMeals.length === 1 ? "restaurant" : "restaurants"}`)}
                  <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center" }}>
                    {dots(0)}
                    <Text style={hint}>Swipe left for meals</Text>
                  </View>
                </View>
              }
              ListEmptyComponent={emptyCard(
                "storefront-outline",
                restaurantSearchText ? "No restaurants found" : "No restaurant meals yet",
                restaurantSearchText ? "Try a different search term." : "Tap + to log a visit.",
              )}
              renderItem={({ item }) => (
                <ReanimatedSwipeable
                  key={item._id}
                  friction={2}
                  rightThreshold={40}
                  renderLeftActions={() => swipeAction("archive-outline", () => handleArchiveRestaurantMeal(item))}
                >
                  <Tap
                    style={row}
                    pressedStyle={{ backgroundColor: c.pill }}
                    onPress={() => router.push({ pathname: "/restaurant-meals/[id]", params: { id: item._id } })}
                  >
                    {tile("storefront-outline")}
                    <View style={{ marginLeft: 14, flex: 1 }}>
                      <Text style={nameText}>{item.restaurantName}</Text>
                      <Text style={detail} numberOfLines={1}>
                        {item.dishes.map((d) => d.name).join(", ") || "No dishes yet"}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={c.faint} />
                  </Tap>
                </ReanimatedSwipeable>
              )}
            />
          </View>

          {/* Page 2: Meals */}
          <View style={{ width: screenWidth, flex: 1 }}>
            <FlatList
              data={mealsForBrowse}
              keyExtractor={m => m._id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: 96,
                paddingBottom: 120,
              }}
              ListHeaderComponent={
                <View style={{ marginBottom: 16 }}>
                  {pageTitle("Your Meals", `${meals.length} ${meals.length === 1 ? "meal" : "meals"}`)}
                  <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center" }}>
                    {dots(1)}
                    <Text style={hint}>Swipe for restaurants or recipes</Text>
                  </View>
                </View>
              }
              ListEmptyComponent={emptyCard(
                "restaurant-outline",
                mealSearchText ? "No meals found" : "No meals yet",
                mealSearchText ? "Try a different search term." : "Tap + to plan your first meal.",
              )}
              renderItem={({ item: meal }) => (
                <ReanimatedSwipeable
                  key={meal._id}
                  friction={2}
                  rightThreshold={40}
                  renderLeftActions={() => swipeAction("trash-outline", () => handleDeleteMeal(meal._id, meal.name))}
                >
                  <Tap
                    style={row}
                    pressedStyle={{ backgroundColor: c.pill }}
                    onPress={() => router.push({ pathname: "/meals/[id]", params: { id: meal._id } })}
                  >
                    {tile("restaurant-outline")}

                    <View style={{ marginLeft: 14, flex: 1 }}>
                      <Text style={nameText}>{meal.name}</Text>
                      <Text style={detail}>
                        {meal.courses?.length ?? 0}{" "}
                        {(meal.courses?.length ?? 0) === 1 ? "course" : "courses"}
                      </Text>
                      {(meal.tags ?? []).length > 0 && (
                        <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                          {(meal.tags ?? []).map(tag => (
                            <View key={tag._id} style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: c.pill }}>
                              <Text style={{ fontSize: 12, fontWeight: "500", color: c.onPill }}>{tag.name}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>

                    {(() => {
                      const cal = getMealCalories(meal);
                      return cal != null ? (
                        <View style={{ marginRight: 12, alignItems: "flex-end" }}>
                          <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }}>{cal} kcal</Text>
                          <Text style={{ fontSize: 12, color: c.faint }}>total</Text>
                        </View>
                      ) : (
                        <View style={{ marginRight: 8, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: c.pill }}>
                          <Text style={{ fontSize: 12, fontWeight: "600", color: c.onPill }}>Course</Text>
                        </View>
                      );
                    })()}

                    {(() => {
                      const av = getMealAvailability(meal, recipeMap, ingredientMap, ingredients, pantryItems, customUnitConversions);
                      const color = av === "green" ? "#34D399" : av === "yellow" ? "#FBBF24" : av === "red" ? "#F87171" : null;
                      return color ? <View style={{ marginLeft: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: color }} /> : null;
                    })()}

                    <Ionicons name="chevron-forward" size={18} color={c.faint} style={{ marginLeft: 8 }} />
                  </Tap>
                </ReanimatedSwipeable>
              )}
            />
          </View>

          {/* Page 3: Recipes */}
          <View style={{ width: screenWidth, flex: 1 }}>
            <FlatList
              data={groupedRecipes}
              keyExtractor={(group) => group.key}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: 96,
                paddingBottom: 120,
              }}
              ListHeaderComponent={
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    {pageTitle("Recipes", `${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"}`)}
                    {segments<SortMode>([["category", "Category"], ["meal", "Meal"], ["mealPrep", "Meal Prep"]], sortMode, handleSortMode, false)}
                  </View>
                  <View style={{ marginTop: 12 }}>
                    {segments<"all" | "wantToTry" | "confirmed">([["all", "All"], ["confirmed", "Confirmed"], ["wantToTry", "Want to Try"]], statusFilter, setStatusFilter, true)}
                  </View>
                  <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center" }}>
                    {dots(2)}
                    <Text style={[hint, { flex: 1 }]}>Swipe right for meals</Text>
                    {/* Every group open, or every group shut. */}
                    {groupedRecipes.length > 1 && (
                      <Tap
                        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}
                        pressedStyle={{ opacity: 0.6 }}
                        onPress={() => setExpandedGroups(allOpen ? new Set() : new Set(groupedRecipes.map((g) => g.key)))}
                      >
                        <Ionicons name={allOpen ? "chevron-collapse" : "chevron-expand"} size={14} color={c.accent} />
                        <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: "600", color: c.accent }}>{allOpen ? "Collapse all" : "Expand all"}</Text>
                      </Tap>
                    )}
                  </View>
                </View>
              }
              ListEmptyComponent={emptyCard(
                "book-outline",
                searchText ? "No recipes found" : "No recipes yet",
                searchText ? "Try a different search term." : "Tap + to add your first recipe.",
              )}
              renderItem={({ item: group }) => {
                const isCollapsed = !expandedGroups.has(group.key);
                return (
                  <View style={{ marginBottom: 8 }}>
                    <Pressable
                      style={{ marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, paddingHorizontal: 4 }}
                      onPress={() => toggleGroup(group.key)}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", color: c.faint }}>
                        {group.label}
                        <Text style={{ fontWeight: "400" }}> ({group.items.length})</Text>
                      </Text>
                      <Ionicons
                        name={isCollapsed ? "chevron-forward" : "chevron-down"}
                        size={16}
                        color={c.faint}
                      />
                    </Pressable>
                    {!isCollapsed && group.items.map(recipeCard)}
                  </View>
                );
              }}
            />
          </View>
        </ScrollView>

        {isSearchActive && activePage === "recipes" && scrim(closeSearch)}
        {isMealSearchActive && activePage === "meals" && scrim(closeMealSearch)}
        {isRestaurantSearchActive && activePage === "restaurant" && scrim(closeRestaurantSearch)}

        {/* Floating bar — search on each page, and + */}
        {activePage === "recipes" &&
          searchPanel({
            open: isSearchActive,
            value: searchText,
            onChangeText: setSearchText,
            onFocus: () => setIsSearchActive(true),
            placeholder: "Search recipes",
            onAdd: () => router.push("/recipes/add"),
            title: "Recipes",
            onCancel: closeSearch,
            results: (
              <FlatList
                data={filteredRecipes}
                keyExtractor={(r) => r._id}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                renderItem={({ item: recipe }) => (
                  <Tap
                    style={searchRow}
                    pressedStyle={{ backgroundColor: c.pill }}
                    onPress={() => {
                      closeSearch();
                      router.push({ pathname: "/recipes/[id]", params: { id: recipe._id } });
                    }}
                  >
                    <RecipeThumb imageUrl={recipe.imageUrl} size={44} fallback={tile("book-outline", 44)} />
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "600", color: c.text }}>{recipe.name}</Text>
                      <Text style={detail}>{getMealLabel(recipe.mealCategory)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={c.faint} />
                  </Tap>
                )}
                ListEmptyComponent={searchEmpty("No recipes found")}
              />
            ),
          })}

        {activePage === "meals" &&
          searchPanel({
            open: isMealSearchActive,
            value: mealSearchText,
            onChangeText: setMealSearchText,
            onFocus: () => setIsMealSearchActive(true),
            placeholder: "Search meals or tags",
            onAdd: () => router.push("/meals/add"),
            title: "Meals",
            onCancel: closeMealSearch,
            results: (
              <FlatList
                data={filteredMeals}
                keyExtractor={m => m._id}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                renderItem={({ item: meal }) => (
                  <Tap
                    style={searchRow}
                    pressedStyle={{ backgroundColor: c.pill }}
                    onPress={() => {
                      setIsMealSearchActive(false);
                      setMealSearchText("");
                      Keyboard.dismiss();
                      router.push({ pathname: "/meals/[id]", params: { id: meal._id } });
                    }}
                  >
                    {tile("restaurant-outline", 44)}
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "600", color: c.text }}>{meal.name}</Text>
                      <Text style={detail}>
                        {meal.courses?.length ?? 0} {(meal.courses?.length ?? 0) === 1 ? "course" : "courses"}
                      </Text>
                    </View>
                    {(() => {
                      const av = getMealAvailability(meal, recipeMap, ingredientMap, ingredients, pantryItems, customUnitConversions);
                      const color = av === "green" ? "#34D399" : av === "yellow" ? "#FBBF24" : av === "red" ? "#F87171" : null;
                      return color ? <View style={{ marginRight: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: color }} /> : null;
                    })()}
                    <Ionicons name="chevron-forward" size={18} color={c.faint} />
                  </Tap>
                )}
                ListEmptyComponent={searchEmpty("No meals found")}
              />
            ),
          })}

        {activePage === "restaurant" &&
          searchPanel({
            open: isRestaurantSearchActive,
            value: restaurantSearchText,
            onChangeText: setRestaurantSearchText,
            onFocus: () => setIsRestaurantSearchActive(true),
            placeholder: "Search restaurants or dishes",
            onAdd: () => router.push("/restaurant-meals/add"),
            title: "Restaurants",
            onCancel: closeRestaurantSearch,
            results: (
              <FlatList
                data={filteredRestaurantMeals}
                keyExtractor={(r) => r._id}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Tap
                    style={searchRow}
                    pressedStyle={{ backgroundColor: c.pill }}
                    onPress={() => {
                      setIsRestaurantSearchActive(false);
                      setRestaurantSearchText("");
                      Keyboard.dismiss();
                      router.push({ pathname: "/restaurant-meals/[id]", params: { id: item._id } });
                    }}
                  >
                    {tile("storefront-outline", 44)}
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "600", color: c.text }}>{item.restaurantName}</Text>
                      <Text style={detail} numberOfLines={1}>
                        {item.dishes.map((d) => d.name).join(", ") || "No dishes yet"}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={c.faint} />
                  </Tap>
                )}
                ListEmptyComponent={searchEmpty("No restaurants found")}
              />
            ),
          })}
      </View>
    </SafeAreaView>
    </OrbitPage>
  );
}
