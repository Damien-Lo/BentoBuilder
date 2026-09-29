import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
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
  CreatableMultiTagDropdown,
  CreatableStringDropdown,
  CreateGenericIngredientModal,
  FieldLabel,
  FormCard,
  FormInput,
  SearchableObjectDropdown,
  SegmentedToggle,
  ToggleRow,
  UnitFamilyDropdown,
} from "@/src/components/forms";

import { useScrollFocusSection } from "@/src/hooks/useScrollFocusSection";
import { getIngredients, updateIngredient, type Ingredient } from "@/src/services/ingredientApi";
import { createTag, getTags, getUnitSuggestions, type SelectOption } from "@/src/services/optionsApi";
import {
  createRecipeCategory,
  getRecipeById,
  getRecipeCategories,
  updateRecipe,
  type IngredientMatchMode,
  type MealCategory,
  type PopulatedIngredient,
  type RecipeCategory,
  type RecipeNutrition,
} from "@/src/services/recipeApi";
import { resolveOrCreateOption } from "@/src/utils/resolveOrCreateOption";
import { loadSettings } from "@/src/services/settingsService";
import { referenceId } from "@/src/utils/pantryDefaults";
import {
  convertAmountForUnitChange,
  convertUnits,
  getIngredientConversions,
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
  isGeneric: boolean;
  quantity: string;
  unit: string;
  // The ingredient's own unit — quantity/unit above may be in a different
  // (but convertible) unit chosen for this recipe, e.g. cups for an
  // ingredient whose native unit is mL. Nutrition math needs this.
  nativeUnit: string;
  portionAmount: number;
  // How much of this line's nutrition actually ends up in the dish — 1
  // (the common case) counts it in full; lower values cover ingredients
  // mostly rinsed off or discarded rather than eaten.
  nutritionFactor: number;
  // "quantity" (default) is today's exact-amount matching. "wholePiece" is
  // for something naturally sold/used as a discrete, irregularly-sized
  // unit (a fish fillet, a steak) — quantity/unit above mean "how many"
  // and a display label ("fillet"), and pieceMinWeight/pieceMaxWeight/
  // pieceWeightUnit is the acceptable real weight range for one piece.
  matchMode: IngredientMatchMode;
  pieceMinWeight: number | null;
  pieceMaxWeight: number | null;
  pieceWeightUnit: string;
  // "quantity" lines only — prompt for the real amount used each time the
  // recipe is confirmed (e.g. potatoes weighed per batch); quantity/unit
  // above is then just the pre-filled default.
  askAmount: boolean;
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
    isGeneric: ingredient.isGeneric ?? false,
    portionAmount: ingredient.defaultPortionAmount ?? 1,
    unit: ingredient.defaultPortionUnit ?? "",
    pieceLabel: ingredient.pieceLabel ?? null,
    calories: ingredient.nutrition?.calories ?? undefined,
    protein: ingredient.nutrition?.protein ?? undefined,
    carbs: ingredient.nutrition?.carbs ?? undefined,
    fats: ingredient.nutrition?.fats ?? undefined,
    fiber: ingredient.nutrition?.fiber ?? undefined,
    sodium: ingredient.nutrition?.sodium ?? undefined,
    unitConversions: ingredient.unitConversions ?? [],
    genericParent: ingredient.genericParent ?? null,
    isMealPrep: ingredient.isMealPrep ?? false,
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
  nutritionFactor: number,
  matchMode: IngredientMatchMode,
  pieceMinWeight: number | null,
  pieceMaxWeight: number | null,
  pieceWeightUnit: string,
  askAmount: boolean,
  index: number,
): IngredientRow {
  return {
    // Index-qualified — the same ingredient can appear on more than one
    // line in a recipe (e.g. an ingredient used in both a marinade and a
    // sauce), and ing._id alone would collide across those rows.
    key: `${ing._id}-loaded-${index}`,
    ingredientId: ing._id,
    ingredientName: ing.name,
    isGeneric: ing.isGeneric ?? false,
    quantity: String(quantity),
    unit: unit || ing.defaultPortionUnit || "serving",
    nativeUnit: ing.defaultPortionUnit || "serving",
    portionAmount: ing.defaultPortionAmount ?? 1,
    nutritionFactor,
    matchMode,
    pieceMinWeight,
    pieceMaxWeight,
    pieceWeightUnit,
    askAmount,
    calories: ing.nutrition?.calories ?? null,
    protein: ing.nutrition?.protein ?? null,
    carbs: ing.nutrition?.carbs ?? null,
    fats: ing.nutrition?.fats ?? null,
    fiber: ing.nutrition?.fiber ?? null,
    sodium: ing.nutrition?.sodium ?? null,
  };
}

// One instruction step — its own scroll-focus section (declared here, per
// row, rather than once for the whole page) so each step's TextInput scrolls
// itself into view within the shared page-level ScrollView regardless of
// which step it is. No dropdown involved, so no zIndex is needed.
function StepRow({
  step,
  index,
  scrollRef,
  scrollAnchorRef,
  updateStep,
  removeStep,
}: {
  step: string;
  index: number;
  scrollRef: RefObject<ScrollView | null>;
  scrollAnchorRef: RefObject<View | null>;
  updateStep: (index: number, value: string) => void;
  removeStep: (index: number) => void;
}) {
  const stepSection = useScrollFocusSection(scrollRef, scrollAnchorRef);

  return (
    <View className="mb-3 flex-row items-start">
      <View className="mt-3 h-7 w-7 items-center justify-center rounded-full bg-blue-100">
        <Text className="text-xs font-bold text-blue-700">{index + 1}</Text>
      </View>

      <View className="ml-3 flex-1" {...stepSection.wrapperProps}>
        <TextInput
          value={step}
          onChangeText={(text) => updateStep(index, text)}
          onFocus={stepSection.trigger}
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
  );
}

