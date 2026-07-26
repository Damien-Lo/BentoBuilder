import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  BarcodeScannerModal,
  type ScannedProduct,
} from "@/src/components/BarcodeScannerModal";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  CreatableObjectDropdown,
  CreatableStringDropdown,
  FieldLabel,
  FormInput,
  SearchableObjectDropdown,
  SectionTitle,
  SegmentedToggle,
} from "@/src/components/forms";

import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";

import {
  createBrand,
  createCategory,
  createStorageLocation,
  getBrands,
  getCategories,
  getStorageLocations,
  getUnitSuggestions,
} from "@/src/services/optionsApi";

import { addIngredientToPantry } from "@/src/services/pantryApi";
import { createIngredient } from "@/src/services/ingredientApi";

import type { IngredientOption, SelectOption } from "@/src/types/options";

interface FormState {
  ingredientId: string;
  ingredientName: string;
  barcode: string;
  defaultPortionAmount: string;

  description: string;

  isGeneric: boolean;

  brandId: string;
  brandName: string;

  genericParentId: string;
  genericParentName: string;

  categoryId: string;
  categoryName: string;

  storageLocationId: string;
  storageLocationName: string;

  quantityAvailable: string;
  quantityUnit: string;
  purchaseDate: string;
  expiryDate: string;
  lowStockThreshold: string;

  calories: string;
  protein: string;
  carbs: string;
  fats: string;
  fiber: string;
  sodium: string;
}

const initialForm: FormState = {
  ingredientId: "",
  ingredientName: "",
  barcode: "",
  defaultPortionAmount: "",

  description: "",

  isGeneric: false,

  brandId: "",
  brandName: "",

  genericParentId: "",
  genericParentName: "",

  categoryId: "",
  categoryName: "",

  storageLocationId: "",
  storageLocationName: "",

  quantityAvailable: "",
  quantityUnit: "",
  purchaseDate: new Date().toISOString().split("T")[0],
  expiryDate: "",
  lowStockThreshold: "0",

  calories: "",
  protein: "",
  carbs: "",
  fats: "",
  fiber: "",
  sodium: "",
};

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function numberToFormValue(value: number | undefined): string {
  return value != null ? String(value) : "";
}

function isValidDateString(value: string): boolean {
  if (!value.trim()) {
    return true;
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!datePattern.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);

  return !Number.isNaN(date.getTime());
}

function ingredientToOption(ingredient: Ingredient): IngredientOption {
  const category =
    typeof ingredient.category === "object" && ingredient.category !== null
      ? ingredient.category
      : undefined;

  const genericParent =
    typeof ingredient.genericParent === "object" &&
    ingredient.genericParent !== null
      ? ingredient.genericParent
      : undefined;

  return {
    _id: ingredient._id,
    name: ingredient.name,

    description: ingredient.description ?? "",

    isGeneric: ingredient.isGeneric ?? false,

    genericParentId:
      genericParent?._id ??
      (typeof ingredient.genericParent === "string"
        ? ingredient.genericParent
        : ""),

    genericParentName: genericParent?.name ?? "",

    unit: ingredient.defaultPortionUnit ?? "",
    defaultPortionAmount: ingredient.defaultPortionAmount,

    lowStockThreshold: ingredient.lowStockThreshold,

    calories: ingredient.nutrition?.calories,

    protein: ingredient.nutrition?.protein,

    carbs: ingredient.nutrition?.carbs,

    fat: ingredient.nutrition?.fats,

    fiber: ingredient.nutrition?.fiber,

    sodium: ingredient.nutrition?.sodium,

    categoryId:
      category?._id ??
      (typeof ingredient.category === "string" ? ingredient.category : ""),

    categoryName: category?.name ?? "",

    category: category
      ? {
          _id: category._id,
          name: category.name,
        }
      : undefined,
  };
}

