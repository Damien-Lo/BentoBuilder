import { useCallback, useMemo, useRef, useState } from "react";
import { WebPantryScreen } from "@/src/components/pantry/web/WebPantryScreen";
import { useWideWeb } from "@/src/utils/useWideWeb";
import { usePaneDimensions } from "@/src/utils/pane";
import {
  BarcodeScannerModal,
  type ScannedProduct,
} from "@/src/components/BarcodeScannerModal";
import { ReceiptScannerModal } from "@/src/components/ReceiptScannerModal";
import { chooseReceiptReview } from "@/src/components/receipts/chooseReceiptReview";
import { parseReceipt } from "@/src/services/receiptApi";
import { clearReviewDraft, setPendingReceipt } from "@/src/utils/receiptReviewStore";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  createStorageLocation,
  deleteStorageLocation,
  getStorageLocations,
  type SelectOption,
} from "@/src/services/optionsApi";

import {
  deleteIngredient,
  getIngredients,
  saveIngredient,
  type Ingredient,
} from "@/src/services/ingredientApi";
import { useAccount } from "@/src/components/auth/AuthGate";
import {
  alwaysInMyIngredients,
  fromLibrary,
  libraryTagColors,
  findIngredientByBarcode,
  inMyIngredients,
  setIngredientSaved,
  useIngredientLibrarySearch,
  withSaved,
} from "@/src/components/ingredients/foodLibrary";

import { deletePantryItem, getPantryItems, updatePantryItem } from "@/src/services/pantryApi";
import { PantryItemCard } from "@/src/components/pantry/PantryItemCard";
import { SplitPantryItemModal } from "@/src/components/pantry/SplitPantryItemModal";
import type { PantryItem } from "@/src/types/pantry";
import { loadSettings } from "@/src/services/settingsService";
import { convertUnits, getIngredientConversions, type CustomUnitConversion } from "@/src/utils/unitConversion";
import { daysUntil } from "@/src/utils/date";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitPage, useOrbitTheme } from "@/src/theme/orbit";

type ReferenceObject = {
  _id?: string;
  id?: string;
  name?: string;
};

type GroupedPantryItems = {
  id: string;
  name: string;
  items: PantryItem[];
};

type GroupedIngredients = {
  category: string;
  items: Ingredient[];
};

type ActivePage = "pantry" | "ingredients" | "mealPreps";

function isReferenceObject(value: unknown): value is ReferenceObject {
  return typeof value === "object" && value !== null;
}

function getReferenceId(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (!isReferenceObject(value)) {
    return "";
  }

  if (typeof value._id === "string") {
    return value._id;
  }

  if (typeof value.id === "string") {
    return value.id;
  }

  return "";
}

// Only trust a populated reference object's `.name` — a bare string means the
// ref wasn't populated (it's just the raw ObjectId), so never display it.
function getReferenceName(value: unknown): string {
  if (isReferenceObject(value) && typeof value.name === "string") {
    return value.name;
  }

  return "";
}

function getIngredientField(
  item: PantryItem,
  field: "name" | "brand" | "category",
): unknown {
  const ingredient = item.ingredient as unknown;

  if (
    typeof ingredient !== "object" ||
    ingredient === null ||
    !(field in ingredient)
  ) {
    return undefined;
  }

  return (ingredient as Record<string, unknown>)[field];
}

function getIngredientName(item: PantryItem): string {
  return (
    getReferenceName(getIngredientField(item, "name")) ||
    String(getIngredientField(item, "name") ?? "Unnamed ingredient")
  );
}

function getIngredientBrandName(item: PantryItem): string {
  return getReferenceName(getIngredientField(item, "brand"));
}

function getIngredientCategoryName(item: PantryItem): string {
  return getReferenceName(getIngredientField(item, "category"));
}

function getIngredientTagNames(item: PantryItem): string[] {
  const ingredient = item.ingredient as unknown;
  if (typeof ingredient !== "object" || ingredient === null || !("tags" in ingredient)) {
    return [];
  }

  const tags = (ingredient as Record<string, unknown>).tags;
  if (!Array.isArray(tags)) return [];

  return tags
    .map((tag) => (typeof tag === "object" && tag !== null ? getReferenceName(tag) : ""))
    .filter(Boolean);
}

type IngredientTreeNode = {
  parent: Ingredient;
  children: Ingredient[];
};

// Nests specific/branded ingredients under their generic parent — but only
// when that parent is present in the same list (e.g. same category group).
// Otherwise the child renders as its own root, so nothing goes missing.
function buildIngredientTree(items: Ingredient[]): IngredientTreeNode[] {
  const idsInList = new Set(items.map((item) => item._id));
  const childIds = new Set<string>();
  const childrenByParentId = new Map<string, Ingredient[]>();

  for (const item of items) {
    const parentId = getReferenceId(item.genericParent as unknown);
    if (!parentId || !idsInList.has(parentId)) continue;

    childIds.add(item._id);
    const siblings = childrenByParentId.get(parentId) ?? [];
    siblings.push(item);
    childrenByParentId.set(parentId, siblings);
  }

  return items
    .filter((item) => !childIds.has(item._id))
    .map((item) => ({
      parent: item,
      children: childrenByParentId.get(item._id) ?? [],
    }));
}

export default function PantryMainPage() {
  // A desktop browser gets the pantry as a table; the phone's is below.
  const wide = useWideWeb();
  return wide ? <WebPantryScreen /> : <PhonePantryMainPage />;
}

