import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
  SegmentedToggle,
  ToggleRow,
  UnitConversionsEditor,
} from "@/src/components/forms";

import { getIngredients, parseNutritionLabel, type Ingredient } from "@/src/services/ingredientApi";
import { PhotoCaptureModal } from "@/src/components/PhotoCaptureModal";
import { countReadNutrients, labelNutrition, labelServing } from "@/src/utils/nutritionLabel";
import type { DurationUnit } from "@/src/utils/date";

import {
  createBrand,
  createCategory,
  createStorageLocation,
  createStore,
  createTag,
  getBrands,
  getCategories,
  getStorageLocations,
  getStores,
  getTags,
  getUnitSuggestions,
} from "@/src/services/optionsApi";

import { addIngredientToPantry } from "@/src/services/pantryApi";
import { createIngredient } from "@/src/services/ingredientApi";
import { updateGroceryItem } from "@/src/services/groceryListApi";

import type { IngredientOption, SelectOption } from "@/src/types/options";
import type { PantryItem } from "@/src/types/pantry";
import type { NutritionField, PartialNutrition } from "@/src/types/nutrition";
import {
  mergeNutritionForm,
  nutritionFormToInput,
  nutritionToForm,
  type NutritionFormValues,
} from "@/src/utils/nutritionForm";
import { barcodesMatch } from "@/src/utils/barcode";
import { resolveOrCreateOption } from "@/src/utils/resolveOrCreateOption";
import { todayDateInputString } from "@/src/utils/date";
import { loadSettings } from "@/src/services/settingsService";
import { useScrollFocusSection } from "@/src/hooks/useScrollFocusSection";
import {
  convertAmountForUnitChange,
  getIngredientConversions,
  type CustomUnitConversion,
} from "@/src/utils/unitConversion";

interface FormState {
  ingredientId: string;
  ingredientName: string;
  barcode: string;
  defaultPortionAmount: string;
  // Purely a display/grouping label (e.g. "steak", "fillet") - set only
  // when this ingredient is naturally bought/consumed as discrete,
  // individually-sized pieces, so the pantry list can show a piece count
  // instead of a summed weight. Carries no weight range - that's a
  // per-recipe decision made on the recipe's own ingredient line.
  pieceLabel: string;

  description: string;

  isGeneric: boolean;

  brandId: string;
  brandName: string;

  genericParentId: string;
  genericParentName: string;

  unitConversions: CustomUnitConversion[];

  categoryId: string;
  categoryName: string;

  storageLocationId: string;
  storageLocationName: string;

  quantityAvailable: string;
  quantityUnit: string;
  entryCount: string;
  purchaseDate: string;
  expiryDate: string;
  purchasePrice: string;
  storeId: string;
  storeName: string;
  lowStockThreshold: string;
  alwaysAvailable: boolean;

  defaultStorageLocationId: string;
  defaultStorageLocationName: string;
  defaultExpiryDurationAmount: string;
  defaultExpiryDurationUnit: DurationUnit;

  nutrition: NutritionFormValues;
}

function parseNutritionParam(raw?: string): PartialNutrition | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PartialNutrition;
  } catch {
    return null;
  }
}

