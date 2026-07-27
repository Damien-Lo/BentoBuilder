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

import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  CreatableStringDropdown,
  DurationExpiryInput,
  FieldLabel,
  FormInput,
  QuantityServingInput,
  SearchableObjectDropdown,
  SectionTitle,
} from "@/src/components/forms";

import {
  getBrands,
  getCategories,
  getStorageLocations,
  getUnitSuggestions,
  createBrand,
  createCategory,
  createStorageLocation,
  type SelectOption,
} from "@/src/services/optionsApi";

import {
  getIngredientAvailability,
  getIngredientById,
  updateIngredient,
  type Ingredient,
  type IngredientAvailability,
} from "@/src/services/ingredientApi";

import {
  addIngredientToPantry,
  deletePantryItem,
  getPantryItems,
} from "@/src/services/pantryApi";
import type { PantryItem } from "@/src/types/pantry";

import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { resolveOrCreateOption } from "@/src/utils/resolveOrCreateOption";
import { daysUntil, formatDateDisplay, todayDateInputString } from "@/src/utils/date";

type ReferenceObject = { _id?: string; id?: string; name?: string };

function isReferenceObject(value: unknown): value is ReferenceObject {
  return typeof value === "object" && value !== null;
}

function getReferenceName(value: unknown): string {
  if (!isReferenceObject(value)) return "";
  return typeof value.name === "string" ? value.name : "";
}

function getReferenceId(value: unknown): string {
  if (typeof value === "string") return value;
  if (!isReferenceObject(value)) return "";
  if (typeof value._id === "string") return value._id;
  if (typeof value.id === "string") return value.id;
  return "";
}