export default function EditRecipePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [loadingRecipe, setLoadingRecipe] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState("");
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [mealCategories, setMealCategories] = useState<MealCategory[]>([]);
  const [recipeCategoryId, setRecipeCategoryId] = useState("");
  const [recipeCategoryName, setRecipeCategoryName] = useState("");
  const [recipeCategoryDraft, setRecipeCategoryDraft] = useState("");
  const [description, setDescription] = useState("");
  const [servings, setServings] = useState("1");
  const [prepTimeMinutes, setPrepTimeMinutes] = useState("");
  const [cookTimeMinutes, setCookTimeMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [ingredientRows, setIngredientRows] = useState<IngredientRow[]>([]);
  // Set while the picker card below is editing an already-added row in
  // place, rather than staging a brand-new one.
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);

  // Picker state
  const [pickerIngredientId, setPickerIngredientId] = useState("");
  const [pickerIngredientName, setPickerIngredientName] = useState("");
  const [pickerQuantity, setPickerQuantity] = useState("1");
  const [pickerUnit, setPickerUnit] = useState("");
  // Percent (0-100) of this line's nutrition that counts toward the
  // recipe total — kept collapsed unless the user opts in, since almost
  // every ingredient counts in full.
  const [pickerNutritionPercent, setPickerNutritionPercent] = useState("100");
  const [showNutritionFactor, setShowNutritionFactor] = useState(false);
  // "Whole piece" mode — kept collapsed unless opted in, since almost every
  // ingredient is matched by exact quantity.
  const [pickerMatchMode, setPickerMatchMode] = useState<IngredientMatchMode>("quantity");
  const [pickerPieceMinWeight, setPickerPieceMinWeight] = useState("");
  const [pickerPieceMaxWeight, setPickerPieceMaxWeight] = useState("");
  const [pickerPieceWeightUnit, setPickerPieceWeightUnit] = useState("g");
  const [pickerAskAmount, setPickerAskAmount] = useState(false);
  const [pickerSelected, setPickerSelected] = useState<IngredientOption | null>(null);
  const [showCreateIngredient, setShowCreateIngredient] = useState(false);

  // "This recipe produces an ingredient" — see recipes/add.tsx for the
  // full rationale. The current link (if any) isn't part of the Recipe
  // document — it's a reverse lookup against the ingredient catalog
  // (already loaded below for the row picker) for whichever Ingredient's
  // productionRecipe points at this recipe.
  const [producesIngredient, setProducesIngredient] = useState(false);
  const [produceIngredientId, setProduceIngredientId] = useState("");
  const [produceIngredientName, setProduceIngredientName] = useState("");
  const [showCreateProducedIngredient, setShowCreateProducedIngredient] = useState(false);
  // What productionRecipe pointed at on load — lets handleSave notice the
  // link was removed or switched to a different ingredient, and clear the
  // old ingredient's link accordingly (it wouldn't otherwise be touched).
  const [originalProduceIngredientId, setOriginalProduceIngredientId] = useState("");
  const [produceYieldAmount, setProduceYieldAmount] = useState("1");
  const [produceYieldUnit, setProduceYieldUnit] = useState("");
  // "Ingredient" = usable as a component in other recipes (Dashi Stock).
  // "Meal prep" = a finished dish you reheat/eat directly (Okonomiyaki) —
  // never offered as a component when building other recipes.
  const [producedItemIsMealPrep, setProducedItemIsMealPrep] = useState(false);

  // Tags
  const [allTags, setAllTags] = useState<SelectOption[]>([]);
  const [selectedTags, setSelectedTags] = useState<SelectOption[]>([]);

  // Options
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([]);
  const [recipeCategories, setRecipeCategories] = useState<RecipeCategory[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [customUnitConversions, setCustomUnitConversions] = useState<CustomUnitConversion[]>([]);

  // Scrolls whichever field was just focused/opened into view — see
  // useScrollFocusSection. zIndex descends in on-screen top-to-bottom order
  // across the four dropdown-capable fields on this page (Category, Tags,
  // the "Prepares" ingredient picker, and the ingredient-row picker card's
  // own search field) so each one's open option list paints over whatever
  // comes after it in the scroll; every other (plain) field omits zIndex.
  const scrollRef = useRef<ScrollView>(null);
  const scrollAnchorRef = useRef<View>(null);
  const nameSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const categorySection = useScrollFocusSection(scrollRef, scrollAnchorRef, 80);
  const descriptionSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const tagsSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 60);
  const servingsSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const prepCookTimeSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const producedIngredientSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 40);
  const produceYieldSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const pickerIngredientSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 20);
  const pickerAmountSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const pickerNutritionFactorSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const pickerPieceWeightSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const notesSection = useScrollFocusSection(scrollRef, scrollAnchorRef);

  // Load recipe + options in parallel
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      try {
        const [recipe, loadedIngredients, loadedCategories, loadedTags, loadedUnits, loadedSettings] = await Promise.all([
          getRecipeById(id),
          getIngredients(),
          getRecipeCategories(),
          getTags(),
          getUnitSuggestions(),
          loadSettings(),
        ]);

        if (cancelled) return;

        // Populate form from existing recipe
        setName(recipe.name);
        setIsConfirmed(recipe.isConfirmed ?? false);
        setMealCategories(
          Array.isArray(recipe.mealCategory) ? recipe.mealCategory : [recipe.mealCategory],
        );
        setDescription(recipe.description ?? "");
        setServings(String(recipe.servings ?? 1));
        setPrepTimeMinutes(recipe.prepTimeMinutes != null ? String(recipe.prepTimeMinutes) : "");
        setCookTimeMinutes(recipe.cookTimeMinutes != null ? String(recipe.cookTimeMinutes) : "");
        setNotes(recipe.notes ?? "");
        setSteps(recipe.instructions.length > 0 ? recipe.instructions : []);

        if (recipe.recipeCategory && typeof recipe.recipeCategory !== "string") {
          setRecipeCategoryId(recipe.recipeCategory._id);
          setRecipeCategoryName(recipe.recipeCategory.name);
          setRecipeCategoryDraft(recipe.recipeCategory.name);
        }

        const rows: IngredientRow[] = [];
        recipe.ingredientList.forEach((entry, index) => {
          if (typeof entry.ingredient !== "string") {
            rows.push(
              populatedToRow(
                entry.ingredient,
                entry.quantity,
                entry.unit,
                entry.nutritionFactor ?? 1,
                entry.matchMode ?? "quantity",
                entry.pieceMinWeight ?? null,
                entry.pieceMaxWeight ?? null,
                entry.pieceWeightUnit || "g",
                entry.askAmount ?? false,
                index,
              ),
            );
          }
        });
        setIngredientRows(rows);

        const ingredientList = Array.isArray(loadedIngredients) ? loadedIngredients : [];
        setIngredientOptions(ingredientList.map(ingredientToOption));

        const producedIngredient = ingredientList.find(
          (ing) => referenceId(ing.productionRecipe) === id,
        );
        if (producedIngredient) {
          setProducesIngredient(true);
          setProduceIngredientId(producedIngredient._id);
          setProduceIngredientName(producedIngredient.name);
          setOriginalProduceIngredientId(producedIngredient._id);
          setProduceYieldAmount(String(producedIngredient.defaultPortionAmount || 1));
          setProduceYieldUnit(producedIngredient.defaultPortionUnit || "");
          setProducedItemIsMealPrep(producedIngredient.isMealPrep ?? false);
        }

        setRecipeCategories(
          Array.isArray(loadedCategories) ? loadedCategories : [],
        );
        setAllTags(Array.isArray(loadedTags) ? loadedTags : []);
        setSelectedTags(
          Array.isArray(recipe.tags)
            ? recipe.tags.filter(
                (t): t is SelectOption => typeof t === "object" && t !== null,
              )
            : [],
        );
        setUnits(Array.isArray(loadedUnits) ? loadedUnits : []);
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
        const rowIngredient = ingredientOptions.find((o) => o._id === row.ingredientId);
        // A "wholePiece" line has no single real amount to convert (`unit`
        // is just a display label like "fillet") - the pre-cook estimate
        // uses the midpoint of its acceptable weight range as a stand-in
        // for "how big a piece probably is." The real, exact nutrition
        // once actually cooked comes from whichever real pantry piece got
        // deducted (see computeConfirmedRecipeNutrition), not this preview.
        const qtyInNativeUnit = row.matchMode === "wholePiece"
          ? convertUnits(
              qty * (((row.pieceMinWeight ?? 0) + (row.pieceMaxWeight ?? row.pieceMinWeight ?? 0)) / 2),
              row.pieceWeightUnit,
              row.nativeUnit,
              getIngredientConversions(rowIngredient, customUnitConversions),
            )
          : convertUnits(
              qty,
              row.unit,
              row.nativeUnit,
              getIngredientConversions(rowIngredient, customUnitConversions),
            );
        const multiplier =
          qtyInNativeUnit != null
            ? (qtyInNativeUnit / (row.portionAmount || 1)) * row.nutritionFactor
            : 0;
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
  }, [ingredientRows, customUnitConversions, ingredientOptions]);

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
        ? getRelatedUnits(pickerSelected.unit, getIngredientConversions(pickerSelected, customUnitConversions))
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

    let pieceMinWeight: number | null = null;
    let pieceMaxWeight: number | null = null;
    if (pickerMatchMode === "wholePiece") {
      const min = Number(pickerPieceMinWeight);
      const max = Number(pickerPieceMaxWeight);
      if (!Number.isFinite(min) || min <= 0 || !Number.isFinite(max) || max <= 0) {
        Alert.alert(
          "Piece weight range required",
          "Enter both a minimum and maximum weight for one whole piece.",
        );
        return;
      }
      if (min > max) {
        Alert.alert("Invalid range", "The minimum weight can't be greater than the maximum.");
        return;
      }
      pieceMinWeight = min;
      pieceMaxWeight = max;
    }

    const nativeUnit = pickerSelected?.unit ?? "serving";
    const unit = pickerUnit || nativeUnit;

    const parsedPercent = Number(pickerNutritionPercent);
    const nutritionFactor = Number.isFinite(parsedPercent)
      ? Math.min(1, Math.max(0, parsedPercent / 100))
      : 1;

    const row: IngredientRow = {
      key: editingRowKey ?? `${pickerIngredientId}-${Date.now()}`,
      ingredientId: pickerIngredientId,
      ingredientName: pickerIngredientName,
      isGeneric: pickerSelected?.isGeneric ?? false,
      quantity: pickerQuantity,
      unit,
      nativeUnit,
      portionAmount: pickerSelected?.portionAmount ?? 1,
      nutritionFactor,
      matchMode: pickerMatchMode,
      pieceMinWeight,
      pieceMaxWeight,
      pieceWeightUnit: pickerPieceWeightUnit.trim() || "g",
      askAmount: pickerMatchMode === "quantity" && pickerAskAmount,
      calories: pickerSelected?.calories ?? null,
      protein: pickerSelected?.protein ?? null,
      carbs: pickerSelected?.carbs ?? null,
      fats: pickerSelected?.fats ?? null,
      fiber: pickerSelected?.fiber ?? null,
      sodium: pickerSelected?.sodium ?? null,
    };

    if (editingRowKey) {
      setIngredientRows((prev) => prev.map((r) => (r.key === editingRowKey ? row : r)));
    } else {
      setIngredientRows((prev) => [...prev, row]);
    }

    setEditingRowKey(null);
    setPickerIngredientId("");
    setPickerIngredientName("");
    setPickerQuantity("1");
    setPickerUnit("");
    setPickerNutritionPercent("100");
    setShowNutritionFactor(false);
    setPickerMatchMode("quantity");
    setPickerPieceMinWeight("");
    setPickerPieceMaxWeight("");
    setPickerPieceWeightUnit("g");
    setPickerAskAmount(false);
    setPickerSelected(null);
  }

  function startEditingRow(row: IngredientRow) {
    const option = ingredientOptions.find((o) => o._id === row.ingredientId) ?? null;
    setEditingRowKey(row.key);
    setPickerIngredientId(row.ingredientId);
    setPickerIngredientName(row.ingredientName);
    setPickerQuantity(row.quantity);
    setPickerUnit(row.unit);
    setPickerNutritionPercent(String(Math.round(row.nutritionFactor * 100)));
    setShowNutritionFactor(row.nutritionFactor !== 1);
    setPickerMatchMode(row.matchMode);
    setPickerPieceMinWeight(row.pieceMinWeight != null ? String(row.pieceMinWeight) : "");
    setPickerPieceMaxWeight(row.pieceMaxWeight != null ? String(row.pieceMaxWeight) : "");
    setPickerPieceWeightUnit(row.pieceWeightUnit || "g");
    setPickerAskAmount(row.askAmount);
    setPickerSelected(option);
  }

  function cancelEditingRow() {
    setEditingRowKey(null);
    setPickerIngredientId("");
    setPickerIngredientName("");
    setPickerQuantity("1");
    setPickerUnit("");
    setPickerNutritionPercent("100");
    setShowNutritionFactor(false);
    setPickerMatchMode("quantity");
    setPickerPieceMinWeight("");
    setPickerPieceMaxWeight("");
    setPickerPieceWeightUnit("g");
    setPickerAskAmount(false);
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

  async function handleCreateTag(tagName: string): Promise<SelectOption> {
    const tag = await createTag(tagName);
    setAllTags((prev) => (prev.some((t) => t._id === tag._id) ? prev : [...prev, tag]));
    return tag;
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
    if (mealCategories.length === 0 && !producesIngredient) {
      Alert.alert("Meal type required", "Select at least one meal type.");
      return;
    }
    const numServings = Number(servings);
    if (!Number.isFinite(numServings) || numServings < 1) {
      Alert.alert("Invalid servings", "Enter a serving count of 1 or more.");
      return;
    }
    if (producesIngredient && !produceIngredientId) {
      Alert.alert("Ingredient required", "Search for or create the ingredient this recipe prepares.");
      return;
    }
    const numYieldAmount = Number(produceYieldAmount);
    if (producesIngredient && (!Number.isFinite(numYieldAmount) || numYieldAmount <= 0 || !produceYieldUnit.trim())) {
      Alert.alert("Yield required", "Enter how much one serving makes (a positive amount and a unit).");
      return;
    }
    if (prepTimeMinutes.trim() && (!Number.isFinite(Number(prepTimeMinutes)) || Number(prepTimeMinutes) < 0)) {
      Alert.alert("Invalid prep time", "Enter a prep time of zero or more minutes.");
      return;
    }
    if (cookTimeMinutes.trim() && (!Number.isFinite(Number(cookTimeMinutes)) || Number(cookTimeMinutes) < 0)) {
      Alert.alert("Invalid cook time", "Enter a cook time of zero or more minutes.");
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

      const resolvedTags = await Promise.all(
        selectedTags.map((tag) =>
          tag._id ? tag : resolveOrCreateOption(allTags, "", tag.name, handleCreateTag),
        ),
      );
      const tagIds = resolvedTags.filter((t): t is SelectOption => t != null).map((t) => t._id);

      const savedRecipe = await updateRecipe(id, {
        name: name.trim(),
        mealCategory: mealCategories,
        recipeCategory: recipeCategory?._id || null,
        tags: tagIds,
        description: description.trim() || undefined,
        servings: numServings,
        prepTimeMinutes: prepTimeMinutes.trim() ? Number(prepTimeMinutes) : null,
        cookTimeMinutes: cookTimeMinutes.trim() ? Number(cookTimeMinutes) : null,
        notes: notes.trim() || undefined,
        ingredientList: ingredientRows.map((row) => ({
          ingredient: row.ingredientId,
          quantity: Number(row.quantity),
          unit: row.unit,
          nutritionFactor: row.nutritionFactor,
          matchMode: row.matchMode,
          pieceMinWeight: row.pieceMinWeight,
          pieceMaxWeight: row.pieceMaxWeight,
          pieceWeightUnit: row.pieceWeightUnit,
          askAmount: row.askAmount,
        })),
        instructions: steps.map((s) => s.trim()).filter((s) => s.length > 0),
        nutrition: hasNutritionData ? perServingNutrition : undefined,
        isConfirmed,
      });

      const nextProduceIngredientId = producesIngredient ? produceIngredientId : "";

      // The link moved off the original ingredient (removed, or switched
      // to a different one) — clear it there too, best-effort, since it
      // wouldn't otherwise be touched by this save.
      if (originalProduceIngredientId && originalProduceIngredientId !== nextProduceIngredientId) {
        try {
          await updateIngredient(originalProduceIngredientId, { productionRecipe: null });
        } catch {
          // non-fatal — worst case the old ingredient still points here
          // until edited again
        }
      }

      if (nextProduceIngredientId) {
        try {
          await updateIngredient(nextProduceIngredientId, {
            productionRecipe: savedRecipe._id,
            defaultPortionAmount: numYieldAmount,
            defaultPortionUnit: produceYieldUnit.trim(),
            isMealPrep: producedItemIsMealPrep,
          });
        } catch (linkError) {
          Alert.alert(
            "Recipe saved, but not linked",
            linkError instanceof Error
              ? linkError.message
              : `Couldn't link this recipe to ${produceIngredientName || "the ingredient"} — try again.`,
          );
          router.back();
          return;
        }
      }

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
    <>
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
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, paddingTop: 20 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
        >
          <View ref={scrollAnchorRef} collapsable={false} />
          {/* ── Recipe Details ── */}
          <FormCard icon="book-outline" title="Recipe details" description="Give your recipe a name and tell us when it's eaten." zIndex={60}>

          <View {...nameSection.wrapperProps}>
            <FieldLabel text="Recipe name" required />
            <FormInput
              value={name}
              placeholder="e.g. Avocado toast"
              onFocus={nameSection.trigger}
              onChangeText={setName}
            />
          </View>

          <FieldLabel text="Meal type" required={!producesIngredient} />
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

          <FieldLabel text="Status" />
          <View className="mt-1 mb-4 flex-row overflow-hidden rounded-2xl border border-slate-200">
            <Pressable
              className={`flex-1 items-center py-3 ${
                !isConfirmed ? "bg-blue-600" : "bg-white"
              }`}
              onPress={() => setIsConfirmed(false)}
            >
              <Text
                className={`text-xs font-semibold ${
                  !isConfirmed ? "text-white" : "text-slate-600"
                }`}
              >
                Want to try
              </Text>
            </Pressable>
            <Pressable
              className={`flex-1 items-center border-l border-slate-200 py-3 ${
                isConfirmed ? "bg-blue-600" : "bg-white"
              }`}
              onPress={() => setIsConfirmed(true)}
            >
              <Text
                className={`text-xs font-semibold ${
                  isConfirmed ? "text-white" : "text-slate-600"
                }`}
              >
                Confirmed
              </Text>
            </Pressable>
          </View>

          <View {...categorySection.wrapperProps}>
            <FieldLabel text="Category" />
            <SearchableObjectDropdown<RecipeCategory>
              options={recipeCategories}
              selectedId={recipeCategoryId}
              selectedName={recipeCategoryName}
              placeholder="Search or type a new category"
              onOpen={categorySection.trigger}
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
          </View>

          <View {...descriptionSection.wrapperProps}>
            <FieldLabel text="Description" />
            <FormInput
              value={description}
              placeholder="What makes this recipe special?"
              multiline
              onFocus={descriptionSection.trigger}
              onChangeText={setDescription}
            />
          </View>

          <View {...tagsSection.wrapperProps}>
            <FieldLabel text="Tags" />
            <CreatableMultiTagDropdown
              options={allTags}
              selectedItems={selectedTags}
              placeholder="Add a tag…"
              onOpen={tagsSection.trigger}
              onAdd={(option) => setSelectedTags((prev) => [...prev, option])}
              onRemove={(id) => setSelectedTags((prev) => prev.filter((t) => t._id !== id))}
            />
          </View>

          <View className="flex-row gap-3" {...prepCookTimeSection.wrapperProps}>
            <View className="flex-1" {...servingsSection.wrapperProps}>
              <FieldLabel text="Servings" />
              <FormInput
              value={servings}
              placeholder="1"
              keyboardType="number-pad"
              onFocus={servingsSection.trigger}
              onChangeText={setServings}
            />
            </View>
            <View className="flex-1">
              <FieldLabel text="Prep (min)" />
              <FormInput
                value={prepTimeMinutes}
                placeholder="e.g. 15"
                keyboardType="number-pad"
                onFocus={prepCookTimeSection.trigger}
                onChangeText={setPrepTimeMinutes}
              />
            </View>
            <View className="flex-1">
              <FieldLabel text="Cook (min)" />
              <FormInput
                value={cookTimeMinutes}
                placeholder="e.g. 20"
                keyboardType="number-pad"
                onFocus={prepCookTimeSection.trigger}
                onChangeText={setCookTimeMinutes}
              />
            </View>
          </View>

          </FormCard>

          <FormCard icon="archive-outline" title="Makes something" description="Optional — for stocks, sauces and meal preps that go into your pantry." zIndex={50}>

          <ToggleRow
            label="This recipe prepares something"
            description="e.g. Dashi Stock or a batch of Okonomiyaki — cooking this deposits it in your pantry, and its nutrition carries over automatically."
            value={producesIngredient}
            onChange={setProducesIngredient}
          />

          {producesIngredient && (
            <>
              <FieldLabel text="Kind" required />
              <SegmentedToggle<boolean>
                options={[
                  { value: false, label: "Ingredient" },
                  { value: true, label: "Meal prep" },
                ]}
                value={producedItemIsMealPrep}
                onChange={setProducedItemIsMealPrep}
              />
              <Text className="mt-2 text-xs leading-4 text-slate-500">
                {producedItemIsMealPrep
                  ? "A finished dish you reheat and eat — kept out of the main Ingredients list, but still searchable as an ingredient if another recipe needs to finish it (e.g. adding an egg)."
                  : "A component other recipes can use (falling back to these ingredients if you're short), e.g. Dashi Stock."}
              </Text>

              <View {...producedIngredientSection.wrapperProps}>
                <FieldLabel text="Prepares" required />
                <SearchableObjectDropdown<IngredientOption>
                  options={ingredientOptions}
                  selectedId={produceIngredientId}
                  selectedName={produceIngredientName}
                  placeholder="Search existing ingredients"
                  showAllWhenEmpty={false}
                  onOpen={producedIngredientSection.trigger}
                  onTextChange={(value) => {
                    if (value !== produceIngredientName) {
                      setProduceIngredientId("");
                    }
                    setProduceIngredientName(value);
                  }}
                  onSelect={(option) => {
                    setProduceIngredientId(option._id);
                    setProduceIngredientName(option.name);
                  }}
                  onCreateNew={() => setShowCreateProducedIngredient(true)}
                />
              </View>

              <FieldLabel text="1 serving makes" required />
              <View className="flex-row">
                <View className="mr-3 flex-1" {...produceYieldSection.wrapperProps}>
                  <FormInput
                    value={produceYieldAmount}
                    placeholder="1"
                    keyboardType="decimal-pad"
                    onFocus={produceYieldSection.trigger}
                    onChangeText={setProduceYieldAmount}
                  />
                </View>
                <View className="flex-1">
                  <CreatableStringDropdown
                    options={units}
                    selectedValue={produceYieldUnit}
                    placeholder="e.g. mL"
                    onSelect={setProduceYieldUnit}
                  />
                </View>
              </View>
              <Text className="mt-2 text-xs leading-4 text-slate-500">
                e.g. 250 mL — this becomes {produceIngredientName.trim() || "the ingredient"}
                &apos;s own portion size, so its nutrition (carried over automatically) means the
                right thing.
              </Text>
            </>
          )}

          </FormCard>

          {/* ── Ingredients ── */}
          <FormCard icon="basket-outline" title="Ingredients" description="Add ingredients and how many servings of each you use." zIndex={40}>

          {/* Picker card — the "Search ingredient" dropdown lives nested one
              level inside this card, which is itself the direct ScrollView
              sibling, so its zIndex has to go on this outer card (matching
              review.tsx's brandGenericSection pattern) while the ref/trigger
              that actually gets measured stay on the inner wrapper below. */}
          <View
            className="mb-3 mt-3 rounded-2xl bg-slate-50 p-3"
            style={pickerIngredientSection.wrapperProps.style}
          >
            <View {...pickerIngredientSection.wrapperProps}>
              <FieldLabel text="Search ingredient" />
              <SearchableObjectDropdown<IngredientOption>
                options={ingredientOptions}
                selectedId={pickerIngredientId}
                selectedName={pickerIngredientName}
                placeholder="Search existing ingredients"
                showAllWhenEmpty={false}
                onOpen={pickerIngredientSection.trigger}
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
                onCreateNew={() => setShowCreateIngredient(true)}
                renderSubtitle={(option) =>
                  option.isGeneric ? (
                    <Text className="mt-0.5 text-xs font-medium text-violet-600">Generic</Text>
                  ) : null
                }
              />
            </View>

            <View className="mt-3 flex-row items-end" {...pickerAmountSection.wrapperProps}>
              <View className="mr-3 flex-1">
                <FieldLabel text="Amount" />
                <FormInput
                  value={pickerQuantity}
                  placeholder="1"
                  keyboardType="decimal-pad"
                  onFocus={pickerAmountSection.trigger}
                  onChangeText={setPickerQuantity}
                />
              </View>

              {pickerSelected?.unit ? (
                pickerRelatedUnits.length > 1 ? (
                  <View className="mr-3 mb-1">
                    <UnitFamilyDropdown
                      unit={pickerUnit || pickerSelected.unit}
                      options={pickerRelatedUnits}
                      onSelect={(unit) => {
                        const converted = convertAmountForUnitChange(
                          Number(pickerQuantity),
                          pickerUnit || pickerSelected.unit,
                          unit,
                          getIngredientConversions(pickerSelected, customUnitConversions),
                        );
                        if (converted != null) setPickerQuantity(String(converted));
                        setPickerUnit(unit);
                      }}
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
                <Text className="font-semibold text-white">
                  {editingRowKey ? "Update" : "Add"}
                </Text>
              </Pressable>
            </View>

            {editingRowKey && (
              <Pressable className="mt-1 self-start" onPress={cancelEditingRow}>
                <Text className="text-sm font-semibold text-slate-500">Cancel edit</Text>
              </Pressable>
            )}

            {pickerSelected?.unit && pickerUnit && pickerUnit !== pickerSelected.unit ? (
              <Text className="mt-2 text-xs text-slate-400">
                {(() => {
                  const converted = convertUnits(
                    Number(pickerQuantity) || 0,
                    pickerUnit,
                    pickerSelected.unit,
                    getIngredientConversions(pickerSelected, customUnitConversions),
                  );
                  return converted != null
                    ? `≈ ${Math.round(converted * 1000) / 1000} ${pickerSelected.unit} — used for nutrition & stock checks`
                    : "Can't convert to this ingredient's unit — nutrition and stock checks won't include this line";
                })()}
              </Text>
            ) : null}

            <Pressable
              className="mt-3 self-start"
              onPress={() => setShowNutritionFactor((prev) => !prev)}
            >
              <Text className="text-xs font-semibold text-blue-600">
                {pickerNutritionPercent !== "100"
                  ? `Counts ${pickerNutritionPercent}% toward nutrition`
                  : "Not fully eaten? Adjust nutrition %"}
              </Text>
            </Pressable>

            {showNutritionFactor && (
              <View className="mt-2 flex-row items-center" {...pickerNutritionFactorSection.wrapperProps}>
                <View style={{ width: 80 }}>
                  <FormInput
                    value={pickerNutritionPercent}
                    placeholder="100"
                    keyboardType="number-pad"
                    onFocus={pickerNutritionFactorSection.trigger}
                    onChangeText={setPickerNutritionPercent}
                  />
                </View>
                <Text className="ml-1 text-sm text-slate-500">%</Text>
                <Text className="ml-2 flex-1 text-xs leading-4 text-slate-400">
                  of this line&apos;s nutrition counts toward the recipe — e.g. 10% for
                  something mostly rinsed or drained off
                </Text>
              </View>
            )}

            <Pressable
              className="mt-3 self-start"
              onPress={() => {
                setPickerMatchMode((prev) => {
                  const next = prev === "wholePiece" ? "quantity" : "wholePiece";
                  // Pre-fill the display unit from the ingredient's own
                  // piece label (e.g. "steak"), if it has one and nothing's
                  // already been typed - purely a typing convenience, never
                  // overwrites something the user already entered.
                  if (next === "wholePiece" && pickerSelected?.pieceLabel && !pickerUnit.trim()) {
                    setPickerUnit(pickerSelected.pieceLabel);
                  }
                  return next;
                });
              }}
            >
              <Text className="text-xs font-semibold text-blue-600">
                {pickerMatchMode === "wholePiece"
                  ? "Matched as a whole piece — tap to switch back to an exact amount"
                  : "Naturally a whole piece (fillet, steak)? Match by piece instead"}
              </Text>
            </Pressable>

            {pickerMatchMode === "wholePiece" && (
              <View className="mt-2">
                <Text className="text-xs leading-4 text-slate-400">
                  Amount above is how many whole pieces this line needs — a real pantry
                  item whose own weight falls in this range is used whole, never split.
                </Text>
                <View className="mt-2 flex-row items-end gap-2" {...pickerPieceWeightSection.wrapperProps}>
                  <View className="flex-1">
                    <FieldLabel text="Min weight" />
                    <FormInput
                      value={pickerPieceMinWeight}
                      placeholder="150"
                      keyboardType="decimal-pad"
                      onFocus={pickerPieceWeightSection.trigger}
                      onChangeText={setPickerPieceMinWeight}
                    />
                  </View>
                  <View className="flex-1">
                    <FieldLabel text="Max weight" />
                    <FormInput
                      value={pickerPieceMaxWeight}
                      placeholder="250"
                      keyboardType="decimal-pad"
                      onFocus={pickerPieceWeightSection.trigger}
                      onChangeText={setPickerPieceMaxWeight}
                    />
                  </View>
                  <View style={{ width: 70 }}>
                    <FieldLabel text="Unit" />
                    <FormInput
                      value={pickerPieceWeightUnit}
                      placeholder="g"
                      onFocus={pickerPieceWeightSection.trigger}
                      onChangeText={setPickerPieceWeightUnit}
                    />
                  </View>
                </View>
              </View>
            )}

            {pickerMatchMode === "quantity" && (
              <Pressable className="mt-3 self-start" onPress={() => setPickerAskAmount((prev) => !prev)}>
                <Text className="text-xs font-semibold text-blue-600">
                  {pickerAskAmount
                    ? "Asks for the real amount when cooking — tap to always use this amount"
                    : "Amount varies each time (e.g. weighed out)? Ask when cooking"}
                </Text>
              </Pressable>
            )}
            {pickerMatchMode === "quantity" && pickerAskAmount && (
              <Text className="mt-1 text-xs leading-4 text-slate-400">
                Confirming this recipe in the planner will ask how much you actually used, pre-filled
                with the amount above — what you enter is what gets deducted from your pantry and
                counted for nutrition.
              </Text>
            )}
          </View>

          {/* Ingredient rows */}
          {ingredientRows.length > 0 && (
            <View className="mb-3 overflow-hidden rounded-2xl border border-slate-100 bg-white">
              {ingredientRows.map((row, index) => (
                <Pressable
                  key={row.key}
                  className={`flex-row items-center px-4 py-3 ${
                    index < ingredientRows.length - 1 ? "border-b border-slate-100" : ""
                  } ${editingRowKey === row.key ? "bg-blue-50" : "active:bg-slate-50"}`}
                  onPress={() => startEditingRow(row)}
                >
                  <View className="h-8 w-8 items-center justify-center rounded-full bg-blue-50">
                    <Text className="text-xs font-bold text-blue-700">{index + 1}</Text>
                  </View>

                  <View className="ml-3 flex-1">
                    <View className="flex-row items-center">
                      <Text className="font-semibold text-slate-900">{row.ingredientName}</Text>
                      {row.isGeneric && (
                        <Text className="ml-1.5 text-xs font-medium text-violet-600">Generic</Text>
                      )}
                    </View>
                    <Text className="mt-0.5 text-sm text-slate-500">
                      {row.quantity}{" "}
                      {row.unit ? `× ${row.unit}` : `serving${Number(row.quantity) !== 1 ? "s" : ""}`}
                      {row.matchMode === "wholePiece"
                        ? ` (${row.pieceMinWeight}-${row.pieceMaxWeight}${row.pieceWeightUnit} each, whole)`
                        : ""}
                      {row.nutritionFactor !== 1
                        ? ` · ${Math.round(row.nutritionFactor * 100)}% counted`
                        : ""}
                      {row.askAmount ? " · asks amount when cooking" : ""}
                    </Text>
                  </View>

                  <Pressable
                    className="ml-2 p-1"
                    onPress={(e) => {
                      e.stopPropagation();
                      if (editingRowKey === row.key) cancelEditingRow();
                      removeIngredientRow(row.key);
                    }}
                  >
                    <Ionicons name="close-circle-outline" size={22} color="#94A3B8" />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          )}

          {/* Nutrition summary */}
          {hasNutritionData && (
            <>
              <Text className="mb-2 mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                Estimated nutrition
                {Number(servings) > 1 ? ` · per serving (${servings})` : ""}
              </Text>

              <View className="mb-3 overflow-hidden rounded-2xl border border-slate-100 bg-white">
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

          </FormCard>

          {/* ── Instructions ── */}
          <FormCard icon="list-outline" title="Instructions" description="Add step-by-step cooking instructions." zIndex={30}>
          <View className="h-3" />

          {steps.map((step, index) => (
            <StepRow
              key={index}
              step={step}
              index={index}
              scrollRef={scrollRef}
              scrollAnchorRef={scrollAnchorRef}
              updateStep={updateStep}
              removeStep={removeStep}
            />
          ))}

          <Pressable
            className="mb-4 flex-row items-center justify-center rounded-2xl border border-dashed border-slate-300 py-4 active:bg-slate-100"
            onPress={() => setSteps((prev) => [...prev, ""])}
          >
            <Ionicons name="add" size={20} color="#2563EB" />
            <Text className="ml-2 font-semibold text-blue-700">Add step</Text>
          </Pressable>

          </FormCard>

          {/* ── Notes ── */}
          <FormCard icon="document-text-outline" title="Notes" description="Any tips, variations, or extra context." zIndex={20}>
          <View className="h-3" />

          <View {...notesSection.wrapperProps}>
            <FormInput
              value={notes}
              placeholder="e.g. Best served fresh, substitute oat milk for dairy-free…"
              multiline
              onFocus={notesSection.trigger}
              onChangeText={setNotes}
            />
          </View>
          </FormCard>

          <Pressable
            disabled={saving}
            onPress={() => void handleSave()}
            className={`mt-2 items-center rounded-2xl py-4 ${saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}
          >
            <Text className="text-base font-semibold text-white">{saving ? "Saving..." : "Save changes"}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>

    <CreateGenericIngredientModal
      visible={showCreateIngredient}
      initialName={pickerIngredientName}
      onClose={() => setShowCreateIngredient(false)}
      onCreated={(ingredient) => {
        const option = ingredientToOption(ingredient);
        setIngredientOptions((prev) => [...prev, option]);
        setPickerIngredientId(option._id);
        setPickerIngredientName(option.name);
        setPickerSelected(option);
        setPickerUnit(option.unit);
        setShowCreateIngredient(false);
      }}
    />

    <CreateGenericIngredientModal
      visible={showCreateProducedIngredient}
      initialName={produceIngredientName.trim() || name.trim()}
      title={producedItemIsMealPrep ? "Create meal prep" : "Create prepared ingredient"}
      description={
        producedItemIsMealPrep
          ? "No existing item matched — this creates the meal prep this recipe makes, so cooking it can deposit a batch here."
          : "No existing ingredient matched — this creates the ingredient this recipe makes, so cooking it can deposit a batch here."
      }
      onClose={() => setShowCreateProducedIngredient(false)}
      onCreated={(ingredient) => {
        const option = ingredientToOption(ingredient);
        setIngredientOptions((prev) => [...prev, option]);
        setProduceIngredientId(option._id);
        setProduceIngredientName(option.name);
        setShowCreateProducedIngredient(false);
      }}
    />
    </>
  );
}
