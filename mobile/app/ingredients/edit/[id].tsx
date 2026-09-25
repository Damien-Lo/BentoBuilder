import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  CreatableMultiTagDropdown,
  CreatableStringDropdown,
  DateTextInput,
  DurationExpiryInput,
  DurationValueInput,
  FieldLabel,
  FormInput,
  NutritionFieldsEditor,
  PriceInput,
  QuantityServingInput,
  SearchableObjectDropdown,
  SectionTitle,
  ToggleRow,
  UnitConversionsEditor,
} from "@/src/components/forms";
import {
  hasAnyNutrition,
  nutritionFormToInput,
  nutritionToForm,
  type NutritionFormValues,
} from "@/src/utils/nutritionForm";

import {
  getBrands,
  getCategories,
  getStorageLocations,
  getStores,
  getTags,
  getUnitSuggestions,
  createBrand,
  createCategory,
  createStorageLocation,
  createStore,
  createTag,
  type SelectOption,
} from "@/src/services/optionsApi";

import {
  deleteIngredient,
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
import {
  addDurationToDate,
  daysUntil,
  formatDateDisplay,
  todayDateInputString,
  type DurationUnit,
} from "@/src/utils/date";
import {
  recentPantryEntries,
  suggestExpiryDuration,
  suggestStorageLocation,
  suggestStore,
} from "@/src/utils/pantryDefaults";
import { loadSettings } from "@/src/services/settingsService";
import { useScrollFocusSection } from "@/src/hooks/useScrollFocusSection";
import {
  convertAmountForUnitChange,
  getIngredientConversions,
  type CustomUnitConversion,
} from "@/src/utils/unitConversion";

// How many of the ingredient's most recent pantry entries to consider when
// suggesting a default storage location / expiry duration.
const HISTORY_WINDOW = 20;

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

function hasNutritionData(form: FormState): boolean {
  return hasAnyNutrition(form.nutrition);
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
  // Purely a display/grouping label (e.g. "steak", "fillet") - set only
  // when this ingredient is naturally bought/consumed as discrete,
  // individually-sized pieces, so the pantry list can show a piece count
  // instead of a summed weight. No weight range - that's a per-recipe
  // decision made on the recipe's own ingredient line.
  pieceLabel: string;
  barcode: string;
  lowStockThreshold: string;
  alwaysAvailable: boolean;
  defaultStorageLocationId: string;
  defaultStorageLocationName: string;
  defaultExpiryDurationAmount: string;
  defaultExpiryDurationUnit: DurationUnit;
  // Every nutrient, core and extended — the update route replaces the
  // whole nutrition sub-document, so the form has to load and send back
  // all of them or a save here would wipe values set elsewhere (e.g. a
  // barcode scan's extended nutrients).
  nutrition: NutritionFormValues;
  unitConversions: CustomUnitConversion[];
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
    pieceLabel: ingredient.pieceLabel ?? "",
    barcode: ingredient.barcode ?? "",
    lowStockThreshold:
      ingredient.lowStockThreshold != null
        ? String(ingredient.lowStockThreshold)
        : "",
    alwaysAvailable: ingredient.isAlwaysAvailable ?? false,
    defaultStorageLocationId: getReferenceId(ingredient.defaultStorageLocation),
    defaultStorageLocationName: getReferenceName(ingredient.defaultStorageLocation),
    defaultExpiryDurationAmount:
      ingredient.defaultExpiryDurationAmount != null
        ? String(ingredient.defaultExpiryDurationAmount)
        : "",
    defaultExpiryDurationUnit: ingredient.defaultExpiryDurationUnit ?? "week",
    nutrition: nutritionToForm(ingredient.nutrition),
    unitConversions: ingredient.unitConversions ?? [],
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
  const [stores, setStores] = useState<SelectOption[]>([]);
  const [brands, setBrands] = useState<SelectOption[]>([]);
  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [allTags, setAllTags] = useState<SelectOption[]>([]);
  const [selectedTags, setSelectedTags] = useState<SelectOption[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [customUnitConversions, setCustomUnitConversions] = useState<CustomUnitConversion[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [brandDraft, setBrandDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [defaultLocationDraft, setDefaultLocationDraft] = useState("");
  const [wantsDefaultLocation, setWantsDefaultLocation] = useState(false);
  const [wantsDefaultExpiry, setWantsDefaultExpiry] = useState(false);
  const [nutritionExpanded, setNutritionExpanded] = useState(false);
  const [smartDefaultsExpanded, setSmartDefaultsExpanded] = useState(false);
  const [unitConversionsExpanded, setUnitConversionsExpanded] = useState(false);
  const [quickAddPurchaseDate, setQuickAddPurchaseDate] = useState(
    todayDateInputString(),
  );
  const [quickAddExpiryDate, setQuickAddExpiryDate] = useState("");
  const [quickAddExpiryTouched, setQuickAddExpiryTouched] = useState(false);
  const [quickAddLocationId, setQuickAddLocationId] = useState("");
  const [quickAddLocationName, setQuickAddLocationName] = useState("");
  const [quickAddLocationDraft, setQuickAddLocationDraft] = useState("");
  const [quickAddLocationTouched, setQuickAddLocationTouched] = useState(false);
  const [quickAddStoreId, setQuickAddStoreId] = useState("");
  const [quickAddStoreName, setQuickAddStoreName] = useState("");
  const [quickAddStoreDraft, setQuickAddStoreDraft] = useState("");
  const [quickAddStoreTouched, setQuickAddStoreTouched] = useState(false);
  const [quickAddQuantity, setQuickAddQuantity] = useState("");
  const [quickAddQuantityUnit, setQuickAddQuantityUnit] = useState("");
  const [quickAddEntryCount, setQuickAddEntryCount] = useState("1");
  const [quickAddPrice, setQuickAddPrice] = useState("");
  const [quickAddNotes, setQuickAddNotes] = useState("");
  const [quickAddShowMoreDetails, setQuickAddShowMoreDetails] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);

  const [genericAvailability, setGenericAvailability] =
    useState<IngredientAvailability | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  // Scrolls whichever field was just focused/opened into view — this page
  // has a single top-level ScrollView shared by both the edit form and the
  // (mutually exclusive) detail/quick-add view, so one scrollRef/anchorRef
  // pair covers every section below regardless of which branch is mounted.
  // zIndex descends in on-screen top-to-bottom order among the dropdown-
  // capable fields only — see useScrollFocusSection for why plain
  // TextInput-style sections don't need one (they default to 0).
  const scrollRef = useRef<ScrollView>(null);
  const scrollAnchorRef = useRef<View>(null);

  // Edit-form sections, in on-screen order.
  const nameSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const brandSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 120);
  const categorySection = useScrollFocusSection(scrollRef, scrollAnchorRef, 100);
  const tagsSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 80);
  const descriptionSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const barcodeSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const portionSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const pieceLabelSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const lowStockSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const nutritionSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const defaultStorageLocationSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 60);
  const defaultExpirySection = useScrollFocusSection(scrollRef, scrollAnchorRef);

  // Quick-add pantry entry sections (detail view, !isEditing), in on-screen
  // order — continues the same descending zIndex sequence as the edit-form
  // dropdowns above even though the two branches never mount together, for
  // one consistent numbering across the file.
  const quickAddLocationSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 40);
  const quickAddQuantitySection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const quickAddDatesSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const quickAddDurationSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const quickAddStoreSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 20);
  const quickAddPriceSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const quickAddNotesSection = useScrollFocusSection(scrollRef, scrollAnchorRef);

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
          loadedStores,
          loadedBrands,
          loadedCategories,
          loadedTags,
          loadedUnits,
          loadedSettings,
        ] = await Promise.all([
          getIngredientById(id),
          getPantryItems(),
          getStorageLocations(),
          getStores(),
          getBrands(),
          getCategories(),
          getTags(),
          getUnitSuggestions(),
          loadSettings(),
        ]);

        if (cancelled) return;

        const loadedForm = ingredientToForm(loadedIngredient);
        setCurrentIngredient(loadedIngredient);
        setForm(loadedForm);
        setBrandDraft(loadedForm.brandName);
        setCategoryDraft(loadedForm.categoryName);
        setDefaultLocationDraft(loadedForm.defaultStorageLocationName);
        setWantsDefaultLocation(!!loadedForm.defaultStorageLocationId);
        setWantsDefaultExpiry(!!loadedForm.defaultExpiryDurationAmount);
        setNutritionExpanded(hasNutritionData(loadedForm));
        setSmartDefaultsExpanded(
          !!loadedForm.defaultStorageLocationId || !!loadedForm.defaultExpiryDurationAmount,
        );

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
        setStores(Array.isArray(loadedStores) ? loadedStores : []);
        setBrands(Array.isArray(loadedBrands) ? loadedBrands : []);
        setCategories(Array.isArray(loadedCategories) ? loadedCategories : []);
        setAllTags(Array.isArray(loadedTags) ? loadedTags : []);
        setSelectedTags(
          Array.isArray(loadedIngredient.tags)
            ? loadedIngredient.tags.filter(
                (t): t is SelectOption => typeof t === "object" && t !== null,
              )
            : [],
        );
        setUnits(Array.isArray(loadedUnits) ? loadedUnits : []);
        setCustomUnitConversions(loadedSettings.unitConversions ?? []);
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

  // The Pantry entries list below shows a generic's own direct entries plus
  // every specific/branded variant's entries too — that's genuinely where
  // most of a generic's real-world stock lives. Every other use of "this
  // ingredient's pantry items" (smart-default suggestions, quick-add
  // fallbacks, the "direct entries" count) stays scoped to direct entries
  // only, via ingredientPantryItems above.
  const displayedPantryItems = useMemo(() => {
    if (!currentIngredient?.isGeneric) return ingredientPantryItems;

    return pantryItems.filter((p) => {
      if (getReferenceId(p.ingredient as unknown) === id) return true;
      return getReferenceId(p.ingredient?.genericParent as unknown) === id;
    });
  }, [pantryItems, id, currentIngredient?.isGeneric, ingredientPantryItems]);

  useEffect(() => {
    const lastEntry = ingredientPantryItems[0];
    if (!lastEntry) return;
    setQuickAddQuantityUnit((current) => current || lastEntry.quantityUnit);
  }, [ingredientPantryItems]);

  const getLocationName = useCallback(
    (item: PantryItem): string => {
      const raw = item.storageLocation as unknown;
      const populated = getReferenceName(raw);
      if (populated) return populated;
      const locId = getReferenceId(raw);
      return storageLocationById.get(locId)?.name ?? "Unknown location";
    },
    [storageLocationById],
  );

  // Most recently logged pantry entries for this ingredient — the basis for
  // both "smart default" suggestions below.
  const recentPantryHistory = useMemo(
    () => recentPantryEntries(ingredientPantryItems, HISTORY_WINDOW),
    [ingredientPantryItems],
  );

  // The most frequently used storage location across recent entries, or
  // null if there's no history yet to suggest from.
  const suggestedLocation = useMemo(
    () => suggestStorageLocation(recentPantryHistory),
    [recentPantryHistory],
  );

  // The average expiry duration across recent entries that have both a
  // purchase and expiry date, rounded to the nearest whole unit.
  const suggestedExpiryDuration = useMemo(
    () => suggestExpiryDuration(recentPantryHistory),
    [recentPantryHistory],
  );

  // What actually drives quick-add's location auto-fill: the ingredient's
  // own saved default location if one has been set (typed or accepted via
  // Autofill), otherwise the live suggestion computed from history.
  const effectiveLocation = useMemo(() => {
    const savedDefault = currentIngredient?.defaultStorageLocation as unknown;
    const savedDefaultId = getReferenceId(savedDefault);
    if (savedDefaultId) {
      const name =
        getReferenceName(savedDefault) ||
        storageLocationById.get(savedDefaultId)?.name ||
        "";
      return { id: savedDefaultId, name };
    }
    return suggestedLocation;
  }, [currentIngredient, suggestedLocation, storageLocationById]);

  // Keeps quick-add's storage location in sync with whichever location is
  // effective — but only until the user picks/types one themselves, at
  // which point their input always wins.
  useEffect(() => {
    if (quickAddLocationTouched || !effectiveLocation) return;

    setQuickAddLocationId(effectiveLocation.id);
    setQuickAddLocationName(effectiveLocation.name);
    setQuickAddLocationDraft(effectiveLocation.name);
  }, [effectiveLocation, quickAddLocationTouched]);

  // The most frequently bought-from store across recent entries — unlike
  // storage location/expiry, there's no per-ingredient "default store" to
  // check first, since store is purely a per-purchase attribute.
  const suggestedStore = useMemo(
    () => suggestStore(recentPantryHistory),
    [recentPantryHistory],
  );

  useEffect(() => {
    if (quickAddStoreTouched || !suggestedStore) return;

    setQuickAddStoreId(suggestedStore.id);
    setQuickAddStoreName(suggestedStore.name);
    setQuickAddStoreDraft(suggestedStore.name);
  }, [suggestedStore, quickAddStoreTouched]);

  // What actually drives quick-add's expiry auto-fill: the ingredient's own
  // saved default duration if one has been set (typed or accepted via
  // Autofill), otherwise the live suggestion computed from history.
  const effectiveExpiryDuration = useMemo(() => {
    if (
      currentIngredient?.defaultExpiryDurationAmount != null &&
      currentIngredient.defaultExpiryDurationUnit
    ) {
      return {
        amount: currentIngredient.defaultExpiryDurationAmount,
        unit: currentIngredient.defaultExpiryDurationUnit,
      };
    }
    return suggestedExpiryDuration;
  }, [currentIngredient, suggestedExpiryDuration]);

  // Keeps quick-add's expiry date in sync with the purchase date using
  // whichever duration is effective — but only until the user edits the
  // expiry field themselves, at which point their input always wins.
  useEffect(() => {
    if (quickAddExpiryTouched || !effectiveExpiryDuration) return;

    setQuickAddExpiryDate(
      addDurationToDate(
        quickAddPurchaseDate,
        effectiveExpiryDuration.amount,
        effectiveExpiryDuration.unit,
      ),
    );
  }, [quickAddPurchaseDate, effectiveExpiryDuration, quickAddExpiryTouched]);

  function handleAutofillLocation() {
    if (!suggestedLocation) return;
    updateForm("defaultStorageLocationId", suggestedLocation.id);
    updateForm("defaultStorageLocationName", suggestedLocation.name);
    setDefaultLocationDraft(suggestedLocation.name);
    setWantsDefaultLocation(true);
  }

  function handleAutofillExpiryDuration() {
    if (!suggestedExpiryDuration) return;
    updateForm("defaultExpiryDurationAmount", String(suggestedExpiryDuration.amount));
    updateForm("defaultExpiryDurationUnit", suggestedExpiryDuration.unit);
    setWantsDefaultExpiry(true);
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
      setDefaultLocationDraft(revertedForm.defaultStorageLocationName);
      setWantsDefaultLocation(!!revertedForm.defaultStorageLocationId);
      setWantsDefaultExpiry(!!revertedForm.defaultExpiryDurationAmount);
      setNutritionExpanded(hasNutritionData(revertedForm));
      setSmartDefaultsExpanded(
        !!revertedForm.defaultStorageLocationId || !!revertedForm.defaultExpiryDurationAmount,
      );
    }
    setIsEditing(false);
  }

  function handleDeleteIngredient() {
    if (!currentIngredient) return;
    Alert.alert(
      "Delete ingredient",
      `Delete "${currentIngredient.name}"? This will remove it and all its pantry entries.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setSaving(true);
              await deleteIngredient(id);
              router.back();
            } catch (err) {
              Alert.alert(
                "Unable to delete",
                err instanceof Error ? err.message : "Could not delete ingredient.",
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
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

      // Only resolved when the user opted in — leaving the toggle off always
      // clears the value, even if a field still has leftover typed text.
      const defaultStorageLocation =
        wantsDefaultLocation
          ? await resolveOrCreateOption(
              storageLocations,
              form.defaultStorageLocationId,
              defaultLocationDraft,
              handleCreateStorageLocation,
            )
          : null;

      const defaultExpiryDurationAmount = wantsDefaultExpiry
        ? optionalNumber(form.defaultExpiryDurationAmount)
        : undefined;

      // Tags typed but not yet matched to a real record (pending, no _id
      // yet) get created here — no separate "create" tap was needed for them.
      const resolvedTags = await Promise.all(
        selectedTags.map((tag) =>
          tag._id ? tag : resolveOrCreateOption(allTags, "", tag.name, handleCreateTag),
        ),
      );
      const tagIds = resolvedTags
        .filter((t): t is SelectOption => t != null)
        .map((t) => t._id);

      const updated = await updateIngredient(id, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        // Generics are an abstract matching umbrella, not one physical
        // product — never save a barcode for one, even if it already had a
        // stray value from before this rule existed.
        barcode: currentIngredient?.isGeneric ? null : form.barcode.trim() || null,
        brand: brand?._id || null,
        category: category?._id || null,
        defaultPortionAmount: optionalNumber(form.defaultPortionAmount),
        defaultPortionUnit: form.defaultPortionUnit.trim() || undefined,
        pieceLabel: form.pieceLabel.trim() || null,
        lowStockThreshold: optionalNumber(form.lowStockThreshold),
        isAlwaysAvailable: form.alwaysAvailable,
        defaultStorageLocation: defaultStorageLocation?._id || null,
        defaultExpiryDurationAmount: defaultExpiryDurationAmount ?? null,
        defaultExpiryDurationUnit:
          defaultExpiryDurationAmount != null ? form.defaultExpiryDurationUnit : null,
        nutrition: nutritionFormToInput(form.nutrition),
        unitConversions: form.unitConversions,
        tags: tagIds,
      });

      const updatedForm = ingredientToForm(updated);
      setCurrentIngredient(updated);
      setForm(updatedForm);
      setBrandDraft(updatedForm.brandName);
      setCategoryDraft(updatedForm.categoryName);
      setDefaultLocationDraft(updatedForm.defaultStorageLocationName);
      setWantsDefaultLocation(!!updatedForm.defaultStorageLocationId);
      setWantsDefaultExpiry(!!updatedForm.defaultExpiryDurationAmount);
      setNutritionExpanded(hasNutritionData(updatedForm));
      setSmartDefaultsExpanded(
        !!updatedForm.defaultStorageLocationId || !!updatedForm.defaultExpiryDurationAmount,
      );
      setSelectedTags(
        Array.isArray(updated.tags)
          ? updated.tags.filter((t): t is SelectOption => typeof t === "object" && t !== null)
          : [],
      );
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

  async function handleCreateStore(name: string): Promise<SelectOption> {
    const store = await createStore(name);
    setStores((current) =>
      current.some((s) => s._id === store._id)
        ? current
        : [...current, store].sort((a, b) => a.name.localeCompare(b.name)),
    );
    return store;
  }

  async function handleCreateTag(name: string): Promise<SelectOption> {
    const tag = await createTag(name);
    setAllTags((current) =>
      current.some((t) => t._id === tag._id) ? current : [...current, tag],
    );
    return tag;
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
    const trimmed = unit.trim();

    setForm((current) => {
      if (!current) return current;

      const oldUnit = current.defaultPortionUnit;
      if (!oldUnit || trimmed === oldUnit) {
        return { ...current, defaultPortionUnit: trimmed };
      }

      const next = { ...current, defaultPortionUnit: trimmed };
      const resolvedConversions = getIngredientConversions(
        { unitConversions: current.unitConversions, genericParent: currentIngredient?.genericParent },
        customUnitConversions,
      );

      const amountConverted = convertAmountForUnitChange(
        Number(current.defaultPortionAmount),
        oldUnit,
        trimmed,
        resolvedConversions,
      );
      if (amountConverted != null) next.defaultPortionAmount = String(amountConverted);

      const thresholdConverted = convertAmountForUnitChange(
        Number(current.lowStockThreshold),
        oldUnit,
        trimmed,
        resolvedConversions,
      );
      if (thresholdConverted != null) next.lowStockThreshold = String(thresholdConverted);

      return next;
    });
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

    // A prior entry (if any) is just a convenience default for unit/low-stock
    // threshold below — this ingredient's own fields cover the same ground,
    // so a never-yet-stocked ingredient (e.g. fresh off a recipe link) can
    // still get its first entry added right here.
    const lastEntry = ingredientPantryItems[0];

    if (!quickAddLocationId && !quickAddLocationDraft.trim()) {
      Alert.alert(
        "Missing storage location",
        "Search or type a storage location before adding an entry.",
      );
      return;
    }

    const resolvedUnit =
      quickAddQuantityUnit.trim() || lastEntry?.quantityUnit || currentIngredient.defaultPortionUnit || "";
    if (!resolvedUnit) {
      Alert.alert("Missing unit", "Choose a unit before adding an entry.");
      return;
    }

    if (quickAddPrice.trim()) {
      const parsedPrice = Number(quickAddPrice);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        Alert.alert("Invalid price", "Enter a valid price of 0 or more.");
        return;
      }
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

      const store = await resolveOrCreateOption(
        stores,
        quickAddStoreId,
        quickAddStoreDraft,
        handleCreateStore,
      );

      const entryCount = Math.max(1, Math.round(Number(quickAddEntryCount)) || 1);
      const newEntries: PantryItem[] = [];
      for (let i = 0; i < entryCount; i++) {
        newEntries.push(
          await addIngredientToPantry({
            ingredient: id,
            storageLocation: storageLocation._id,
            quantityAvailable: quickAddQuantity ? Number(quickAddQuantity) : 0,
            quantityUnit: resolvedUnit,
            purchaseDate: quickAddPurchaseDate || undefined,
            expiryDate: quickAddExpiryDate || undefined,
            purchasePrice: quickAddPrice.trim() ? Number(quickAddPrice) : undefined,
            store: store ? store._id : null,
            notes: quickAddNotes.trim() || undefined,
          }),
        );
      }

      setPantryItems((current) => [...current, ...newEntries]);
      setQuickAddPurchaseDate(todayDateInputString());
      setQuickAddExpiryDate("");
      setQuickAddExpiryTouched(false);
      setQuickAddPrice("");
      setQuickAddNotes("");
      setQuickAddShowMoreDetails(false);
      setQuickAddLocationTouched(false);
      setQuickAddStoreTouched(false);
      setQuickAddQuantity("");
      setQuickAddEntryCount("1");
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

  // A generic's total is its own direct pantry stock plus the aggregation
  // across its specific/branded variants (both computed server-side).
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
          ref={scrollRef}
          className="flex-1"
          contentContainerClassName="px-5 pb-16 pt-5"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
        >
          <View ref={scrollAnchorRef} collapsable={false} />
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
                      It has no brand — its availability also includes any
                      specific/branded variants linked to it.
                    </Text>
                  </View>
                </View>
              )}

              <SectionTitle
                first
                icon="pricetag-outline"
                title="Ingredient"
                description="What it is, and how it's categorized."
              />

              <View {...nameSection.wrapperProps}>
                <FieldLabel text="Name" required />
                <FormInput
                  value={form.name}
                  placeholder="e.g. Rolled oats"
                  onFocus={nameSection.trigger}
                  onChangeText={(v) => updateForm("name", v)}
                />
              </View>

              {!ingredient.isGeneric && (
                <View {...brandSection.wrapperProps}>
                  <FieldLabel text="Brand" />
                  <SearchableObjectDropdown<SelectOption>
                    options={brands}
                    selectedId={form.brandId}
                    selectedName={form.brandName}
                    placeholder="Search or type a new brand"
                    onOpen={brandSection.trigger}
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
                </View>
              )}

              <View {...categorySection.wrapperProps}>
                <FieldLabel text="Category" />
                <SearchableObjectDropdown<SelectOption>
                  options={categories}
                  selectedId={form.categoryId}
                  selectedName={form.categoryName}
                  placeholder="Search or type a new category"
                  onOpen={categorySection.trigger}
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

              <View {...descriptionSection.wrapperProps}>
                <FieldLabel text="Description" />
                <FormInput
                  value={form.description}
                  placeholder="Optional description"
                  multiline
                  onFocus={descriptionSection.trigger}
                  onChangeText={(v) => updateForm("description", v)}
                />
              </View>

              {!ingredient.isGeneric && (
                <View {...barcodeSection.wrapperProps}>
                  <FieldLabel text="Barcode" />
                  <FormInput
                    value={form.barcode}
                    placeholder="Optional barcode"
                    autoCapitalize="none"
                    keyboardType="numbers-and-punctuation"
                    onFocus={barcodeSection.trigger}
                    onChangeText={(v) => updateForm("barcode", v)}
                  />
                </View>
              )}

              <SectionTitle
                icon="scale-outline"
                title="Serving & stock"
                description="Define a serving size and when to flag low stock."
              />

              <View className="flex-row" {...portionSection.wrapperProps}>
                <View className="mr-3 flex-1">
                  <FieldLabel text="Default portion" />
                  <FormInput
                    value={form.defaultPortionAmount}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    onFocus={portionSection.trigger}
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

              <View className="mt-4" {...pieceLabelSection.wrapperProps}>
                <FieldLabel text="Piece label (optional)" />
                <FormInput
                  value={form.pieceLabel}
                  placeholder="e.g. steak, fillet, cut"
                  onFocus={pieceLabelSection.trigger}
                  onChangeText={(v) => updateForm("pieceLabel", v)}
                />
                <Text className="mt-2 text-xs leading-4 text-slate-500">
                  Only set this if you buy/log it as individual pieces rather than
                  a continuous amount (a steak vs. ground beef) — the pantry list
                  will then show a count (&quot;3 steaks&quot;) instead of a summed
                  weight. Doesn&apos;t set any size limit; a recipe&apos;s own
                  ingredient line still decides what weight range counts as a
                  usable piece.
                </Text>
              </View>

              <ToggleRow
                label="Always available"
                description="Never shows as low or out of stock (e.g. tap water) — skips stock tracking entirely."
                value={form.alwaysAvailable}
                onChange={(v) => updateForm("alwaysAvailable", v)}
              />

              {!form.alwaysAvailable && (
                <View {...lowStockSection.wrapperProps}>
                  <FieldLabel text="Low stock threshold" />
                  <FormInput
                    value={form.lowStockThreshold}
                    placeholder={`Alert when total falls below this (${form.defaultPortionUnit || "units"})`}
                    keyboardType="decimal-pad"
                    onFocus={lowStockSection.trigger}
                    onChangeText={(v) => updateForm("lowStockThreshold", v)}
                  />
                </View>
              )}

              <Pressable
                className="mt-8 flex-row items-center justify-between"
                onPress={() => setNutritionExpanded((current) => !current)}
              >
                <View className="mr-3 flex-1 flex-row items-center">
                  <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-blue-50">
                    <Ionicons name="nutrition-outline" size={18} color="#2563EB" />
                  </View>

                  <View className="flex-1">
                    <Text className="text-base font-bold text-slate-950">
                      Nutrition per serving
                    </Text>
                    <Text className="mt-0.5 text-xs leading-4 text-slate-500">
                      Optional — add now, or fill in later.
                    </Text>
                  </View>
                </View>

                <Ionicons
                  name={nutritionExpanded ? "chevron-up" : "chevron-down"}
                  size={22}
                  color="#64748B"
                />
              </Pressable>

              {nutritionExpanded && (
                <View {...nutritionSection.wrapperProps}>
                  <NutritionFieldsEditor
                    values={form.nutrition}
                    onChange={(field, value) => updateForm("nutrition", { ...form.nutrition, [field]: value })}
                    onFocus={nutritionSection.trigger}
                  />
                </View>
              )}

              <Pressable
                className="mt-8 flex-row items-center justify-between"
                onPress={() => setSmartDefaultsExpanded((current) => !current)}
              >
                <View className="mr-3 flex-1 flex-row items-center">
                  <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-blue-50">
                    <Ionicons name="options-outline" size={18} color="#2563EB" />
                  </View>

                  <View className="flex-1">
                    <Text className="text-base font-bold text-slate-950">
                      Smart defaults
                    </Text>
                    <Text className="mt-0.5 text-xs leading-4 text-slate-500">
                      Optional — speeds up logging future purchases.
                    </Text>
                  </View>
                </View>

                <Ionicons
                  name={smartDefaultsExpanded ? "chevron-up" : "chevron-down"}
                  size={22}
                  color="#64748B"
                />
              </Pressable>

              {smartDefaultsExpanded && (
                <>
                  <ToggleRow
                    label="Set a default storage location"
                    description="Prefills the location when logging a purchase of this ingredient."
                    value={wantsDefaultLocation}
                    onChange={setWantsDefaultLocation}
                  />
                  {suggestedLocation && (
                    <Pressable
                      className="mt-2 flex-row items-center self-start rounded-full bg-blue-50 px-3 py-1.5 active:bg-blue-100"
                      onPress={handleAutofillLocation}
                    >
                      <Ionicons name="sparkles-outline" size={14} color="#2563EB" />
                      <Text className="ml-1.5 text-xs font-semibold text-blue-600">
                        Autofill: {suggestedLocation.name}
                      </Text>
                    </Pressable>
                  )}
                  {wantsDefaultLocation && (
                    <View {...defaultStorageLocationSection.wrapperProps}>
                      <FieldLabel text="Default storage location" />
                      <SearchableObjectDropdown<SelectOption>
                        options={storageLocations}
                        selectedId={form.defaultStorageLocationId}
                        selectedName={form.defaultStorageLocationName}
                        placeholder="Search or type a location"
                        onOpen={defaultStorageLocationSection.trigger}
                        onTextChange={(value) => {
                          if (value !== form.defaultStorageLocationName) {
                            updateForm("defaultStorageLocationId", "");
                          }
                          setDefaultLocationDraft(value);
                        }}
                        onSelect={(option) => {
                          updateForm("defaultStorageLocationId", option._id);
                          updateForm("defaultStorageLocationName", option.name);
                          setDefaultLocationDraft(option.name);
                        }}
                      />
                    </View>
                  )}

                  <ToggleRow
                    label="Set a default expiry duration"
                    description="Prefills the expiry date when logging a purchase of this ingredient."
                    value={wantsDefaultExpiry}
                    onChange={setWantsDefaultExpiry}
                  />
                  {suggestedExpiryDuration && (
                    <Pressable
                      className="mt-2 flex-row items-center self-start rounded-full bg-blue-50 px-3 py-1.5 active:bg-blue-100"
                      onPress={handleAutofillExpiryDuration}
                    >
                      <Ionicons name="sparkles-outline" size={14} color="#2563EB" />
                      <Text className="ml-1.5 text-xs font-semibold text-blue-600">
                        Autofill: {suggestedExpiryDuration.amount}{" "}
                        {suggestedExpiryDuration.unit}
                        {suggestedExpiryDuration.amount > 1 ? "s" : ""}
                      </Text>
                    </Pressable>
                  )}
                  {wantsDefaultExpiry && (
                    <View {...defaultExpirySection.wrapperProps}>
                      <FieldLabel text="Default expiry duration" />
                      <DurationValueInput
                        amount={form.defaultExpiryDurationAmount}
                        unit={form.defaultExpiryDurationUnit}
                        onChangeAmount={(v) => updateForm("defaultExpiryDurationAmount", v)}
                        onChangeUnit={(v) => updateForm("defaultExpiryDurationUnit", v)}
                        onFocus={defaultExpirySection.trigger}
                      />
                    </View>
                  )}
                </>
              )}

              <Pressable
                className="mt-8 flex-row items-center justify-between"
                onPress={() => setUnitConversionsExpanded((current) => !current)}
              >
                <View className="mr-3 flex-1 flex-row items-center">
                  <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-blue-50">
                    <Ionicons name="swap-horizontal-outline" size={18} color="#2563EB" />
                  </View>

                  <View className="flex-1">
                    <Text className="text-base font-bold text-slate-950">
                      Unit conversions
                    </Text>
                    <Text className="mt-0.5 text-xs leading-4 text-slate-500">
                      Optional — e.g. 1 tbsp = 10 g, specific to this ingredient (density
                      varies, so this doesn&apos;t apply to other ingredients).
                    </Text>
                  </View>
                </View>

                <Ionicons
                  name={unitConversionsExpanded ? "chevron-up" : "chevron-down"}
                  size={22}
                  color="#64748B"
                />
              </Pressable>

              {unitConversionsExpanded && (
                <View className="mt-4">
                  <UnitConversionsEditor
                    conversions={form.unitConversions}
                    onChange={(conversions) => updateForm("unitConversions", conversions)}
                    unitOptions={units}
                    disabled={saving}
                  />
                </View>
              )}

              <Pressable
                disabled={saving}
                className="mt-8 items-center rounded-2xl border border-red-200 bg-red-50 py-3.5 active:bg-red-100"
                onPress={handleDeleteIngredient}
              >
                <Text className="font-semibold text-red-600">Delete ingredient</Text>
              </Pressable>
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
                  {ingredient.productionRecipe ? (
                    <View className="mr-2 rounded-full bg-blue-50 px-3 py-1">
                      <Text className="text-sm font-medium text-blue-600">
                        Prepared
                      </Text>
                    </View>
                  ) : null}
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
                    <View className="mr-2 rounded-full bg-slate-100 px-3 py-1">
                      <Text className="text-sm font-medium text-slate-600">
                        {brandName}
                      </Text>
                    </View>
                  ) : null}
                  {selectedTags.map((tag) => (
                    <View key={tag._id} className="mr-2 mt-2 rounded-full bg-slate-100 px-3 py-1">
                      <Text className="text-sm font-medium text-slate-600">
                        #{tag.name}
                      </Text>
                    </View>
                  ))}
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
                    {Math.round(totalQuantity * 100) / 100}
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
                      ? [
                          ingredientPantryItems.length > 0
                            ? `${ingredientPantryItems.length} direct ${
                                ingredientPantryItems.length === 1 ? "entry" : "entries"
                              }`
                            : null,
                          `${genericAvailability?.variantCount ?? 0} variant${
                            genericAvailability?.variantCount === 1 ? "" : "s"
                          }`,
                        ]
                          .filter(Boolean)
                          .join(" + ")
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
              ingredient.defaultPortionAmount != null ||
              ingredient.defaultStorageLocation ||
              ingredient.defaultExpiryDurationAmount != null ? (
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
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="text-sm text-slate-500">Barcode</Text>
                      <Text className="text-sm font-medium text-slate-900">
                        {ingredient.barcode}
                      </Text>
                    </View>
                  ) : null}

                  {ingredient.defaultStorageLocation ? (
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="text-sm text-slate-500">Default location</Text>
                      <Text className="text-sm font-medium text-slate-900">
                        {getReferenceName(ingredient.defaultStorageLocation)}
                      </Text>
                    </View>
                  ) : null}

                  {ingredient.defaultExpiryDurationAmount != null ? (
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm text-slate-500">Usually lasts</Text>
                      <Text className="text-sm font-medium text-slate-900">
                        {ingredient.defaultExpiryDurationAmount}{" "}
                        {ingredient.defaultExpiryDurationUnit}
                        {ingredient.defaultExpiryDurationAmount > 1 ? "s" : ""}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Unit conversions */}
              {ingredient.unitConversions && ingredient.unitConversions.length > 0 ? (
                <View className="mb-4 rounded-2xl border border-slate-200 bg-white px-5 py-4">
                  <Text className="mb-3 text-base font-bold text-slate-900">
                    Unit conversions
                  </Text>

                  {ingredient.unitConversions.map((conversion, index) => (
                    <View
                      key={`${conversion.unit}-${conversion.baseUnit}-${index}`}
                      className={`flex-row items-center justify-between ${
                        index < ingredient.unitConversions!.length - 1 ? "mb-2" : ""
                      }`}
                    >
                      <Text className="text-sm text-slate-500">
                        1 {conversion.unit}
                      </Text>
                      <Text className="text-sm font-medium text-slate-900">
                        = {conversion.factor} {conversion.baseUnit}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Nutrition */}
              {nutrition ? (
                <View className="mb-4 rounded-2xl border border-slate-200 bg-white px-5 py-4">
                  <Text className="mb-1 text-base font-bold text-slate-900">
                    Nutrition
                  </Text>
                  <Text className="mb-3 text-xs text-slate-400">
                    Per {ingredient.defaultPortionAmount ?? 1} {ingredient.defaultPortionUnit || "serving"}
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

          {/* Generic ingredients are a matching umbrella — a recipe calling
              for this can be satisfied by any specific/branded variant too,
              so availability below includes more than just its own entries. */}
          {!isEditing && ingredient.isGeneric && (
            <View className="mb-4 rounded-2xl border border-slate-200 bg-white px-6 py-6">
              <View className="flex-row items-center">
                <Ionicons name="git-branch-outline" size={22} color="#7C3AED" />
                <Text className="ml-2 flex-1 font-semibold text-slate-700">
                  Includes specific/branded variants
                </Text>
              </View>
              <Text className="mt-2 text-sm leading-5 text-slate-500">
                Availability also counts any specific/branded ingredients
                linked to this one, not just the entries below.
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
                      {ingredient.defaultPortionUnit || "units"} combined total
                    </Text>
                  </View>
                )
              )}
            </View>
          )}

          {/* Made from a recipe — view mode only, display only. Set from
              the recipe screens, not editable here (avoids two UIs
              mutating the same relationship). */}
          {!isEditing && ingredient.productionRecipe ? (
            <View className="mb-4 rounded-2xl border border-slate-200 bg-white px-6 py-6">
              <View className="flex-row items-center">
                <Ionicons name="flask-outline" size={22} color="#2563EB" />
                <Text className="ml-2 flex-1 font-semibold text-slate-700">
                  Made from {getReferenceName(ingredient.productionRecipe)}
                </Text>
                <View className="rounded-full bg-blue-50 px-2.5 py-1">
                  <Text className="text-xs font-semibold text-blue-600">Recipe</Text>
                </View>
              </View>
              <Text className="mt-2 text-sm leading-5 text-slate-500">
                Cooking that recipe deposits a batch of this here — its nutrition stays in
                sync with the recipe automatically.
              </Text>
              <Pressable
                className="mt-4 flex-row items-center justify-center rounded-2xl bg-blue-600 py-3 active:bg-blue-700"
                onPress={() =>
                  router.push({
                    pathname: "/recipes/[id]",
                    params: { id: getReferenceId(ingredient.productionRecipe) },
                  })
                }
              >
                <Text className="mr-1.5 text-sm font-semibold text-white">Go to recipe</Text>
                <Ionicons name="arrow-forward" size={16} color="white" />
              </Pressable>
            </View>
          ) : null}

          {/* Pantry entries — view mode only */}
          {!isEditing && (
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

              {displayedPantryItems.length === 0 ? (
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
                    {currentIngredient?.isGeneric
                      ? "No entries yet — directly, or under any specific/branded variant."
                      : "This ingredient has no pantry entries yet."}
                  </Text>
                </View>
              ) : (
                displayedPantryItems.map((entry) => {
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
                        <Pressable
                          className="rounded-2xl border border-slate-200 bg-white px-5 py-4 active:bg-slate-50"
                          onPress={() =>
                            router.push({
                              pathname: "/pantry/edit/[id]",
                              params: { id: entry._id },
                            })
                          }
                        >
                          <View className="flex-row items-center justify-between">
                            <View className="flex-row items-center">
                              <View className="h-9 w-9 items-center justify-center rounded-full bg-blue-50">
                                <Ionicons
                                  name="file-tray-stacked-outline"
                                  size={16}
                                  color="#2563EB"
                                />
                              </View>
                              <View>
                                <Text className="ml-3 font-semibold text-slate-900">
                                  {getLocationName(entry)}
                                </Text>
                                {currentIngredient?.isGeneric && (
                                  <Text className="ml-3 mt-0.5 text-xs text-slate-400">
                                    {getReferenceId(entry.ingredient as unknown) === id
                                      ? "Generic"
                                      : (entry.ingredient?.name ?? "Unknown product")}
                                  </Text>
                                )}
                              </View>
                            </View>
                            <View className="flex-row items-center">
                              <Text className="font-bold text-slate-900">
                                {entry.quantityAvailable} {entry.quantityUnit}
                              </Text>
                              <Ionicons
                                name="chevron-forward"
                                size={16}
                                color="#CBD5E1"
                                style={{ marginLeft: 6 }}
                              />
                            </View>
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
                        </Pressable>
                      </ReanimatedSwipeable>
                    </View>
                  );
                })
              )}

              {/* Quick-add new entry */}
              <View className="mt-1 rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <View {...quickAddLocationSection.wrapperProps}>
                  <FieldLabel text="Storage location" />
                  <SearchableObjectDropdown<SelectOption>
                    options={storageLocations}
                    selectedId={quickAddLocationId}
                    selectedName={quickAddLocationName}
                    placeholder="Search or type a new location"
                    onOpen={quickAddLocationSection.trigger}
                    onTextChange={(value) => {
                      if (value !== quickAddLocationName) {
                        setQuickAddLocationId("");
                      }
                      setQuickAddLocationDraft(value);
                      setQuickAddLocationTouched(true);
                    }}
                    onSelect={(option) => {
                      setQuickAddLocationId(option._id);
                      setQuickAddLocationName(option.name);
                      setQuickAddLocationDraft(option.name);
                      setQuickAddLocationTouched(true);
                    }}
                  />
                </View>

                {effectiveLocation && !quickAddLocationTouched ? (
                  <Text className="mt-2 text-xs leading-4 text-slate-500">
                    Location auto-filled from{" "}
                    {currentIngredient?.defaultStorageLocation
                      ? "this ingredient's default"
                      : "recent purchase history"}
                    .
                  </Text>
                ) : null}

                <View className="mt-3" {...quickAddQuantitySection.wrapperProps}>
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
                    entryCount={quickAddEntryCount}
                    onChangeEntryCount={setQuickAddEntryCount}
                    customUnitConversions={getIngredientConversions(ingredient, customUnitConversions)}
                    onFocus={quickAddQuantitySection.trigger}
                  />
                </View>

                <View className="mt-3 flex-row" {...quickAddDatesSection.wrapperProps}>
                  <View className="mr-3 flex-1">
                    <FieldLabel text="Purchase date" />
                    <DateTextInput
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900"
                      value={quickAddPurchaseDate}
                      onFocus={quickAddDatesSection.trigger}
                      onChangeText={setQuickAddPurchaseDate}
                    />
                  </View>
                  <View className="flex-1">
                    <FieldLabel text="Expiry date" />
                    <DateTextInput
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900"
                      value={quickAddExpiryDate}
                      onFocus={quickAddDatesSection.trigger}
                      onChangeText={(value) => {
                        setQuickAddExpiryDate(value);
                        setQuickAddExpiryTouched(true);
                      }}
                    />
                  </View>
                </View>

                {effectiveExpiryDuration && !quickAddExpiryTouched ? (
                  <Text className="mt-2 text-xs leading-4 text-slate-500">
                    Expiry auto-filled from{" "}
                    {currentIngredient?.defaultExpiryDurationAmount != null
                      ? "this ingredient's default"
                      : "recent purchase history"}{" "}
                    ({effectiveExpiryDuration.amount} {effectiveExpiryDuration.unit}
                    {effectiveExpiryDuration.amount > 1 ? "s" : ""}).
                  </Text>
                ) : null}

                <View className="mt-2" {...quickAddDurationSection.wrapperProps}>
                  <FieldLabel text="Or set expiry from purchase date" />
                  <DurationExpiryInput
                    purchaseDate={quickAddPurchaseDate}
                    initialAmount={
                      effectiveExpiryDuration ? String(effectiveExpiryDuration.amount) : undefined
                    }
                    initialUnit={effectiveExpiryDuration?.unit}
                    onApply={(value) => {
                      setQuickAddExpiryDate(value);
                      setQuickAddExpiryTouched(true);
                    }}
                    onFocus={quickAddDurationSection.trigger}
                  />
                </View>

                {quickAddShowMoreDetails ||
                quickAddStoreId ||
                quickAddStoreDraft.trim() ||
                quickAddPrice.trim() ? (
                  <>
                    <View className="mt-2" {...quickAddStoreSection.wrapperProps}>
                      <FieldLabel text="Store (optional)" />
                      <SearchableObjectDropdown<SelectOption>
                        options={stores}
                        selectedId={quickAddStoreId}
                        selectedName={quickAddStoreName}
                        placeholder="Search or type a new store"
                        onOpen={quickAddStoreSection.trigger}
                        onTextChange={(value) => {
                          if (value !== quickAddStoreName) {
                            setQuickAddStoreId("");
                          }
                          setQuickAddStoreDraft(value);
                          setQuickAddStoreTouched(true);
                        }}
                        onSelect={(option) => {
                          setQuickAddStoreId(option._id);
                          setQuickAddStoreName(option.name);
                          setQuickAddStoreDraft(option.name);
                          setQuickAddStoreTouched(true);
                        }}
                      />
                      {suggestedStore && !quickAddStoreTouched ? (
                        <Text className="mt-1.5 text-xs leading-4 text-slate-400">
                          Auto-filled from recent purchase history.
                        </Text>
                      ) : null}
                    </View>

                    <View className="mt-2" {...quickAddPriceSection.wrapperProps}>
                      <FieldLabel text="Price paid (optional)" />
                      <PriceInput
                        value={quickAddPrice}
                        onChangeText={setQuickAddPrice}
                        onFocus={quickAddPriceSection.trigger}
                      />
                    </View>
                  </>
                ) : (
                  <Pressable
                    className="mt-2 flex-row items-center self-start active:opacity-60"
                    onPress={() => setQuickAddShowMoreDetails(true)}
                  >
                    <Ionicons name="add-circle-outline" size={16} color="#2563EB" />
                    <Text className="ml-1.5 text-sm font-semibold text-blue-600">
                      Add store or price
                    </Text>
                  </Pressable>
                )}

                <View className="mt-2" {...quickAddNotesSection.wrapperProps}>
                  <FieldLabel text="Notes (optional)" />
                  <FormInput
                    value={quickAddNotes}
                    placeholder="e.g. Half-used, keep away from the window"
                    onChangeText={setQuickAddNotes}
                    onFocus={quickAddNotesSection.trigger}
                    multiline
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
