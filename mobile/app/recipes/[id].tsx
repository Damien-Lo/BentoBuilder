import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import {
  addRecipeScore,
  deleteRecipeScore,
  getRecipeById,
  getRecipes,
  type PopulatedIngredient,
  type Recipe,
} from "@/src/services/recipeApi";
import {
  addIngredientToPantry,
  getPantryItems,
  // Aliased — a plain REST call (POST /api/pantry/:id/use), not a React
  // Hook, but its "use..." name trips the hooks linter's naming heuristic
  // when called in a loop inside a regular async function.
  usePantryItem as deductFromPantryItem,
} from "@/src/services/pantryApi";
import type { PantryItem } from "@/src/types/pantry";
import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import {
  createStorageLocation,
  getStorageLocations,
  type SelectOption,
} from "@/src/services/optionsApi";
import { loadSettings } from "@/src/services/settingsService";
import { convertUnits, getIngredientConversions, type CustomUnitConversion } from "@/src/utils/unitConversion";
import { getIngredientStockInUnit } from "@/src/utils/ingredientStock";
import { RateRecipeModal } from "@/src/components/recipes/RateRecipeModal";
import { ResolveIngredientSourcesModal } from "@/src/components/planner/ResolveIngredientSourcesModal";
import { DateTextInput, DurationExpiryInput, FieldLabel, FormInput, SearchableObjectDropdown } from "@/src/components/forms";
import type { MealPlanEntry } from "@/src/services/mealPlanApi";
import {
  buildIngredientRequirements,
  getDefaultDeductionInstructions,
  getResolvedDeductionInstructions,
  hasAmbiguity,
  type DeductionInstruction,
  type IngredientRequirement,
} from "@/src/utils/pantryDeduction";
import { referenceId, referenceName } from "@/src/utils/pantryDefaults";
import { resolveOrCreateOption } from "@/src/utils/resolveOrCreateOption";
import { addDurationToDate, todayDateInputString } from "@/src/utils/date";

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
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [customUnitConversions, setCustomUnitConversions] = useState<CustomUnitConversion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPerServing, setShowPerServing] = useState(true);
  const [showRateModal, setShowRateModal] = useState(false);
  const [savingScore, setSavingScore] = useState(false);
  const [showAllScores, setShowAllScores] = useState(false);

  // "Cook now" — see recipes/add.tsx for the full produces-an-ingredient
  // rationale. Purely a pantry operation, not tied to the meal planner:
  // deducts this recipe's own ingredients (reusing the same
  // deduction/substitution/ambiguity-resolution pipeline the planner uses)
  // and, once the amount/location/expiry are confirmed in the small card
  // below, creates a normal pantry entry for the produced ingredient.
  const [cooking, setCooking] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [pendingRequirements, setPendingRequirements] = useState<IngredientRequirement[]>([]);
  const [ambiguousRequirements, setAmbiguousRequirements] = useState<IngredientRequirement[]>([]);
  const [showBatchCard, setShowBatchCard] = useState(false);
  const [pendingInstructions, setPendingInstructions] = useState<DeductionInstruction[]>([]);
  const [batchAmount, setBatchAmount] = useState("");
  const [batchStorageLocationId, setBatchStorageLocationId] = useState("");
  const [batchStorageLocationName, setBatchStorageLocationName] = useState("");
  const [batchStorageLocationDraft, setBatchStorageLocationDraft] = useState("");
  const [batchExpiryDate, setBatchExpiryDate] = useState("");
  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);

  const isFirstLoad = useRef(true);

  // Refetches on every focus, not just mount — otherwise coming back from
  // logging pantry stock (e.g. adding an entry from the ingredient's own
  // screen) leaves this screen's stock bars stuck on whatever was loaded
  // before that trip, still reading "insufficient" for stock that's since
  // been added.
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;

      const showSpinner = isFirstLoad.current;
      if (showSpinner) setIsLoading(true);

      async function load() {
        try {
          const [loaded, loadedPantry, loadedIngredients, loadedRecipes, loadedLocations, loadedSettings] =
            await Promise.all([
              getRecipeById(id),
              getPantryItems(),
              getIngredients(),
              getRecipes(),
              getStorageLocations(),
              loadSettings(),
            ]);
          if (!cancelled) {
            setRecipe(loaded);
            setPantryItems(Array.isArray(loadedPantry) ? loadedPantry : []);
            setAllIngredients(Array.isArray(loadedIngredients) ? loadedIngredients : []);
            setAllRecipes(Array.isArray(loadedRecipes) ? loadedRecipes : []);
            setStorageLocations(Array.isArray(loadedLocations) ? loadedLocations : []);
            setCustomUnitConversions(loadedSettings.unitConversions ?? []);
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Failed to load recipe");
          }
        } finally {
          if (!cancelled) {
            isFirstLoad.current = false;
            if (showSpinner) setIsLoading(false);
          }
        }
      }

      void load();
      return () => { cancelled = true; };
    }, [id]),
  );

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
        getIngredientConversions(ing, customUnitConversions, allIngredients),
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
  }, [recipe, customUnitConversions, allIngredients]);

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

  // "Current score" is always computed from the last 50 raw entries, never
  // stored — the full history stays in recipe.scores regardless.
  const recentScores = useMemo(() => {
    const all = recipe?.scores ?? [];
    return all.slice(-50).slice().reverse();
  }, [recipe]);

  const averageScore = useMemo(() => {
    if (recentScores.length === 0) return null;
    const sum = recentScores.reduce((acc, s) => acc + s.value, 0);
    return Math.round((sum / recentScores.length) * 10) / 10;
  }, [recentScores]);

  const ingredientMap = useMemo(
    () => new Map(allIngredients.map((i) => [i._id, i])),
    [allIngredients],
  );
  const recipeMap = useMemo(
    () => new Map(allRecipes.map((r) => [r._id, r])),
    [allRecipes],
  );

  // Reverse lookup — the link lives on the Ingredient (productionRecipe),
  // not the Recipe, same as recipes/edit/[id].tsx.
  const producedIngredient = useMemo(
    () => allIngredients.find((i) => referenceId(i.productionRecipe) === recipe?._id),
    [allIngredients, recipe],
  );

  async function refreshPantry() {
    try {
      const loaded = await getPantryItems();
      setPantryItems(Array.isArray(loaded) ? loaded : []);
    } catch {
      // non-fatal — stock bars just won't reflect the change until next load
    }
  }

  // A throwaway, never-persisted MealPlanEntry — just enough of the real
  // shape for buildIngredientRequirements's `entry.recipe` branch (it only
  // reads entry.recipe.ingredientList). Nothing here ever hits the server;
  // "cook now" is a pure pantry operation, not a meal-plan action.
  function buildCookEntry(): MealPlanEntry | null {
    if (!recipe) return null;
    return {
      _id: "cook-now",
      date: todayDateInputString(),
      slot: recipe.mealCategory[0] ?? "dinner",
      status: "planned",
      recipe,
    };
  }

  function openBatchCard(instructions: DeductionInstruction[]) {
    if (!recipe || !producedIngredient) return;
    setPendingInstructions(instructions);

    const amount = (recipe.servings ?? 1) * (producedIngredient.defaultPortionAmount ?? 1);
    setBatchAmount(String(round1(amount)));

    setBatchStorageLocationId(referenceId(producedIngredient.defaultStorageLocation));
    const locationName = referenceName(producedIngredient.defaultStorageLocation);
    setBatchStorageLocationName(locationName);
    setBatchStorageLocationDraft(locationName);

    const durationAmount = producedIngredient.defaultExpiryDurationAmount;
    const durationUnit = producedIngredient.defaultExpiryDurationUnit;
    setBatchExpiryDate(
      durationAmount != null && durationUnit
        ? addDurationToDate(todayDateInputString(), durationAmount, durationUnit)
        : "",
    );

    setShowBatchCard(true);
  }

  function handleCook() {
    if (!recipe || !producedIngredient || cooking) return;
    const entry = buildCookEntry();
    if (!entry) return;

    const requirements = buildIngredientRequirements(
      entry,
      recipeMap,
      ingredientMap,
      allIngredients,
      pantryItems,
      customUnitConversions,
    );

    if (hasAmbiguity(requirements)) {
      setPendingRequirements(requirements);
      setAmbiguousRequirements(requirements.filter((r) => r.groups.length > 1));
      setShowResolveModal(true);
      return;
    }

    openBatchCard(getDefaultDeductionInstructions(requirements));
  }

  function handleResolvedConfirm(selections: Record<string, string[]>) {
    const instructions = getResolvedDeductionInstructions(pendingRequirements, selections);
    setShowResolveModal(false);
    setPendingRequirements([]);
    openBatchCard(instructions);
  }

  function handleCancelResolve() {
    setShowResolveModal(false);
    setPendingRequirements([]);
  }

  async function handleConfirmBatch() {
    if (!recipe || !producedIngredient || cooking) return;

    const parsedAmount = Number(batchAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Enter an amount", "How much did this batch make?");
      return;
    }
    if (!batchStorageLocationId && !batchStorageLocationDraft.trim()) {
      Alert.alert("Choose a storage location", "Pick or type where this batch will be stored.");
      return;
    }

    setCooking(true);
    try {
      const storageLocation = await resolveOrCreateOption(
        storageLocations,
        batchStorageLocationId,
        batchStorageLocationDraft,
        createStorageLocation,
      );
      if (!storageLocation) {
        Alert.alert("Choose a storage location", "Pick or type where this batch will be stored.");
        return;
      }

      // pendingInstructions were computed against the recipe's default
      // yield (recipe.servings worth) — scale them to whatever batch size
      // was actually entered, so doubling the batch doubles the deduction.
      const baseYield = (recipe.servings ?? 1) * (producedIngredient.defaultPortionAmount ?? 1);
      const ratio = baseYield > 0 ? parsedAmount / baseYield : 1;

      for (const instruction of pendingInstructions) {
        await deductFromPantryItem(instruction.pantryItemId, round1(instruction.amount * ratio));
      }

      await addIngredientToPantry({
        ingredient: producedIngredient._id,
        storageLocation: storageLocation._id,
        quantityAvailable: parsedAmount,
        quantityUnit: producedIngredient.defaultPortionUnit || "serving",
        purchaseDate: todayDateInputString(),
        expiryDate: batchExpiryDate || undefined,
      });

      setShowBatchCard(false);
      setPendingInstructions([]);
      await refreshPantry();
      Alert.alert("Batch made", `${recipe.name} was cooked and added to your pantry.`);
    } catch (err) {
      Alert.alert("Could not save batch", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setCooking(false);
    }
  }

  function handleCancelBatch() {
    setShowBatchCard(false);
    setPendingInstructions([]);
  }

  async function handleAddScore(value: number) {
    if (!recipe) return;
    setSavingScore(true);
    try {
      const updatedScores = await addRecipeScore(recipe._id, value);
      setRecipe((prev) => (prev ? { ...prev, scores: updatedScores } : prev));
      setShowRateModal(false);
    } catch (err) {
      Alert.alert(
        "Couldn't save rating",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setSavingScore(false);
    }
  }

  function handleDeleteScore(scoreId: string) {
    if (!recipe) return;
    Alert.alert("Delete rating", "Remove this rating?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const updatedScores = await deleteRecipeScore(recipe._id, scoreId);
            setRecipe((prev) => (prev ? { ...prev, scores: updatedScores } : prev));
          } catch (err) {
            Alert.alert(
              "Couldn't delete rating",
              err instanceof Error ? err.message : "Something went wrong.",
            );
          }
        },
      },
    ]);
  }

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
    <>
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
        <View className="rounded-2xl border border-slate-200 bg-white p-5">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            <Ionicons name="book-outline" size={26} color="#2563EB" />
          </View>

          <Text className="mt-4 text-2xl font-bold text-slate-900">{recipe.name}</Text>

          <View className="mt-3 flex-row flex-wrap gap-2">
            <View
              className={`rounded-full px-3 py-1 ${
                recipe.isConfirmed ? "bg-blue-50" : "bg-slate-100"
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  recipe.isConfirmed ? "text-blue-600" : "text-slate-500"
                }`}
              >
                {recipe.isConfirmed ? "Confirmed" : "Want to try"}
              </Text>
            </View>

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

            {recipe.prepTimeMinutes != null && (
              <View className="flex-row items-center rounded-full bg-slate-100 px-3 py-1">
                <Ionicons name="cut-outline" size={12} color="#475569" />
                <Text className="ml-1 text-xs font-semibold text-slate-600">
                  {recipe.prepTimeMinutes} min prep
                </Text>
              </View>
            )}

            {recipe.cookTimeMinutes != null && (
              <View className="flex-row items-center rounded-full bg-slate-100 px-3 py-1">
                <Ionicons name="flame-outline" size={12} color="#475569" />
                <Text className="ml-1 text-xs font-semibold text-slate-600">
                  {recipe.cookTimeMinutes} min cook
                </Text>
              </View>
            )}

            {(recipe.tags ?? [])
              .filter((tag): tag is SelectOption => typeof tag !== "string")
              .map((tag) => (
                <View key={tag._id} className="rounded-full bg-emerald-100 px-3 py-1">
                  <Text className="text-xs font-semibold text-emerald-700">{tag.name}</Text>
                </View>
              ))}
          </View>

          {recipe.description ? (
            <Text className="mt-4 text-base leading-6 text-slate-600">
              {recipe.description}
            </Text>
          ) : null}
        </View>

        {/* Prepares an ingredient */}
        {producedIngredient && (
          <View className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <View className="flex-row items-center">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                <Ionicons name="flask-outline" size={20} color="#2563EB" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-sm font-bold uppercase tracking-wide text-slate-500">
                  Prepares
                </Text>
                <Text className="mt-0.5 text-base font-semibold text-slate-900">
                  {producedIngredient.name}
                </Text>
              </View>
            </View>

            <Pressable
              disabled={cooking}
              className={`mt-4 items-center rounded-2xl py-3.5 ${
                cooking ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
              }`}
              onPress={handleCook}
            >
              <Text className="text-sm font-semibold text-white">Cook & make a batch</Text>
            </Pressable>
          </View>
        )}

        {/* Rating */}
        <View className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Rating
              </Text>
              {averageScore != null ? (
                <View className="mt-2 flex-row items-baseline">
                  <Text className="text-2xl font-bold text-slate-900">{averageScore}</Text>
                  <Text className="ml-1 text-base font-semibold text-slate-400">/ 10</Text>
                  <Text className="ml-1.5 text-sm text-slate-400">
                    · {recentScores.length} {recentScores.length === 1 ? "rating" : "ratings"}
                  </Text>
                </View>
              ) : (
                <Text className="mt-2 text-sm text-slate-400">Not rated yet</Text>
              )}
            </View>

            <Pressable
              className="rounded-2xl bg-blue-600 px-4 py-2.5 active:bg-blue-700"
              onPress={() => setShowRateModal(true)}
            >
              <Text className="text-sm font-semibold text-white">Rate</Text>
            </Pressable>
          </View>

          {recentScores.length > 0 && (
            <>
              <Pressable
                className="mt-4 flex-row items-center"
                onPress={() => setShowAllScores((v) => !v)}
              >
                <Text className="text-xs font-semibold text-slate-500">
                  {showAllScores ? "Hide history" : "Show history"}
                </Text>
                <Ionicons
                  name={showAllScores ? "chevron-up" : "chevron-down"}
                  size={14}
                  color="#64748B"
                  style={{ marginLeft: 4 }}
                />
              </Pressable>

              {showAllScores && (
                <View className="mt-2 overflow-hidden rounded-2xl border border-slate-100">
                  {recentScores.map((score, index) => (
                    <ReanimatedSwipeable
                      key={score._id}
                      friction={2}
                      rightThreshold={40}
                      renderLeftActions={() => (
                        <Pressable
                          className="w-20 items-center justify-center bg-red-500 active:bg-red-600"
                          onPress={() => handleDeleteScore(score._id)}
                        >
                          <Ionicons name="trash-outline" size={20} color="white" />
                        </Pressable>
                      )}
                    >
                      <View
                        className={`flex-row items-center justify-between bg-white px-3 py-2.5 ${
                          index < recentScores.length - 1 ? "border-b border-slate-100" : ""
                        }`}
                      >
                        <Text className="text-sm text-slate-600">
                          {new Date(score.ratedAt).toLocaleDateString()}
                        </Text>
                        <Text className="text-sm font-semibold text-slate-900">
                          {score.value} / 10
                        </Text>
                      </View>
                    </ReanimatedSwipeable>
                  ))}
                </View>
              )}
            </>
          )}
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

            <View className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
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
                  ? (convertUnits(
                      rawThreshold,
                      ing.defaultPortionUnit,
                      entry.unit,
                      getIngredientConversions(ing, customUnitConversions, allIngredients),
                    ) ?? rawThreshold)
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
                      <View className="h-8 w-8 items-center justify-center rounded-full bg-blue-50">
                        <Ionicons name="nutrition-outline" size={15} color="#2563EB" />
                      </View>

                      <Text className="ml-3 flex-1 text-base text-slate-800">
                        {getIngredientName(entry.ingredient)}
                      </Text>

                      <View className="items-end">
                        <Text className="text-sm font-semibold text-slate-500">
                          {displayQty}
                          {entry.unit ? ` × ${entry.unit}` : ""}
                        </Text>
                        {ing?.nutrition?.calories != null && (() => {
                          // displayQty is in entry.unit, not necessarily the
                          // ingredient's own defaultPortionUnit (e.g. a
                          // recipe using grams for an ingredient portioned
                          // in packages) — has to convert before scaling,
                          // same as the total nutrition sum above.
                          const qtyInNativeUnit = convertUnits(
                            displayQty,
                            entry.unit,
                            ing.defaultPortionUnit ?? "",
                            getIngredientConversions(ing, customUnitConversions, allIngredients),
                          );
                          if (qtyInNativeUnit == null) return null;
                          const kcal = Math.round(
                            ing.nutrition.calories * (qtyInNativeUnit / (ing.defaultPortionAmount ?? 1)),
                          );
                          return (
                            <Text className="mt-0.5 text-xs text-slate-400">{kcal} kcal</Text>
                          );
                        })()}
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

            <View className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
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
            <View className="rounded-2xl border border-slate-200 bg-white p-5">
              <Text className="text-base leading-6 text-slate-600">{recipe.notes}</Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>

    <RateRecipeModal
      visible={showRateModal}
      saving={savingScore}
      onClose={() => setShowRateModal(false)}
      onSubmit={(value) => void handleAddScore(value)}
    />

    <ResolveIngredientSourcesModal
      visible={showResolveModal}
      requirements={ambiguousRequirements}
      onCancel={handleCancelResolve}
      onConfirm={handleResolvedConfirm}
    />

    <Modal visible={showBatchCard} transparent animationType="fade" onRequestClose={handleCancelBatch}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 items-center justify-center bg-black/40 px-6"
      >
        <Pressable className="absolute inset-0" onPress={handleCancelBatch} />

        <View className="w-full rounded-3xl bg-white p-5">
          <Text className="text-lg font-bold text-slate-950">Make a batch</Text>
          <Text className="mt-0.5 mb-5 text-sm text-slate-400">
            {producedIngredient?.name ?? "This ingredient"} will be added to your pantry.
          </Text>

          <FieldLabel text="Amount made" required />
          <View className="flex-row items-center">
            <FormInput
              value={batchAmount}
              onChangeText={setBatchAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              style={{ height: 56 }}
              className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
            />
            <Text className="ml-3 text-base font-semibold text-slate-500">
              {producedIngredient?.defaultPortionUnit || "serving"}
            </Text>
          </View>

          <View className="mt-4">
            <FieldLabel text="Storage location" required />
            <SearchableObjectDropdown<SelectOption>
              options={storageLocations}
              selectedId={batchStorageLocationId}
              selectedName={batchStorageLocationName}
              placeholder="Search or type a new storage location"
              onTextChange={(value) => {
                if (value !== batchStorageLocationName) setBatchStorageLocationId("");
                setBatchStorageLocationDraft(value);
              }}
              onSelect={(option) => {
                setBatchStorageLocationId(option._id);
                setBatchStorageLocationName(option.name);
                setBatchStorageLocationDraft(option.name);
              }}
            />
          </View>

          <View className="mt-4">
            <FieldLabel text="Expiry date" />
            <DateTextInput
              value={batchExpiryDate}
              style={{ height: 56 }}
              className="rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
              onChangeText={setBatchExpiryDate}
            />
          </View>

          <View className="mt-2">
            <DurationExpiryInput
              purchaseDate={todayDateInputString()}
              onApply={setBatchExpiryDate}
            />
          </View>

          <View className="mt-5 flex-row gap-3">
            <Pressable
              className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200"
              onPress={handleCancelBatch}
            >
              <Text className="text-sm font-semibold text-slate-700">Cancel</Text>
            </Pressable>
            <Pressable
              disabled={cooking}
              className={`flex-1 items-center rounded-2xl py-3.5 ${
                cooking ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
              }`}
              onPress={() => void handleConfirmBatch()}
            >
              <Text className="text-sm font-semibold text-white">
                {cooking ? "Saving..." : "Add to pantry"}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </>
  );
}
