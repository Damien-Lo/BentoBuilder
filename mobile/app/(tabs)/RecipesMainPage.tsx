import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  deleteRecipe,
  getRecipes,
  type MealCategory,
  type Recipe,
} from "@/src/services/recipeApi";
import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import { getPantryItems } from "@/src/services/pantryApi";
import type { PantryItem } from "@/src/types/pantry";

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

export default function RecipesMainPage() {
  const router = useRouter();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("category");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const [loaded, loadedIngredients, loadedPantry] = await Promise.all([
          getRecipes(),
          getIngredients(),
          getPantryItems(),
        ]);
        if (!cancelled) {
          setRecipes(Array.isArray(loaded) ? loaded : []);
          setIngredients(Array.isArray(loadedIngredients) ? loadedIngredients : []);
          setPantryItems(Array.isArray(loadedPantry) ? loadedPantry : []);
        }
      } catch (error) {
        console.error("Error loading recipes:", error);
        if (!cancelled) setRecipes([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  const ingredientMap = useMemo(
    () => new Map(ingredients.map((i) => [i._id, i])),
    [ingredients],
  );

  const pantryStockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of pantryItems) {
      const raw = item.ingredient as unknown;
      const ingId =
        typeof raw === "string"
          ? raw
          : typeof raw === "object" && raw !== null && "_id" in raw
            ? String((raw as Record<string, unknown>)._id)
            : "";
      if (!ingId) continue;
      map.set(ingId, (map.get(ingId) ?? 0) + (item.quantityAvailable ?? 0));
    }
    return map;
  }, [pantryItems]);

  // Reset collapsed groups when switching sort mode
  const handleSortMode = (mode: SortMode) => {
    setSortMode(mode);
    setCollapsedGroups(mode === "meal" ? new Set(MEAL_CATEGORY_ORDER) : new Set());
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredRecipes = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return recipes;
    return recipes.filter((recipe) => {
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
  }, [recipes, searchText]);

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

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" />
        <Text className="mt-3 text-slate-500">Loading recipes...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <View className="flex-1">
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
            <View className="mb-4 flex-row items-center justify-between">
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
                  className={`px-3 py-1.5 border-l border-slate-200 ${sortMode === "meal" ? "bg-blue-600" : "bg-white"}`}
                  onPress={() => handleSortMode("meal")}
                >
                  <Text className={`text-xs font-semibold ${sortMode === "meal" ? "text-white" : "text-slate-600"}`}>
                    Meal
                  </Text>
                </Pressable>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View className="items-center rounded-3xl bg-white px-6 py-16 shadow-sm">
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
            const isCollapsed = collapsedGroups.has(group.key);
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

                {!isCollapsed && group.items.map((recipe) => {
                  // Worst-case pantry availability across all ingredients
                  let availability: "green" | "yellow" | "red" | null = null;
                  for (const entry of recipe.ingredientList) {
                    const ingId = typeof entry.ingredient === "string"
                      ? entry.ingredient
                      : (entry.ingredient as { _id: string })._id;
                    const ing = ingredientMap.get(ingId);
                    if (!ing) continue;
                    const inStock = pantryStockMap.get(ingId) ?? 0;
                    const remaining = inStock - entry.quantity;
                    const threshold = ing.lowStockThreshold ?? 0;
                    const state: "green" | "yellow" | "red" =
                      remaining > threshold ? "green" :
                      remaining >= 0 ? "yellow" : "red";
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
                        className="mb-3 w-20 items-center justify-center rounded-3xl bg-red-500 active:bg-red-600"
                        onPress={() => handleDeleteRecipe(recipe._id, recipe.name)}
                      >
                        <Ionicons name="trash-outline" size={22} color="white" />
                      </Pressable>
                    )}
                  >
                    <Pressable
                      className="mb-3 flex-row items-center rounded-3xl bg-white p-4 shadow-sm"
                      onPress={() => {
                        router.push({ pathname: "/recipes/[id]", params: { id: recipe._id } });
                      }}
                    >
                      <View className="h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
                        <Ionicons name="book-outline" size={23} color="#2563EB" />
                      </View>

                      <View className="ml-4 flex-1">
                        <Text className="text-base font-bold text-slate-900">
                          {recipe.name}
                        </Text>

                        {sortMode === "category" ? (
                          <Text className="mt-0.5 text-sm text-slate-500">
                            {getMealLabel(recipe.mealCategory)}
                          </Text>
                        ) : getRecipeCategoryName(recipe) ? (
                          <Text className="mt-0.5 text-sm text-slate-500">
                            {getRecipeCategoryName(recipe)}
                          </Text>
                        ) : recipe.description ? (
                          <Text className="mt-0.5 text-sm text-slate-500" numberOfLines={1}>
                            {recipe.description}
                          </Text>
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
                        <View
                          className="ml-3 h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: dotColor }}
                        />
                      )}

                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color="#94A3B8"
                        style={{ marginLeft: 8 }}
                      />
                    </Pressable>
                  </ReanimatedSwipeable>
                  );
                })}
              </View>
            );
          }}
        />

        {isSearchActive && (
          <Pressable
            className="absolute inset-0 z-10 bg-black/30"
            onPress={closeSearch}
          />
        )}

        {/* Floating search bar */}
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
                    <View className="h-11 w-11 items-center justify-center rounded-xl bg-blue-100">
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
      </View>
    </SafeAreaView>
  );
}
