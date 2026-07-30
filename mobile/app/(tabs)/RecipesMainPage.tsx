import { useCallback, useMemo, useRef, useState } from "react";
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
  useWindowDimensions,
  View,
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
import { getPantryItems } from "@/src/services/pantryApi";
import type { PantryItem } from "@/src/types/pantry";
import { loadSettings } from "@/src/services/settingsService";
import { convertUnits, getIngredientConversions, type CustomUnitConversion } from "@/src/utils/unitConversion";
import { getIngredientStockInUnit } from "@/src/utils/ingredientStock";

type SortMode = "category" | "meal";

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
    const ref = course.recipe;
    if (!ref) continue;
    const recipeId = typeof ref === "string" ? ref : ref._id;
    const recipe = recipeMap.get(recipeId);
    if (!recipe?.ingredientList?.length) continue;
    for (const entry of recipe.ingredientList) {
      const ingId = typeof entry.ingredient === "string"
        ? entry.ingredient
        : (entry.ingredient as { _id: string })._id;
      const ing = ingredientMap.get(ingId);
      if (!ing) continue;
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
      const state: "green" | "yellow" | "red" =
        remaining > threshold ? "green" : remaining >= 0 ? "yellow" : "red";
      if (overall === null) overall = state;
      else if (state === "red") { overall = "red"; break; }
      else if (state === "yellow" && overall === "green") overall = "yellow";
    }
  }
  return overall;
}

function getMealCalories(meal: Meal): number | null {
  if (!meal.courses?.length) return null;
  let total = 0;
  let hasAny = false;
  for (const course of meal.courses) {
    const recipe = course.recipe;
    if (!recipe || typeof recipe === "string") continue;
    if (recipe.nutrition?.calories != null) {
      total += recipe.nutrition.calories * course.servings;
      hasAny = true;
    }
  }
  return hasAny ? Math.round(total) : null;
}

