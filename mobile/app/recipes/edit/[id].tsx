import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  FieldLabel,
  FormInput,
  SearchableObjectDropdown,
  SectionTitle,
  UnitFamilyDropdown,
} from "@/src/components/forms";

import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import {
  createRecipeCategory,
  getRecipeById,
  getRecipeCategories,
  updateRecipe,
  type MealCategory,
  type PopulatedIngredient,
  type RecipeCategory,
  type RecipeNutrition,
} from "@/src/services/recipeApi";
import { resolveOrCreateOption } from "@/src/utils/resolveOrCreateOption";
import { loadSettings } from "@/src/services/settingsService";
import {
  convertUnits,
  getRelatedUnits,
  type CustomUnitConversion,
} from "@/src/utils/unitConversion";

const MEAL_CATEGORIES: { value: MealCategory; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

type IngredientRow = {
  key: string;
  ingredientId: string;
  ingredientName: string;
  quantity: string;
  unit: string;
  // The ingredient's own unit — quantity/unit above may be in a different
  // (but convertible) unit chosen for this recipe, e.g. cups for an
  // ingredient whose native unit is mL. Nutrition math needs this.
  nativeUnit: string;
  portionAmount: number;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fats?: number | null;
  fiber?: number | null;
  sodium?: number | null;
};

function ingredientToOption(ingredient: Ingredient) {
  return {
    _id: ingredient._id,
    name: ingredient.name,
    portionAmount: ingredient.defaultPortionAmount ?? 1,
    unit: ingredient.defaultPortionUnit ?? "",
    calories: ingredient.nutrition?.calories ?? undefined,
    protein: ingredient.nutrition?.protein ?? undefined,
    carbs: ingredient.nutrition?.carbs ?? undefined,
    fats: ingredient.nutrition?.fats ?? undefined,
    fiber: ingredient.nutrition?.fiber ?? undefined,
    sodium: ingredient.nutrition?.sodium ?? undefined,
  };
}

type IngredientOption = ReturnType<typeof ingredientToOption>;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function populatedToRow(
  ing: PopulatedIngredient,
  quantity: number,
  unit: string,
): IngredientRow {
  return {
    key: `${ing._id}-loaded`,
    ingredientId: ing._id,
    ingredientName: ing.name,
    quantity: String(quantity),
    unit: unit || ing.defaultPortionUnit || "serving",
    nativeUnit: ing.defaultPortionUnit || "serving",
    portionAmount: ing.defaultPortionAmount ?? 1,
    calories: ing.nutrition?.calories ?? null,
    protein: ing.nutrition?.protein ?? null,
    carbs: ing.nutrition?.carbs ?? null,
    fats: ing.nutrition?.fats ?? null,
    fiber: ing.nutrition?.fiber ?? null,
    sodium: ing.nutrition?.sodium ?? null,
  };
}

export default function EditRecipePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [loadingRecipe, setLoadingRecipe] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState("");
  const [mealCategories, setMealCategories] = useState<MealCategory[]>([]);
  const [recipeCategoryId, setRecipeCategoryId] = useState("");
  const [recipeCategoryName, setRecipeCategoryName] = useState("");
  const [recipeCategoryDraft, setRecipeCategoryDraft] = useState("");
  const [description, setDescription] = useState("");
  const [servings, setServings] = useState("1");
  const [notes, setNotes] = useState("");
  const [ingredientRows, setIngredientRows] = useState<IngredientRow[]>([]);
  const [steps, setSteps] = useState<string[]>([]);

  // Picker state
  const [pickerIngredientId, setPickerIngredientId] = useState("");
  const [pickerIngredientName, setPickerIngredientName] = useState("");
  const [pickerQuantity, setPickerQuantity] = useState("1");
  const [pickerUnit, setPickerUnit] = useState("");
  const [pickerSelected, setPickerSelected] = useState<IngredientOption | null>(null);

  // Options
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([]);
  const [recipeCategories, setRecipeCategories] = useState<RecipeCategory[]>([]);
  const [customUnitConversions, setCustomUnitConversions] = useState<CustomUnitConversion[]>([]);

  // Load recipe + options in parallel
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      try {
        const [recipe, loadedIngredients, loadedCategories, loadedSettings] = await Promise.all([
          getRecipeById(id),
          getIngredients(),
          getRecipeCategories(),
          loadSettings(),
        ]);

        if (cancelled) return;

        // Populate form from existing recipe
        setName(recipe.name);
        setMealCategories(
          Array.isArray(recipe.mealCategory) ? recipe.mealCategory : [recipe.mealCategory],
        );
        setDescription(recipe.description ?? "");
        setServings(String(recipe.servings ?? 1));
        setNotes(recipe.notes ?? "");
        setSteps(recipe.instructions.length > 0 ? recipe.instructions : []);

        if (recipe.recipeCategory && typeof recipe.recipeCategory !== "string") {
          setRecipeCategoryId(recipe.recipeCategory._id);
          setRecipeCategoryName(recipe.recipeCategory.name);
          setRecipeCategoryDraft(recipe.recipeCategory.name);
        }

        const rows: IngredientRow[] = [];
        for (const entry of recipe.ingredientList) {
          if (typeof entry.ingredient !== "string") {
            rows.push(populatedToRow(entry.ingredient, entry.quantity, entry.unit));
          }
        }
        setIngredientRows(rows);

        setIngredientOptions(
          Array.isArray(loadedIngredients)
            ? loadedIngredients.map(ingredientToOption)
            : [],
        );
        setRecipeCategories(
          Array.isArray(loadedCategories) ? loadedCategories : [],
        );
        setCustomUnitConversions(loadedSettings.unitConversions ?? []);
      } catch (err) {
        if (!cancelled) {
          Alert.alert(
            "Could not load recipe",
            err instanceof Error ? err.message : "Unknown error",
          );
          router.back();
        }
      } finally {
        if (!cancelled) {
          setLoadingRecipe(false);
          setLoadingOptions(false);
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [id]);

  const totalNutrition = useMemo<RecipeNutrition>(() => {
    return ingredientRows.reduce(
      (acc, row) => {
        const qty = Number(row.quantity) || 0;
        const qtyInNativeUnit = convertUnits(qty, row.unit, row.nativeUnit, customUnitConversions);
        const multiplier =
          qtyInNativeUnit != null ? qtyInNativeUnit / (row.portionAmount || 1) : 0;
        return {
          calories: (acc.calories ?? 0) + (row.calories ?? 0) * multiplier,
          protein: (acc.protein ?? 0) + (row.protein ?? 0) * multiplier,
          carbs: (acc.carbs ?? 0) + (row.carbs ?? 0) * multiplier,
          fats: (acc.fats ?? 0) + (row.fats ?? 0) * multiplier,
          fiber: (acc.fiber ?? 0) + (row.fiber ?? 0) * multiplier,
          sodium: (acc.sodium ?? 0) + (row.sodium ?? 0) * multiplier,
        };
      },
      { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sodium: 0 } as RecipeNutrition,
    );
  }, [ingredientRows, customUnitConversions]);

  const perServingNutrition = useMemo<RecipeNutrition>(() => {
    const s = Math.max(1, Number(servings) || 1);
    return {
      calories: round1((totalNutrition.calories ?? 0) / s),
      protein: round1((totalNutrition.protein ?? 0) / s),
      carbs: round1((totalNutrition.carbs ?? 0) / s),
      fats: round1((totalNutrition.fats ?? 0) / s),
      fiber: round1((totalNutrition.fiber ?? 0) / s),
      sodium: round1((totalNutrition.sodium ?? 0) / s),
    };
  }, [totalNutrition, servings]);

  const pickerRelatedUnits = useMemo(
    () =>
      pickerSelected?.unit
        ? getRelatedUnits(pickerSelected.unit, customUnitConversions)
        : [],
    [pickerSelected, customUnitConversions],
  );

  const hasNutritionData = ingredientRows.some(
    (row) => row.calories != null || row.protein != null || row.carbs != null || row.fats != null,
  );

  function handleAddIngredient() {
    if (!pickerIngredientId || !pickerIngredientName.trim()) {
      Alert.alert("Select an ingredient", "Search and select an ingredient from the list.");
      return;
    }
    const qty = Number(pickerQuantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert("Invalid quantity", "Enter a quantity greater than 0.");
      return;
    }

    const nativeUnit = pickerSelected?.unit ?? "serving";
    const unit = pickerUnit || nativeUnit;

    setIngredientRows((prev) => [
      ...prev,
      {
        key: `${pickerIngredientId}-${Date.now()}`,
        ingredientId: pickerIngredientId,
        ingredientName: pickerIngredientName,
        quantity: pickerQuantity,
        unit,
        nativeUnit,
        portionAmount: pickerSelected?.portionAmount ?? 1,
        calories: pickerSelected?.calories ?? null,
        protein: pickerSelected?.protein ?? null,
        carbs: pickerSelected?.carbs ?? null,
        fats: pickerSelected?.fats ?? null,
        fiber: pickerSelected?.fiber ?? null,
        sodium: pickerSelected?.sodium ?? null,
      },
    ]);
    setPickerIngredientId("");
    setPickerIngredientName("");
    setPickerQuantity("1");
    setPickerUnit("");
    setPickerSelected(null);
  }

  async function handleCreateRecipeCategory(catName: string): Promise<RecipeCategory> {
    const category = await createRecipeCategory(catName);
    setRecipeCategories((prev) => {
      const exists = prev.some((c) => c._id === category._id);
      return exists ? prev : [...prev, category].sort((a, b) => a.name.localeCompare(b.name));
    });
    return category;
  }

  function removeIngredientRow(key: string) {
    setIngredientRows((prev) => prev.filter((r) => r.key !== key));
  }

  function updateStep(index: number, value: string) {
    setSteps((prev) => prev.map((s, i) => (i === index ? value : s)));
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert("Name required", "Enter a name for your recipe.");
      return;
    }
    if (mealCategories.length === 0) {
      Alert.alert("Meal type required", "Select at least one meal type.");
      return;
    }
    const numServings = Number(servings);
    if (!Number.isFinite(numServings) || numServings < 1) {
      Alert.alert("Invalid servings", "Enter a serving count of 1 or more.");
      return;
    }

    setSaving(true);
    try {
      const recipeCategory = await resolveOrCreateOption(
        recipeCategories,
        recipeCategoryId,
        recipeCategoryDraft,
        handleCreateRecipeCategory,
      );

      await updateRecipe(id, {
        name: name.trim(),
        mealCategory: mealCategories,
        recipeCategory: recipeCategory?._id || null,
        description: description.trim() || undefined,
        servings: numServings,
        notes: notes.trim() || undefined,
        ingredientList: ingredientRows.map((row) => ({
          ingredient: row.ingredientId,
          quantity: Number(row.quantity),
          unit: row.unit,
        })),
        instructions: steps.map((s) => s.trim()).filter((s) => s.length > 0),
        nutrition: hasNutritionData ? perServingNutrition : undefined,
      });
      router.back();
    } catch (error) {
      Alert.alert("Unable to save", error instanceof Error ? error.message : "Could not save recipe.");
    } finally {
      setSaving(false);
    }
  }

  if (loadingRecipe || loadingOptions) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="mt-3 text-slate-500">Loading recipe...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Nav bar */}
        <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
          <Pressable
            disabled={saving}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>

          <Text className="ml-2 flex-1 text-xl font-bold text-slate-950">
            Edit Recipe
          </Text>

          <Pressable
            disabled={saving}
            className={`rounded-xl px-4 py-2 ${saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}
            onPress={() => void handleSave()}
          >
            <Text className="font-semibold text-white">
              {saving ? "Saving..." : "Update"}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, paddingTop: 20 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
        >
          {/* ── Recipe Details ── */}
          <SectionTitle
            first
            title="Recipe details"
            description="Give your recipe a name and tell us when it's eaten."
          />

          <FieldLabel text="Recipe name" required />
          <FormInput value={name} placeholder="e.g. Avocado toast" onChangeText={setName} />

          <FieldLabel text="Meal type" required />
          <View className="mt-1 mb-4 flex-row overflow-hidden rounded-2xl border border-slate-200">
            {MEAL_CATEGORIES.map((cat, i) => {
              const selected = mealCategories.includes(cat.value);
              return (
                <Pressable
                  key={cat.value}
                  className={`flex-1 items-center py-3 ${
                    selected ? "bg-blue-600" : "bg-white"
                  } ${i > 0 ? "border-l border-slate-200" : ""}`}
                  onPress={() =>
                    setMealCategories((prev) =>
                      prev.includes(cat.value)
                        ? prev.filter((c) => c !== cat.value)
                        : [...prev, cat.value],
                    )
                  }
                >
                  <Text
                    className={`text-xs font-semibold ${
                      selected ? "text-white" : "text-slate-600"
                    }`}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <FieldLabel text="Category" />
          <SearchableObjectDropdown<RecipeCategory>
            options={recipeCategories}
            selectedId={recipeCategoryId}
            selectedName={recipeCategoryName}
            placeholder="Search or type a new category"
            onTextChange={(value) => {
              if (value !== recipeCategoryName) {
                setRecipeCategoryId("");
              }
              setRecipeCategoryDraft(value);
            }}
            onSelect={(option) => {
              setRecipeCategoryId(option._id);
              setRecipeCategoryName(option.name);
              setRecipeCategoryDraft(option.name);
            }}
          />

          <FieldLabel text="Description" />
          <FormInput
            value={description}
            placeholder="What makes this recipe special?"
            multiline
            onChangeText={setDescription}
          />

          <FieldLabel text="Servings" />
          <FormInput
            value={servings}
            placeholder="1"
            keyboardType="number-pad"
            onChangeText={setServings}
          />

          {/* ── Ingredients ── */}
          <SectionTitle
            title="Ingredients"
            description="Add ingredients and how many servings of each you use."
          />

          {/* Picker card */}
          <View className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
            <FieldLabel text="Search ingredient" />
            <SearchableObjectDropdown<IngredientOption>
              options={ingredientOptions}
              selectedId={pickerIngredientId}
              selectedName={pickerIngredientName}
              placeholder="Search existing ingredients"
              showAllWhenEmpty={false}
              onTextChange={(value) => {
                if (value !== pickerIngredientName) {
                  setPickerIngredientId("");
                  setPickerSelected(null);
                  setPickerUnit("");
                }
                setPickerIngredientName(value);
              }}
              onSelect={(option) => {
                setPickerIngredientId(option._id);
                setPickerIngredientName(option.name);
                setPickerSelected(option);
                setPickerUnit(option.unit);
              }}
            />

            <View className="mt-3 flex-row items-end">
              <View className="mr-3 flex-1">
                <FieldLabel text="Amount" />
                <FormInput
                  value={pickerQuantity}
                  placeholder="1"
                  keyboardType="decimal-pad"
                  onChangeText={setPickerQuantity}
                />
              </View>

              {pickerSelected?.unit ? (
                pickerRelatedUnits.length > 1 ? (
                  <View className="mr-3 mb-1">
                    <UnitFamilyDropdown
                      unit={pickerUnit || pickerSelected.unit}
                      options={pickerRelatedUnits}
                      onSelect={setPickerUnit}
                    />
                  </View>
                ) : (
                  <View className="mr-3 mb-1 rounded-2xl bg-slate-100 px-3 py-3">
                    <Text className="text-sm text-slate-500">× {pickerSelected.unit}</Text>
                  </View>
                )
              ) : null}

              <Pressable
                className="mb-1 rounded-2xl bg-blue-600 px-5 py-3 active:bg-blue-700"
                onPress={handleAddIngredient}
              >
                <Text className="font-semibold text-white">Add</Text>
              </Pressable>
            </View>

            {pickerSelected?.unit && pickerUnit && pickerUnit !== pickerSelected.unit ? (
              <Text className="mt-2 text-xs text-slate-400">
                {(() => {
                  const converted = convertUnits(
                    Number(pickerQuantity) || 0,
                    pickerUnit,
                    pickerSelected.unit,
                    customUnitConversions,
                  );
                  return converted != null
                    ? `≈ ${Math.round(converted * 1000) / 1000} ${pickerSelected.unit} — used for nutrition & stock checks`
                    : "Can't convert to this ingredient's unit — nutrition and stock checks won't include this line";
                })()}
              </Text>
            ) : null}
          </View>

          {/* Ingredient rows */}
          {ingredientRows.length > 0 && (
            <View className="mb-4 rounded-2xl border border-slate-200 bg-white overflow-hidden">
              {ingredientRows.map((row, index) => (
                <View
                  key={row.key}
                  className={`flex-row items-center px-4 py-3 ${
                    index < ingredientRows.length - 1 ? "border-b border-slate-100" : ""
                  }`}
                >
                  <View className="h-8 w-8 items-center justify-center rounded-full bg-blue-50">
                    <Text className="text-xs font-bold text-blue-700">{index + 1}</Text>
                  </View>

                  <View className="ml-3 flex-1">
                    <Text className="font-semibold text-slate-900">{row.ingredientName}</Text>
                    <Text className="mt-0.5 text-sm text-slate-500">
                      {row.quantity}{" "}
                      {row.unit ? `× ${row.unit}` : `serving${Number(row.quantity) !== 1 ? "s" : ""}`}
                    </Text>
                  </View>

                  <Pressable className="ml-2 p-1" onPress={() => removeIngredientRow(row.key)}>
                    <Ionicons name="close-circle-outline" size={22} color="#94A3B8" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {/* Nutrition summary */}
          {hasNutritionData && (
            <>
              <Text className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                Estimated nutrition
                {Number(servings) > 1 ? ` · per serving (${servings})` : ""}
              </Text>

              <View className="mb-4 rounded-2xl border border-slate-200 bg-white overflow-hidden">
                {(
                  [
                    ["Calories", perServingNutrition.calories, "kcal"],
                    ["Protein", perServingNutrition.protein, "g"],
                    ["Carbs", perServingNutrition.carbs, "g"],
                    ["Fats", perServingNutrition.fats, "g"],
                    ["Fiber", perServingNutrition.fiber, "g"],
                    ["Sodium", perServingNutrition.sodium, "mg"],
                  ] as [string, number | null | undefined, string][]
                )
                  .filter(([, v]) => v != null && (v as number) > 0)
                  .map(([label, value, unit], i, arr) => (
                    <View
                      key={label}
                      className={`flex-row items-center justify-between px-4 py-3 ${
                        i < arr.length - 1 ? "border-b border-slate-100" : ""
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

          {/* ── Instructions ── */}
          <SectionTitle title="Instructions" description="Add step-by-step cooking instructions." />

          {steps.map((step, index) => (
            <View key={index} className="mb-3 flex-row items-start">
              <View className="mt-3 h-7 w-7 items-center justify-center rounded-full bg-blue-100">
                <Text className="text-xs font-bold text-blue-700">{index + 1}</Text>
              </View>

              <View className="ml-3 flex-1">
                <TextInput
                  value={step}
                  onChangeText={(text) => updateStep(index, text)}
                  placeholder={`Step ${index + 1}`}
                  placeholderTextColor="#94a3b8"
                  multiline
                  className="rounded-2xl bg-white px-4 py-3 text-base text-slate-900"
                  style={{ minHeight: 56 }}
                />
              </View>

              <Pressable className="ml-2 mt-3 p-1" onPress={() => removeStep(index)}>
                <Ionicons name="trash-outline" size={20} color="#94A3B8" />
              </Pressable>
            </View>
          ))}

          <Pressable
            className="mb-4 flex-row items-center justify-center rounded-2xl border border-dashed border-slate-300 py-4 active:bg-slate-100"
            onPress={() => setSteps((prev) => [...prev, ""])}
          >
            <Ionicons name="add" size={20} color="#2563EB" />
            <Text className="ml-2 font-semibold text-blue-700">Add step</Text>
          </Pressable>

          {/* ── Notes ── */}
          <SectionTitle title="Notes" description="Any tips, variations, or extra context." />

          <FormInput
            value={notes}
            placeholder="e.g. Best served fresh, substitute oat milk for dairy-free…"
            multiline
            onChangeText={setNotes}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