const initialForm: FormState = {
  ingredientId: "",
  ingredientName: "",
  barcode: "",
  defaultPortionAmount: "",
  pieceLabel: "",

  description: "",

  isGeneric: false,

  brandId: "",
  brandName: "",

  genericParentId: "",
  genericParentName: "",

  unitConversions: [],

  categoryId: "",
  categoryName: "",

  storageLocationId: "",
  storageLocationName: "",

  quantityAvailable: "",
  quantityUnit: "",
  entryCount: "1",
  purchaseDate: todayDateInputString(),
  expiryDate: "",
  purchasePrice: "",
  storeId: "",
  storeName: "",
  lowStockThreshold: "0",
  alwaysAvailable: false,

  defaultStorageLocationId: "",
  defaultStorageLocationName: "",
  defaultExpiryDurationAmount: "",
  defaultExpiryDurationUnit: "week",

  nutrition: nutritionToForm(),
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

  const brand =
    typeof ingredient.brand === "object" && ingredient.brand !== null
      ? ingredient.brand
      : undefined;

  const genericParent =
    typeof ingredient.genericParent === "object" &&
    ingredient.genericParent !== null
      ? ingredient.genericParent
      : undefined;

  const defaultStorageLocation =
    typeof ingredient.defaultStorageLocation === "object" &&
    ingredient.defaultStorageLocation !== null
      ? ingredient.defaultStorageLocation
      : undefined;

  return {
    _id: ingredient._id,
    name: ingredient.name,

    description: ingredient.description ?? "",
    barcode: ingredient.barcode ?? null,

    isGeneric: ingredient.isGeneric ?? false,

    brandId:
      brand?._id ??
      (typeof ingredient.brand === "string" ? ingredient.brand : ""),
    brandName: brand?.name ?? "",

    genericParentId:
      genericParent?._id ??
      (typeof ingredient.genericParent === "string"
        ? ingredient.genericParent
        : ""),

    genericParentName: genericParent?.name ?? "",

    unitConversions: ingredient.unitConversions ?? [],

    unit: ingredient.defaultPortionUnit ?? "",
    defaultPortionAmount: ingredient.defaultPortionAmount,

    lowStockThreshold: ingredient.lowStockThreshold,
    isAlwaysAvailable: ingredient.isAlwaysAvailable ?? false,

    defaultStorageLocationId:
      defaultStorageLocation?._id ??
      (typeof ingredient.defaultStorageLocation === "string"
        ? ingredient.defaultStorageLocation
        : ""),
    defaultStorageLocationName: defaultStorageLocation?.name ?? "",
    defaultExpiryDurationAmount: ingredient.defaultExpiryDurationAmount ?? undefined,
    defaultExpiryDurationUnit: ingredient.defaultExpiryDurationUnit ?? undefined,

    nutrition: ingredient.nutrition,

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
    // JSON-encoded PartialNutrition — every nutrient the scan reported.
    scannedNutrition?: string;
    // Present when arriving from "add as a new ingredient" on a grocery
    // list item that isn't directly loggable — completes that item once
    // this ingredient + a mandatory pantry entry are saved.
    groceryItemId?: string;
    prefillName?: string;
    genericParentId?: string;
    genericParentName?: string;
    // Present instead of prefillName/genericParent* when the grocery item's
    // generic already has an existing specific ingredient fulfilling it —
    // skips creation entirely and goes straight to logging a purchase.
    existingIngredientId?: string;
  }>();

  // This screen exists specifically to log a purchase when resolving a
  // grocery item, so Pantry inventory can't be collapsed away in that mode.
  const isResolvingGroceryItem = !!params.groceryItemId;

  // Generics can hold pantry stock directly now, so ingredient type is only
  // locked when arriving here to add a *specific* product under an already-
  // known generic (the grocery list's "add a different product" choice) —
  // genericParentId only makes sense for a specific/branded ingredient.
  const lockTypeToSpecific = isResolvingGroceryItem && !!params.genericParentId;

  const [form, setForm] = useState<FormState>(() => {
    if (isResolvingGroceryItem) {
      return {
        ...initialForm,
        ingredientName: params.prefillName ?? "",
        genericParentId: params.genericParentId ?? "",
        genericParentName: params.genericParentName ?? "",
      };
    }
    if (params.scannedName || params.scannedBarcode) {
      return {
        ...initialForm,
        ingredientName: params.scannedName ?? "",
        barcode: params.scannedBarcode ?? "",
        brandName: params.scannedBrand ?? "",
        quantityAvailable: params.scannedQuantity ?? "",
        quantityUnit: params.scannedQuantityUnit || params.scannedServingUnit || "",
        // scannedServingSize is only set by PantryMainPage when the scan
        // had a real declared serving — see servingIsEstimated on
        // ScannedProduct — so an absent param already means "leave blank".
        defaultPortionAmount: params.scannedServingSize ?? "",
        nutrition: nutritionToForm(parseNutritionParam(params.scannedNutrition)),
      };
    }
    return initialForm;
  });
  const [scannerVisible, setScannerVisible] = useState(false);
  const [labelCameraVisible, setLabelCameraVisible] = useState(false);
  const [readingLabel, setReadingLabel] = useState(false);

  const [saving, setSaving] = useState(false);

  // Collapsed by default — adding an ingredient shouldn't force stocking it
  // in the pantry right away. Forced open (and kept open — no toggle is
  // rendered) when completing a grocery item, since that's the whole point.
  const [pantryInventoryExpanded, setPantryInventoryExpanded] = useState(
    () => isResolvingGroceryItem,
  );

  // Collapsed by default — nutrition is optional and often filled in later.
  const [nutritionExpanded, setNutritionExpanded] = useState(false);

  // Collapsed by default — smart defaults are optional.
  const [smartDefaultsExpanded, setSmartDefaultsExpanded] = useState(false);

  // Collapsed by default — unit conversions are optional.
  const [unitConversionsExpanded, setUnitConversionsExpanded] = useState(false);

  const [loadingOptions, setLoadingOptions] = useState(true);

  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);

  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [allTags, setAllTags] = useState<SelectOption[]>([]);
  const [selectedTags, setSelectedTags] = useState<SelectOption[]>([]);

  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);

  const [stores, setStores] = useState<SelectOption[]>([]);

  const [brands, setBrands] = useState<SelectOption[]>([]);

  const [brandDraft, setBrandDraft] = useState(() => params.scannedBrand ?? "");

  const [genericParentDraft, setGenericParentDraft] = useState(
    () => params.genericParentName ?? "",
  );

  const [categoryDraft, setCategoryDraft] = useState("");

  const [storageLocationDraft, setStorageLocationDraft] = useState("");

  const [storeDraft, setStoreDraft] = useState("");

  const [defaultLocationDraft, setDefaultLocationDraft] = useState("");

  const [wantsDefaultLocation, setWantsDefaultLocation] = useState(false);
  const [wantsDefaultExpiry, setWantsDefaultExpiry] = useState(false);

  const [units, setUnits] = useState<string[]>([]);
  const [customUnitConversions, setCustomUnitConversions] = useState<CustomUnitConversion[]>([]);

  // Scrolls whichever field was just focused/opened into view — see
  // useScrollFocusSection for why zIndex has to descend in on-screen order
  // (only the fields that can show a dropdown need one, each higher than
  // every one after it; plain text fields default to 0 and don't need to be
  // listed here).
  const scrollRef = useRef<ScrollView>(null);
  const scrollAnchorRef = useRef<View>(null);
  const nameSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 130);
  const genericBrandSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 120);
  const descriptionSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const barcodeSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const categorySection = useScrollFocusSection(scrollRef, scrollAnchorRef, 110);
  const tagsSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 100);
  const servingUnitSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const pieceLabelSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const lowStockSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const nutritionSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const defaultStorageLocationSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 90);
  const defaultExpirySection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const storageLocationSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 80);
  const quantitySection = useScrollFocusSection(scrollRef, scrollAnchorRef, 70);
  const purchaseDateSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const expiryDateSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const expiryDurationSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const storeSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 60);
  const priceSection = useScrollFocusSection(scrollRef, scrollAnchorRef);

  const genericIngredientOptions = ingredients.filter(
    (option) => option.isGeneric,
  );

  // This ingredient's own conversions, then its selected generic parent's (if
  // any), then the app-wide list as a last-resort fallback — mirrors the
  // ingredient/genericParent/global resolution order used everywhere else.
  const resolvedConversions = useMemo(() => {
    const genericParent = form.genericParentId
      ? ingredients.find((option) => option._id === form.genericParentId)
      : undefined;

    return getIngredientConversions(
      {
        unitConversions: form.unitConversions,
        genericParent: genericParent
          ? { unitConversions: genericParent.unitConversions }
          : null,
      },
      customUnitConversions,
    );
  }, [form.unitConversions, form.genericParentId, ingredients, customUnitConversions]);

  // Adding a specific product under a known generic requires a
  // specific/branded ingredient, so generics are excluded from the Name
  // search here — otherwise selecting one would silently flip
  // form.isGeneric back on despite the locked toggle.
  const nameSearchOptions = lockTypeToSpecific
    ? ingredients.filter((option) => !option.isGeneric)
    : ingredients;

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      try {
        const [
          loadedIngredients,
          loadedCategories,
          loadedStorageLocations,
          loadedStores,
          loadedBrands,
          loadedTags,
          loadedUnits,
          loadedSettings,
        ] = await Promise.all([
          getIngredients(),
          getCategories(),
          getStorageLocations(),
          getStores(),
          getBrands(),
          getTags(),
          getUnitSuggestions(),
          loadSettings(),
        ]);

        if (cancelled) {
          return;
        }

        const mappedIngredients = Array.isArray(loadedIngredients)
          ? loadedIngredients.map(ingredientToOption)
          : [];

        setIngredients(mappedIngredients);

        // Barcode-scan duplicates are already caught before navigating here
        // (see PantryMainPage's scanner handler, and applyScannedProduct
        // below for the in-page scanner) — only the "chosen from the
        // grocery list" hand-off still needs resolving on load.
        if (params.existingIngredientId) {
          // Chosen from the grocery list's "you already have this" prompt —
          // already confirmed there, so no need to alert about it again.
          const existingIngredient = mappedIngredients.find(
            (option) => option._id === params.existingIngredientId,
          );

          if (existingIngredient) {
            applySelectedIngredient(existingIngredient);
            setPantryInventoryExpanded(true);
          }
        }

        setCategories(Array.isArray(loadedCategories) ? loadedCategories : []);

        setStorageLocations(
          Array.isArray(loadedStorageLocations) ? loadedStorageLocations : [],
        );

        setStores(Array.isArray(loadedStores) ? loadedStores : []);

        setBrands(Array.isArray(loadedBrands) ? loadedBrands : []);

        setAllTags(Array.isArray(loadedTags) ? loadedTags : []);

        setUnits(Array.isArray(loadedUnits) ? loadedUnits : []);
        setCustomUnitConversions(loadedSettings.unitConversions ?? []);
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

  function updateNutritionField(field: NutritionField, value: string) {
    setForm((current) => ({
      ...current,
      nutrition: { ...current.nutrition, [field]: value },
    }));
  }

  // Photo of a Nutrition Facts / Supplement Facts panel -> the nutrition
  // fields plus the serving they're per. Only what the label prints is
  // filled (a supplement's unlisted nutrients become 0 — see
  // labelNutrition); the serving is put in this form's own unit when it
  // already has one, and flagged instead of guessed when it can't be.
  async function handleLabelPhoto(photoUri: string) {
    setLabelCameraVisible(false);
    setReadingLabel(true);
    try {
      const scan = await parseNutritionLabel(photoUri);
      if (!scan.isNutritionLabel) {
        Alert.alert(
          "No label found",
          "Couldn't read a nutrition or supplement facts label in that photo. Try again with the whole panel in frame and in focus.",
        );
        return;
      }

      const serving = labelServing(scan, form.quantityUnit, resolvedConversions);
      const printedServing = [
        scan.servingAmount != null && scan.servingUnit ? `${scan.servingAmount} ${scan.servingUnit}` : null,
        scan.servingMetricAmount != null && scan.servingMetricUnit
          ? `${scan.servingMetricAmount} ${scan.servingMetricUnit}`
          : null,
      ].filter(Boolean).join(" / ");

      setForm((current) => ({
        ...current,
        ingredientName: current.ingredientName.trim() ? current.ingredientName : scan.productName ?? "",
        quantityUnit: serving && !current.quantityUnit.trim() ? serving.unit : current.quantityUnit,
        defaultPortionAmount: serving ? String(serving.amount) : current.defaultPortionAmount,
        nutrition: mergeNutritionForm(current.nutrition, labelNutrition(scan)),
      }));
      setNutritionExpanded(true);

      const lines = [
        `Filled ${countReadNutrients(scan)} nutrients` +
          (serving ? ` per ${serving.amount} ${serving.unit}.` : "."),
      ];
      if (!serving && printedServing) {
        lines.push(
          `The label's serving (${printedServing}) doesn't convert to ${form.quantityUnit || "this unit"} — set the serving size to match it, since the nutrition is per that serving.`,
        );
      }
      if (scan.labelType === "supplement_facts") {
        lines.push("Anything not on the supplement label was set to 0.");
      }
      if (scan.notes.trim()) lines.push(`Note: ${scan.notes.trim()}`);
      Alert.alert("Label read — check the values", lines.join("\n\n"));
    } catch (error) {
      Alert.alert("Couldn't read label", error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setReadingLabel(false);
    }
  }

  function applyScannedProduct(product: ScannedProduct) {
    // Scanning a barcode that's already in the catalog should log a pantry
    // entry for that ingredient, not offer to create a duplicate.
    const existingMatch = ingredients.find((option) =>
      barcodesMatch(option.barcode, product.barcode),
    );

    if (existingMatch) {
      if (isResolvingGroceryItem) {
        goToExistingIngredient(existingMatch);
        Alert.alert(
          "Already in your catalog",
          `"${existingMatch.name}" is already an ingredient — add a pantry entry below to log this purchase.`,
        );
      } else {
        Alert.alert(
          "Already in your catalog",
          `"${existingMatch.name}" is already an ingredient.`,
          [
            {
              text: "View ingredient",
              onPress: () => goToExistingIngredient(existingMatch),
            },
          ],
        );
      }
      return;
    }

    setForm((current) => ({
      ...current,
      ingredientId: "",
      ingredientName: product.name,
      barcode: product.barcode,
      brandName: product.brand ?? current.brandName,
      quantityAvailable: product.packageQuantity != null ? String(product.packageQuantity) : current.quantityAvailable,
      quantityUnit: product.packageUnit || product.servingUnit,
      // Only trust a real declared serving — a 100g/100ml fallback isn't a
      // genuine per-use amount for most products (least of all anything
      // measured by volume, like a spice), so leave whatever was already
      // there (blank, for a brand-new ingredient) rather than overwrite it
      // with a number that looks authoritative but isn't real.
      defaultPortionAmount: product.servingIsEstimated
        ? current.defaultPortionAmount
        : String(product.servingSize),
      nutrition: mergeNutritionForm(current.nutrition, product.nutrition),
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

      unitConversions: option.unitConversions ?? [],

      quantityUnit: option.unit ?? "",
      defaultPortionAmount: numberToFormValue(option.defaultPortionAmount),

      lowStockThreshold:
        option.lowStockThreshold != null
          ? String(option.lowStockThreshold)
          : "0",
      alwaysAvailable: option.isAlwaysAvailable ?? false,

      nutrition: nutritionToForm(option.nutrition),

      categoryId: option.categoryId ?? option.category?._id ?? "",

      categoryName: option.categoryName ?? option.category?.name ?? "",

      defaultStorageLocationId: option.defaultStorageLocationId ?? "",
      defaultStorageLocationName: option.defaultStorageLocationName ?? "",
      defaultExpiryDurationAmount: numberToFormValue(option.defaultExpiryDurationAmount),
      defaultExpiryDurationUnit: option.defaultExpiryDurationUnit ?? "week",
    }));

    setGenericParentDraft(option.genericParentName ?? "");
    setCategoryDraft(option.categoryName ?? option.category?.name ?? "");
    setDefaultLocationDraft(option.defaultStorageLocationName ?? "");
    setWantsDefaultLocation(!!option.defaultStorageLocationId);
    setWantsDefaultExpiry(option.defaultExpiryDurationAmount != null);
  }

  // What "pick the existing ingredient instead" does when a duplicate is
  // found (via barcode scan or typed name+brand match). Resolving a grocery
  // item still needs to finish on *this* screen — completing it requires
  // creating the pantry entry here so it can link back via groceryItemId —
  // so that case stays and just loads the existing ingredient into the
  // form. Otherwise there's nothing left to do here, so hand off to the
  // ingredient's own page instead of leaving a pantry-only shell behind.
  function goToExistingIngredient(existingIngredient: IngredientOption) {
    if (isResolvingGroceryItem) {
      applySelectedIngredient(existingIngredient);
      setPantryInventoryExpanded(true);
      return;
    }

    router.replace({
      pathname: "/ingredients/edit/[id]",
      params: { id: existingIngredient._id },
    });
  }

  async function handleCreateTag(name: string): Promise<SelectOption> {
    const tag = await createTag(name);

    setAllTags((current) =>
      current.some((item) => item._id === tag._id) ? current : [...current, tag],
    );

    return tag;
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

  async function handleCreateStore(name: string): Promise<SelectOption> {
    const store = await createStore(name);

    setStores((current) => {
      const exists = current.some((item) => item._id === store._id);

      return exists
        ? current
        : [...current, store].sort((first, second) =>
            first.name.localeCompare(second.name),
          );
    });

    return store;
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

  function registerUnit(unit: string) {
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
  }

  // "Serving size" and "Pantry entry"'s Quantity both share form.quantityUnit
  // — this changes it directly (bypassing QuantityServingInput, which owns
  // its own quantityAvailable conversion), so it converts BOTH numbers that
  // are anchored to that unit.
  function handleServingUnitChange(unit: string) {
    const trimmedUnit = unit.trim();
    if (!trimmedUnit) return;

    registerUnit(trimmedUnit);

    setForm((current) => {
      const oldUnit = current.quantityUnit;
      const next = { ...current, quantityUnit: trimmedUnit };
      if (!oldUnit || trimmedUnit === oldUnit) return next;

      const portionConverted = convertAmountForUnitChange(
        Number(current.defaultPortionAmount),
        oldUnit,
        trimmedUnit,
        resolvedConversions,
      );
      if (portionConverted != null) next.defaultPortionAmount = String(portionConverted);

      const quantityConverted = convertAmountForUnitChange(
        Number(current.quantityAvailable),
        oldUnit,
        trimmedUnit,
        resolvedConversions,
      );
      if (quantityConverted != null) next.quantityAvailable = String(quantityConverted);

      const thresholdConverted = convertAmountForUnitChange(
        Number(current.lowStockThreshold),
        oldUnit,
        trimmedUnit,
        resolvedConversions,
      );
      if (thresholdConverted != null) next.lowStockThreshold = String(thresholdConverted);

      return next;
    });
  }

  // Pantry Quantity's own unit dropdown (inside QuantityServingInput) already
  // converts quantityAvailable itself before calling this — this only needs
  // to also convert defaultPortionAmount/lowStockThreshold, which share the
  // same unit.
  function handlePantryUnitChange(unit: string) {
    const trimmedUnit = unit.trim();
    if (!trimmedUnit) return;

    setForm((current) => {
      const oldUnit = current.quantityUnit;
      const next = { ...current, quantityUnit: trimmedUnit };
      if (!oldUnit || trimmedUnit === oldUnit) return next;

      const portionConverted = convertAmountForUnitChange(
        Number(current.defaultPortionAmount),
        oldUnit,
        trimmedUnit,
        resolvedConversions,
      );
      if (portionConverted != null) next.defaultPortionAmount = String(portionConverted);

      const thresholdConverted = convertAmountForUnitChange(
        Number(current.lowStockThreshold),
        oldUnit,
        trimmedUnit,
        resolvedConversions,
      );
      if (thresholdConverted != null) next.lowStockThreshold = String(thresholdConverted);

      return next;
    });
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

    if (!form.categoryId && !categoryDraft.trim()) {
      Alert.alert("Category is required", "Search or type a category.");
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

      if (form.purchasePrice.trim()) {
        const parsedPrice = Number(form.purchasePrice);
        if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
          Alert.alert("Invalid price", "Enter a valid price of 0 or more.");
          return;
        }
      }

      if (!form.storageLocationId && !storageLocationDraft.trim()) {
        Alert.alert(
          "Storage location is required",
          "Search or type a storage location.",
        );
        return;
      }
    } else if (form.ingredientId) {
      // An existing ingredient was selected (nothing new to create) and
      // the pantry section is collapsed — there's nothing for Save to do.
      Alert.alert(
        "Nothing to save",
        "Expand Pantry inventory to add stock for this ingredient.",
      );

      return;
    }

    try {
      setSaving(true);

      // Every "creatable" field here works the same way: type a name, and
      // if it doesn't match an existing option, resolveOrCreateOption makes
      // one at save time — no separate "create" tap required.
      const category = await resolveOrCreateOption(
        categories,
        form.categoryId,
        categoryDraft,
        handleCreateCategory,
      );

      if (!category) {
        throw new Error("Enter a category name.");
      }

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

      // Optional — resolveOrCreateOption returns null when both the id and
      // draft text are empty, which is fine here (unlike category). Gated by
      // the toggle rather than just presence of text, so leaving it off
      // never saves a leftover draft value.
      const defaultStorageLocation = wantsDefaultLocation
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

      const nutrition = nutritionFormToInput(form.nutrition);

      const normalizedName = form.ingredientName.trim().toLowerCase();

      let ingredientId = form.ingredientId;

      if (!ingredientId && form.isGeneric) {
        // Generics are unique by name within a category (mirrors the same
        // rule the server already enforces when resolving a typed
        // genericName on a specific ingredient) — catch it client-side too
        // so typing a name without selecting the suggestion doesn't quietly
        // create a second "Soy Sauce" in the same category.
        const duplicateGeneric = ingredients.find(
          (option) =>
            option.isGeneric &&
            option.name.trim().toLowerCase() === normalizedName &&
            (option.categoryId ?? option.category?._id) === category._id,
        );

        if (duplicateGeneric) {
          Alert.alert(
            "Ingredient already exists",
            `"${duplicateGeneric.name}" already exists as a generic ingredient in this category. Change the name to create a different one, or use it to add a pantry entry.`,
            [
              { text: "Change name", style: "cancel" },
              {
                text: "Use existing ingredient",
                onPress: () => goToExistingIngredient(duplicateGeneric),
              },
            ],
          );
          return;
        }

        const newGeneric = await createIngredient({
          name: form.ingredientName.trim(),
          // Generics are an abstract matching umbrella, not one physical
          // product — a barcode only ever identifies a specific item, so
          // this is never sent even if the field had a leftover value from
          // before the type was switched to Generic.
          barcode: null,
          description: form.description.trim() || undefined,
          isGeneric: true,
          brand: null,
          category: category._id,
          defaultPortionUnit: form.quantityUnit.trim() || undefined,
          defaultPortionAmount: optionalNumber(form.defaultPortionAmount),
          pieceLabel: form.pieceLabel.trim() || null,
          lowStockThreshold: ingredientLowStockThreshold,
          isAlwaysAvailable: form.alwaysAvailable,
          defaultStorageLocation: defaultStorageLocation?._id || null,
          defaultExpiryDurationAmount: defaultExpiryDurationAmount ?? null,
          defaultExpiryDurationUnit:
            defaultExpiryDurationAmount != null ? form.defaultExpiryDurationUnit : null,
          nutrition,
          unitConversions: form.unitConversions,
          tags: tagIds,
        });
        ingredientId = newGeneric._id;
      } else if (!ingredientId) {
        const brand = await resolveOrCreateOption(
          brands,
          form.brandId,
          brandDraft,
          handleCreateBrand,
        );

        // Same name AND same brand (including "no brand" matching "no
        // brand") is what actually identifies "the same product" — two
        // different brands can legitimately share a product name (e.g. two
        // brands both called "Soy Sauce"), so brand alone or name alone
        // isn't enough to call it a duplicate.
        const resolvedBrandId = brand?._id ?? null;
        const duplicateIngredient = ingredients.find(
          (option) =>
            !option.isGeneric &&
            option.name.trim().toLowerCase() === normalizedName &&
            (option.brandId || null) === resolvedBrandId,
        );

        if (duplicateIngredient) {
          Alert.alert(
            "Ingredient already exists",
            `"${duplicateIngredient.name}"${
              brand ? ` (${brand.name})` : ""
            } is already in your catalog. Change the name to create a different product, or use the existing ingredient to add a pantry entry.`,
            [
              { text: "Change name", style: "cancel" },
              {
                text: "Use existing ingredient",
                onPress: () => goToExistingIngredient(duplicateIngredient),
              },
            ],
          );
          return;
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
          brand: brand?._id || null,
          genericParent: form.genericParentId || undefined,
          genericName: !form.genericParentId && trimmedGenericName
            ? trimmedGenericName
            : undefined,
          category: category._id,
          defaultPortionUnit: form.quantityUnit.trim() || undefined,
          defaultPortionAmount: optionalNumber(form.defaultPortionAmount),
          pieceLabel: form.pieceLabel.trim() || null,
          lowStockThreshold: ingredientLowStockThreshold,
          isAlwaysAvailable: form.alwaysAvailable,
          defaultStorageLocation: defaultStorageLocation?._id || null,
          defaultExpiryDurationAmount: defaultExpiryDurationAmount ?? null,
          defaultExpiryDurationUnit:
            defaultExpiryDurationAmount != null ? form.defaultExpiryDurationUnit : null,
          nutrition,
          unitConversions: form.unitConversions,
          tags: tagIds,
        });
        ingredientId = newIngredient._id;
      }

      let newPantryItem: PantryItem | undefined;

      if (pantryInventoryExpanded) {
        const storageLocation = await resolveOrCreateOption(
          storageLocations,
          form.storageLocationId,
          storageLocationDraft,
          handleCreateStorageLocation,
        );

        if (!storageLocation) {
          throw new Error("Enter a storage location.");
        }

        const store = await resolveOrCreateOption(
          stores,
          form.storeId,
          storeDraft,
          handleCreateStore,
        );
        if (store && !stores.some((s) => s._id === store._id)) {
          setStores((prev) => [...prev, store]);
        }

        const entryCount = Math.max(1, Math.round(Number(form.entryCount)) || 1);

        for (let i = 0; i < entryCount; i++) {
          newPantryItem = await addIngredientToPantry({
            ingredient: ingredientId,
            storageLocation: storageLocation._id,
            quantityAvailable,
            quantityUnit: form.quantityUnit.trim(),
            purchaseDate: form.purchaseDate.trim() || undefined,
            expiryDate: form.expiryDate.trim() || undefined,
            purchasePrice: form.purchasePrice.trim() ? Number(form.purchasePrice) : undefined,
            store: store ? store._id : null,
          });
        }
      }

      if (params.groceryItemId) {
        try {
          await updateGroceryItem(params.groceryItemId, {
            ingredient: ingredientId,
            status: "completed",
            pantryItem: newPantryItem?._id ?? null,
          });
        } catch {
          Alert.alert(
            "Ingredient added",
            "The ingredient and pantry entry were saved, but the grocery list item couldn't be updated automatically — check it off manually.",
          );
        }
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

          <View className="ml-2 flex-1">
            <Text className="text-xl font-bold text-slate-950" numberOfLines={1}>
              {isResolvingGroceryItem ? "Log purchase" : "Add Ingredient"}
            </Text>
            {isResolvingGroceryItem && (
              <Text className="text-sm text-slate-500" numberOfLines={1}>
                Completing &quot;{params.prefillName}&quot; from your grocery list
              </Text>
            )}
          </View>

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
          ref={scrollRef}
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
          <View ref={scrollAnchorRef} collapsable={false} />
          <SectionTitle
            first
            icon="pricetag-outline"
            title="Ingredient"
            description="What it is, and how it's categorized."
          />

          <FieldLabel text="Type" required />

          <SegmentedToggle<boolean>
            value={form.isGeneric}
            disabled={!!form.ingredientId || lockTypeToSpecific}
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

          <Text className="mt-2 text-xs leading-4 text-slate-500">
            {form.ingredientId
              ? "This ingredient already exists, so its type can't be changed here."
              : lockTypeToSpecific
                ? "Adding a specific product under an existing generic requires a specific/branded ingredient."
                : form.isGeneric
                  ? "A generic ingredient (e.g. \"Soy Sauce\") stands in for any specific product a recipe could use — and can hold its own pantry stock too."
                  : "A specific ingredient (e.g. \"Kikkoman Soy Sauce\") is a particular product, usually with a brand."}
          </Text>

          <View {...nameSection.wrapperProps}>
          <FieldLabel text="Name" required />

          <SearchableObjectDropdown<IngredientOption>
            options={nameSearchOptions}
            selectedId={form.ingredientId}
            selectedName={form.ingredientName}
            placeholder="Search for an ingredient"
            showAllWhenEmpty={false}
            onOpen={nameSection.trigger}
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
          </View>

          {!form.isGeneric && (
            <>
              <View className="flex-row" {...genericBrandSection.wrapperProps}>
                <View className="mr-3 flex-1">
                  <FieldLabel text="Generic ingredient" />

                  <SearchableObjectDropdown<IngredientOption>
                    options={genericIngredientOptions}
                    selectedId={form.genericParentId}
                    selectedName={form.genericParentName}
                    placeholder="Search or new"
                    onOpen={genericBrandSection.trigger}
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

                      const categoryId = option.categoryId ?? option.category?._id;
                      const categoryName =
                        option.categoryName ?? option.category?.name;

                      if (categoryId) {
                        updateForm("categoryId", categoryId);
                        updateForm("categoryName", categoryName ?? "");
                        setCategoryDraft(categoryName ?? "");
                      }

                      if (option.unit) {
                        updateForm("quantityUnit", option.unit);
                      }
                    }}
                  />
                </View>

                <View className="flex-1">
                  <FieldLabel text="Brand" />

                  <SearchableObjectDropdown<SelectOption>
                    options={brands}
                    selectedId={form.brandId}
                    selectedName={form.brandName}
                    placeholder="Search or new"
                    onOpen={genericBrandSection.trigger}
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
                  />
                </View>
              </View>

              <Text className="mt-2 text-xs leading-4 text-slate-500">
                Generic ingredient optionally links this to a catalog item
                (e.g. &quot;Soy Sauce&quot;) so recipes calling for it can use
                this product; typing a new name creates one on save.
              </Text>
            </>
          )}

          <View {...descriptionSection.wrapperProps}>
          <FieldLabel text="Description" />

          <FormInput
            value={form.description}
            placeholder="Optional description"
            multiline
            onFocus={descriptionSection.trigger}
            onChangeText={(value) => updateForm("description", value)}
          />
          </View>

          {!form.isGeneric && (
            <View {...barcodeSection.wrapperProps}>
              <FieldLabel text="Barcode" />

              <FormInput
                value={form.barcode}
                placeholder="Optional barcode"
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                onFocus={barcodeSection.trigger}
                onChangeText={(value) => updateForm("barcode", value)}
              />
              <Text className="mt-2 text-xs leading-4 text-slate-500">
                Scanning a barcode fills this in automatically — type one here if
                a scan came back empty, so it&apos;s recognized next time.
              </Text>
            </View>
          )}

          <View {...categorySection.wrapperProps}>
          <FieldLabel text="Category" required />

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

          <SectionTitle
            icon="scale-outline"
            title="Serving & stock"
            description="Define a serving size and when to flag low stock."
          />

          <View className="flex-row" {...servingUnitSection.wrapperProps}>
            <View className="mr-3 flex-1">
              <FieldLabel text="Serving size" />

              <FormInput
                value={form.defaultPortionAmount}
                placeholder="1"
                keyboardType="decimal-pad"
                onFocus={servingUnitSection.trigger}
                onChangeText={(value) => updateForm("defaultPortionAmount", value)}
              />
            </View>

            <View className="flex-1">
              <FieldLabel text="Unit" required />

              <CreatableStringDropdown
                options={units}
                selectedValue={form.quantityUnit}
                placeholder="Search or type a new unit"
                onSelect={handleServingUnitChange}
              />
            </View>
          </View>

          <Text className="mt-2 text-xs leading-4 text-slate-500">
            How much of the unit above counts as one serving (e.g. 5 g of a
            120 g spice bottle) — nutrition below should match that amount.
          </Text>

          <View className="mt-4" {...pieceLabelSection.wrapperProps}>
            <FieldLabel text="Piece label (optional)" />
            <FormInput
              value={form.pieceLabel}
              placeholder="e.g. steak, fillet, cut"
              onFocus={pieceLabelSection.trigger}
              onChangeText={(value) => updateForm("pieceLabel", value)}
            />
            <Text className="mt-2 text-xs leading-4 text-slate-500">
              Only set this if you buy/log it as individual pieces rather than a
              continuous amount (a steak vs. ground beef) — the pantry list will
              then show a count (&quot;3 steaks&quot;) instead of a summed weight.
              Doesn&apos;t set any size limit; a recipe&apos;s own ingredient line
              still decides what weight range counts as a usable piece.
            </Text>
          </View>

          <ToggleRow
            label="Always available"
            description="Never shows as low or out of stock (e.g. tap water) — skips stock tracking entirely."
            value={form.alwaysAvailable}
            onChange={(value) => updateForm("alwaysAvailable", value)}
          />

          {!form.alwaysAvailable && (
            <View {...lowStockSection.wrapperProps}>
              <FieldLabel text="Low-stock threshold" />

              <FormInput
                value={form.lowStockThreshold}
                placeholder="0"
                keyboardType="decimal-pad"
                onFocus={lowStockSection.trigger}
                onChangeText={(value) => updateForm("lowStockThreshold", value)}
              />

              <Text className="mt-2 text-xs leading-4 text-slate-500">
                Warn when total stock falls below this many{" "}
                {form.quantityUnit.trim() || "units"}.
              </Text>
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

            <Pressable
              className="mr-2 h-9 flex-row items-center rounded-full bg-blue-50 px-3 active:bg-blue-100"
              disabled={readingLabel}
              onPress={() => setLabelCameraVisible(true)}
              accessibilityLabel="Scan nutrition label"
            >
              {readingLabel ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <Ionicons name="camera-outline" size={16} color="#2563EB" />
              )}
              <Text className="ml-1.5 text-xs font-semibold text-blue-700">
                {readingLabel ? "Reading…" : "Scan label"}
              </Text>
            </Pressable>

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
                onChange={updateNutritionField}
                onFocus={nutritionSection.trigger}
              />
            </View>
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
                  Optional — e.g. 1 tbsp = 10 g, specific to this ingredient
                  (density varies, so this doesn&apos;t apply to other
                  ingredients).
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
              {wantsDefaultExpiry && (
                <View {...defaultExpirySection.wrapperProps}>
                  <FieldLabel text="Default expiry duration" />
                  <DurationValueInput
                    amount={form.defaultExpiryDurationAmount}
                    unit={form.defaultExpiryDurationUnit}
                    onChangeAmount={(value) => updateForm("defaultExpiryDurationAmount", value)}
                    onChangeUnit={(value) => updateForm("defaultExpiryDurationUnit", value)}
                    onFocus={defaultExpirySection.trigger}
                  />
                </View>
              )}
            </>
          )}

          {isResolvingGroceryItem ? (
            <SectionTitle
              icon="archive-outline"
              title="Pantry inventory"
              description="Required — completes the grocery item you're logging."
            />
          ) : (
            <Pressable
              className="mt-8 flex-row items-center justify-between"
              onPress={() =>
                setPantryInventoryExpanded((current) => !current)
              }
            >
              <View className="mr-3 flex-1 flex-row items-center">
                <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-blue-50">
                  <Ionicons name="archive-outline" size={18} color="#2563EB" />
                </View>

                <View className="flex-1">
                  <Text className="text-base font-bold text-slate-950">
                    Pantry inventory
                  </Text>
                  <Text className="mt-0.5 text-xs leading-4 text-slate-500">
                    Optional — add stock now, or later.
                  </Text>
                </View>
              </View>

              <Ionicons
                name={pantryInventoryExpanded ? "chevron-up" : "chevron-down"}
                size={22}
                color="#64748B"
              />
            </Pressable>
          )}

          {pantryInventoryExpanded && (
            <>
              <View {...storageLocationSection.wrapperProps}>
              <FieldLabel text="Storage location" required />

              <SearchableObjectDropdown<SelectOption>
                options={storageLocations}
                selectedId={form.storageLocationId}
                selectedName={form.storageLocationName}
                placeholder="Search or type a new storage location"
                onOpen={storageLocationSection.trigger}
                onTextChange={(value) => {
                  if (value !== form.storageLocationName) {
                    updateForm("storageLocationId", "");
                  }

                  setStorageLocationDraft(value);
                }}
                onSelect={(option) => {
                  updateForm("storageLocationId", option._id);
                  updateForm("storageLocationName", option.name);
                  setStorageLocationDraft(option.name);
                }}
              />
              </View>

              <FieldLabel text="Quantity" required />

              <View {...quantitySection.wrapperProps}>
              <QuantityServingInput
                quantityAvailable={form.quantityAvailable}
                quantityUnit={form.quantityUnit}
                onChangeQuantity={(value) => updateForm("quantityAvailable", value)}
                onChangeUnit={handlePantryUnitChange}
                unitOptions={units}
                onAddUnit={registerUnit}
                defaultPortionAmount={optionalNumber(form.defaultPortionAmount)}
                defaultPortionUnit={form.quantityUnit.trim() || undefined}
                entryCount={form.entryCount}
                onChangeEntryCount={(value) => updateForm("entryCount", value)}
                customUnitConversions={resolvedConversions}
                onFocus={quantitySection.trigger}
              />
              </View>

              <View {...purchaseDateSection.wrapperProps}>
              <FieldLabel text="Purchase date" />

              <DateTextInput
                value={form.purchaseDate}
                style={{ height: 56 }}
                className="rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
                onChangeText={(value) => updateForm("purchaseDate", value)}
                onFocus={purchaseDateSection.trigger}
              />
              </View>

              <View {...expiryDateSection.wrapperProps}>
              <FieldLabel text="Expiry date" />

              <DateTextInput
                value={form.expiryDate}
                style={{ height: 56 }}
                className="rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
                onChangeText={(value) => updateForm("expiryDate", value)}
                onFocus={expiryDateSection.trigger}
              />
              </View>

              <View {...expiryDurationSection.wrapperProps}>
              <FieldLabel text="Or set expiry from purchase date" />
              <DurationExpiryInput
                purchaseDate={form.purchaseDate}
                onApply={(expiryDate) => updateForm("expiryDate", expiryDate)}
                onFocus={expiryDurationSection.trigger}
              />
              </View>

              <View {...storeSection.wrapperProps}>
              <FieldLabel text="Store (optional)" />
              <SearchableObjectDropdown<SelectOption>
                options={stores}
                selectedId={form.storeId}
                selectedName={form.storeName}
                placeholder="Search or type a new store"
                onOpen={storeSection.trigger}
                onTextChange={(value) => {
                  if (value !== form.storeName) {
                    updateForm("storeId", "");
                  }

                  setStoreDraft(value);
                }}
                onSelect={(option) => {
                  updateForm("storeId", option._id);
                  updateForm("storeName", option.name);
                  setStoreDraft(option.name);
                }}
              />
              </View>

              <View {...priceSection.wrapperProps}>
              <FieldLabel text="Price paid (optional)" />
              <PriceInput
                value={form.purchasePrice}
                onChangeText={(value) => updateForm("purchasePrice", value)}
                onFocus={priceSection.trigger}
              />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onProductFound={applyScannedProduct}
      />

      <PhotoCaptureModal
        visible={labelCameraVisible}
        onClose={() => setLabelCameraVisible(false)}
        onCaptured={(photoUri) => void handleLabelPhoto(photoUri)}
        subject="nutrition label"
        instructions="Fit the whole Nutrition Facts or Supplement Facts panel in frame, flat and in focus."
      />
    </SafeAreaView>
  );
}