export default function AddManualPantryItemScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    scannedName?: string;
    scannedBarcode?: string;
    scannedBrand?: string;
    scannedQuantity?: string;
    scannedQuantityUnit?: string;
    scannedServingSize?: string;
    scannedServingUnit?: string;
    scannedCalories?: string;
    scannedProtein?: string;
    scannedCarbs?: string;
    scannedFats?: string;
    scannedFiber?: string;
    scannedSodium?: string;
  }>();

  const [form, setForm] = useState<FormState>(() => {
    if (params.scannedName) {
      return {
        ...initialForm,
        ingredientName: params.scannedName,
        barcode: params.scannedBarcode ?? "",
        brandName: params.scannedBrand ?? "",
        quantityAvailable: params.scannedQuantity ?? "",
        quantityUnit: params.scannedQuantityUnit || params.scannedServingUnit || "",
        defaultPortionAmount: params.scannedServingSize ?? "",
        calories: params.scannedCalories ?? "",
        protein: params.scannedProtein ?? "",
        carbs: params.scannedCarbs ?? "",
        fats: params.scannedFats ?? "",
        fiber: params.scannedFiber ?? "",
        sodium: params.scannedSodium ?? "",
      };
    }
    return initialForm;
  });
  const [scannerVisible, setScannerVisible] = useState(false);

  const [saving, setSaving] = useState(false);

  // Collapsed by default — adding an ingredient shouldn't force stocking it
  // in the pantry right away.
  const [pantryInventoryExpanded, setPantryInventoryExpanded] = useState(false);

  const [loadingOptions, setLoadingOptions] = useState(true);

  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);

  const [categories, setCategories] = useState<SelectOption[]>([]);

  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);

  const [brands, setBrands] = useState<SelectOption[]>([]);

  const [brandDraft, setBrandDraft] = useState(() => params.scannedBrand ?? "");

  const [genericParentDraft, setGenericParentDraft] = useState("");

  const [units, setUnits] = useState<string[]>([]);

  const genericIngredientOptions = ingredients.filter(
    (option) => option.isGeneric,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      try {
        const [
          loadedIngredients,
          loadedCategories,
          loadedStorageLocations,
          loadedBrands,
          loadedUnits,
        ] = await Promise.all([
          getIngredients(),
          getCategories(),
          getStorageLocations(),
          getBrands(),
          getUnitSuggestions(),
        ]);

        if (cancelled) {
          return;
        }

        setIngredients(
          Array.isArray(loadedIngredients)
            ? loadedIngredients.map(ingredientToOption)
            : [],
        );

        setCategories(Array.isArray(loadedCategories) ? loadedCategories : []);

        setStorageLocations(
          Array.isArray(loadedStorageLocations) ? loadedStorageLocations : [],
        );

        setBrands(Array.isArray(loadedBrands) ? loadedBrands : []);

        setUnits(Array.isArray(loadedUnits) ? loadedUnits : []);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not load form options.";

        Alert.alert("Unable to load options", message);
      } finally {
        if (!cancelled) {
          setLoadingOptions(false);
        }
      }
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateForm<K extends keyof FormState>(
    field: K,
    value: FormState[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function applyScannedProduct(product: ScannedProduct) {
    setForm((current) => ({
      ...current,
      ingredientId: "",
      ingredientName: product.name,
      barcode: product.barcode,
      brandName: product.brand ?? current.brandName,
      quantityAvailable: product.packageQuantity != null ? String(product.packageQuantity) : current.quantityAvailable,
      quantityUnit: product.packageUnit || product.servingUnit,
      defaultPortionAmount: String(product.servingSize),
      calories: product.calories != null ? String(Math.round(product.calories)) : current.calories,
      protein: product.protein != null ? String(Math.round(product.protein * 10) / 10) : current.protein,
      carbs: product.carbs != null ? String(Math.round(product.carbs * 10) / 10) : current.carbs,
      fats: product.fats != null ? String(Math.round(product.fats * 10) / 10) : current.fats,
      fiber: product.fiber != null ? String(Math.round(product.fiber * 10) / 10) : current.fiber,
      sodium: product.sodium != null ? String(product.sodium) : current.sodium,
    }));

    if (product.brand) {
      setBrandDraft(product.brand);
    }
  }

  function applySelectedIngredient(option: IngredientOption) {
    setForm((current) => ({
      ...current,

      ingredientId: option._id,
      ingredientName: option.name,

      description: option.description ?? "",

      isGeneric: option.isGeneric ?? false,

      genericParentId: option.genericParentId ?? "",
      genericParentName: option.genericParentName ?? "",

      quantityUnit: option.unit ?? "",
      defaultPortionAmount: numberToFormValue(option.defaultPortionAmount),

      lowStockThreshold:
        option.lowStockThreshold != null
          ? String(option.lowStockThreshold)
          : "0",

      calories: numberToFormValue(option.calories),

      protein: numberToFormValue(option.protein),

      carbs: numberToFormValue(option.carbs),

      fats: numberToFormValue(option.fat),

      fiber: numberToFormValue(option.fiber),

      sodium: numberToFormValue(option.sodium),

      categoryId: option.categoryId ?? option.category?._id ?? "",

      categoryName: option.categoryName ?? option.category?.name ?? "",
    }));
  }

  async function handleCreateCategory(name: string): Promise<SelectOption> {
    const category = await createCategory(name);

    setCategories((current) => {
      const exists = current.some((item) => item._id === category._id);

      return exists
        ? current
        : [...current, category].sort((first, second) =>
            first.name.localeCompare(second.name),
          );
    });

    return category;
  }

  async function handleCreateStorageLocation(
    name: string,
  ): Promise<SelectOption> {
    const location = await createStorageLocation(name);

    setStorageLocations((current) => {
      const exists = current.some((item) => item._id === location._id);

      return exists
        ? current
        : [...current, location].sort((first, second) =>
            first.name.localeCompare(second.name),
          );
    });

    return location;
  }

  async function handleCreateBrand(name: string): Promise<SelectOption> {
    const brand = await createBrand(name);

    setBrands((current) => {
      const exists = current.some((item) => item._id === brand._id);

      return exists
        ? current
        : [...current, brand].sort((first, second) =>
            first.name.localeCompare(second.name),
          );
    });

    return brand;
  }

  function handleAddUnit(unit: string) {
    const trimmedUnit = unit.trim();

    if (!trimmedUnit) {
      return;
    }

    setUnits((current) => {
      const exists = current.some(
        (item) => item.toLowerCase() === trimmedUnit.toLowerCase(),
      );

      return exists
        ? current
        : [...current, trimmedUnit].sort((first, second) =>
            first.localeCompare(second),
          );
    });

    updateForm("quantityUnit", trimmedUnit);
  }

  /**
   * handleSave
   * Save the current form data as a new pantry item, add new ingredient if ingreident does not exist.
   */
  async function handleSave() {
    if (!form.ingredientName.trim()) {
      Alert.alert(
        "Ingredient name is required",
        "Enter a name or select an existing ingredient.",
      );

      return;
    }

    if (!form.categoryId) {
      Alert.alert("Category is required", "Select or create a category.");
      return;
    }

    // Low-stock threshold is a property of the ingredient itself (generic or
    // specific) — not of any one pantry entry — so it's parsed once here and
    // sent to createIngredient regardless of whether pantry stock is added.
    const ingredientLowStockThreshold = form.lowStockThreshold.trim()
      ? Number(form.lowStockThreshold)
      : undefined;

    if (
      ingredientLowStockThreshold !== undefined &&
      (!Number.isFinite(ingredientLowStockThreshold) ||
        ingredientLowStockThreshold < 0)
    ) {
      Alert.alert(
        "Invalid low-stock threshold",
        "Enter a threshold of zero or greater.",
      );

      return;
    }

    // Generic ingredients (e.g. "Soy Sauce") are a matching umbrella for a
    // recipe, not a physical thing you can own — whatever is actually in the
    // pantry is always some specific product. So a generic ingredient is
    // only ever a catalog definition, never a pantry item.
    if (form.isGeneric) {
      if (form.ingredientId) {
        Alert.alert(
          "Nothing to save",
          "This is already a generic ingredient — it can't be stocked in the pantry. Select or create a specific/branded ingredient instead.",
        );

        return;
      }

      try {
        setSaving(true);

        const nutrition = {
          calories: optionalNumber(form.calories),
          protein: optionalNumber(form.protein),
          carbs: optionalNumber(form.carbs),
          fats: optionalNumber(form.fats),
          fiber: optionalNumber(form.fiber),
          sodium: optionalNumber(form.sodium),
        };

        await createIngredient({
          name: form.ingredientName.trim(),
          barcode: form.barcode.trim() || null,
          description: form.description.trim() || undefined,
          isGeneric: true,
          brand: null,
          category: form.categoryId || null,
          defaultPortionUnit: form.quantityUnit.trim() || undefined,
          defaultPortionAmount: optionalNumber(form.defaultPortionAmount),
          lowStockThreshold: ingredientLowStockThreshold,
          nutrition,
        });

        router.back();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "The ingredient could not be saved.";

        Alert.alert("Unable to save ingredient", message);
      } finally {
        setSaving(false);
      }

      return;
    }

    let quantityAvailable = 0;

    if (pantryInventoryExpanded) {
      quantityAvailable = form.quantityAvailable.trim()
        ? Number(form.quantityAvailable)
        : 0;

      if (!Number.isFinite(quantityAvailable) || quantityAvailable < 0) {
        Alert.alert(
          "Invalid quantity",
          "Enter a quantity of zero or greater.",
        );

        return;
      }

      if (!isValidDateString(form.purchaseDate)) {
        Alert.alert(
          "Invalid purchase date",
          "Enter the date in YYYY-MM-DD format.",
        );

        return;
      }

      if (!isValidDateString(form.expiryDate)) {
        Alert.alert(
          "Invalid expiry date",
          "Enter the date in YYYY-MM-DD format.",
        );

        return;
      }

      if (!form.storageLocationId) {
        Alert.alert(
          "Storage location is required",
          "Select or create a storage location.",
        );
        return;
      }
    } else if (form.ingredientId) {
      // An existing ingredient was selected (nothing new to create) and the
      // pantry section is collapsed — there's nothing for Save to do.
      Alert.alert(
        "Nothing to save",
        "Expand Pantry inventory to add stock for this ingredient.",
      );

      return;
    }

    try {
      setSaving(true);

      const nutrition = {
        calories: optionalNumber(form.calories),
        protein: optionalNumber(form.protein),
        carbs: optionalNumber(form.carbs),
        fats: optionalNumber(form.fats),
        fiber: optionalNumber(form.fiber),
        sodium: optionalNumber(form.sodium),
      };

      let ingredientId = form.ingredientId;

      if (!ingredientId) {
        let brandId = form.brandId;
        const trimmedBrandName = brandDraft.trim();

        if (!brandId && trimmedBrandName) {
          const existingBrand = brands.find(
            (brand) =>
              brand.name.trim().toLowerCase() ===
              trimmedBrandName.toLowerCase(),
          );

          brandId = existingBrand
            ? existingBrand._id
            : (await handleCreateBrand(trimmedBrandName))._id;
        }

        // If an existing generic was picked, its id is sent as-is. If the
        // user just typed a name that didn't match one, no genericParent is
        // set — genericName goes instead, and the server finds-or-creates a
        // generic ingredient with that name, seeded from this ingredient's
        // own portion/nutrition below.
        const trimmedGenericName = genericParentDraft.trim();

        const newIngredient = await createIngredient({
          name: form.ingredientName.trim(),
          barcode: form.barcode.trim() || null,
          description: form.description.trim() || undefined,
          isGeneric: false,
          brand: brandId || null,
          genericParent: form.genericParentId || undefined,
          genericName: !form.genericParentId && trimmedGenericName
            ? trimmedGenericName
            : undefined,
          category: form.categoryId || null,
          defaultPortionUnit: form.quantityUnit.trim() || undefined,
          defaultPortionAmount: optionalNumber(form.defaultPortionAmount),
          lowStockThreshold: ingredientLowStockThreshold,
          nutrition,
        });
        ingredientId = newIngredient._id;
      }

      if (pantryInventoryExpanded) {
        await addIngredientToPantry({
          ingredient: ingredientId,
          storageLocation: form.storageLocationId,
          quantityAvailable,
          quantityUnit: form.quantityUnit.trim(),
          purchaseDate: form.purchaseDate.trim() || undefined,
          expiryDate: form.expiryDate.trim() || undefined,
        });
      }

      router.back();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : pantryInventoryExpanded
            ? "The pantry item could not be saved."
            : "The ingredient could not be saved.";

      Alert.alert(
        pantryInventoryExpanded
          ? "Unable to save pantry item"
          : "Unable to save ingredient",
        message,
      );
    } finally {
      setSaving(false);
    }
  }

  if (loadingOptions) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />

        <Text className="mt-3 text-slate-500">Loading form options...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-slate-50"
      edges={["top", "left", "right"]}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
          <Pressable
            disabled={saving}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>

          <Text className="ml-2 flex-1 text-xl font-bold text-slate-950">
            Add Ingredient
          </Text>

          <Pressable
            disabled={saving}
            className="mr-2 h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
            onPress={() => setScannerVisible(true)}
          >
            <Ionicons name="barcode-outline" size={26} color="#2563EB" />
          </Pressable>

          <Pressable
            disabled={saving}
            className={`rounded-xl px-4 py-2 ${
              saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
            }`}
            onPress={() => void handleSave()}
          >
            <Text className="font-semibold text-white">
              {saving ? "Saving..." : "Save"}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 64,
            paddingTop: 20,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
        >
          {/* <SectionTitle
            first
            title="Ingredient"
            description="Choose an existing ingredient from your ingredient catalog."
          /> */}

          <FieldLabel text="Ingredient type" required />

          <SegmentedToggle<boolean>
            value={form.isGeneric}
            disabled={!!form.ingredientId}
            options={[
              { value: false, label: "Specific / Branded" },
              { value: true, label: "Generic" },
            ] as const}
            onChange={(isGeneric) => {
              updateForm("isGeneric", isGeneric);

              if (isGeneric) {
                updateForm("brandId", "");
                updateForm("brandName", "");
                setBrandDraft("");
              }
            }}
          />

          <Text className="mt-2 text-sm leading-5 text-slate-500">
            {form.ingredientId
              ? "This ingredient already exists, so its type can't be changed here."
              : form.isGeneric
                ? "A generic ingredient (e.g. \"Soy Sauce\") has no single brand — it stands in for any specific product a recipe could use."
                : "A specific ingredient (e.g. \"Kikkoman Soy Sauce\") is a particular product, usually with a brand."}
          </Text>

          <FieldLabel text="Ingredient name" required />

          <SearchableObjectDropdown<IngredientOption>
            options={ingredients}
            selectedId={form.ingredientId}
            selectedName={form.ingredientName}
            placeholder="Search for an ingredient"
            showAllWhenEmpty={false}
            onTextChange={(value: string) => {
              const selectedIngredient = ingredients.find(
                (ingredient) => ingredient._id === form.ingredientId,
              );

              const stillMatchesSelection = selectedIngredient?.name === value;

              if (!stillMatchesSelection) {
                updateForm("ingredientId", "");
              }

              updateForm("ingredientName", value);
            }}
            onSelect={applySelectedIngredient}
          />

          {!form.isGeneric && (
            <>
              <FieldLabel text="Generic ingredient" />

              <CreatableObjectDropdown
                options={genericIngredientOptions}
                selectedId={form.genericParentId}
                selectedName={form.genericParentName}
                placeholder="Search or name a generic ingredient"
                createLabel="Use generic name"
                onTextChange={(value: string) => {
                  if (value !== form.genericParentName) {
                    updateForm("genericParentId", "");
                  }

                  setGenericParentDraft(value);
                }}
                onSelect={(option) => {
                  updateForm("genericParentId", option._id);
                  updateForm("genericParentName", option.name);
                  setGenericParentDraft(option.name);

                  if (option._id) {
                    const matchedGeneric = genericIngredientOptions.find(
                      (generic) => generic._id === option._id,
                    );

                    if (matchedGeneric) {
                      updateForm(
                        "categoryId",
                        matchedGeneric.categoryId ??
                          matchedGeneric.category?._id ??
                          "",
                      );
                      updateForm(
                        "categoryName",
                        matchedGeneric.categoryName ??
                          matchedGeneric.category?.name ??
                          "",
                      );

                      if (matchedGeneric.unit) {
                        updateForm("quantityUnit", matchedGeneric.unit);
                      }
                    }
                  }
                }}
                onCreate={async (name) => ({ _id: "", name })}
              />

              <Text className="mt-2 text-sm leading-5 text-slate-500">
                Optional. Links this to a generic ingredient (e.g. &quot;Soy
                Sauce&quot;) so recipes calling for the generic can use this
                product. Selecting one fills in its category and unit below;
                typing a new name creates that generic ingredient when you
                save, using this item&apos;s portion and nutrition as its
                starting values.
              </Text>

              <FieldLabel text="Brand" />

              <CreatableObjectDropdown
                options={brands}
                selectedId={form.brandId}
                selectedName={form.brandName}
                placeholder="Search or create a brand"
                createLabel="Create brand"
                onTextChange={(value: string) => {
                  if (value !== form.brandName) {
                    updateForm("brandId", "");
                  }

                  setBrandDraft(value);
                }}
                onSelect={(option) => {
                  updateForm("brandId", option._id);

                  updateForm("brandName", option.name);

                  setBrandDraft(option.name);
                }}
                onCreate={handleCreateBrand}
              />
            </>
          )}

          <FieldLabel text="Description" />

          <FormInput
            value={form.description}
            placeholder="Optional description"
            multiline
            onChangeText={(value) => updateForm("description", value)}
          />

          <FieldLabel text="Category" required />

          <CreatableObjectDropdown
            options={categories}
            selectedId={form.categoryId}
            selectedName={form.categoryName}
            placeholder="Search or create a category"
            createLabel="Create category"
            onSelect={(option) => {
              updateForm("categoryId", option._id);

              updateForm("categoryName", option.name);
            }}
            onCreate={handleCreateCategory}
          />

          <SectionTitle
            title="Nutrition per serving"
            description="Define what one serving is, then enter nutrition for that amount."
          />

          <View className="flex-row">
            <View className="mr-3 flex-1">
              <FieldLabel text="Serving size" />

              <FormInput
                value={form.defaultPortionAmount}
                placeholder="1"
                keyboardType="decimal-pad"
                onChangeText={(value) => updateForm("defaultPortionAmount", value)}
              />
            </View>

            <View className="flex-1">
              <FieldLabel text="Unit" required />

              <CreatableStringDropdown
                options={units}
                selectedValue={form.quantityUnit}
                placeholder="Search or create a unit"
                createLabel="Use unit"
                onSelect={(unit) => updateForm("quantityUnit", unit)}
                onCreate={handleAddUnit}
              />
            </View>
          </View>

          <Text className="mt-2 text-sm leading-5 text-slate-500">
            How much of the unit above is one serving. For example, a spice
            might have a 120 g bottle but a 5 g serving — enter 5 here, and
            the nutrition values below should be for that 5 g.
          </Text>

          <FieldLabel text="Low-stock threshold" />

          <FormInput
            value={form.lowStockThreshold}
            placeholder="0"
            keyboardType="decimal-pad"
            onChangeText={(value) => updateForm("lowStockThreshold", value)}
          />

          <Text className="mt-2 text-sm leading-5 text-slate-500">
            Warn when total stock across all pantry entries falls to this many{" "}
            {form.quantityUnit.trim() || "units"}. This belongs to the
            ingredient itself, not any one pantry entry.
          </Text>

          <View className="flex-row">
            <View className="mr-3 flex-1">
              <FieldLabel text="Calories" />

              <FormInput
                value={form.calories}
                keyboardType="decimal-pad"
                placeholder="N/A"
                onChangeText={(value) => updateForm("calories", value)}
              />
            </View>

            <View className="flex-1">
              <FieldLabel text="Protein (g)" />

              <FormInput
                value={form.protein}
                keyboardType="decimal-pad"
                placeholder="N/A"
                onChangeText={(value) => updateForm("protein", value)}
              />
            </View>
          </View>

          <View className="flex-row">
            <View className="mr-3 flex-1">
              <FieldLabel text="Carbs (g)" />

              <FormInput
                value={form.carbs}
                keyboardType="decimal-pad"
                placeholder="N/A"
                onChangeText={(value) => updateForm("carbs", value)}
              />
            </View>

            <View className="flex-1">
              <FieldLabel text="Fats (g)" />

              <FormInput
                value={form.fats}
                keyboardType="decimal-pad"
                placeholder="N/A"
                onChangeText={(value) => updateForm("fats", value)}
              />
            </View>
          </View>

          <View className="flex-row">
            <View className="mr-3 flex-1">
              <FieldLabel text="Fiber (g)" />

              <FormInput
                value={form.fiber}
                keyboardType="decimal-pad"
                placeholder="N/A"
                onChangeText={(value) => updateForm("fiber", value)}
              />
            </View>

            <View className="flex-1">
              <FieldLabel text="Sodium (mg)" />

              <FormInput
                value={form.sodium}
                keyboardType="decimal-pad"
                placeholder="N/A"
                onChangeText={(value) => updateForm("sodium", value)}
              />
            </View>
          </View>

          {!form.isGeneric && (
            <>
              <Pressable
                className="mt-8 flex-row items-center justify-between"
                onPress={() =>
                  setPantryInventoryExpanded((current) => !current)
                }
              >
                <View className="mr-3 flex-1">
                  <Text className="text-xl font-bold text-slate-950">
                    Pantry inventory
                  </Text>
                  <Text className="mt-1 text-sm leading-5 text-slate-500">
                    Optional — add stock now, or just save the ingredient and
                    stock it later.
                  </Text>
                </View>

                <Ionicons
                  name={pantryInventoryExpanded ? "chevron-up" : "chevron-down"}
                  size={22}
                  color="#64748B"
                />
              </Pressable>

              {pantryInventoryExpanded && (
                <>
                  <FieldLabel text="Storage location" required />

                  <CreatableObjectDropdown
                    options={storageLocations}
                    selectedId={form.storageLocationId}
                    selectedName={form.storageLocationName}
                    placeholder="Search or create a storage location"
                    createLabel="Create location"
                    onSelect={(option) => {
                      updateForm("storageLocationId", option._id);

                      updateForm("storageLocationName", option.name);
                    }}
                    onCreate={handleCreateStorageLocation}
                  />

                  <FieldLabel text="Quantity" required />

                  <View className="flex-row items-center">
                    <View className="flex-1">
                      <FormInput
                        value={form.quantityAvailable}
                        placeholder="0"
                        keyboardType="decimal-pad"
                        onChangeText={(value) =>
                          updateForm("quantityAvailable", value)
                        }
                      />
                    </View>

                    <Text className="ml-3 text-base font-medium text-slate-600">
                      {form.quantityUnit.trim() || "unit"}
                    </Text>
                  </View>

                  <FieldLabel text="Purchase date" />

                  <FormInput
                    value={form.purchaseDate}
                    placeholder="YYYY-MM-DD"
                    keyboardType="numbers-and-punctuation"
                    autoCapitalize="none"
                    onChangeText={(value) => updateForm("purchaseDate", value)}
                  />

                  <FieldLabel text="Expiry date" />

                  <FormInput
                    value={form.expiryDate}
                    placeholder="YYYY-MM-DD"
                    keyboardType="numbers-and-punctuation"
                    autoCapitalize="none"
                    onChangeText={(value) => updateForm("expiryDate", value)}
                  />
                </>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onProductFound={applyScannedProduct}
      />
    </SafeAreaView>
  );
}