export default function RecipesMainPage() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

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
  const [activePage, setActivePage] = useState<"meals" | "recipes">("meals");
  const scrollRef = useRef<ScrollView>(null);
  const [mealSearchText, setMealSearchText] = useState("");
  const [isMealSearchActive, setIsMealSearchActive] = useState(false);
  const [mealSearchMode, setMealSearchMode] = useState<"name" | "tag">("name");
  const [meals, setMeals] = useState<Meal[]>([]);

  const isFirstLoad = useRef(true);

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
      return [
        recipe.name,
        recipe.description ?? "",
        getRecipeCategoryName(recipe),
        mealCats,
      ].some((v) => v.toLowerCase().includes(query));
    });
  }, [recipes, searchText, statusFilter]);

  const groupedRecipes = useMemo<RecipeGroup[]>(() => {
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
  }, [filteredRecipes, sortMode]);

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
    setActivePage(pageIndex === 0 ? "meals" : "recipes");
    Keyboard.dismiss();
    setIsSearchActive(false);
    setSearchText("");
    setIsMealSearchActive(false);
    setMealSearchText("");
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

  const filteredMeals = useMemo(() => {
    const query = mealSearchText.trim().toLowerCase();
    if (!query) return meals;
    if (mealSearchMode === "tag") {
      return meals.filter(m =>
        (m.tags ?? []).some(t => t.name.toLowerCase().includes(query)),
      );
    }
    return meals.filter(m => m.name.toLowerCase().includes(query));
  }, [meals, mealSearchText, mealSearchMode]);

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

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" />
        <Text className="mt-3 text-slate-500">Loading recipes...</Text>
      </SafeAreaView>
    );
  }

  const recipeCard = (recipe: Recipe) => {
    let availability: "green" | "yellow" | "red" | null = null;
    for (const entry of recipe.ingredientList) {
      const ingId = typeof entry.ingredient === "string"
        ? entry.ingredient
        : (entry.ingredient as { _id: string })._id;
      const ing = ingredientMap.get(ingId);
      if (!ing) continue;
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
      const state: "green" | "yellow" | "red" =
        remaining > threshold ? "green" : remaining >= 0 ? "yellow" : "red";
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
        renderLeftActions={() => (
          <Pressable
            className="mb-2.5 w-20 items-center justify-center rounded-2xl bg-red-500 active:bg-red-600"
            onPress={() => handleDeleteRecipe(recipe._id, recipe.name)}
          >
            <Ionicons name="trash-outline" size={22} color="white" />
          </Pressable>
        )}
      >
        <Pressable
          className="mb-2.5 flex-row items-center rounded-2xl border border-slate-200 bg-white p-4"
          onPress={() => router.push({ pathname: "/recipes/[id]", params: { id: recipe._id } })}
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-blue-50">
            <Ionicons name="book-outline" size={18} color="#2563EB" />
          </View>

          <View className="ml-4 flex-1">
            <Text className="text-base font-bold text-slate-900">{recipe.name}</Text>
            {sortMode === "category" ? (
              <Text className="mt-0.5 text-sm text-slate-500">{getMealLabel(recipe.mealCategory)}</Text>
            ) : getRecipeCategoryName(recipe) ? (
              <Text className="mt-0.5 text-sm text-slate-500">{getRecipeCategoryName(recipe)}</Text>
            ) : recipe.description ? (
              <Text className="mt-0.5 text-sm text-slate-500" numberOfLines={1}>{recipe.description}</Text>
            ) : null}
          </View>

          <View className="items-end">
            {recipe.nutrition?.calories ? (
              <>
                <Text className="text-sm font-semibold text-slate-700">
                  {Math.round(recipe.nutrition.calories)} kcal
                </Text>
                <Text className="text-xs text-slate-400">per serving</Text>
              </>
            ) : (
              <Text className="text-sm text-slate-400">
                {recipe.ingredientList.length}{" "}
                {recipe.ingredientList.length === 1 ? "ingredient" : "ingredients"}
              </Text>
            )}
          </View>

          {dotColor && (
            <View className="ml-3 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
          )}
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" style={{ marginLeft: 8 }} />
        </Pressable>
      </ReanimatedSwipeable>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <View className="flex-1">
        {/* Horizontal paging scroll — Page 1: Meals, Page 2: Recipes */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          className="flex-1"
          onMomentumScrollEnd={handleHorizontalScrollEnd}
        >
          {/* Page 1: Meals */}
          <View style={{ width: screenWidth }} className="flex-1">
            <FlatList
              data={filteredMeals}
              keyExtractor={m => m._id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 100,
                paddingBottom: 120,
              }}
              ListHeaderComponent={
                <View className="mb-4">
                  <View>
                    <Text className="text-3xl font-bold text-slate-950">Your Meals</Text>
                    <Text className="mt-1 text-base text-slate-500">
                      {meals.length} {meals.length === 1 ? "meal" : "meals"}
                    </Text>
                  </View>
                  <View className="mt-3 flex-row items-center">
                    <View className="h-2 w-6 rounded-full bg-blue-600" />
                    <View className="ml-2 h-2 w-2 rounded-full bg-slate-300" />
                    <Text className="ml-3 text-xs font-medium text-slate-400">
                      Swipe left for all recipes
                    </Text>
                  </View>
                </View>
              }
              ListEmptyComponent={
                <View className="items-center rounded-2xl border border-slate-200 bg-white px-6 py-16">
                  <Ionicons name="restaurant-outline" size={42} color="#94A3B8" />
                  <Text className="mt-4 text-lg font-bold text-slate-900">
                    {mealSearchText ? "No meals found" : "No meals yet"}
                  </Text>
                  <Text className="mt-2 text-center text-slate-500">
                    {mealSearchText
                      ? "Try a different search term."
                      : "Tap + to plan your first meal."}
                  </Text>
                </View>
              }
              renderItem={({ item: meal }) => (
                <ReanimatedSwipeable
                  key={meal._id}
                  friction={2}
                  rightThreshold={40}
                  renderLeftActions={() => (
                    <Pressable
                      className="mb-2.5 w-20 items-center justify-center rounded-2xl bg-red-500 active:bg-red-600"
                      onPress={() => handleDeleteMeal(meal._id, meal.name)}
                    >
                      <Ionicons name="trash-outline" size={22} color="white" />
                    </Pressable>
                  )}
                >
                  <Pressable
                    className="mb-2.5 flex-row items-center rounded-2xl border border-slate-200 bg-white p-4 active:bg-slate-50"
                    onPress={() => router.push({ pathname: "/meals/[id]", params: { id: meal._id } })}
                  >
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                      <Ionicons name="restaurant-outline" size={18} color="#2563EB" />
                    </View>

                    <View className="ml-4 flex-1">
                      <Text className="text-base font-bold text-slate-900">{meal.name}</Text>
                      <Text className="mt-0.5 text-sm text-slate-500">
                        {meal.courses?.length ?? 0}{" "}
                        {(meal.courses?.length ?? 0) === 1 ? "course" : "courses"}
                      </Text>
                      {(meal.tags ?? []).length > 0 && (
                        <View className="mt-1.5 flex-row flex-wrap gap-1">
                          {(meal.tags ?? []).map(tag => (
                            <View key={tag._id} className="rounded-full bg-emerald-100 px-2 py-0.5">
                              <Text className="text-xs font-medium text-emerald-700">{tag.name}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>

                    {(() => {
                      const cal = getMealCalories(meal);
                      return cal != null ? (
                        <View className="mr-3 items-end">
                          <Text className="text-sm font-semibold text-slate-700">{cal} kcal</Text>
                          <Text className="text-xs text-slate-400">total</Text>
                        </View>
                      ) : (
                        <View className="mr-2 rounded-full bg-blue-100 px-2.5 py-1">
                          <Text className="text-xs font-semibold text-blue-700">Course</Text>
                        </View>
                      );
                    })()}

                    {(() => {
                      const av = getMealAvailability(meal, recipeMap, ingredientMap, ingredients, pantryItems, customUnitConversions);
                      const color = av === "green" ? "#34D399" : av === "yellow" ? "#FBBF24" : av === "red" ? "#F87171" : null;
                      return color ? <View className="ml-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} /> : null;
                    })()}

                    <Ionicons name="chevron-forward" size={20} color="#94A3B8" style={{ marginLeft: 8 }} />
                  </Pressable>
                </ReanimatedSwipeable>
              )}
            />
          </View>

          {/* Page 2: Recipes */}
          <View style={{ width: screenWidth }} className="flex-1">
            <FlatList
              data={groupedRecipes}
              keyExtractor={(group) => group.key}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 100,
                paddingBottom: 120,
              }}
              ListHeaderComponent={
                <View className="mb-4">
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text className="text-3xl font-bold text-slate-950">Recipes</Text>
                      <Text className="mt-1 text-base text-slate-500">
                        {recipes.length} {recipes.length === 1 ? "recipe" : "recipes"}
                      </Text>
                    </View>
                    <View className="flex-row overflow-hidden rounded-xl border border-slate-200">
                      <Pressable
                        className={`px-3 py-1.5 ${sortMode === "category" ? "bg-blue-600" : "bg-white"}`}
                        onPress={() => handleSortMode("category")}
                      >
                        <Text className={`text-xs font-semibold ${sortMode === "category" ? "text-white" : "text-slate-600"}`}>
                          Category
                        </Text>
                      </Pressable>
                      <Pressable
                        className={`border-l border-slate-200 px-3 py-1.5 ${sortMode === "meal" ? "bg-blue-600" : "bg-white"}`}
                        onPress={() => handleSortMode("meal")}
                      >
                        <Text className={`text-xs font-semibold ${sortMode === "meal" ? "text-white" : "text-slate-600"}`}>
                          Meal
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                  <View className="mt-3 flex-row overflow-hidden rounded-xl border border-slate-200">
                    <Pressable
                      className={`flex-1 items-center py-1.5 ${statusFilter === "all" ? "bg-blue-600" : "bg-white"}`}
                      onPress={() => setStatusFilter("all")}
                    >
                      <Text className={`text-xs font-semibold ${statusFilter === "all" ? "text-white" : "text-slate-600"}`}>
                        All
                      </Text>
                    </Pressable>
                    <Pressable
                      className={`flex-1 items-center border-l border-slate-200 py-1.5 ${statusFilter === "confirmed" ? "bg-blue-600" : "bg-white"}`}
                      onPress={() => setStatusFilter("confirmed")}
                    >
                      <Text className={`text-xs font-semibold ${statusFilter === "confirmed" ? "text-white" : "text-slate-600"}`}>
                        Tried!
                      </Text>
                    </Pressable>
                    <Pressable
                      className={`flex-1 items-center border-l border-slate-200 py-1.5 ${statusFilter === "wantToTry" ? "bg-blue-600" : "bg-white"}`}
                      onPress={() => setStatusFilter("wantToTry")}
                    >
                      <Text className={`text-xs font-semibold ${statusFilter === "wantToTry" ? "text-white" : "text-slate-600"}`}>
                        Want to Try
                      </Text>
                    </Pressable>
                  </View>
                  <View className="mt-3 flex-row items-center">
                    <View className="h-2 w-2 rounded-full bg-slate-300" />
                    <View className="ml-2 h-2 w-6 rounded-full bg-blue-600" />
                    <Text className="ml-3 text-xs font-medium text-slate-400">
                      Swipe right for meals
                    </Text>
                  </View>
                </View>
              }
              ListEmptyComponent={
                <View className="items-center rounded-2xl border border-slate-200 bg-white px-6 py-16">
                  <Ionicons name="book-outline" size={42} color="#94A3B8" />
                  <Text className="mt-4 text-lg font-bold text-slate-900">
                    {searchText ? "No recipes found" : "No recipes yet"}
                  </Text>
                  <Text className="mt-2 text-center text-slate-500">
                    {searchText ? "Try a different search term." : "Tap + to add your first recipe."}
                  </Text>
                </View>
              }
              renderItem={({ item: group }) => {
                const isCollapsed = !expandedGroups.has(group.key);
                return (
                  <View className="mb-2">
                    <Pressable
                      className="mb-2 flex-row items-center justify-between py-1"
                      onPress={() => toggleGroup(group.key)}
                    >
                      <Text className="text-sm font-bold uppercase tracking-wide text-slate-500">
                        {group.label}
                        <Text className="font-normal"> ({group.items.length})</Text>
                      </Text>
                      <Ionicons
                        name={isCollapsed ? "chevron-forward" : "chevron-down"}
                        size={16}
                        color="#94A3B8"
                      />
                    </Pressable>
                    {!isCollapsed && group.items.map(recipeCard)}
                  </View>
                );
              }}
            />
          </View>
        </ScrollView>

        {isSearchActive && activePage === "recipes" && (
          <Pressable className="absolute inset-0 z-10 bg-black/30" onPress={closeSearch} />
        )}

        {isMealSearchActive && activePage === "meals" && (
          <Pressable
            className="absolute inset-0 z-10 bg-black/30"
            onPress={() => {
              setIsMealSearchActive(false);
              setMealSearchText("");
              Keyboard.dismiss();
            }}
          />
        )}

        {/* Floating bar — search on recipes page, plain + on meals page */}
        {activePage === "recipes" && (
          <View
            className={`absolute left-4 right-4 top-3 z-20 overflow-hidden rounded-3xl bg-white shadow-lg ${
              isSearchActive ? "bottom-4" : ""
            }`}
          >
            <View className="flex-row items-center p-3">
              <View className="h-12 flex-1 flex-row items-center rounded-2xl bg-slate-100 px-4">
                <Ionicons name="search-outline" size={21} color="#64748b" />
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  onFocus={() => setIsSearchActive(true)}
                  placeholder="Search recipes"
                  placeholderTextColor="#94a3b8"
                  className="ml-3 flex-1 text-base text-slate-900"
                />
                {searchText.length > 0 && (
                  <Pressable onPress={() => setSearchText("")}>
                    <Ionicons name="close-circle" size={21} color="#94a3b8" />
                  </Pressable>
                )}
              </View>
              <Pressable
                className="ml-3 h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 active:bg-blue-700"
                onPress={() => router.push("/recipes/add")}
              >
                <Ionicons name="add" size={28} color="white" />
              </Pressable>
            </View>

            {isSearchActive && (
              <View className="flex-1 border-t border-slate-100 px-4 pb-4">
                <View className="flex-row items-center justify-between py-3">
                  <Text className="text-lg font-bold text-slate-900">Recipes</Text>
                  <Pressable onPress={closeSearch}>
                    <Text className="font-semibold text-blue-700">Cancel</Text>
                  </Pressable>
                </View>
                <FlatList
                  data={filteredRecipes}
                  keyExtractor={(r) => r._id}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item: recipe }) => (
                    <Pressable
                      className="mb-2 flex-row items-center rounded-2xl bg-slate-50 p-3"
                      onPress={() => {
                        closeSearch();
                        router.push({ pathname: "/recipes/[id]", params: { id: recipe._id } });
                      }}
                    >
                      <View className="h-11 w-11 items-center justify-center rounded-full bg-blue-50">
                        <Ionicons name="book-outline" size={21} color="#2563EB" />
                      </View>
                      <View className="ml-3 flex-1">
                        <Text className="font-semibold text-slate-900">{recipe.name}</Text>
                        <Text className="mt-0.5 text-sm text-slate-500">
                          {getMealLabel(recipe.mealCategory)}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                    </Pressable>
                  )}
                  ListEmptyComponent={
                    <View className="items-center px-6 py-16">
                      <Ionicons name="search-outline" size={42} color="#94a3b8" />
                      <Text className="mt-4 text-lg font-bold text-slate-900">No recipes found</Text>
                      <Text className="mt-2 text-center text-slate-500">
                        Try searching with different keywords.
                      </Text>
                    </View>
                  }
                />
              </View>
            )}
          </View>
        )}

        {activePage === "meals" && (
          <View
            className={`absolute left-4 right-4 top-3 z-20 overflow-hidden rounded-3xl bg-white shadow-lg ${
              isMealSearchActive ? "bottom-4" : ""
            }`}
          >
            <View className="flex-row items-center p-3">
              <View className="h-12 flex-1 flex-row items-center rounded-2xl bg-slate-100 px-4">
                <Ionicons name="search-outline" size={21} color="#64748b" />
                <TextInput
                  value={mealSearchText}
                  onChangeText={setMealSearchText}
                  onFocus={() => setIsMealSearchActive(true)}
                  placeholder={mealSearchMode === "tag" ? "Search by tag…" : "Search meals"}
                  placeholderTextColor="#94a3b8"
                  className="ml-3 flex-1 text-base text-slate-900"
                />
                {mealSearchText.length > 0 && (
                  <Pressable onPress={() => setMealSearchText("")}>
                    <Ionicons name="close-circle" size={21} color="#94a3b8" />
                  </Pressable>
                )}
              </View>
              <Pressable
                className="ml-3 h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 active:bg-blue-700"
                onPress={() => router.push("/meals/add")}
              >
                <Ionicons name="add" size={28} color="white" />
              </Pressable>
            </View>

            {isMealSearchActive && (
              <View className="flex-1 border-t border-slate-100 px-4 pb-4">
                <View className="flex-row items-center justify-between py-3">
                  <Text className="text-lg font-bold text-slate-900">Meals</Text>
                  <View className="flex-row items-center gap-3">
                    <View className="flex-row overflow-hidden rounded-xl border border-slate-200">
                      <Pressable
                        className={`px-3 py-1.5 ${mealSearchMode === "name" ? "bg-blue-600" : "bg-white"}`}
                        onPress={() => setMealSearchMode("name")}
                      >
                        <Text className={`text-xs font-semibold ${mealSearchMode === "name" ? "text-white" : "text-slate-600"}`}>
                          Meal
                        </Text>
                      </Pressable>
                      <Pressable
                        className={`border-l border-slate-200 px-3 py-1.5 ${mealSearchMode === "tag" ? "bg-blue-600" : "bg-white"}`}
                        onPress={() => setMealSearchMode("tag")}
                      >
                        <Text className={`text-xs font-semibold ${mealSearchMode === "tag" ? "text-white" : "text-slate-600"}`}>
                          Tag
                        </Text>
                      </Pressable>
                    </View>
                    <Pressable
                      onPress={() => {
                        setIsMealSearchActive(false);
                        setMealSearchText("");
                        Keyboard.dismiss();
                      }}
                    >
                      <Text className="font-semibold text-blue-700">Cancel</Text>
                    </Pressable>
                  </View>
                </View>
                <FlatList
                  data={filteredMeals}
                  keyExtractor={m => m._id}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item: meal }) => (
                    <Pressable
                      className="mb-2 flex-row items-center rounded-2xl bg-slate-50 p-3"
                      onPress={() => {
                        setIsMealSearchActive(false);
                        setMealSearchText("");
                        Keyboard.dismiss();
                        router.push({ pathname: "/meals/[id]", params: { id: meal._id } });
                      }}
                    >
                      <View className="h-11 w-11 items-center justify-center rounded-full bg-blue-50">
                        <Ionicons name="restaurant-outline" size={21} color="#2563EB" />
                      </View>
                      <View className="ml-3 flex-1">
                        <Text className="font-semibold text-slate-900">{meal.name}</Text>
                        <Text className="mt-0.5 text-sm text-slate-500">
                          {meal.courses?.length ?? 0} {(meal.courses?.length ?? 0) === 1 ? "course" : "courses"}
                        </Text>
                      </View>
                      {(() => {
                        const av = getMealAvailability(meal, recipeMap, ingredientMap, ingredients, pantryItems, customUnitConversions);
                        const color = av === "green" ? "#34D399" : av === "yellow" ? "#FBBF24" : av === "red" ? "#F87171" : null;
                        return color ? <View className="mr-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} /> : null;
                      })()}
                      <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                    </Pressable>
                  )}
                  ListEmptyComponent={
                    <View className="items-center px-6 py-16">
                      <Ionicons name="search-outline" size={42} color="#94a3b8" />
                      <Text className="mt-4 text-lg font-bold text-slate-900">No meals found</Text>
                      <Text className="mt-2 text-center text-slate-500">
                        Try searching with different keywords.
                      </Text>
                    </View>
                  }
                />
              </View>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
