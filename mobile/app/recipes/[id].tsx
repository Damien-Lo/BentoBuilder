import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
  getRecipeById,
  type PopulatedIngredient,
  type Recipe,
} from "@/src/services/recipeApi";
import { getPantryItems } from "@/src/services/pantryApi";
import type { PantryItem } from "@/src/types/pantry";
import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import { loadSettings } from "@/src/services/settingsService";
import { convertUnits, type CustomUnitConversion } from "@/src/utils/unitConversion";
import { getIngredientStockInUnit } from "@/src/utils/ingredientStock";

const MEAL_CATEGORY_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function getIngredientName(ingredient: string | PopulatedIngredient): string {
  if (typeof ingredient === "string") return ingredient;
  return ingredient.name;
}

export default function RecipeDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [customUnitConversions, setCustomUnitConversions] = useState<CustomUnitConversion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPerServing, setShowPerServing] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const [loaded, loadedPantry, loadedIngredients, loadedSettings] = await Promise.all([
          getRecipeById(id),
          getPantryItems(),
          getIngredients(),
          loadSettings(),
        ]);
        if (!cancelled) {
          setRecipe(loaded);
          setPantryItems(Array.isArray(loadedPantry) ? loadedPantry : []);
          setAllIngredients(Array.isArray(loadedIngredients) ? loadedIngredients : []);
          setCustomUnitConversions(loadedSettings.unitConversions ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load recipe");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [id]);

  // Calculate total nutrition from ingredient list (live, not stored value)
  const totalNutrition = useMemo(() => {
    if (!recipe) return null;

    let calories = 0, protein = 0, carbs = 0, fats = 0, fiber = 0, sodium = 0;
    let hasData = false;

    for (const entry of recipe.ingredientList) {
      const ing = entry.ingredient;
      if (typeof ing === "string" || !ing.nutrition) continue;

      const qtyInNativeUnit = convertUnits(
        entry.quantity,
        entry.unit,
        ing.defaultPortionUnit ?? "",
        customUnitConversions,
      );
      if (qtyInNativeUnit == null) continue;

      const multiplier = qtyInNativeUnit / (ing.defaultPortionAmount ?? 1);
      calories += (ing.nutrition.calories ?? 0) * multiplier;
      protein  += (ing.nutrition.protein  ?? 0) * multiplier;
      carbs    += (ing.nutrition.carbs    ?? 0) * multiplier;
      fats     += (ing.nutrition.fats     ?? 0) * multiplier;
      fiber    += (ing.nutrition.fiber    ?? 0) * multiplier;
      sodium   += (ing.nutrition.sodium   ?? 0) * multiplier;
      hasData = true;
    }

    if (!hasData) return null;
    return { calories, protein, carbs, fats, fiber, sodium };
  }, [recipe, customUnitConversions]);

  const displayedNutrition = useMemo(() => {
    if (!totalNutrition || !recipe) return null;
    const s = showPerServing ? Math.max(1, recipe.servings ?? 1) : 1;
    return {
      calories: round1(totalNutrition.calories / s),
      protein:  round1(totalNutrition.protein  / s),
      carbs:    round1(totalNutrition.carbs    / s),
      fats:     round1(totalNutrition.fats     / s),
      fiber:    round1(totalNutrition.fiber    / s),
      sodium:   round1(totalNutrition.sodium   / s),
    };
  }, [totalNutrition, showPerServing, recipe]);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" />
        <Text className="mt-3 text-slate-500">Loading recipe...</Text>
      </SafeAreaView>
    );
  }

  if (error || !recipe) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <Ionicons name="alert-circle-outline" size={42} color="#94A3B8" />
        <Text className="mt-4 text-lg font-bold text-slate-900">
          Could not load recipe
        </Text>
        <Text className="mt-2 text-center text-slate-500 px-8">{error}</Text>
        <Pressable
          className="mt-6 rounded-2xl bg-slate-200 px-6 py-3"
          onPress={() => router.back()}
        >
          <Text className="font-semibold text-slate-700">Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const recipeCategoryName =
    recipe.recipeCategory && typeof recipe.recipeCategory !== "string"
      ? recipe.recipeCategory.name
      : null;

  const servings = recipe.servings ?? 1;

  const filledInstructions = (recipe.instructions ?? []).filter(
    (s) => s.trim().length > 0,
  );

  const nutritionRows: [string, number, string][] = displayedNutrition
    ? ([
        ["Calories", displayedNutrition.calories, "kcal"],
        ["Protein",  displayedNutrition.protein,  "g"],
        ["Carbs",    displayedNutrition.carbs,     "g"],
        ["Fats",     displayedNutrition.fats,      "g"],
        ["Fiber",    displayedNutrition.fiber,     "g"],
        ["Sodium",   displayedNutrition.sodium,    "mg"],
      ] as [string, number, string][]).filter(([, v]) => v > 0)
    : [];

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      {/* Nav bar */}
      <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
        <Pressable
          className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>

        <Text className="ml-2 flex-1 text-xl font-bold text-slate-950" numberOfLines={1}>
          {recipe.name}
        </Text>

        <Pressable
          className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
          onPress={() =>
            router.push({ pathname: "/recipes/edit/[id]", params: { id } })
          }
        >
          <Ionicons name="create-outline" size={24} color="#2563EB" />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60, paddingTop: 20 }}
      >
        {/* Header card */}
        <View className="rounded-3xl bg-white p-5 shadow-sm">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-blue-100">
            <Ionicons name="book-outline" size={28} color="#2563EB" />
          </View>

          <Text className="mt-4 text-2xl font-bold text-slate-900">{recipe.name}</Text>

          <View className="mt-3 flex-row flex-wrap gap-2">
            {(Array.isArray(recipe.mealCategory)
              ? recipe.mealCategory
              : [recipe.mealCategory]
            ).map((cat) => (
              <View key={cat} className="rounded-full bg-blue-100 px-3 py-1">
                <Text className="text-xs font-semibold text-blue-700">
                  {MEAL_CATEGORY_LABEL[cat] ?? cat}
                </Text>
              </View>
            ))}

            {recipeCategoryName ? (
              <View className="rounded-full bg-slate-100 px-3 py-1">
                <Text className="text-xs font-semibold text-slate-600">
                  {recipeCategoryName}
                </Text>
              </View>
            ) : null}

            <View className="rounded-full bg-slate-100 px-3 py-1">
              <Text className="text-xs font-semibold text-slate-600">
                {servings} {servings === 1 ? "serving" : "servings"}
              </Text>
            </View>
          </View>

          {recipe.description ? (
            <Text className="mt-4 text-base leading-6 text-slate-600">
              {recipe.description}
            </Text>
          ) : null}
        </View>

        {/* Ingredients */}
        {recipe.ingredientList.length > 0 && (
          <>
            <View className="flex-row items-center justify-between mt-6 mb-2">
              <Text className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Ingredients
              </Text>

              <View className="flex-row overflow-hidden rounded-xl border border-slate-200">
                <Pressable
                  className={`px-3 py-1.5 ${showPerServing ? "bg-blue-600" : "bg-white"}`}
                  onPress={() => setShowPerServing(true)}
                >
                  <Text className={`text-xs font-semibold ${showPerServing ? "text-white" : "text-slate-600"}`}>
                    Per serving
                  </Text>
                </Pressable>

                <Pressable
                  className={`px-3 py-1.5 border-l border-slate-200 ${!showPerServing ? "bg-blue-600" : "bg-white"}`}
                  onPress={() => setShowPerServing(false)}
                >
                  <Text className={`text-xs font-semibold ${!showPerServing ? "text-white" : "text-slate-600"}`}>
                    Full recipe
                  </Text>
                </Pressable>
              </View>
            </View>

            <View className="rounded-3xl bg-white shadow-sm overflow-hidden">
              {recipe.ingredientList.map((entry, index) => {
                const displayQty = showPerServing
                  ? round1(entry.quantity / Math.max(1, servings))
                  : entry.quantity;

                const ing = typeof entry.ingredient === "string" ? null : entry.ingredient;
                const inStock = ing
                  ? getIngredientStockInUnit(ing, entry.unit, allIngredients, pantryItems, customUnitConversions)
                  : 0;
                const remaining = inStock - displayQty;
                const rawThreshold = ing?.lowStockThreshold ?? 0;
                const threshold = ing?.defaultPortionUnit
                  ? (convertUnits(rawThreshold, ing.defaultPortionUnit, entry.unit, customUnitConversions) ??
                    rawThreshold)
                  : rawThreshold;
                const barState: "green" | "yellow" | "red" =
                  remaining > threshold ? "green" :
                  remaining >= 0 ? "yellow" :
                  "red";

                return (
                  <View
                    key={index}
                    className={index < recipe.ingredientList.length - 1 ? "border-b border-slate-100" : ""}
                  >
                    <View className="flex-row items-center px-4 py-3">
                      <View className="h-8 w-8 items-center justify-center rounded-xl bg-blue-100">
                        <Ionicons name="nutrition-outline" size={16} color="#2563EB" />
                      </View>

                      <Text className="ml-3 flex-1 text-base text-slate-800">
                        {getIngredientName(entry.ingredient)}
                      </Text>

                      <View className="items-end">
                        <Text className="text-sm font-semibold text-slate-500">
                          {displayQty}
                          {entry.unit ? ` × ${entry.unit}` : ""}
                        </Text>
                        {ing?.nutrition?.calories != null && (
                          <Text className="mt-0.5 text-xs text-slate-400">
                            {Math.round(ing.nutrition.calories * (displayQty / (ing.defaultPortionAmount ?? 1)))} kcal
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Pantry availability bar */}
                    <View className="h-[3px] w-full bg-slate-100">
                      <View
                        className={
                          barState === "green"
                            ? "h-full w-full bg-emerald-400"
                            : barState === "yellow"
                              ? "h-full w-1/2 bg-amber-400"
                              : "h-full w-[8%] bg-red-400"
                        }
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Nutrition */}
        {nutritionRows.length > 0 && (
          <>
            <Text className="text-sm font-bold uppercase tracking-wide text-slate-500 mt-6 mb-2">
              Nutrition
            </Text>

            <View className="rounded-3xl bg-white shadow-sm overflow-hidden">
              {nutritionRows.map(([label, value, unit], index) => (
                <View
                  key={label}
                  className={`flex-row items-center justify-between px-4 py-3 ${
                    index < nutritionRows.length - 1 ? "border-b border-slate-100" : ""
                  }`}
                >
                  <Text className="text-base text-slate-600">{label}</Text>
                  <Text className="text-base font-semibold text-slate-900">
                    {value} {unit}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Instructions */}
        {filledInstructions.length > 0 && (
          <>
            <Text className="mb-3 mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">
              Instructions
            </Text>

            {filledInstructions.map((step, index) => (
              <View key={index} className="mb-3 flex-row items-start">
                <View className="mt-0.5 h-7 w-7 items-center justify-center rounded-full bg-blue-600">
                  <Text className="text-xs font-bold text-white">{index + 1}</Text>
                </View>

                <Text className="ml-3 flex-1 text-base leading-6 text-slate-800">
                  {step}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Notes */}
        {recipe.notes ? (
          <>
            <Text className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">
              Notes
            </Text>
            <View className="rounded-3xl bg-white p-5 shadow-sm">
              <Text className="text-base leading-6 text-slate-600">{recipe.notes}</Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