function PhonePantryMainPage() {
  const router = useRouter();
  const { width: screenWidth } = usePaneDimensions();
  // In Orbit's look, light or dark, in the Kitchen's colour (the tabs put
  // it in its section); the item cards, split sheet and fields in it follow
  // by themselves (OrbitPage).
  const { colors: o, dark } = useOrbitTheme();
  // Soft tints behind a badge or banner, in either theme.
  const tint = (light: string, darkTint: string) => (dark ? darkTint : light);
  const eyebrow = { fontSize: 11, fontWeight: "700" as const, letterSpacing: 1.2, color: o.faint };
  const title = { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.5, color: o.text };
  const card = { backgroundColor: o.surface, borderColor: o.border, borderWidth: 1, borderRadius: 18 };
  // A small round button on the page (cart, list/grid), and a word in a pill (Edit, Collapse all).
  const roundButton = { width: 40, height: 40, borderRadius: 20, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: o.surface, borderWidth: 1, borderColor: o.border };
  const pillButton = { height: 40, borderRadius: 20, paddingHorizontal: 14, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: o.pill };
  const generic = { backgroundColor: tint("#F5F3FF", "rgba(139,92,246,0.18)"), color: tint("#7C3AED", "#C4B5FD") };
  const prepared = { backgroundColor: o.accentSoft, color: o.accent };
  const library = libraryTagColors(dark);

  const [addMenuVisible, setAddMenuVisible] = useState(false);
  const [pantryAddMenuVisible, setPantryAddMenuVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanContext, setScanContext] = useState<"ingredient" | "pantry">("ingredient");
  const [receiptScannerVisible, setReceiptScannerVisible] = useState(false);
  const [parsingReceipt, setParsingReceipt] = useState(false);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [activePage, setActivePage] = useState<ActivePage>("pantry");
  const [pantryViewMode, setPantryViewMode] = useState<"locations" | "list">("list");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedMealPrepCategories, setExpandedMealPrepCategories] = useState<Set<string>>(new Set());
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set());
  const [customUnitConversions, setCustomUnitConversions] = useState<CustomUnitConversion[]>([]);
  const [locationEditMode, setLocationEditMode] = useState(false);
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [splittingItem, setSplittingItem] = useState<PantryItem | null>(null);
  const [busyPantryItemId, setBusyPantryItemId] = useState<string | null>(null);
  const isAdmin = useAccount().account?.role === "admin";

  // The food library, searched as one types on the Ingredients page: what
  // isn't already shown from your list, each with ✓ / + (foodLibrary.ts).
  // `toggledIds`: ones put in or taken out during this search — they keep
  // their place down there, with their new tick, rather than jumping up
  // into your list.
  const libraryQuery = isSearchActive && activePage === "ingredients" ? searchText : "";
  const { results: libraryResults, setResults: setLibraryResults, loading: libraryLoading } =
    useIngredientLibrarySearch(libraryQuery);
  const [toggledIds, setToggledIds] = useState<Set<string>>(new Set());

  const toggleLocation = (id: string) => {
    setExpandedLocations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Switches to the location-grouped list and expands every location that
  // has an expired item, so tapping the expired banner actually surfaces
  // them instead of just hinting they exist.
  function revealExpiredItems() {
    setPantryViewMode("list");
    setLocationEditMode(false);
    setExpandedLocations((prev) => {
      const next = new Set(prev);
      for (const item of expiredPantryItems) {
        next.add(getReferenceId(item.storageLocation as unknown) || "other");
      }
      return next;
    });
  }

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const toggleMealPrepCategory = (category: string) => {
    setExpandedMealPrepCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const isFirstLoad = useRef(true);

  const loadPantryPage = useCallback(async (cancelledRef?: { current: boolean }) => {
    const showSpinner = isFirstLoad.current;
    if (showSpinner) setIsLoading(true);

    try {
      const [loadedLocations, loadedPantryItems, loadedIngredients, loadedSettings] =
        await Promise.all([
          getStorageLocations(),
          getPantryItems(),
          getIngredients(),
          loadSettings(),
        ]);

      if (cancelledRef?.current) return;

      setStorageLocations(Array.isArray(loadedLocations) ? loadedLocations : []);
      setPantryItems(Array.isArray(loadedPantryItems) ? loadedPantryItems : []);
      setIngredients(Array.isArray(loadedIngredients) ? loadedIngredients : []);
      setCustomUnitConversions(loadedSettings.unitConversions ?? []);
    } catch (error) {
      console.error("Error loading pantry page:", error);
      if (!cancelledRef?.current && showSpinner) {
        setStorageLocations([]);
        setPantryItems([]);
        setIngredients([]);
      }
    } finally {
      if (!cancelledRef?.current) {
        isFirstLoad.current = false;
        setIsLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const cancelledRef = { current: false };
      void loadPantryPage(cancelledRef);
      return () => {
        cancelledRef.current = true;
      };
    }, [loadPantryPage]),
  );

  const storageLocationById = useMemo(() => {
    return new Map(
      storageLocations.map((location) => [String(location._id), location]),
    );
  }, [storageLocations]);

  const ingredientById = useMemo(
    () => new Map(ingredients.map((ingredient) => [ingredient._id, ingredient])),
    [ingredients],
  );

  // A generic's total is its own direct pantry stock plus every
  // specific/branded variant's stock that shares its unit (a generic's
  // threshold in "tbsp" can't be checked against a variant's stock recorded
  // in "ml").
  const genericStockByIngredientId = useMemo(() => {
    const stats = new Map<string, { total: number; variantCount: number; pieceCount: number }>();

    for (const ingredient of ingredients) {
      const parentId = getReferenceId(ingredient.genericParent as unknown);
      if (!parentId) continue;

      const entry = stats.get(parentId) ?? { total: 0, variantCount: 0, pieceCount: 0 };
      entry.variantCount += 1;
      stats.set(parentId, entry);
    }

    for (const pantryItem of pantryItems) {
      const itemIngredientId = getReferenceId(pantryItem.ingredient as unknown);
      const itemIngredient = ingredientById.get(itemIngredientId);
      if (!itemIngredient) continue;

      // Either logged directly against a generic, or against one of its
      // specific/branded variants — both count toward the same total.
      const parentId = itemIngredient.isGeneric
        ? itemIngredient._id
        : getReferenceId(itemIngredient.genericParent as unknown);
      if (!parentId) continue;

      const parent = ingredientById.get(parentId);
      if (!parent) continue;

      const entry = stats.get(parentId) ?? { total: 0, variantCount: 0, pieceCount: 0 };
      // Piece count doesn't need unit conversion — every pantry item is one
      // physical piece regardless of what unit its weight happens to be
      // recorded in, so this counts unconditionally (unlike the weight
      // total below, which is meaningless without a valid conversion).
      entry.pieceCount += 1;

      if (parent.defaultPortionUnit) {
        const converted = convertUnits(
          Number(pantryItem.quantityAvailable ?? 0),
          pantryItem.quantityUnit,
          parent.defaultPortionUnit,
          getIngredientConversions(itemIngredient, customUnitConversions, ingredients),
        );
        if (converted != null) entry.total += converted;
      }

      stats.set(parentId, entry);
    }

    return stats;
  }, [ingredients, pantryItems, ingredientById, customUnitConversions]);

  const getStorageLocationName = (item: PantryItem): string => {
    const rawLocation = item.storageLocation as unknown;
    const populatedName = getReferenceName(rawLocation);

    if (populatedName) {
      return populatedName;
    }

    const locationId = getReferenceId(rawLocation);
    return storageLocationById.get(locationId)?.name ?? "Other";
  };

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    if (!normalizedSearch) {
      return pantryItems;
    }

    return pantryItems.filter((item) => {
      const searchableValues = [
        getIngredientName(item),
        getIngredientBrandName(item),
        getIngredientCategoryName(item),
        getStorageLocationName(item),
        ...getIngredientTagNames(item),
      ];

      return searchableValues.some((value) =>
        value.toLowerCase().includes(normalizedSearch),
      );
    });
  }, [pantryItems, searchText, storageLocationById]);

  // Past their expiry date, regardless of search/location — the basis for
  // the proactive banner below, since nothing else on this page surfaces
  // them without digging into every location one at a time.
  const expiredPantryItems = useMemo(
    () =>
      pantryItems.filter((item) => {
        const days = daysUntil(item.expiryDate);
        return days != null && days < 0;
      }),
    [pantryItems],
  );

  // A meal-prep item (a finished dish you reheat/eat directly, e.g.
  // Okonomiyaki) isn't something you'd browse as a recipe component —
  // excluded from the Ingredients tab and its search entirely. It still
  // shows in the Pantry tab (by location), which isn't filtered from this.
  // And only your ingredients (the rest of `ingredients` is there for the
  // stock totals and what the pantry points at; the food library is
  // reached by the search).
  const browsableIngredients = useMemo(
    () => ingredients.filter((ingredient) => !ingredient.isMealPrep && inMyIngredients(ingredient)),
    [ingredients],
  );

  const filteredIngredients = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) {
      return browsableIngredients;
    }

    return browsableIngredients.filter((ingredient) => {
      const brandName =
        typeof ingredient.brand === "object" && ingredient.brand !== null
          ? (ingredient.brand.name ?? "")
          : "";

      const categoryName =
        typeof ingredient.category === "object" && ingredient.category !== null
          ? (ingredient.category.name ?? "")
          : "";

      const tagNames = Array.isArray(ingredient.tags)
        ? ingredient.tags
            .map((tag) => (typeof tag === "object" && tag !== null ? tag.name : ""))
            .filter(Boolean)
        : [];

      return [
        ingredient.name,
        brandName,
        categoryName,
        ingredient.barcode ?? "",
        ...tagNames,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [browsableIngredients, searchText]);

  const groupedItems = useMemo<GroupedPantryItems[]>(() => {
    const groups = new Map<string, GroupedPantryItems>();

    for (const item of filteredItems) {
      const rawLocation = item.storageLocation as unknown;
      const locationId = getReferenceId(rawLocation) || "other";
      const locationName = getStorageLocationName(item);
      const existingGroup = groups.get(locationId);

      if (existingGroup) {
        existingGroup.items.push(item);
      } else {
        groups.set(locationId, {
          id: locationId,
          name: locationName,
          items: [item],
        });
      }
    }

    for (const group of groups.values()) {
      group.items.sort((a, b) => getIngredientName(a).localeCompare(getIngredientName(b)));
    }

    return Array.from(groups.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [filteredItems, storageLocationById]);

  const groupedIngredients = useMemo<GroupedIngredients[]>(() => {
    const groups = new Map<string, GroupedIngredients>();

    for (const ingredient of filteredIngredients) {
      const category =
        typeof ingredient.category === "object" && ingredient.category !== null
          ? (ingredient.category.name ?? "Uncategorised")
          : "Uncategorised";

      const existing = groups.get(category);
      if (existing) {
        existing.items.push(ingredient);
      } else {
        groups.set(category, { category, items: [ingredient] });
      }
    }

    for (const group of groups.values()) {
      group.items.sort((a, b) => a.name.localeCompare(b.name));
    }

    return Array.from(groups.values()).sort((a, b) => {
      if (a.category === "Uncategorised") return 1;
      if (b.category === "Uncategorised") return -1;
      return a.category.localeCompare(b.category);
    });
  }, [filteredIngredients]);

  // Finished dishes you reheat/eat directly (e.g. Okonomiyaki) — the
  // mirror image of browsableIngredients, which excludes these.
  const mealPrepIngredients = useMemo(
    () => ingredients.filter((ingredient) => ingredient.isMealPrep),
    [ingredients],
  );

  const filteredMealPreps = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) {
      return mealPrepIngredients;
    }

    return mealPrepIngredients.filter((ingredient) => {
      const categoryName =
        typeof ingredient.category === "object" && ingredient.category !== null
          ? (ingredient.category.name ?? "")
          : "";

      const tagNames = Array.isArray(ingredient.tags)
        ? ingredient.tags
            .map((tag) => (typeof tag === "object" && tag !== null ? tag.name : ""))
            .filter(Boolean)
        : [];

      return [ingredient.name, categoryName, ...tagNames].some((value) =>
        value.toLowerCase().includes(query),
      );
    });
  }, [mealPrepIngredients, searchText]);

  const groupedMealPreps = useMemo<GroupedIngredients[]>(() => {
    const groups = new Map<string, GroupedIngredients>();

    for (const ingredient of filteredMealPreps) {
      const category =
        typeof ingredient.category === "object" && ingredient.category !== null
          ? (ingredient.category.name ?? "Uncategorised")
          : "Uncategorised";

      const existing = groups.get(category);
      if (existing) {
        existing.items.push(ingredient);
      } else {
        groups.set(category, { category, items: [ingredient] });
      }
    }

    for (const group of groups.values()) {
      group.items.sort((a, b) => a.name.localeCompare(b.name));
    }

    return Array.from(groups.values()).sort((a, b) => {
      if (a.category === "Uncategorised") return 1;
      if (b.category === "Uncategorised") return -1;
      return a.category.localeCompare(b.category);
    });
  }, [filteredMealPreps]);

  // The search on the Ingredients page: your ingredients that match (less
  // any just put in or taken out), then the rest of the food library's.
  const searchedIngredients = useMemo(
    () => filteredIngredients.filter((ingredient) => !toggledIds.has(ingredient._id)),
    [filteredIngredients, toggledIds],
  );
  const moreFromLibrary = useMemo(() => {
    const shown = new Set(searchedIngredients.map((ingredient) => ingredient._id));
    return (libraryResults ?? []).filter((food) => !shown.has(food._id) && !food.isMealPrep);
  }, [libraryResults, searchedIngredients]);

  const closeSearch = () => {
    Keyboard.dismiss();
    setIsSearchActive(false);
    setSearchText("");
    setToggledIds(new Set());
  };

  // A library food into your ingredients or out, at once — put back if the
  // server says no. (Your own, and the admin's catalog, stay.)
  async function toggleSaved(food: Ingredient) {
    if (alwaysInMyIngredients(food, isAdmin)) return;
    const saved = !inMyIngredients(food);
    const swap = (to: boolean) => {
      setIngredients((prev) => (to || prev.some((i) => i._id === food._id) ? withSaved(prev, food, to) : prev));
      setLibraryResults((prev) => prev && prev.map((i) => (i._id === food._id ? { ...i, saved: to } : i)));
    };
    setToggledIds((prev) => new Set(prev).add(food._id));
    swap(saved);
    try {
      await setIngredientSaved(food, saved);
    } catch (error) {
      swap(!saved);
      Alert.alert("Couldn't change your ingredients", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  const handleDeleteIngredient = (id: string, name: string) => {
    Alert.alert(
      "Delete ingredient",
      `Delete "${name}"? This will remove it and all its pantry entries.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteIngredient(id)
              .then(() => {
                setIngredients((prev) => prev.filter((i) => i._id !== id));
                setPantryItems((prev) =>
                  prev.filter(
                    (p) => getReferenceId(p.ingredient as unknown) !== id,
                  ),
                );
              })
              .catch((err: unknown) => {
                const message =
                  err instanceof Error
                    ? err.message
                    : "Could not delete ingredient.";
                Alert.alert("Error", message);
              });
          },
        },
      ],
    );
  };

  // A shared ingredient out of your list (it stays in `ingredients` for
  // whatever of yours points at it, and the search finds it again) — at
  // once, put back if the server says no.
  async function handleRemoveFromMyIngredients(ingredient: Ingredient) {
    setIngredients((prev) => withSaved(prev, ingredient, false));
    try {
      await setIngredientSaved(ingredient, false);
    } catch (error) {
      setIngredients((prev) => withSaved(prev, ingredient, true));
      Alert.alert("Couldn't remove it", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  function handleDeletePantryEntry(id: string) {
    Alert.alert("Delete entry", "Remove this pantry entry?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deletePantryItem(id)
            .then(() => {
              setPantryItems((prev) => prev.filter((p) => p._id !== id));
            })
            .catch((err: unknown) => {
              const message =
                err instanceof Error ? err.message : "Could not delete pantry entry.";
              Alert.alert("Error", message);
            });
        },
      },
    ]);
  }

  async function handleQuantityDelta(item: PantryItem, delta: number) {
    const nextQuantity = Math.max(0, Number(item.quantityAvailable ?? 0) + delta);
    if (nextQuantity === item.quantityAvailable) return;

    setBusyPantryItemId(item._id);
    try {
      const updated = await updatePantryItem(item._id, { quantityAvailable: nextQuantity });
      setPantryItems((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Could not update the pantry entry.",
      );
    } finally {
      setBusyPantryItemId(null);
    }
  }

  function handleSplitComplete(updatedOriginal: PantryItem, newEntry: PantryItem | null) {
    setPantryItems((prev) => {
      const next = prev.map((p) => (p._id === updatedOriginal._id ? updatedOriginal : p));
      return newEntry ? [...next, newEntry] : next;
    });
  }

  function handleDeleteLocation(location: SelectOption) {
    const itemCount = pantryItems.filter(
      (item) => getReferenceId(item.storageLocation as unknown) === location._id,
    ).length;

    Alert.alert(
      "Delete location",
      itemCount > 0
        ? `Delete "${location.name}"? ${itemCount} ${itemCount === 1 ? "item" : "items"} stored here will move to "Other".`
        : `Delete "${location.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteStorageLocation(location._id)
              .then(() => loadPantryPage())
              .catch((err: unknown) => {
                Alert.alert(
                  "Error",
                  err instanceof Error ? err.message : "Could not delete location.",
                );
              });
          },
        },
      ],
    );
  }

  async function handleCreateLocation() {
    const name = newLocationName.trim();
    if (!name || savingLocation) return;

    try {
      setSavingLocation(true);
      await createStorageLocation(name);
      await loadPantryPage();
      setNewLocationName("");
      setIsAddingLocation(false);
    } catch (err) {
      Alert.alert(
        "Could not add location",
        err instanceof Error ? err.message : "Failed to add the location.",
      );
    } finally {
      setSavingLocation(false);
    }
  }

  // `isChild` renders a variant nested under a generic's header row — no
  // icon or card chrome, just a slim line, so a generic with its branded
  // variants reads as one grouped unit instead of N duplicate-looking cards.
  function renderIngredientCard(ingredientItem: Ingredient, isChild = false) {
    const ingredientPantryItems = pantryItems.filter(
      (p) => getReferenceId(p.ingredient as unknown) === ingredientItem._id,
    );

    // Generic ingredients never hold pantry stock directly — use the
    // aggregated variant total instead.
    const totalQuantity = ingredientItem.isGeneric
      ? (genericStockByIngredientId.get(ingredientItem._id)?.total ?? 0)
      : ingredientPantryItems.reduce(
          (sum, p) => sum + Number(p.quantityAvailable ?? 0),
          0,
        );
    // For a piece-labeled ingredient ("steak", "fillet", ...) a summed
    // weight ("682 g") hides the actually-useful fact — how many whole
    // pieces are on hand. pieceCount mirrors totalQuantity's generic-vs-
    // direct split, but counts pantry entries rather than summing weight.
    const pieceCount = ingredientItem.pieceLabel
      ? (ingredientItem.isGeneric
          ? (genericStockByIngredientId.get(ingredientItem._id)?.pieceCount ?? 0)
          : ingredientPantryItems.length)
      : null;
    const isAlwaysAvailable = ingredientItem.isAlwaysAvailable ?? false;
    const isInStock = isAlwaysAvailable || totalQuantity > 0;
    const isLowStock =
      !isAlwaysAvailable &&
      isInStock &&
      ingredientItem.lowStockThreshold != null &&
      totalQuantity <= ingredientItem.lowStockThreshold;
    const displayUnit = ingredientItem.isGeneric
      ? ingredientItem.defaultPortionUnit
      : ingredientPantryItems[0]?.quantityUnit;
    const locationNames = [
      ...new Set(ingredientPantryItems.map((p) => getStorageLocationName(p))),
    ].join(", ");

    const statusDotColor = isAlwaysAvailable
      ? "bg-blue-500"
      : isLowStock
        ? "bg-amber-500"
        : isInStock
          ? "bg-emerald-500"
          : "bg-slate-300";
    // (Out of stock: the theme's grey, which reads in the dark too.)
    const statusDotStyle = !isAlwaysAvailable && !isInStock ? { backgroundColor: o.orbit } : undefined;

    // Swiped: your own is deleted; a shared one (the food library's, or
    // the catalog's — the admin's catalog aside, theirs to delete) only
    // leaves your list.
    const deleteAction = alwaysInMyIngredients(ingredientItem, isAdmin) ? (
      <Tap
        style={{ alignItems: "center", justifyContent: "center", borderRadius: isChild ? 16 : 18, backgroundColor: "#EF4444", marginBottom: isChild ? 8 : 10, width: isChild ? 64 : 80 }}
        pressedStyle={{ backgroundColor: "#DC2626" }}
        onPress={() => handleDeleteIngredient(ingredientItem._id, ingredientItem.name)}
      >
        <Ionicons name="trash-outline" size={isChild ? 18 : 22} color="white" />
      </Tap>
    ) : (
      <Tap
        style={{ alignItems: "center", justifyContent: "center", borderRadius: isChild ? 16 : 18, backgroundColor: o.ink, marginBottom: isChild ? 8 : 10, width: isChild ? 64 : 80 }}
        pressedStyle={{ opacity: 0.8 }}
        accessibilityLabel={`Remove ${ingredientItem.name} from my ingredients`}
        onPress={() => void handleRemoveFromMyIngredients(ingredientItem)}
      >
        <Ionicons name="remove-circle-outline" size={isChild ? 18 : 22} color={o.onInk} />
        {!isChild && <Text style={{ marginTop: 2, fontSize: 11, fontWeight: "600", color: o.onInk }}>Remove</Text>}
      </Tap>
    );

    // Both levels use the same compact "dot + quantity" status treatment —
    // hierarchy comes from the icon, indent, and Generic badge instead of
    // repeating "In stock" text at every level.
    const stockValue = (
      <View className="flex-row items-center">
        <View className={`mr-2 h-2 w-2 rounded-full ${statusDotColor}`} style={statusDotStyle} />
        <Text
          className={`text-sm font-medium ${isAlwaysAvailable ? "text-blue-600" : "text-slate-600"}`}
          style={{ color: isAlwaysAvailable ? o.accent : o.icon }}
        >
          {isAlwaysAvailable
            ? "Always available"
            : isInStock
              ? pieceCount != null
                ? `${pieceCount} ${pieceCount === 1 ? ingredientItem.pieceLabel : `${ingredientItem.pieceLabel}s`}`
                : `${Math.round(totalQuantity * 100) / 100} ${displayUnit ?? ""}`.trim()
              : "—"}
        </Text>
      </View>
    );

    if (isChild) {
      const brandName = getReferenceName(ingredientItem.brand);
      const subtitle = [brandName, locationNames].filter(Boolean).join(" · ");

      return (
        <ReanimatedSwipeable
          key={ingredientItem._id}
          friction={2}
          rightThreshold={40}
          renderLeftActions={() => deleteAction}
        >
          <Tap
            style={{ ...card, borderRadius: 16, marginBottom: 8, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13 }}
            pressedStyle={{ backgroundColor: o.pill }}
            onPress={() => {
              router.push({
                pathname: "/ingredients/edit/[id]",
                params: { id: ingredientItem._id },
              });
            }}
          >
            <View className="flex-1">
              <Text className="text-sm font-semibold text-slate-800" style={{ color: o.text }} numberOfLines={1}>
                {ingredientItem.name}
              </Text>
              {/* Its tags, in a row under the name. */}
              {(fromLibrary(ingredientItem, isAdmin) || !!ingredientItem.productionRecipe) && (
              <View style={{ marginTop: 5, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {fromLibrary(ingredientItem, isAdmin) && (
                  <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: library.backgroundColor }}>
                    <Text className="text-[10px] font-bold uppercase tracking-wide" style={{ color: library.color }}>
                      Library
                    </Text>
                  </View>
                )}
                {ingredientItem.productionRecipe && (
                  <View className="rounded-full bg-blue-50 px-2 py-0.5" style={{ backgroundColor: prepared.backgroundColor }}>
                    <Text className="text-[10px] font-bold uppercase tracking-wide text-blue-600" style={{ color: prepared.color }}>
                      Prepared
                    </Text>
                  </View>
                )}
              </View>
              )}
              {subtitle ? (
                <Text className="mt-0.5 text-xs text-slate-400" style={{ marginTop: 5, color: o.faint }} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>

            {stockValue}

            <Ionicons name="chevron-forward" size={16} color={o.faint} style={{ marginLeft: 8 }} />
          </Tap>
        </ReanimatedSwipeable>
      );
    }

    return (
      <ReanimatedSwipeable
        key={ingredientItem._id}
        friction={2}
        rightThreshold={40}
        renderLeftActions={() => deleteAction}
      >
        <Tap
          style={{ ...card, marginBottom: 10, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16 }}
          pressedStyle={{ backgroundColor: o.pill }}
          onPress={() => {
            router.push({
              pathname: "/ingredients/edit/[id]",
              params: { id: ingredientItem._id },
            });
          }}
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-blue-50" style={{ backgroundColor: o.pill }}>
            <Ionicons name="nutrition-outline" size={18} color={o.onPill} />
          </View>

          <View className="ml-3 flex-1">
            <Text
              className="text-base font-bold text-slate-900"
              style={{ fontSize: 15, fontWeight: "600", color: o.text }}
              numberOfLines={1}
            >
              {ingredientItem.name}
            </Text>

            {/* Its tags, in a row under the name. */}
            {(ingredientItem.isGeneric || fromLibrary(ingredientItem, isAdmin) || !!ingredientItem.productionRecipe) && (
            <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {ingredientItem.isGeneric && (
                <View className="rounded-full bg-violet-50 px-2 py-0.5" style={{ backgroundColor: generic.backgroundColor }}>
                  <Text className="text-[10px] font-bold uppercase tracking-wide text-violet-600" style={{ color: generic.color }}>
                    Generic
                  </Text>
                </View>
              )}

              {/* Saved from the library rather than made (an edit makes one's own copy, untagged). */}
              {fromLibrary(ingredientItem, isAdmin) && (
                <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: library.backgroundColor }}>
                  <Text className="text-[10px] font-bold uppercase tracking-wide" style={{ color: library.color }}>
                    Library
                  </Text>
                </View>
              )}

              {ingredientItem.productionRecipe && (
                <View className="rounded-full bg-blue-50 px-2 py-0.5" style={{ backgroundColor: prepared.backgroundColor }}>
                  <Text className="text-[10px] font-bold uppercase tracking-wide text-blue-600" style={{ color: prepared.color }}>
                    Prepared
                  </Text>
                </View>
              )}
            </View>
            )}

            {!ingredientItem.isGeneric &&
              (() => {
                const brandName = getReferenceName(ingredientItem.brand);
                const subtitle = [brandName, locationNames]
                  .filter(Boolean)
                  .join(" · ");
                return subtitle ? (
                  <Text
                    className="mt-1 text-sm text-slate-500"
                    style={{ marginTop: 6, fontSize: 13, color: o.muted }}
                    numberOfLines={1}
                  >
                    {subtitle}
                  </Text>
                ) : null;
              })()}
          </View>

          {stockValue}

          <Ionicons
            name="chevron-forward"
            size={18}
            color={o.faint}
            style={{ marginLeft: 10 }}
          />
        </Tap>
      </ReanimatedSwipeable>
    );
  }

  // Under your ingredients in the search: the rest of what the food library
  // has by that name, each ticked when it's in your list. The tick puts it
  // in or takes it out; the row opens its page.
  function renderLibraryResults() {
    if (searchText.trim().length < 2) return null;
    if (!moreFromLibrary.length) {
      return libraryLoading ? <ActivityIndicator style={{ marginTop: 16 }} color={o.muted} /> : null;
    }

    return (
      <View style={{ marginTop: searchedIngredients.length ? 12 : 0 }}>
        <Text style={{ ...eyebrow, marginLeft: 4, marginBottom: 10 }}>
          MORE FROM THE FOOD LIBRARY
          <Text style={{ fontWeight: "600", color: o.orbit }}> · {moreFromLibrary.length}</Text>
        </Text>

        {moreFromLibrary.map((food) => {
          const fixed = alwaysInMyIngredients(food, isAdmin);
          const mine = fixed || inMyIngredients(food);
          const subtitle = [getReferenceName(food.brand), getReferenceName(food.category)].filter(Boolean).join(" · ");
          return (
            <Tap
              key={food._id}
              style={{ marginBottom: 8, flexDirection: "row", alignItems: "center", borderRadius: 16, padding: 12, backgroundColor: o.canvas, borderWidth: 2, borderColor: mine ? o.ink : "transparent" }}
              pressedStyle={{ backgroundColor: o.pill }}
              onPress={() => {
                closeSearch();
                router.push({
                  pathname: "/ingredients/edit/[id]",
                  params: { id: food._id },
                });
              }}
            >
              <View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: o.pill }}>
                <Ionicons name="nutrition-outline" size={20} color={o.onPill} />
              </View>

              <View className="ml-3 flex-1">
                <Text className="font-semibold" style={{ color: o.text }} numberOfLines={2}>
                  {food.name}
                </Text>
                {subtitle ? (
                  <Text className="mt-0.5 text-sm" style={{ color: o.muted }} numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>

              <Tap
                onPress={() => void toggleSaved(food)}
                disabled={fixed}
                hitSlop={10}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: mine, disabled: fixed }}
                accessibilityLabel={mine ? `Remove ${food.name} from your ingredients` : `Add ${food.name} to your ingredients`}
                style={{ marginLeft: 8 }}
              >
                <Ionicons name={mine ? "checkmark-circle" : "add-circle-outline"} size={26} color={mine ? o.ink : o.faint} />
              </Tap>
            </Tap>
          );
        })}

        {(libraryResults?.length ?? 0) >= 40 && (
          <Text style={{ textAlign: "center", marginTop: 6, fontSize: 13, color: o.faint }}>Keep typing to narrow it down</Text>
        )}
      </View>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50" style={{ backgroundColor: o.canvas }}>
        <ActivityIndicator size="large" color={o.muted} />
        <Text className="mt-3 text-slate-500" style={{ color: o.muted }}>Loading pantry...</Text>
      </SafeAreaView>
    );
  }

  const handleHorizontalScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const pageIndex = Math.round(
      event.nativeEvent.contentOffset.x / screenWidth,
    );

    setActivePage(
      pageIndex === 0 ? "pantry" : pageIndex === 1 ? "ingredients" : "mealPreps",
    );

    Keyboard.dismiss();
    setIsSearchActive(false);
    setSearchText("");
  };

  return (
    <OrbitPage>
    <SafeAreaView className="flex-1 bg-slate-50" style={{ backgroundColor: o.canvas }}>
      <View className="flex-1">
        {/* Swipe horizontally between Pantry and All Ingredients */}
        <ScrollView
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          className="flex-1"
          onMomentumScrollEnd={handleHorizontalScrollEnd}
        >
          {/* Page 1: Pantry by storage location */}
          <View style={{ width: screenWidth }} className="flex-1">
            <View className="px-5 pt-24">
              <View className="flex-row items-center">
                <Text className="flex-1 text-3xl font-bold text-slate-950" style={title}>
                  Your Pantry
                </Text>
                {pantryViewMode === "locations" && (
                  <Tap
                    style={[pillButton, { marginRight: 8 }, locationEditMode && { backgroundColor: o.ink }]}
                    pressedStyle={{ opacity: 0.7 }}
                    onPress={() => {
                      setLocationEditMode((v) => !v);
                      setIsAddingLocation(false);
                      setNewLocationName("");
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: locationEditMode ? o.onInk : o.onPill }}>
                      {locationEditMode ? "Done" : "Edit"}
                    </Text>
                  </Tap>
                )}
                {pantryViewMode === "list" && expandedLocations.size > 0 && (
                  <Tap
                    style={[pillButton, { marginRight: 8 }]}
                    pressedStyle={{ opacity: 0.7 }}
                    onPress={() => setExpandedLocations(new Set())}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: o.onPill }}>
                      Collapse all
                    </Text>
                  </Tap>
                )}
                <Tap
                  style={[roundButton, { marginRight: 8 }]}
                  pressedStyle={{ backgroundColor: o.pill }}
                  onPress={() => router.push("/grocery-list")}
                  accessibilityLabel="Grocery list"
                >
                  <Ionicons name="cart-outline" size={19} color={o.icon} />
                </Tap>
                <Tap
                  style={roundButton}
                  pressedStyle={{ backgroundColor: o.pill }}
                  onPress={() => {
                    setPantryViewMode((m) => m === "locations" ? "list" : "locations");
                    setLocationEditMode(false);
                    setIsAddingLocation(false);
                  }}
                >
                  <Ionicons
                    name={pantryViewMode === "locations" ? "list-outline" : "apps-outline"}
                    size={20}
                    color={o.icon}
                  />
                </Tap>
              </View>

              <Text className="mt-1 text-base text-slate-500" style={{ marginTop: 2, fontSize: 14, color: o.muted }}>
                {pantryViewMode === "locations"
                  ? "Browse ingredients by storage location"
                  : "All pantry items grouped by location"}
              </Text>

              <View className="mt-3 flex-row items-center">
                <View className="h-2 w-6 rounded-full bg-blue-600" style={{ backgroundColor: o.ink }} />
                <View className="ml-2 h-2 w-2 rounded-full bg-slate-300" style={{ backgroundColor: o.orbit }} />
                <View className="ml-2 h-2 w-2 rounded-full bg-slate-300" style={{ backgroundColor: o.orbit }} />
                <Text className="ml-3 text-xs font-medium text-slate-400" style={{ color: o.faint }}>
                  Swipe left for ingredients
                </Text>
              </View>

              {expiredPantryItems.length > 0 && (
                <Tap
                  style={{ marginTop: 12, flexDirection: "row", alignItems: "center", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: tint("#FEF2F2", "rgba(248,113,113,0.14)") }}
                  pressedStyle={{ opacity: 0.7 }}
                  onPress={revealExpiredItems}
                >
                  <Ionicons name="alert-circle" size={18} color={o.danger} />
                  <Text style={{ marginLeft: 10, flex: 1, fontSize: 14, fontWeight: "600", color: o.danger }}>
                    {expiredPantryItems.length} {expiredPantryItems.length === 1 ? "item" : "items"}{" "}
                    expired
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={o.danger} />
                </Tap>
              )}
            </View>

            {pantryViewMode === "locations" ? (
              <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 120 }}
                showsVerticalScrollIndicator={false}
              >
                <View className="flex-row flex-wrap justify-between">
                  {storageLocations.map((location) => {
                    const locationId = String(location._id);
                    const itemCount = pantryItems.filter((item) =>
                      getReferenceId(item.storageLocation as unknown) === locationId
                    ).length;
                    const canDelete = locationEditMode && !location.isDefault;

                    return (
                      <View key={locationId} className="relative mb-4 w-[48%]">
                        <Tap
                          disabled={locationEditMode}
                          style={{ ...card, borderRadius: 20, height: 176, justifyContent: "space-between", padding: 20 }}
                          pressedStyle={{ backgroundColor: o.pill }}
                          onPress={() =>
                            router.push({ pathname: "/pantry/location/[id]", params: { id: locationId, name: location.name } })
                          }
                        >
                          <View className="h-11 w-11 items-center justify-center rounded-full bg-blue-50" style={{ backgroundColor: o.pill }}>
                            <Ionicons name="file-tray-stacked-outline" size={20} color={o.onPill} />
                          </View>
                          <View>
                            <Text className="text-lg font-bold text-slate-900" style={{ color: o.text }}>{location.name}</Text>
                            <Text className="mt-1 text-sm text-slate-500" style={{ color: o.muted }}>
                              {itemCount} {itemCount === 1 ? "item" : "items"}
                            </Text>
                          </View>
                        </Tap>

                        {canDelete && (
                          <Pressable
                            className="absolute -left-2 -top-2 h-7 w-7 items-center justify-center rounded-full bg-red-500 active:bg-red-600"
                            onPress={() => handleDeleteLocation(location)}
                            hitSlop={8}
                          >
                            <Ionicons name="remove" size={18} color="white" />
                          </Pressable>
                        )}
                      </View>
                    );
                  })}

                  {locationEditMode &&
                    (isAddingLocation ? (
                      <View className="mb-4 h-44 w-[48%] justify-between rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 p-5" style={{ borderRadius: 20, borderColor: o.selectedRing, backgroundColor: o.surface }}>
                        <View className="h-11 w-11 items-center justify-center rounded-full bg-blue-100" style={{ backgroundColor: o.pill }}>
                          <Ionicons name="file-tray-stacked-outline" size={20} color={o.ink} />
                        </View>
                        <View>
                          <TextInput
                            value={newLocationName}
                            onChangeText={setNewLocationName}
                            onSubmitEditing={() => void handleCreateLocation()}
                            autoFocus
                            placeholder="Location name"
                            placeholderTextColor={o.faint}
                            returnKeyType="done"
                            className="text-base font-bold text-slate-900"
                            style={{ color: o.text }}
                          />
                          <View className="mt-2 flex-row gap-2">
                            <Tap
                              disabled={savingLocation}
                              style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: o.ink, opacity: savingLocation ? 0.5 : 1 }}
                              pressedStyle={{ opacity: 0.8 }}
                              onPress={() => void handleCreateLocation()}
                              accessibilityLabel="Add"
                            >
                              <Ionicons name="checkmark" size={18} color={o.onInk} />
                            </Tap>
                            <Tap
                              style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: o.pill }}
                              pressedStyle={{ opacity: 0.7 }}
                              onPress={() => {
                                setIsAddingLocation(false);
                                setNewLocationName("");
                              }}
                              accessibilityLabel="Cancel"
                            >
                              <Ionicons name="close" size={18} color={o.onPill} />
                            </Tap>
                          </View>
                        </View>
                      </View>
                    ) : (
                      <Pressable
                        className="mb-4 h-44 w-[48%] items-center justify-center rounded-2xl border-2 border-dashed border-slate-300"
                        style={{ borderRadius: 20, borderColor: o.orbit }}
                        onPress={() => setIsAddingLocation(true)}
                      >
                        <Ionicons name="add-circle-outline" size={28} color={o.faint} />
                        <Text className="mt-2 text-sm font-semibold text-slate-400" style={{ color: o.faint }}>
                          Add location
                        </Text>
                      </Pressable>
                    ))}
                </View>
              </ScrollView>
            ) : (
              <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 120 }}
                showsVerticalScrollIndicator={false}
              >
                {groupedItems.length === 0 ? (
                  <View className="items-center rounded-2xl border border-slate-200 bg-white px-6 py-16" style={{ ...card, backgroundColor: "transparent", borderStyle: "dashed", paddingVertical: 40 }}>
                    <Ionicons name="file-tray-outline" size={42} color={o.faint} />
                    <Text className="mt-4 text-lg font-bold text-slate-900" style={{ color: o.text }}>Pantry is empty</Text>
                    <Text className="mt-2 text-center text-slate-500" style={{ color: o.muted }}>Add items to get started.</Text>
                  </View>
                ) : (
                  groupedItems.map((group) => {
                    const isCollapsed = !expandedLocations.has(group.id);
                    return (
                      <View key={group.id} className="mb-2">
                        <Pressable
                          className="mb-2.5 flex-row items-center justify-between py-1.5"
                          onPress={() => toggleLocation(group.id)}
                        >
                          <Text className="text-xs font-bold uppercase tracking-widest text-slate-400" style={{ ...eyebrow, marginLeft: 4 }}>
                            {group.name}
                            <Text className="font-semibold text-slate-300" style={{ color: o.orbit }}> · {group.items.length}</Text>
                          </Text>
                          <Ionicons
                            name={isCollapsed ? "chevron-forward" : "chevron-down"}
                            size={16}
                            color={o.faint}
                          />
                        </Pressable>

                        {!isCollapsed && group.items.map((pantryItem) => {
                          const ingName = getIngredientName(pantryItem);
                          const daysUntilExpiry = daysUntil(pantryItem.expiryDate);
                          const expiryState =
                            daysUntilExpiry == null ? null :
                            daysUntilExpiry < 0 ? "expired" :
                            daysUntilExpiry <= 7 ? "soon" : "ok";

                          return (
                            <PantryItemCard
                              key={pantryItem._id}
                              pantryItemId={pantryItem._id}
                              ingredientName={ingName}
                              quantityAvailable={pantryItem.quantityAvailable}
                              quantityUnit={pantryItem.quantityUnit}
                              storageLocationName={getReferenceName(pantryItem.storageLocation)}
                              purchaseDate={pantryItem.purchaseDate}
                              expiryDate={pantryItem.expiryDate}
                              purchasePrice={pantryItem.purchasePrice}
                              storeName={getReferenceName(pantryItem.store)}
                              notes={pantryItem.notes}
                              busy={busyPantryItemId === pantryItem._id}
                              rightBadge={
                                expiryState === "expired" ? (
                                  <View className="mr-3 rounded-full bg-red-100 px-2.5 py-1" style={{ backgroundColor: tint("#FEE2E2", "rgba(248,113,113,0.16)") }}>
                                    <Text className="text-xs font-semibold text-red-600" style={{ color: o.danger }}>Expired</Text>
                                  </View>
                                ) : expiryState === "soon" ? (
                                  <View className="mr-3 rounded-full bg-amber-100 px-2.5 py-1" style={{ backgroundColor: tint("#FEF3C7", "rgba(251,191,36,0.16)") }}>
                                    <Text className="text-xs font-semibold text-amber-600" style={{ color: o.warning }}>
                                      {daysUntilExpiry === 0 ? "Today" : `${daysUntilExpiry}d`}
                                    </Text>
                                  </View>
                                ) : undefined
                              }
                              onEdit={() =>
                                router.push({ pathname: "/pantry/edit/[id]", params: { id: pantryItem._id } })
                              }
                              onDelete={() => handleDeletePantryEntry(pantryItem._id)}
                              onSubtract={() => void handleQuantityDelta(pantryItem, -1)}
                              onAdd={() => void handleQuantityDelta(pantryItem, 1)}
                              onSplit={() => setSplittingItem(pantryItem)}
                            />
                          );
                        })}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            )}
          </View>

          {/* 
          Page 2: All ingredients list 
          */}
          <View style={{ width: screenWidth }} className="flex-1">
            <View className="px-5 pt-24">
              <View className="flex-row items-center">
                <Text className="flex-1 text-3xl font-bold text-slate-950" style={title}>
                  All Your Ingredients
                </Text>
                {expandedCategories.size > 0 && (
                  <Tap
                    style={pillButton}
                    pressedStyle={{ opacity: 0.7 }}
                    onPress={() => setExpandedCategories(new Set())}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: o.onPill }}>
                      Collapse all
                    </Text>
                  </Tap>
                )}
              </View>

              <Text className="mt-1 text-base text-slate-500" style={{ marginTop: 2, fontSize: 14, color: o.muted }}>
                Your list — search to add more from the food library
              </Text>

              <View className="mt-3 flex-row items-center">
                <View className="h-2 w-2 rounded-full bg-slate-300" style={{ backgroundColor: o.orbit }} />
                <View className="ml-2 h-2 w-6 rounded-full bg-blue-600" style={{ backgroundColor: o.ink }} />
                <View className="ml-2 h-2 w-2 rounded-full bg-slate-300" style={{ backgroundColor: o.orbit }} />
                <Text className="ml-3 text-xs font-medium text-slate-400" style={{ color: o.faint }}>
                  Swipe for pantry or meal preps
                </Text>
              </View>
            </View>

            <ScrollView
              className="flex-1"
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 24,
                paddingBottom: 120,
              }}
              showsVerticalScrollIndicator={false}
            >
              {filteredIngredients.length === 0 ? (
                <View className="items-center rounded-2xl border border-slate-200 bg-white px-6 py-16" style={{ ...card, backgroundColor: "transparent", borderStyle: "dashed", paddingVertical: 40 }}>
                  <Ionicons
                    name="nutrition-outline"
                    size={42}
                    color={o.faint}
                  />

                  <Text className="mt-4 text-lg font-bold text-slate-900" style={{ color: o.text }}>
                    No ingredients yet
                  </Text>

                  <Text className="mt-2 text-center text-slate-500" style={{ color: o.muted }}>
                    Search to add foods from the food library, or add your own.
                  </Text>
                </View>
              ) : (
                groupedIngredients.map((group) => {
                  const isCollapsed = !expandedCategories.has(group.category);
                  return (
                  <View key={group.category} className="mb-3">
                    <Pressable
                      className="mb-2.5 flex-row items-center justify-between py-1.5"
                      onPress={() => toggleCategory(group.category)}
                    >
                      <Text className="text-xs font-bold uppercase tracking-widest text-slate-400" style={{ ...eyebrow, marginLeft: 4 }}>
                        {group.category}
                        <Text className="font-semibold text-slate-300" style={{ color: o.orbit }}> · {group.items.length}</Text>
                      </Text>
                      <Ionicons
                        name={isCollapsed ? "chevron-forward" : "chevron-down"}
                        size={16}
                        color={o.faint}
                      />
                    </Pressable>

                    {!isCollapsed &&
                      buildIngredientTree(group.items).map(
                        ({ parent, children }) => (
                          <View key={parent._id}>
                            {renderIngredientCard(parent)}

                            {children.length > 0 && (
                              <View className="mb-1 ml-6 border-l-2 border-slate-100 pl-4" style={{ borderLeftColor: o.border }}>
                                {children.map((child) => renderIngredientCard(child, true))}
                              </View>
                            )}
                          </View>
                        ),
                      )}
                  </View>
                  );
                })
              )}
            </ScrollView>
          </View>

          {/* Page 3: Meal preps — finished dishes you reheat/eat directly */}
          <View style={{ width: screenWidth }} className="flex-1">
            <View className="px-5 pt-24">
              <View className="flex-row items-center">
                <Text className="flex-1 text-3xl font-bold text-slate-950" style={title}>
                  Meal Preps
                </Text>
                {expandedMealPrepCategories.size > 0 && (
                  <Tap
                    style={pillButton}
                    pressedStyle={{ opacity: 0.7 }}
                    onPress={() => setExpandedMealPrepCategories(new Set())}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: o.onPill }}>
                      Collapse all
                    </Text>
                  </Tap>
                )}
              </View>

              <Text className="mt-1 text-base text-slate-500" style={{ marginTop: 2, fontSize: 14, color: o.muted }}>
                Batches you&apos;ve made ahead, ready to reheat
              </Text>

              <View className="mt-3 flex-row items-center">
                <View className="h-2 w-2 rounded-full bg-slate-300" style={{ backgroundColor: o.orbit }} />
                <View className="ml-2 h-2 w-2 rounded-full bg-slate-300" style={{ backgroundColor: o.orbit }} />
                <View className="ml-2 h-2 w-6 rounded-full bg-blue-600" style={{ backgroundColor: o.ink }} />
                <Text className="ml-3 text-xs font-medium text-slate-400" style={{ color: o.faint }}>
                  Swipe right for ingredients
                </Text>
              </View>
            </View>

            <ScrollView
              className="flex-1"
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 24,
                paddingBottom: 120,
              }}
              showsVerticalScrollIndicator={false}
            >
              {groupedMealPreps.length === 0 ? (
                <View className="items-center rounded-2xl border border-slate-200 bg-white px-6 py-16" style={{ ...card, backgroundColor: "transparent", borderStyle: "dashed", paddingVertical: 40 }}>
                  <Ionicons
                    name="flask-outline"
                    size={42}
                    color={o.faint}
                  />

                  <Text className="mt-4 text-lg font-bold text-slate-900" style={{ color: o.text }}>
                    No meal preps yet
                  </Text>

                  <Text className="mt-2 text-center text-slate-500" style={{ color: o.muted }}>
                    Mark a recipe&apos;s &quot;Prepares&quot; section as &quot;Meal prep&quot; and cook a batch to see it here.
                  </Text>
                </View>
              ) : (
                groupedMealPreps.map((group) => {
                  const isCollapsed = !expandedMealPrepCategories.has(group.category);
                  return (
                  <View key={group.category} className="mb-3">
                    <Pressable
                      className="mb-2.5 flex-row items-center justify-between py-1.5"
                      onPress={() => toggleMealPrepCategory(group.category)}
                    >
                      <Text className="text-xs font-bold uppercase tracking-widest text-slate-400" style={{ ...eyebrow, marginLeft: 4 }}>
                        {group.category}
                        <Text className="font-semibold text-slate-300" style={{ color: o.orbit }}> · {group.items.length}</Text>
                      </Text>
                      <Ionicons
                        name={isCollapsed ? "chevron-forward" : "chevron-down"}
                        size={16}
                        color={o.faint}
                      />
                    </Pressable>

                    {!isCollapsed &&
                      buildIngredientTree(group.items).map(
                        ({ parent, children }) => (
                          <View key={parent._id}>
                            {renderIngredientCard(parent)}

                            {children.length > 0 && (
                              <View className="mb-1 ml-6 border-l-2 border-slate-100 pl-4" style={{ borderLeftColor: o.border }}>
                                {children.map((child) => renderIngredientCard(child, true))}
                              </View>
                            )}
                          </View>
                        ),
                      )}
                  </View>
                  );
                })
              )}
            </ScrollView>
          </View>

        </ScrollView>

        {isSearchActive && (
          <Pressable
            className="absolute inset-0 z-10 bg-black/30"
            style={{ backgroundColor: o.scrim }}
            onPress={closeSearch}
          />
        )}

        {/* Search bar stays fixed above both pages */}
        <View
          className={`absolute left-4 right-4 top-3 z-20 overflow-hidden rounded-3xl bg-white shadow-lg ${
            isSearchActive ? "bottom-4" : ""
          }`}
          style={{ backgroundColor: o.surface, borderWidth: 1, borderColor: o.border }}
        >
          <View className="flex-row items-center p-3">
            <View className="h-12 flex-1 flex-row items-center rounded-2xl bg-slate-100 px-4" style={{ backgroundColor: o.pill, borderRadius: 16 }}>
              <Ionicons name="search-outline" size={20} color={o.muted} />

              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                onFocus={() => setIsSearchActive(true)}
                placeholder={
                  activePage === "pantry"
                    ? "Search entire pantry"
                    : activePage === "mealPreps"
                      ? "Search meal preps"
                      : "Search ingredients and the food library"
                }
                placeholderTextColor={o.faint}
                className="ml-3 flex-1 text-base text-slate-900"
                style={{ color: o.text }}
              />

              {searchText.length > 0 && (
                <Pressable onPress={() => setSearchText("")}>
                  <Ionicons name="close-circle" size={21} color={o.faint} />
                </Pressable>
              )}
            </View>

            <Tap
              style={{ marginLeft: 12, width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: o.ink }}
              pressedStyle={{ opacity: 0.8 }}
              accessibilityLabel="Add"
              onPress={() => {
                if (activePage === "pantry") {
                  setPantryAddMenuVisible(true);
                  return;
                }
                setAddMenuVisible(true);
              }}
            >
              <Ionicons name="add" size={28} color={o.onInk} />
            </Tap>
          </View>

          {isSearchActive && (
            <View className="flex-1 border-t border-slate-100 px-4 pb-4" style={{ borderTopColor: o.border }}>
              <View className="flex-row items-center justify-between py-3">
                <Text className="text-lg font-bold text-slate-900" style={{ color: o.text }}>
                  {activePage === "pantry"
                    ? "Pantry"
                    : activePage === "mealPreps"
                      ? "Meal preps"
                      : "Your ingredients"}
                </Text>

                <Pressable onPress={closeSearch}>
                  <Text className="font-semibold text-blue-700" style={{ color: o.accent }}>Cancel</Text>
                </Pressable>
              </View>

              {activePage === "pantry" ? (
                <FlatList
                  data={groupedItems}
                  keyExtractor={(group) => group.id}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item: group }) => (
                    <View className="mb-5">
                      <Text className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500" style={{ ...eyebrow, marginLeft: 4 }}>
                        {group.name}
                      </Text>

                      {group.items.map((pantryItem) => (
                        <Tap
                          key={pantryItem._id}
                          style={{ marginBottom: 8, flexDirection: "row", alignItems: "center", borderRadius: 16, padding: 12, backgroundColor: o.canvas }}
                          pressedStyle={{ backgroundColor: o.pill }}
                          onPress={() => {
                            closeSearch();
                            router.push({
                              pathname: "/pantry/edit/[id]",
                              params: { id: pantryItem._id },
                            });
                          }}
                        >
                          <View className="h-11 w-11 items-center justify-center rounded-full bg-blue-50" style={{ backgroundColor: o.pill }}>
                            <Ionicons
                              name="nutrition-outline"
                              size={20}
                              color={o.onPill}
                            />
                          </View>

                          <View className="ml-3 flex-1">
                            <Text className="font-semibold text-slate-900" style={{ color: o.text }}>
                              {getIngredientName(pantryItem)}
                            </Text>

                            <Text className="mt-0.5 text-sm text-slate-500" style={{ color: o.muted }}>
                              {pantryItem.quantityAvailable}{" "}
                              {pantryItem.quantityUnit}
                            </Text>
                          </View>

                          <Ionicons
                            name="chevron-forward"
                            size={18}
                            color={o.faint}
                          />
                        </Tap>
                      ))}
                    </View>
                  )}
                  ListEmptyComponent={
                    <View className="items-center px-6 py-16">
                      <Ionicons name="search-outline" size={42} color={o.faint} />
                      <Text className="mt-4 text-lg font-bold text-slate-900" style={{ color: o.text }}>
                        No pantry items found
                      </Text>
                      <Text className="mt-2 text-center text-slate-500" style={{ color: o.muted }}>
                        Try a different ingredient name, category, or location.
                      </Text>
                    </View>
                  }
                />
              ) : (
                <FlatList
                  data={activePage === "mealPreps" ? filteredMealPreps : searchedIngredients}
                  keyExtractor={(ing) => ing._id}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item: ingredient }) => {
                    const categoryName =
                      typeof ingredient.category === "object" &&
                      ingredient.category !== null
                        ? (ingredient.category.name ?? "")
                        : "";

                    const brandName =
                      typeof ingredient.brand === "object" &&
                      ingredient.brand !== null
                        ? (ingredient.brand.name ?? "")
                        : "";

                    return (
                      <Tap
                        style={{ marginBottom: 8, flexDirection: "row", alignItems: "center", borderRadius: 16, padding: 12, backgroundColor: o.canvas }}
                        pressedStyle={{ backgroundColor: o.pill }}
                        onPress={() => {
                          closeSearch();
                          router.push({
                            pathname: "/ingredients/edit/[id]",
                            params: { id: ingredient._id },
                          });
                        }}
                      >
                        <View className="h-11 w-11 items-center justify-center rounded-full bg-blue-50" style={{ backgroundColor: o.pill }}>
                          <Ionicons
                            name="nutrition-outline"
                            size={20}
                            color={o.onPill}
                          />
                        </View>

                        <View className="ml-3 flex-1">
                          <Text
                            className="font-semibold text-slate-900"
                            style={{ color: o.text }}
                            numberOfLines={1}
                          >
                            {ingredient.name}
                          </Text>

                          {ingredient.productionRecipe ? (
                            <Text className="mt-0.5 text-sm font-medium text-blue-600" style={{ color: prepared.color }}>
                              Prepared{ingredient.isGeneric ? " · Generic" : ""}
                            </Text>
                          ) : ingredient.isGeneric ? (
                            <Text className="mt-0.5 text-sm font-medium text-violet-600" style={{ color: generic.color }}>
                              Generic
                            </Text>
                          ) : (
                            <Text className="mt-0.5 text-sm text-slate-500" style={{ color: o.muted }}>
                              {[brandName, categoryName].filter(Boolean).join(" · ")}
                            </Text>
                          )}
                        </View>

                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={o.faint}
                        />
                      </Tap>
                    );
                  }}
                  ListFooterComponent={activePage === "ingredients" ? renderLibraryResults() : null}
                  ListEmptyComponent={
                    activePage === "ingredients" && (libraryLoading || moreFromLibrary.length > 0) ? null : (
                      <View className="items-center px-6 py-16">
                        <Ionicons name="search-outline" size={42} color={o.faint} />
                        <Text className="mt-4 text-lg font-bold text-slate-900" style={{ color: o.text }}>
                          No ingredients found
                        </Text>
                        <Text className="mt-2 text-center text-slate-500" style={{ color: o.muted }}>
                          Try searching by name, brand, or category.
                        </Text>
                      </View>
                    )
                  }
                />
              )}
            </View>
          )}
        </View>
      </View>

      <Modal
        visible={addMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddMenuVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/30" style={{ backgroundColor: o.scrim }}>
          <Pressable
            className="absolute inset-0"
            onPress={() => setAddMenuVisible(false)}
          />

          <View className="rounded-t-[32px] bg-white px-5 pb-10 pt-4" style={{ backgroundColor: o.canvas, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10 }}>
            <View className="mb-5 self-center h-1.5 w-12 rounded-full bg-slate-300" style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: o.track, marginBottom: 18 }} />

            <Text className="text-2xl font-bold text-slate-950" style={{ fontSize: 22, fontWeight: "800", letterSpacing: -0.3, color: o.text }}>
              Add ingredient
            </Text>

            <Text className="mt-1 text-base text-slate-500" style={{ fontSize: 14, color: o.muted }}>
              Choose how you would like to create a new ingredient.
            </Text>

            <Tap
              style={{ ...card, marginTop: 24, flexDirection: "row", alignItems: "center", padding: 16 }}
              pressedStyle={{ backgroundColor: o.pill }}
              onPress={() => {
                setAddMenuVisible(false);
                router.push("/ingredients/add_manual");
              }}
            >
              <View className="h-14 w-14 items-center justify-center rounded-full bg-blue-50" style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: o.pill }}>
                <Ionicons name="create-outline" size={23} color={o.onPill} />
              </View>

              <View className="ml-4 flex-1">
                <Text className="text-lg font-bold text-slate-900" style={{ fontSize: 16, fontWeight: "700", color: o.text }}>
                  Add manually
                </Text>

                <Text className="mt-1 text-sm leading-5 text-slate-500" style={{ marginTop: 2, fontSize: 13, color: o.muted }}>
                  Enter the ingredient details, brand, category, and nutrition
                  information.
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={20} color={o.faint} />
            </Tap>

            <Tap
              style={{ ...card, marginTop: 12, flexDirection: "row", alignItems: "center", padding: 16 }}
              pressedStyle={{ backgroundColor: o.pill }}
              onPress={() => {
                setAddMenuVisible(false);
                setScanContext("ingredient");
                setScannerVisible(true);
              }}
            >
              <View className="h-14 w-14 items-center justify-center rounded-full bg-blue-50" style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: o.pill }}>
                <Ionicons name="barcode-outline" size={25} color={o.onPill} />
              </View>

              <View className="ml-4 flex-1">
                <Text className="text-lg font-bold text-slate-900" style={{ fontSize: 16, fontWeight: "700", color: o.text }}>
                  Scan barcode
                </Text>

                <Text className="mt-1 text-sm leading-5 text-slate-500" style={{ marginTop: 2, fontSize: 13, color: o.muted }}>
                  Scan a packaged product to fill in its information.
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={20} color={o.faint} />
            </Tap>

            <Tap
              style={{ marginTop: 20, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: o.pill }}
              pressedStyle={{ opacity: 0.7 }}
              onPress={() => setAddMenuVisible(false)}
            >
              <Text style={{ fontSize: 16, fontWeight: "600", color: o.onPill }}>
                Cancel
              </Text>
            </Tap>
          </View>
        </View>
      </Modal>

      {/* Pantry add menu */}
      <Modal
        visible={pantryAddMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPantryAddMenuVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/30" style={{ backgroundColor: o.scrim }}>
          <Pressable
            className="absolute inset-0"
            onPress={() => setPantryAddMenuVisible(false)}
          />

          <View className="rounded-t-[32px] bg-white px-5 pb-10 pt-4" style={{ backgroundColor: o.canvas, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10 }}>
            <View className="mb-5 self-center h-1.5 w-12 rounded-full bg-slate-300" style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: o.track, marginBottom: 18 }} />

            <Text className="text-2xl font-bold text-slate-950" style={{ fontSize: 22, fontWeight: "800", letterSpacing: -0.3, color: o.text }}>Add pantry item</Text>
            <Text className="mt-1 text-base text-slate-500" style={{ fontSize: 14, color: o.muted }}>
              Choose how you would like to add an item.
            </Text>

            <Tap
              style={{ ...card, marginTop: 24, flexDirection: "row", alignItems: "center", padding: 16 }}
              pressedStyle={{ backgroundColor: o.pill }}
              onPress={() => {
                setPantryAddMenuVisible(false);
                router.push("/pantry/add_by_ingredient");
              }}
            >
              <View className="h-14 w-14 items-center justify-center rounded-full bg-blue-50" style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: o.pill }}>
                <Ionicons name="create-outline" size={23} color={o.onPill} />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-lg font-bold text-slate-900" style={{ fontSize: 16, fontWeight: "700", color: o.text }}>Add manually</Text>
                <Text className="mt-1 text-sm leading-5 text-slate-500" style={{ marginTop: 2, fontSize: 13, color: o.muted }}>
                  Search or create an ingredient and set the quantity.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={o.faint} />
            </Tap>

            <Tap
              style={{ ...card, marginTop: 12, flexDirection: "row", alignItems: "center", padding: 16 }}
              pressedStyle={{ backgroundColor: o.pill }}
              onPress={() => {
                setPantryAddMenuVisible(false);
                setScanContext("pantry");
                setScannerVisible(true);
              }}
            >
              <View className="h-14 w-14 items-center justify-center rounded-full bg-blue-50" style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: o.pill }}>
                <Ionicons name="barcode-outline" size={25} color={o.onPill} />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-lg font-bold text-slate-900" style={{ fontSize: 16, fontWeight: "700", color: o.text }}>Scan barcode</Text>
                <Text className="mt-1 text-sm leading-5 text-slate-500" style={{ marginTop: 2, fontSize: 13, color: o.muted }}>
                  Scan a product barcode to fill in its details.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={o.faint} />
            </Tap>

            <Tap
              style={{ ...card, marginTop: 12, flexDirection: "row", alignItems: "center", padding: 16 }}
              pressedStyle={{ backgroundColor: o.pill }}
              onPress={() => {
                setPantryAddMenuVisible(false);
                setReceiptScannerVisible(true);
              }}
            >
              <View className="h-14 w-14 items-center justify-center rounded-full bg-blue-50" style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: o.pill }}>
                <Ionicons name="receipt-outline" size={23} color={o.onPill} />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-lg font-bold text-slate-900" style={{ fontSize: 16, fontWeight: "700", color: o.text }}>Scan receipt</Text>
                <Text className="mt-1 text-sm leading-5 text-slate-500" style={{ marginTop: 2, fontSize: 13, color: o.muted }}>
                  Photograph a receipt to auto-match or add ingredients and pantry items.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={o.faint} />
            </Tap>

            <Tap
              style={{ marginTop: 20, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: o.pill }}
              pressedStyle={{ opacity: 0.7 }}
              onPress={() => setPantryAddMenuVisible(false)}
            >
              <Text style={{ fontSize: 16, fontWeight: "600", color: o.onPill }}>Cancel</Text>
            </Tap>
          </View>
        </View>
      </Modal>

      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onProductFound={async (product: ScannedProduct) => {
          setScannerVisible(false);

          const scannedParams = {
            scannedName: product.name,
            scannedBarcode: product.barcode,
            scannedBrand: product.brand ?? "",
            scannedQuantity: product.packageQuantity != null ? String(product.packageQuantity) : "",
            scannedQuantityUnit: product.packageUnit ?? "",
            // Omitted (not just "") when the serving is only an estimated
            // 100g/100ml reference, not a real one — add_manual.tsx reads
            // its absence as "leave the default-portion field blank".
            ...(product.servingIsEstimated ? {} : { scannedServingSize: String(product.servingSize) }),
            scannedServingUnit: product.servingUnit,
            // One JSON param for every nutrient (core and extended) rather
            // than one string param each — add_manual.tsx parses it back.
            ...(product.nutrition ? { scannedNutrition: JSON.stringify(product.nutrition) } : {}),
          };

          // The server's answer, not just this page's list: the list doesn't
          // hold every shared product. One it brings is added to the list.
          const match = await findIngredientByBarcode(ingredients, product.barcode);
          if (match && !ingredients.some((i) => i._id === match._id)) {
            setIngredients((prev) => (prev.some((i) => i._id === match._id) ? prev : [...prev, match]));
          }

          if (scanContext === "pantry") {
            if (match) {
              // Putting a shared product in the pantry puts it in your
              // ingredients (and so in the list the next screen loads).
              if (!inMyIngredients(match)) {
                await saveIngredient(match._id).catch(() => undefined);
                setIngredients((prev) => withSaved(prev, match, true));
              }
              router.push({
                pathname: "/pantry/add_by_ingredient",
                params: {
                  ingredientId: match._id,
                  // The real scanned package amount (from OFF's
                  // product_quantity, a reliable field — unlike
                  // servingSize/serving_quantity, see servingIsEstimated)
                  // so the quantity form defaults to "how much is in this
                  // bottle" instead of the ingredient's own single-serving
                  // default.
                  ...(product.packageQuantity != null
                    ? { scannedQuantity: String(product.packageQuantity), scannedQuantityUnit: product.packageUnit ?? "" }
                    : {}),
                },
              });
            } else {
              Alert.alert(
                "No ingredient found",
                `"${product.name}" isn't in your ingredient catalog yet. You'll be taken to create it first.`,
                [{
                  text: "Continue",
                  onPress: () => router.push({ pathname: "/ingredients/add_manual", params: scannedParams }),
                }],
              );
            }
            return;
          }

          // Scanning while adding a new ingredient — check for an existing
          // match *before* navigating anywhere, so a duplicate never briefly
          // flashes the "create new" screen behind the alert.
          if (match) {
            const viewIngredient = {
              text: "View ingredient",
              onPress: () =>
                router.push({
                  pathname: "/ingredients/edit/[id]",
                  params: { id: match._id },
                }),
            };
            // A shared product not in your list yet: offered to it, rather
            // than made again.
            if (!inMyIngredients(match)) {
              Alert.alert(
                "Already in the catalog",
                `"${match.name}" is already an ingredient, but not one of yours yet.`,
                [
                  { text: "Cancel", style: "cancel" },
                  viewIngredient,
                  {
                    text: "Add to my ingredients",
                    onPress: () => {
                      setIngredients((prev) => withSaved(prev, match, true));
                      saveIngredient(match._id).catch((error: unknown) => {
                        setIngredients((prev) => withSaved(prev, match, false));
                        Alert.alert("Couldn't add it", error instanceof Error ? error.message : "Something went wrong.");
                      });
                    },
                  },
                ],
              );
              return;
            }
            Alert.alert(
              "Already in your catalog",
              `"${match.name}" is already an ingredient.`,
              [{ text: "Cancel", style: "cancel" }, viewIngredient],
            );
            return;
          }

          router.push({ pathname: "/ingredients/add_manual", params: scannedParams });
        }}
      />

      <ReceiptScannerModal
        visible={receiptScannerVisible}
        onClose={() => setReceiptScannerVisible(false)}
        onCaptured={(photoUri) => {
          setReceiptScannerVisible(false);
          // Here, or saved for the desktop (see chooseReceiptReview).
          chooseReceiptReview(photoUri, {
            busy: setParsingReceipt,
            reviewNow: () => {
              setParsingReceipt(true);

              parseReceipt(photoUri)
                .then((result) => {
                  // A fresh scan supersedes any unfinished review still saved on
                  // disk — otherwise the review screen would ignore this new
                  // result and resume the stale draft instead.
                  void clearReviewDraft();
                  setPendingReceipt(result);
                  router.push("/receipts/review");
                })
                .catch((error) => {
                  Alert.alert(
                    "Couldn't read receipt",
                    error instanceof Error ? error.message : "Something went wrong parsing the receipt.",
                  );
                })
                .finally(() => setParsingReceipt(false));
            },
          });
        }}
      />

      <Modal visible={parsingReceipt} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/50" style={{ backgroundColor: o.scrim }}>
          <View className="items-center rounded-3xl bg-white px-8 py-6" style={{ backgroundColor: o.surface }}>
            <ActivityIndicator size="large" color={o.muted} />
            <Text className="mt-3 text-base font-semibold text-slate-700" style={{ color: o.text }}>
              Reading receipt...
            </Text>
          </View>
        </View>
      </Modal>

      <SplitPantryItemModal
        visible={!!splittingItem}
        item={splittingItem}
        ingredientName={splittingItem ? getIngredientName(splittingItem) : ""}
        storageLocations={storageLocations}
        onClose={() => setSplittingItem(null)}
        onSplit={handleSplitComplete}
      />
    </SafeAreaView>
    </OrbitPage>
  );
}