function formatDate(dateString: string | null | undefined): string {
  return (
    formatDateDisplay(dateString, { month: "short", day: "numeric", year: "numeric" }) ?? "—"
  );
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

interface FormState {
  name: string;
  description: string;
  brandId: string;
  brandName: string;
  categoryId: string;
  categoryName: string;
  defaultPortionAmount: string;
  defaultPortionUnit: string;
  barcode: string;
  lowStockThreshold: string;
  alwaysAvailable: boolean;
  calories: string;
  protein: string;
  carbs: string;
  fats: string;
  fiber: string;
  sodium: string;
}

function ingredientToForm(ingredient: Ingredient): FormState {
  return {
    name: ingredient.name,
    description: ingredient.description ?? "",
    brandId: getReferenceId(ingredient.brand),
    brandName: getReferenceName(ingredient.brand),
    categoryId: getReferenceId(ingredient.category),
    categoryName: getReferenceName(ingredient.category),
    defaultPortionAmount:
      ingredient.defaultPortionAmount != null
        ? String(ingredient.defaultPortionAmount)
        : "",
    defaultPortionUnit: ingredient.defaultPortionUnit ?? "",
    barcode: ingredient.barcode ?? "",
    lowStockThreshold:
      ingredient.lowStockThreshold != null
        ? String(ingredient.lowStockThreshold)
        : "",
    alwaysAvailable: ingredient.isAlwaysAvailable ?? false,
    calories:
      ingredient.nutrition?.calories != null
        ? String(ingredient.nutrition.calories)
        : "",
    protein:
      ingredient.nutrition?.protein != null
        ? String(ingredient.nutrition.protein)
        : "",
    carbs:
      ingredient.nutrition?.carbs != null
        ? String(ingredient.nutrition.carbs)
        : "",
    fats:
      ingredient.nutrition?.fats != null
        ? String(ingredient.nutrition.fats)
        : "",
    fiber:
      ingredient.nutrition?.fiber != null
        ? String(ingredient.nutrition.fiber)
        : "",
    sodium:
      ingredient.nutrition?.sodium != null
        ? String(ingredient.nutrition.sodium)
        : "",
  };
}

export default function IngredientDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [currentIngredient, setCurrentIngredient] = useState<Ingredient | null>(
    null,
  );
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);
  const [brands, setBrands] = useState<SelectOption[]>([]);
  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [units, setUnits] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [brandDraft, setBrandDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [quickAddPurchaseDate, setQuickAddPurchaseDate] = useState(
    todayDateInputString(),
  );
  const [quickAddExpiryDate, setQuickAddExpiryDate] = useState("");
  const [quickAddLocationId, setQuickAddLocationId] = useState("");
  const [quickAddLocationName, setQuickAddLocationName] = useState("");
  const [quickAddLocationDraft, setQuickAddLocationDraft] = useState("");
  const [quickAddQuantity, setQuickAddQuantity] = useState("");
  const [quickAddQuantityUnit, setQuickAddQuantityUnit] = useState("");
  const [savingEntry, setSavingEntry] = useState(false);

  const [genericAvailability, setGenericAvailability] =
    useState<IngredientAvailability | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const [
          loadedIngredient,
          loadedPantryItems,
          loadedLocations,
          loadedBrands,
          loadedCategories,
          loadedUnits,
        ] = await Promise.all([
          getIngredientById(id),
          getPantryItems(),
          getStorageLocations(),
          getBrands(),
          getCategories(),
          getUnitSuggestions(),
        ]);

        if (cancelled) return;

        const loadedForm = ingredientToForm(loadedIngredient);
        setCurrentIngredient(loadedIngredient);
        setForm(loadedForm);
        setBrandDraft(loadedForm.brandName);
        setCategoryDraft(loadedForm.categoryName);

        if (loadedIngredient.isGeneric) {
          setLoadingAvailability(true);
          getIngredientAvailability(id)
            .then((availability) => {
              if (!cancelled) setGenericAvailability(availability);
            })
            .catch(() => {
              if (!cancelled) setGenericAvailability(null);
            })
            .finally(() => {
              if (!cancelled) setLoadingAvailability(false);
            });
        } else {
          setGenericAvailability(null);
        }

        setPantryItems(
          Array.isArray(loadedPantryItems) ? loadedPantryItems : [],
        );
        setStorageLocations(
          Array.isArray(loadedLocations) ? loadedLocations : [],
        );
        setBrands(Array.isArray(loadedBrands) ? loadedBrands : []);
        setCategories(Array.isArray(loadedCategories) ? loadedCategories : []);
        setUnits(Array.isArray(loadedUnits) ? loadedUnits : []);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load ingredient.",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const storageLocationById = useMemo(
    () => new Map(storageLocations.map((loc) => [String(loc._id), loc])),
    [storageLocations],
  );

  const ingredientPantryItems = useMemo(
    () =>
      pantryItems.filter((p) => getReferenceId(p.ingredient as unknown) === id),
    [pantryItems, id],
  );

  useEffect(() => {
    const lastEntry = ingredientPantryItems[0];
    if (!lastEntry) return;
    const locId = getReferenceId(lastEntry.storageLocation as unknown);
    const locName =
      getReferenceName(lastEntry.storageLocation as unknown) ||
      storageLocationById.get(locId)?.name ||
      "";
    setQuickAddLocationId(locId);
    setQuickAddLocationName(locName);
    setQuickAddLocationDraft(locName);
    setQuickAddQuantityUnit((current) => current || lastEntry.quantityUnit);
  }, [ingredientPantryItems, storageLocationById]);

  function getLocationName(item: PantryItem): string {
    const raw = item.storageLocation as unknown;
    const populated = getReferenceName(raw);
    if (populated) return populated;
    const locId = getReferenceId(raw);
    return storageLocationById.get(locId)?.name ?? "Unknown location";
  }

  function updateForm<K extends keyof FormState>(
    field: K,
    value: FormState[K],
  ) {
    setForm((current) => (current ? { ...current, [field]: value } : current));
  }

  function handleCancel() {
    if (currentIngredient) {
      const revertedForm = ingredientToForm(currentIngredient);
      setForm(revertedForm);
      setBrandDraft(revertedForm.brandName);
      setCategoryDraft(revertedForm.categoryName);
    }
    setIsEditing(false);
  }

  async function handleSave() {
    if (!form) return;

    if (!form.name.trim()) {
      Alert.alert("Name is required", "Enter an ingredient name.");
      return;
    }

    try {
      setSaving(true);

      // Typing a brand/category that doesn't match an existing one creates
      // it here at save time — no separate "create" tap required.
      const brand = currentIngredient?.isGeneric
        ? null
        : await resolveOrCreateOption(brands, form.brandId, brandDraft, handleCreateBrand);

      const category = await resolveOrCreateOption(
        categories,
        form.categoryId,
        categoryDraft,
        handleCreateCategory,
      );

      const updated = await updateIngredient(id, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        barcode: form.barcode.trim() || null,
        brand: brand?._id || null,
        category: category?._id || null,
        defaultPortionAmount: optionalNumber(form.defaultPortionAmount),
        defaultPortionUnit: form.defaultPortionUnit.trim() || undefined,
        lowStockThreshold: optionalNumber(form.lowStockThreshold),
        isAlwaysAvailable: form.alwaysAvailable,
        nutrition: {
          calories: optionalNumber(form.calories),
          protein: optionalNumber(form.protein),
          carbs: optionalNumber(form.carbs),
          fats: optionalNumber(form.fats),
          fiber: optionalNumber(form.fiber),
          sodium: optionalNumber(form.sodium),
        },
      });

      const updatedForm = ingredientToForm(updated);
      setCurrentIngredient(updated);
      setForm(updatedForm);
      setBrandDraft(updatedForm.brandName);
      setCategoryDraft(updatedForm.categoryName);
      setIsEditing(false);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "The ingredient could not be saved.";
      Alert.alert("Unable to save", message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateBrand(name: string): Promise<SelectOption> {
    const brand = await createBrand(name);
    setBrands((current) =>
      current.some((b) => b._id === brand._id)
        ? current
        : [...current, brand].sort((a, b) => a.name.localeCompare(b.name)),
    );
    return brand;
  }

  async function handleCreateStorageLocation(
    name: string,
  ): Promise<SelectOption> {
    const location = await createStorageLocation(name);
    setStorageLocations((current) =>
      current.some((l) => l._id === location._id)
        ? current
        : [...current, location].sort((a, b) => a.name.localeCompare(b.name)),
    );
    return location;
  }

  async function handleCreateCategory(name: string): Promise<SelectOption> {
    const category = await createCategory(name);
    setCategories((current) =>
      current.some((c) => c._id === category._id)
        ? current
        : [...current, category].sort((a, b) => a.name.localeCompare(b.name)),
    );
    return category;
  }

  function registerUnit(unit: string) {
    const trimmed = unit.trim();
    if (!trimmed) return;
    setUnits((current) =>
      current.some((u) => u.toLowerCase() === trimmed.toLowerCase())
        ? current
        : [...current, trimmed].sort((a, b) => a.localeCompare(b)),
    );
  }

  function handleAddUnit(unit: string) {
    registerUnit(unit);
    updateForm("defaultPortionUnit", unit.trim());
  }

  async function handleDeleteEntry(entryId: string) {
    Alert.alert("Delete entry", "Remove this pantry entry?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deletePantryItem(entryId);
            setPantryItems((current) =>
              current.filter((p) => p._id !== entryId),
            );
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Could not delete entry.";
            Alert.alert("Unable to delete", message);
          }
        },
      },
    ]);
  }

  async function handleQuickAdd() {
    if (!currentIngredient) return;

    const lastEntry = ingredientPantryItems[0];
    if (!lastEntry) {
      Alert.alert(
        "No existing entry",
        "Add your first entry via the Add Ingredient screen.",
      );
      return;
    }

    if (!quickAddLocationId && !quickAddLocationDraft.trim()) {
      Alert.alert(
        "Missing storage location",
        "Search or type a storage location before adding an entry.",
      );
      return;
    }

    try {
      setSavingEntry(true);

      const storageLocation = await resolveOrCreateOption(
        storageLocations,
        quickAddLocationId,
        quickAddLocationDraft,
        handleCreateStorageLocation,
      );

      if (!storageLocation) {
        throw new Error("Enter a storage location.");
      }

      const newEntry = await addIngredientToPantry({
        ingredient: id,
        storageLocation: storageLocation._id,
        quantityAvailable: quickAddQuantity ? Number(quickAddQuantity) : 0,
        quantityUnit: quickAddQuantityUnit.trim() || lastEntry.quantityUnit,
        purchaseDate: quickAddPurchaseDate || undefined,
        expiryDate: quickAddExpiryDate || undefined,
        lowStockThreshold: lastEntry.lowStockThreshold,
      });

      setPantryItems((current) => [...current, newEntry]);
      setQuickAddPurchaseDate(todayDateInputString());
      setQuickAddExpiryDate("");
      setQuickAddQuantity("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not add pantry entry.";
      Alert.alert("Unable to add entry", message);
    } finally {
      setSavingEntry(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="mt-3 text-slate-500">Loading ingredient...</Text>
      </SafeAreaView>
    );
  }

  if (error || !currentIngredient || !form) {
    return (
      <SafeAreaView
        className="flex-1 bg-slate-50"
        edges={["top", "left", "right"]}
      >
        <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
          <Pressable
            className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>
          <Text className="ml-2 flex-1 text-xl font-bold text-slate-950">
            Ingredient
          </Text>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="warning-outline" size={42} color="#94A3B8" />
          <Text className="mt-4 text-lg font-bold text-slate-900">
            Could not load ingredient
          </Text>
          <Text className="mt-2 text-center text-slate-500">
            {error ?? "This ingredient could not be found."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const ingredient = currentIngredient;
  const brandName = getReferenceName(ingredient.brand);
  const categoryName = getReferenceName(ingredient.category);
  const nutrition = ingredient.nutrition;

  // Generic ingredients never hold pantry stock directly — their totals come
  // from the aggregation across specific/branded variants instead.
  const totalQuantity = ingredient.isGeneric
    ? (genericAvailability?.totalInOwnUnit ?? 0)
    : ingredientPantryItems.reduce((sum, p) => sum + (p.quantityAvailable ?? 0), 0);
  const isAlwaysAvailable = ingredient.isAlwaysAvailable ?? false;
  const isInStock = isAlwaysAvailable || totalQuantity > 0;
  const isLowStock =
    !isAlwaysAvailable &&
    (ingredient.isGeneric
      ? (genericAvailability?.isLowStock ?? false)
      : ingredient.lowStockThreshold != null &&
        totalQuantity <= ingredient.lowStockThreshold &&
        isInStock);

  return (
    <SafeAreaView
      className="flex-1 bg-slate-50"
      edges={["top", "left", "right"]}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
          {isEditing ? (
            <Pressable
              disabled={saving}
              className="h-11 items-center justify-center px-1 active:opacity-60"
              onPress={handleCancel}
            >
              <Text className="text-base font-medium text-slate-500">
                Cancel
              </Text>
            </Pressable>
          ) : (
            <Pressable
              className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-back" size={26} color="#0F172A" />
            </Pressable>
          )}

          <Text
            className="ml-2 flex-1 text-xl font-bold text-slate-950"
            numberOfLines={1}
          >
            {ingredient.name}
          </Text>

          {isEditing ? (
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
          ) : (
            <Pressable
              className="rounded-xl bg-slate-100 px-4 py-2 active:bg-slate-200"
              onPress={() => setIsEditing(true)}
            >
              <Text className="font-semibold text-slate-700">Edit</Text>
            </Pressable>
          )}
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-16 pt-5"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
        >
          {isEditing ? (
            /* ── Edit form ── */
            <>
              {ingredient.isGeneric && (
                <View className="mb-4 flex-row items-center rounded-2xl bg-violet-50 px-4 py-3">
                  <Ionicons name="git-branch-outline" size={20} color="#7C3AED" />
                  <View className="ml-3 flex-1">
                    <Text className="text-sm font-bold text-violet-700">
                      Generic ingredient
                    </Text>
                    <Text className="mt-0.5 text-xs leading-4 text-violet-600">
                      It has no brand and can&apos;t be stocked in the pantry
                      directly — availability comes from its specific/branded
                      variants.
                    </Text>
                  </View>
                </View>
              )}

              <FieldLabel text="Ingredient name" required />
              <FormInput
                value={form.name}
                placeholder="e.g. Rolled oats"
                onChangeText={(v) => updateForm("name", v)}
              />

              {!ingredient.isGeneric && (
                <>
                  <FieldLabel text="Brand" />
                  <SearchableObjectDropdown<SelectOption>
                    options={brands}
                    selectedId={form.brandId}
                    selectedName={form.brandName}
                    placeholder="Search or type a new brand"
                    onTextChange={(value) => {
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
                  />
                </>
              )}

              <FieldLabel text="Category" />
              <SearchableObjectDropdown<SelectOption>
                options={categories}
                selectedId={form.categoryId}
                selectedName={form.categoryName}
                placeholder="Search or type a new category"
                onTextChange={(value) => {
                  if (value !== form.categoryName) {
                    updateForm("categoryId", "");
                  }
                  setCategoryDraft(value);
                }}
                onSelect={(option) => {
                  updateForm("categoryId", option._id);
                  updateForm("categoryName", option.name);
                  setCategoryDraft(option.name);
                }}
              />

              <FieldLabel text="Description" />
              <FormInput
                value={form.description}
                placeholder="Optional description"
                multiline
                onChangeText={(v) => updateForm("description", v)}
              />

              <FieldLabel text="Barcode" />
              <FormInput
                value={form.barcode}
                placeholder="Optional barcode"
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                onChangeText={(v) => updateForm("barcode", v)}
              />

              <View className="flex-row">
                <View className="mr-3 flex-1">
                  <FieldLabel text="Default portion" />
                  <FormInput
                    value={form.defaultPortionAmount}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    onChangeText={(v) => updateForm("defaultPortionAmount", v)}
                  />
                </View>
                <View className="flex-1">
                  <FieldLabel text="Unit" />
                  <CreatableStringDropdown
                    options={units}
                    selectedValue={form.defaultPortionUnit}
                    placeholder="Search or type a new unit"
                    onSelect={handleAddUnit}
                  />
                </View>
              </View>

              <Pressable
                className="mt-5 flex-row items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4"
                onPress={() => updateForm("alwaysAvailable", !form.alwaysAvailable)}
              >
                <View className="mr-3 flex-1">
                  <Text className="font-semibold text-slate-900">Always available</Text>
                  <Text className="mt-0.5 text-xs leading-4 text-slate-500">
                    Never shows as low or out of stock (e.g. tap water) — skips stock
                    tracking entirely.
                  </Text>
                </View>
                <View
                  className={`h-7 w-12 justify-center rounded-full px-1 ${
                    form.alwaysAvailable ? "bg-blue-600" : "bg-slate-200"
                  }`}
                >
                  <View
                    className="h-5 w-5 rounded-full bg-white shadow"
                    style={{
                      transform: [{ translateX: form.alwaysAvailable ? 20 : 0 }],
                    }}
                  />
                </View>
              </Pressable>

              {!form.alwaysAvailable && (
                <>
                  <FieldLabel text="Low stock threshold" />
                  <FormInput
                    value={form.lowStockThreshold}
                    placeholder={`Alert when total falls below this (${form.defaultPortionUnit || "units"})`}
                    keyboardType="decimal-pad"
                    onChangeText={(v) => updateForm("lowStockThreshold", v)}
                  />
                </>
              )}

              <SectionTitle
                title="Nutrition per serving"
                description="Optional nutrition values for one serving."
              />

              <View className="flex-row">
                <View className="mr-3 flex-1">
                  <FieldLabel text="Calories" />
                  <FormInput
                    value={form.calories}
                    placeholder="N/A"
                    keyboardType="decimal-pad"
                    onChangeText={(v) => updateForm("calories", v)}
                  />
                </View>
                <View className="flex-1">
                  <FieldLabel text="Protein (g)" />
                  <FormInput
                    value={form.protein}
                    placeholder="N/A"
                    keyboardType="decimal-pad"
                    onChangeText={(v) => updateForm("protein", v)}
                  />
                </View>
              </View>

              <View className="flex-row">
                <View className="mr-3 flex-1">
                  <FieldLabel text="Carbs (g)" />
                  <FormInput
                    value={form.carbs}
                    placeholder="N/A"
                    keyboardType="decimal-pad"
                    onChangeText={(v) => updateForm("carbs", v)}
                  />
                </View>
                <View className="flex-1">
                  <FieldLabel text="Fats (g)" />
                  <FormInput
                    value={form.fats}
                    placeholder="N/A"
                    keyboardType="decimal-pad"
                    onChangeText={(v) => updateForm("fats", v)}
                  />
                </View>
              </View>

              <View className="flex-row">
                <View className="mr-3 flex-1">
                  <FieldLabel text="Fiber (g)" />
                  <FormInput
                    value={form.fiber}
                    placeholder="N/A"
                    keyboardType="decimal-pad"
                    onChangeText={(v) => updateForm("fiber", v)}
                  />
                </View>
                <View className="flex-1">
                  <FieldLabel text="Sodium (mg)" />
                  <FormInput
                    value={form.sodium}
                    placeholder="N/A"
                    keyboardType="decimal-pad"
                    onChangeText={(v) => updateForm("sodium", v)}
                  />
                </View>
              </View>
            </>
          ) : (
            /* ── Detail view ── */
            <>
              {/* Hero card */}
              <View className="mb-4 items-center rounded-2xl border border-slate-200 bg-white px-6 py-8">
                <View className="h-20 w-20 items-center justify-center rounded-full bg-blue-50">
                  <Ionicons
                    name="nutrition-outline"
                    size={36}
                    color="#2563EB"
                  />
                </View>

                <Text className="mt-4 text-center text-2xl font-bold text-slate-950">
                  {ingredient.name}
                </Text>

                <View className="mt-3 flex-row flex-wrap justify-center">
                  {ingredient.isGeneric ? (
                    <View className="mr-2 rounded-full bg-violet-50 px-3 py-1">
                      <Text className="text-sm font-medium text-violet-600">
                        Generic
                      </Text>
                    </View>
                  ) : null}
                  {categoryName ? (
                    <View className="mr-2 rounded-full bg-blue-50 px-3 py-1">
                      <Text className="text-sm font-medium text-blue-700">
                        {categoryName}
                      </Text>
                    </View>
                  ) : null}
                  {brandName ? (
                    <View className="rounded-full bg-slate-100 px-3 py-1">
                      <Text className="text-sm font-medium text-slate-600">
                        {brandName}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {ingredient.description ? (
                  <Text className="mt-3 text-center text-sm leading-5 text-slate-500">
                    {ingredient.description}
                  </Text>
                ) : null}
              </View>

              {/* Stock summary */}
              <View className="mb-4 flex-row rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <View className="flex-1 items-center">
                  <Text className="text-2xl font-bold text-slate-950">
                    {totalQuantity}
                  </Text>
                  <Text className="mt-0.5 text-xs text-slate-500">
                    {ingredient.defaultPortionUnit || "units"} total
                  </Text>
                </View>

                <View className="mx-4 w-px bg-slate-100" />

                <View className="flex-1 items-center justify-center">
                  <View
                    className={`rounded-full px-3 py-1 ${
                      isAlwaysAvailable
                        ? "bg-blue-50"
                        : isLowStock
                          ? "bg-amber-50"
                          : isInStock
                            ? "bg-emerald-50"
                            : "bg-slate-100"
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        isAlwaysAvailable
                          ? "text-blue-600"
                          : isLowStock
                            ? "text-amber-600"
                            : isInStock
                              ? "text-emerald-600"
                              : "text-slate-500"
                      }`}
                    >
                      {isAlwaysAvailable
                        ? "Always available"
                        : isLowStock
                          ? "Low stock"
                          : isInStock
                            ? "In stock"
                            : "Out of stock"}
                    </Text>
                  </View>
                  <Text className="mt-1 text-xs text-slate-500">
                    {ingredient.isGeneric
                      ? `across ${genericAvailability?.variantCount ?? 0} variant${
                          genericAvailability?.variantCount === 1 ? "" : "s"
                        }`
                      : `${ingredientPantryItems.length} ${
                          ingredientPantryItems.length === 1
                            ? "entry"
                            : "entries"
                        }`}
                  </Text>
                </View>

                {ingredient.defaultPortionAmount != null ? (
                  <>
                    <View className="mx-4 w-px bg-slate-100" />
                    <View className="flex-1 items-center">
                      <Text className="text-2xl font-bold text-slate-950">
                        {ingredient.defaultPortionAmount}
                      </Text>
                      <Text className="mt-0.5 text-xs text-slate-500">
                        {ingredient.defaultPortionUnit
                          ? `${ingredient.defaultPortionUnit} / serving`
                          : "per serving"}
                      </Text>
                    </View>
                  </>
                ) : null}
              </View>

              {/* Details */}
              {brandName ||
              categoryName ||
              ingredient.barcode ||
              ingredient.defaultPortionAmount != null ? (
                <View className="mb-4 rounded-2xl border border-slate-200 bg-white px-5 py-4">
                  <Text className="mb-3 text-base font-bold text-slate-900">
                    Details
                  </Text>

                  {brandName ? (
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="text-sm text-slate-500">Brand</Text>
                      <Text className="text-sm font-medium text-slate-900">
                        {brandName}
                      </Text>
                    </View>
                  ) : null}

                  {categoryName ? (
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="text-sm text-slate-500">Category</Text>
                      <Text className="text-sm font-medium text-slate-900">
                        {categoryName}
                      </Text>
                    </View>
                  ) : null}

                  {ingredient.defaultPortionAmount != null ? (
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="text-sm text-slate-500">
                        Default portion
                      </Text>
                      <Text className="text-sm font-medium text-slate-900">
                        {ingredient.defaultPortionAmount}
                        {ingredient.defaultPortionUnit
                          ? ` ${ingredient.defaultPortionUnit}`
                          : ""}
                      </Text>
                    </View>
                  ) : null}

                  {ingredient.barcode ? (
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm text-slate-500">Barcode</Text>
                      <Text className="text-sm font-medium text-slate-900">
                        {ingredient.barcode}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Nutrition */}
              {nutrition ? (
                <View className="mb-4 rounded-2xl border border-slate-200 bg-white px-5 py-4">
                  <Text className="mb-1 text-base font-bold text-slate-900">
                    Nutrition
                  </Text>
                  <Text className="mb-3 text-xs text-slate-400">
                    Per{" "}
                    {ingredient.nutritionBasis === "per-100g"
                      ? "100g"
                      : "serving"}
                  </Text>

                  <View className="mb-3 items-center rounded-2xl bg-blue-50 py-3">
                    <Text className={`text-3xl font-bold ${nutrition.calories != null ? "text-blue-700" : "text-blue-300"}`}>
                      {nutrition.calories != null ? nutrition.calories : "N/A"}
                    </Text>
                    <Text className="mt-0.5 text-xs font-medium text-blue-500">
                      Calories
                    </Text>
                  </View>

                  <View className="flex-row">
                    <View className="mr-2 flex-1 items-center rounded-2xl bg-slate-50 py-3">
                      <Text className={`text-lg font-bold ${nutrition.protein != null ? "text-slate-900" : "text-slate-300"}`}>
                        {nutrition.protein != null ? `${nutrition.protein}g` : "N/A"}
                      </Text>
                      <Text className="mt-0.5 text-xs text-slate-500">Protein</Text>
                    </View>
                    <View className="mr-2 flex-1 items-center rounded-2xl bg-slate-50 py-3">
                      <Text className={`text-lg font-bold ${nutrition.carbs != null ? "text-slate-900" : "text-slate-300"}`}>
                        {nutrition.carbs != null ? `${nutrition.carbs}g` : "N/A"}
                      </Text>
                      <Text className="mt-0.5 text-xs text-slate-500">Carbs</Text>
                    </View>
                    <View className="flex-1 items-center rounded-2xl bg-slate-50 py-3">
                      <Text className={`text-lg font-bold ${nutrition.fats != null ? "text-slate-900" : "text-slate-300"}`}>
                        {nutrition.fats != null ? `${nutrition.fats}g` : "N/A"}
                      </Text>
                      <Text className="mt-0.5 text-xs text-slate-500">Fats</Text>
                    </View>
                  </View>

                  <View className="mt-2 flex-row">
                    <View className="mr-2 flex-1 items-center rounded-2xl bg-slate-50 py-3">
                      <Text className={`text-lg font-bold ${nutrition.fiber != null ? "text-slate-900" : "text-slate-300"}`}>
                        {nutrition.fiber != null ? `${nutrition.fiber}g` : "N/A"}
                      </Text>
                      <Text className="mt-0.5 text-xs text-slate-500">Fiber</Text>
                    </View>
                    <View className="flex-1 items-center rounded-2xl bg-slate-50 py-3">
                      <Text className={`text-lg font-bold ${nutrition.sodium != null ? "text-slate-900" : "text-slate-300"}`}>
                        {nutrition.sodium != null ? `${nutrition.sodium}mg` : "N/A"}
                      </Text>
                      <Text className="mt-0.5 text-xs text-slate-500">Sodium</Text>
                    </View>
                  </View>
                </View>
              ) : null}
            </>
          )}

          {/* Generic ingredients are a matching umbrella, not a physical
              product — they never hold pantry stock directly. Availability
              is aggregated from specific/branded variants instead. */}
          {!isEditing && ingredient.isGeneric && (
            <View className="mb-4 rounded-2xl border border-slate-200 bg-white px-6 py-6">
              <View className="flex-row items-center">
                <Ionicons name="git-branch-outline" size={22} color="#7C3AED" />
                <Text className="ml-2 flex-1 font-semibold text-slate-700">
                  Generic ingredients aren&apos;t stocked directly
                </Text>
              </View>
              <Text className="mt-2 text-sm leading-5 text-slate-500">
                Availability comes from the specific/branded ingredients
                linked to it, not from a pantry entry here.
              </Text>

              {loadingAvailability ? (
                <ActivityIndicator className="mt-4" color="#7C3AED" />
              ) : (
                !isAlwaysAvailable && ingredient.lowStockThreshold != null && (
                  <View
                    className={`mt-4 flex-row items-center self-start rounded-full px-3 py-1.5 ${
                      isLowStock ? "bg-amber-100" : "bg-slate-100"
                    }`}
                  >
                    <Ionicons
                      name="alert-circle-outline"
                      size={14}
                      color={isLowStock ? "#D97706" : "#94A3B8"}
                    />
                    <Text
                      className={`ml-1 text-xs font-semibold ${
                        isLowStock ? "text-amber-700" : "text-slate-500"
                      }`}
                    >
                      Low: {ingredient.lowStockThreshold}{" "}
                      {ingredient.defaultPortionUnit || "units"} total across
                      variants
                    </Text>
                  </View>
                )
              )}
            </View>
          )}

          {/* Pantry entries — view mode only */}
          {!isEditing && !ingredient.isGeneric && (
            <>
              <View className="mb-3 mt-2 flex-row items-center">
                <Text className="flex-1 text-base font-bold text-slate-900">
                  Pantry entries
                </Text>
                {!isAlwaysAvailable && ingredient.lowStockThreshold != null && (
                  <View
                    className={`flex-row items-center rounded-full px-2.5 py-1 ${
                      isLowStock ? "bg-amber-100" : "bg-slate-100"
                    }`}
                  >
                    <Ionicons
                      name="alert-circle-outline"
                      size={13}
                      color={isLowStock ? "#D97706" : "#94A3B8"}
                    />
                    <Text
                      className={`ml-1 text-xs font-semibold ${
                        isLowStock ? "text-amber-700" : "text-slate-500"
                      }`}
                    >
                      Low: {ingredient.lowStockThreshold}{" "}
                      {ingredient.defaultPortionUnit || "units"}
                    </Text>
                  </View>
                )}
              </View>

              {ingredientPantryItems.length === 0 ? (
                <View className="items-center rounded-2xl border border-slate-200 bg-white px-6 py-10">
                  <Ionicons
                    name="file-tray-outline"
                    size={36}
                    color="#94A3B8"
                  />
                  <Text className="mt-3 font-semibold text-slate-700">
                    Not in pantry
                  </Text>
                  <Text className="mt-1 text-center text-sm text-slate-500">
                    This ingredient has no pantry entries yet.
                  </Text>
                </View>
              ) : (
                ingredientPantryItems.map((entry) => {
                  const daysToExpiry = daysUntil(entry.expiryDate);
                  const isExpired = daysToExpiry != null && daysToExpiry < 0;
                  const isExpiringSoon =
                    daysToExpiry != null && !isExpired && daysToExpiry < 7;

                  return (
                    <View key={entry._id} className="mb-3">
                      <ReanimatedSwipeable
                        renderLeftActions={() => (
                          <Pressable
                            className="w-24 items-center justify-center rounded-l-2xl bg-red-500 active:bg-red-600"
                            onPress={() => void handleDeleteEntry(entry._id)}
                          >
                            <Ionicons
                              name="trash-outline"
                              size={22}
                              color="white"
                            />
                            <Text className="mt-1 text-xs font-medium text-white">
                              Delete
                            </Text>
                          </Pressable>
                        )}
                      >
                        <View className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                          <View className="flex-row items-center justify-between">
                            <View className="flex-row items-center">
                              <View className="h-9 w-9 items-center justify-center rounded-full bg-blue-50">
                                <Ionicons
                                  name="file-tray-stacked-outline"
                                  size={16}
                                  color="#2563EB"
                                />
                              </View>
                              <Text className="ml-3 font-semibold text-slate-900">
                                {getLocationName(entry)}
                              </Text>
                            </View>
                            <Text className="font-bold text-slate-900">
                              {entry.quantityAvailable} {entry.quantityUnit}
                            </Text>
                          </View>

                          <View className="mt-3 flex-row">
                            <View className="flex-1">
                              <Text className="text-xs text-slate-400">
                                Purchased
                              </Text>
                              <Text className="mt-0.5 text-sm font-medium text-slate-700">
                                {formatDate(entry.purchaseDate)}
                              </Text>
                            </View>
                            <View className="flex-1">
                              <Text className="text-xs text-slate-400">
                                Expires
                              </Text>
                              <Text
                                className={`mt-0.5 text-sm font-medium ${
                                  isExpired
                                    ? "text-red-600"
                                    : isExpiringSoon
                                      ? "text-amber-600"
                                      : "text-slate-700"
                                }`}
                              >
                                {formatDate(entry.expiryDate)}
                              </Text>
                            </View>
                            {isExpired || isExpiringSoon ? (
                              <View className="justify-center">
                                <View
                                  className={`rounded-full px-2 py-0.5 ${
                                    isExpired ? "bg-red-50" : "bg-amber-50"
                                  }`}
                                >
                                  <Text
                                    className={`text-xs font-medium ${
                                      isExpired
                                        ? "text-red-600"
                                        : "text-amber-600"
                                    }`}
                                  >
                                    {isExpired ? "Expired" : "Expiring soon"}
                                  </Text>
                                </View>
                              </View>
                            ) : null}
                            {entry.isFinished ? (
                              <View className="justify-center">
                                <View className="rounded-full bg-slate-100 px-2 py-0.5">
                                  <Text className="text-xs font-medium text-slate-500">
                                    Finished
                                  </Text>
                                </View>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </ReanimatedSwipeable>
                    </View>
                  );
                })
              )}

              {/* Quick-add new entry */}
              <View className="mt-1 rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <FieldLabel text="Storage location" />
                <SearchableObjectDropdown<SelectOption>
                  options={storageLocations}
                  selectedId={quickAddLocationId}
                  selectedName={quickAddLocationName}
                  placeholder="Search or type a new location"
                  onTextChange={(value) => {
                    if (value !== quickAddLocationName) {
                      setQuickAddLocationId("");
                    }
                    setQuickAddLocationDraft(value);
                  }}
                  onSelect={(option) => {
                    setQuickAddLocationId(option._id);
                    setQuickAddLocationName(option.name);
                    setQuickAddLocationDraft(option.name);
                  }}
                />

                <View className="mt-3">
                  <FieldLabel text="Quantity" />
                  <QuantityServingInput
                    quantityAvailable={quickAddQuantity}
                    quantityUnit={quickAddQuantityUnit}
                    onChangeQuantity={setQuickAddQuantity}
                    onChangeUnit={setQuickAddQuantityUnit}
                    unitOptions={units}
                    onAddUnit={registerUnit}
                    defaultPortionAmount={ingredient.defaultPortionAmount}
                    defaultPortionUnit={ingredient.defaultPortionUnit}
                  />
                </View>

                <View className="mt-3 flex-row">
                  <View className="mr-3 flex-1">
                    <FieldLabel text="Purchase date" />
                    <TextInput
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900"
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#94a3b8"
                      value={quickAddPurchaseDate}
                      onChangeText={setQuickAddPurchaseDate}
                      keyboardType="numeric"
                    />
                  </View>
                  <View className="flex-1">
                    <FieldLabel text="Expiry date" />
                    <TextInput
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900"
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#94a3b8"
                      value={quickAddExpiryDate}
                      onChangeText={setQuickAddExpiryDate}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View className="mt-2">
                  <FieldLabel text="Or set expiry from purchase date" />
                  <DurationExpiryInput
                    purchaseDate={quickAddPurchaseDate}
                    onApply={setQuickAddExpiryDate}
                  />
                </View>

                <Pressable
                  disabled={savingEntry}
                  className={`mt-3 items-center rounded-2xl py-3 ${
                    savingEntry
                      ? "bg-emerald-300"
                      : "bg-emerald-600 active:bg-emerald-700"
                  }`}
                  onPress={() => void handleQuickAdd()}
                >
                  <Text className="font-semibold text-white">
                    {savingEntry ? "Adding..." : "Add entry"}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
