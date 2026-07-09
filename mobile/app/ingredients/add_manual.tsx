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

  brandId: string;
  brandName: string;

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

  brandId: "",
  brandName: "",

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

  return {
    _id: ingredient._id,
    name: ingredient.name,

    description: ingredient.description ?? "",

    unit: ingredient.defaultPortionUnit ?? "",

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

  const [loadingOptions, setLoadingOptions] = useState(true);

  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);

  const [categories, setCategories] = useState<SelectOption[]>([]);

  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);

  const [brands, setBrands] = useState<SelectOption[]>([]);

  const [units, setUnits] = useState<string[]>([]);

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
  }

  function applySelectedIngredient(option: IngredientOption) {
    setForm((current) => ({
      ...current,

      ingredientId: option._id,
      ingredientName: option.name,

      description: option.description ?? "",

      quantityUnit: option.unit ?? "",

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
    const quantityAvailable = form.quantityAvailable.trim()
      ? Number(form.quantityAvailable)
      : 0;

    const lowStockThreshold = form.lowStockThreshold.trim()
      ? Number(form.lowStockThreshold)
      : 0;

    if (!form.ingredientName.trim()) {
      Alert.alert(
        "Ingredient name is required",
        "Enter a name or select an existing ingredient.",
      );

      return;
    }

    if (!Number.isFinite(quantityAvailable) || quantityAvailable < 0) {
      Alert.alert("Invalid quantity", "Enter a quantity of zero or greater.");

      return;
    }

    if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
      Alert.alert(
        "Invalid low-stock threshold",
        "Enter a threshold of zero or greater.",
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

    if (!form.categoryId) {
      Alert.alert("Category is required", "Select or create a category.");
      return;
    }

    if (!form.storageLocationId) {
      Alert.alert(
        "Storage location is required",
        "Select or create a storage location.",
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
        const newIngredient = await createIngredient({
          name: form.ingredientName.trim(),
          barcode: form.barcode.trim() || null,
          description: form.description.trim() || undefined,
          brand: form.brandId || null,
          category: form.categoryId || null,
          defaultPortionUnit: form.quantityUnit.trim() || undefined,
          defaultPortionAmount: optionalNumber(form.defaultPortionAmount),
          lowStockThreshold,
          nutrition,
        });
        ingredientId = newIngredient._id;
      }

      await addIngredientToPantry({
        ingredient: ingredientId,
        storageLocation: form.storageLocationId,
        quantityAvailable,
        quantityUnit: form.quantityUnit.trim(),
        purchaseDate: form.purchaseDate.trim() || undefined,
        expiryDate: form.expiryDate.trim() || undefined,
        lowStockThreshold,
      });

      router.back();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The pantry item could not be saved.";

      Alert.alert("Unable to save pantry item", message);
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

          <FieldLabel text="Brand" />

          <CreatableObjectDropdown
            options={brands}
            selectedId={form.brandId}
            selectedName={form.brandName}
            placeholder="Search or create a brand"
            createLabel="Create brand"
            onSelect={(option) => {
              updateForm("brandId", option._id);

              updateForm("brandName", option.name);
            }}
            onCreate={handleCreateBrand}
          />

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
            title="Pantry inventory"
            description="Where the item is stored and how much you currently have."
          />

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

          <View className="flex-row">
            <View className="mr-3 flex-1">
              <FieldLabel text="Quantity" required />

              <FormInput
                value={form.quantityAvailable}
                placeholder="0"
                keyboardType="decimal-pad"
                onChangeText={(value) => updateForm("quantityAvailable", value)}
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

          <FieldLabel text="Low-stock threshold" />

          <FormInput
            value={form.lowStockThreshold}
            placeholder="0"
            keyboardType="decimal-pad"
            onChangeText={(value) => updateForm("lowStockThreshold", value)}
          />

          <Text className="mt-2 text-sm leading-5 text-slate-500">
            The item is considered low stock when its quantity reaches this
            value.
          </Text>

          <SectionTitle
            title="Nutrition per serving"
            description="Optional nutrition values for one serving."
          />

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
