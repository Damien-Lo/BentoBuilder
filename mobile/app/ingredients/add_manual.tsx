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
  CreatableStringDropdown,
  DateTextInput,
  DurationExpiryInput,
  DurationValueInput,
  FieldLabel,
  FormInput,
  QuantityServingInput,
  SearchableObjectDropdown,
  SectionTitle,
  SegmentedToggle,
  ToggleRow,
} from "@/src/components/forms";

import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import type { DurationUnit } from "@/src/utils/date";

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
import { updateGroceryItem } from "@/src/services/groceryListApi";

import type { IngredientOption, SelectOption } from "@/src/types/options";
import type { PantryItem } from "@/src/types/pantry";
import { barcodesMatch } from "@/src/utils/barcode";
import { resolveOrCreateOption } from "@/src/utils/resolveOrCreateOption";
import { todayDateInputString } from "@/src/utils/date";

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
  alwaysAvailable: boolean;

  defaultStorageLocationId: string;
  defaultStorageLocationName: string;
  defaultExpiryDurationAmount: string;
  defaultExpiryDurationUnit: DurationUnit;

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
  purchaseDate: todayDateInputString(),
  expiryDate: "",
  lowStockThreshold: "0",
  alwaysAvailable: false,

  defaultStorageLocationId: "",
  defaultStorageLocationName: "",
  defaultExpiryDurationAmount: "",
  defaultExpiryDurationUnit: "week",

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
  // in the pantry right away. Forced open (and kept open — no toggle is
  // rendered) when completing a grocery item, since that's the whole point.
  const [pantryInventoryExpanded, setPantryInventoryExpanded] = useState(
    () => isResolvingGroceryItem,
  );

  // Collapsed by default — nutrition is optional and often filled in later.
  const [nutritionExpanded, setNutritionExpanded] = useState(false);

  // Collapsed by default — smart defaults are optional.
  const [smartDefaultsExpanded, setSmartDefaultsExpanded] = useState(false);

  const [loadingOptions, setLoadingOptions] = useState(true);

  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);

  const [categories, setCategories] = useState<SelectOption[]>([]);

  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);

  const [brands, setBrands] = useState<SelectOption[]>([]);

  const [brandDraft, setBrandDraft] = useState(() => params.scannedBrand ?? "");

  const [genericParentDraft, setGenericParentDraft] = useState(
    () => params.genericParentName ?? "",
  );

  const [categoryDraft, setCategoryDraft] = useState("");

  const [storageLocationDraft, setStorageLocationDraft] = useState("");

  const [defaultLocationDraft, setDefaultLocationDraft] = useState("");

  const [wantsDefaultLocation, setWantsDefaultLocation] = useState(false);
  const [wantsDefaultExpiry, setWantsDefaultExpiry] = useState(false);

  const [units, setUnits] = useState<string[]>([]);

  const genericIngredientOptions = ingredients.filter(
    (option) => option.isGeneric,
  );

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
      alwaysAvailable: option.isAlwaysAvailable ?? false,

      calories: numberToFormValue(option.calories),

      protein: numberToFormValue(option.protein),

      carbs: numberToFormValue(option.carbs),

      fats: numberToFormValue(option.fat),

      fiber: numberToFormValue(option.fiber),

      sodium: numberToFormValue(option.sodium),

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

      const nutrition = {
        calories: optionalNumber(form.calories),
        protein: optionalNumber(form.protein),
        carbs: optionalNumber(form.carbs),
        fats: optionalNumber(form.fats),
        fiber: optionalNumber(form.fiber),
        sodium: optionalNumber(form.sodium),
      };

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
          barcode: form.barcode.trim() || null,
          description: form.description.trim() || undefined,
          isGeneric: true,
          brand: null,
          category: category._id,
          defaultPortionUnit: form.quantityUnit.trim() || undefined,
          defaultPortionAmount: optionalNumber(form.defaultPortionAmount),
          lowStockThreshold: ingredientLowStockThreshold,
          isAlwaysAvailable: form.alwaysAvailable,
          defaultStorageLocation: defaultStorageLocation?._id || null,
          defaultExpiryDurationAmount: defaultExpiryDurationAmount ?? null,
          defaultExpiryDurationUnit:
            defaultExpiryDurationAmount != null ? form.defaultExpiryDurationUnit : null,
          nutrition,
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
          lowStockThreshold: ingredientLowStockThreshold,
          isAlwaysAvailable: form.alwaysAvailable,
          defaultStorageLocation: defaultStorageLocation?._id || null,
          defaultExpiryDurationAmount: defaultExpiryDurationAmount ?? null,
          defaultExpiryDurationUnit:
            defaultExpiryDurationAmount != null ? form.defaultExpiryDurationUnit : null,
          nutrition,
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

        newPantryItem = await addIngredientToPantry({
          ingredient: ingredientId,
          storageLocation: storageLocation._id,
          quantityAvailable,
          quantityUnit: form.quantityUnit.trim(),
          purchaseDate: form.purchaseDate.trim() || undefined,
          expiryDate: form.expiryDate.trim() || undefined,
        });
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

          <FieldLabel text="Name" required />

          <SearchableObjectDropdown<IngredientOption>
            options={nameSearchOptions}
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
              <View className="flex-row">
                <View className="mr-3 flex-1">
                  <FieldLabel text="Generic ingredient" />

                  <SearchableObjectDropdown<IngredientOption>
                    options={genericIngredientOptions}
                    selectedId={form.genericParentId}
                    selectedName={form.genericParentName}
                    placeholder="Search or new"
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

          <FieldLabel text="Description" />

          <FormInput
            value={form.description}
            placeholder="Optional description"
            multiline
            onChangeText={(value) => updateForm("description", value)}
          />

          <FieldLabel text="Barcode" />

          <FormInput
            value={form.barcode}
            placeholder="Optional barcode"
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            onChangeText={(value) => updateForm("barcode", value)}
          />
          <Text className="mt-2 text-xs leading-4 text-slate-500">
            Scanning a barcode fills this in automatically — type one here if
            a scan came back empty, so it&apos;s recognized next time.
          </Text>

          <FieldLabel text="Category" required />

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

          <SectionTitle
            icon="scale-outline"
            title="Serving & stock"
            description="Define a serving size and when to flag low stock."
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
                placeholder="Search or type a new unit"
                onSelect={handleAddUnit}
              />
            </View>
          </View>

          <Text className="mt-2 text-xs leading-4 text-slate-500">
            How much of the unit above counts as one serving (e.g. 5 g of a
            120 g spice bottle) — nutrition below should match that amount.
          </Text>

          <ToggleRow
            label="Always available"
            description="Never shows as low or out of stock (e.g. tap water) — skips stock tracking entirely."
            value={form.alwaysAvailable}
            onChange={(value) => updateForm("alwaysAvailable", value)}
          />

          {!form.alwaysAvailable && (
            <>
              <FieldLabel text="Low-stock threshold" />

              <FormInput
                value={form.lowStockThreshold}
                placeholder="0"
                keyboardType="decimal-pad"
                onChangeText={(value) => updateForm("lowStockThreshold", value)}
              />

              <Text className="mt-2 text-xs leading-4 text-slate-500">
                Warn when total stock falls below this many{" "}
                {form.quantityUnit.trim() || "units"}.
              </Text>
            </>
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
            <>
              <View className="mt-4 flex-row">
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
            </>
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
                <>
                  <FieldLabel text="Default storage location" />
                  <SearchableObjectDropdown<SelectOption>
                    options={storageLocations}
                    selectedId={form.defaultStorageLocationId}
                    selectedName={form.defaultStorageLocationName}
                    placeholder="Search or type a location"
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
                </>
              )}

              <ToggleRow
                label="Set a default expiry duration"
                description="Prefills the expiry date when logging a purchase of this ingredient."
                value={wantsDefaultExpiry}
                onChange={setWantsDefaultExpiry}
              />
              {wantsDefaultExpiry && (
                <>
                  <FieldLabel text="Default expiry duration" />
                  <DurationValueInput
                    amount={form.defaultExpiryDurationAmount}
                    unit={form.defaultExpiryDurationUnit}
                    onChangeAmount={(value) => updateForm("defaultExpiryDurationAmount", value)}
                    onChangeUnit={(value) => updateForm("defaultExpiryDurationUnit", value)}
                  />
                </>
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
              <FieldLabel text="Storage location" required />

              <SearchableObjectDropdown<SelectOption>
                options={storageLocations}
                selectedId={form.storageLocationId}
                selectedName={form.storageLocationName}
                placeholder="Search or type a new storage location"
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

              <FieldLabel text="Quantity" required />

              <QuantityServingInput
                quantityAvailable={form.quantityAvailable}
                quantityUnit={form.quantityUnit}
                onChangeQuantity={(value) => updateForm("quantityAvailable", value)}
                onChangeUnit={(value) => updateForm("quantityUnit", value)}
                unitOptions={units}
                onAddUnit={handleAddUnit}
                defaultPortionAmount={optionalNumber(form.defaultPortionAmount)}
                defaultPortionUnit={form.quantityUnit.trim() || undefined}
              />

              <FieldLabel text="Purchase date" />

              <DateTextInput
                value={form.purchaseDate}
                style={{ height: 56 }}
                className="rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
                onChangeText={(value) => updateForm("purchaseDate", value)}
              />

              <FieldLabel text="Expiry date" />

              <DateTextInput
                value={form.expiryDate}
                style={{ height: 56 }}
                className="rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
                onChangeText={(value) => updateForm("expiryDate", value)}
              />

              <FieldLabel text="Or set expiry from purchase date" />
              <DurationExpiryInput
                purchaseDate={form.purchaseDate}
                onApply={(expiryDate) => updateForm("expiryDate", expiryDate)}
              />
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
