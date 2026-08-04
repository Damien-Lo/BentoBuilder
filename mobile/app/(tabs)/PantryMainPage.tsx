import { useCallback, useMemo, useRef, useState } from "react";
import {
  BarcodeScannerModal,
  type ScannedProduct,
} from "@/src/components/BarcodeScannerModal";
import { ReceiptScannerModal } from "@/src/components/ReceiptScannerModal";
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
  useWindowDimensions,
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
  type Ingredient,
} from "@/src/services/ingredientApi";

import { deletePantryItem, getPantryItems, updatePantryItem } from "@/src/services/pantryApi";
import { PantryItemCard } from "@/src/components/pantry/PantryItemCard";
import { SplitPantryItemModal } from "@/src/components/pantry/SplitPantryItemModal";
import type { PantryItem } from "@/src/types/pantry";
import { barcodesMatch } from "@/src/utils/barcode";
import { loadSettings } from "@/src/services/settingsService";
import { convertUnits, getIngredientConversions, type CustomUnitConversion } from "@/src/utils/unitConversion";
import { daysUntil } from "@/src/utils/date";

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
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const [addMenuVisible, setAddMenuVisible] = useState(false);
  const [pantryAddMenuVisible, setPantryAddMenuVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanContext, setScanContext] = useState<"ingredient" | "pantry">("ingredient");
  const [receiptScannerVisible, setReceiptScannerVisible] = useState(false);
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
    const stats = new Map<string, { total: number; variantCount: number }>();

    for (const ingredient of ingredients) {
      const parentId = getReferenceId(ingredient.genericParent as unknown);
      if (!parentId) continue;

      const entry = stats.get(parentId) ?? { total: 0, variantCount: 0 };
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
      if (!parent || !parent.defaultPortionUnit) continue;

      const converted = convertUnits(
        Number(pantryItem.quantityAvailable ?? 0),
        pantryItem.quantityUnit,
        parent.defaultPortionUnit,
        getIngredientConversions(itemIngredient, customUnitConversions, ingredients),
      );
      if (converted == null) continue;

      const entry = stats.get(parentId) ?? { total: 0, variantCount: 0 };
      entry.total += converted;
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
  const browsableIngredients = useMemo(
    () => ingredients.filter((ingredient) => !ingredient.isMealPrep),
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

  const closeSearch = () => {
    Keyboard.dismiss();
    setIsSearchActive(false);
    setSearchText("");
  };

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

    const deleteAction = (
      <Pressable
        className={`items-center justify-center rounded-2xl bg-red-500 active:bg-red-600 ${
          isChild ? "mb-2 w-16" : "mb-2.5 w-20"
        }`}
        onPress={() => handleDeleteIngredient(ingredientItem._id, ingredientItem.name)}
      >
        <Ionicons name="trash-outline" size={isChild ? 18 : 22} color="white" />
      </Pressable>
    );

    // Both levels use the same compact "dot + quantity" status treatment —
    // hierarchy comes from the icon, indent, and Generic badge instead of
    // repeating "In stock" text at every level.
    const stockValue = (
      <View className="flex-row items-center">
        <View className={`mr-2 h-2 w-2 rounded-full ${statusDotColor}`} />
        <Text
          className={`text-sm font-medium ${isAlwaysAvailable ? "text-blue-600" : "text-slate-600"}`}
        >
          {isAlwaysAvailable
            ? "Always available"
            : isInStock
              ? `${Math.round(totalQuantity * 100) / 100} ${displayUnit ?? ""}`.trim()
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
          <Pressable
            className="mb-2 flex-row items-center rounded-2xl border border-slate-100 bg-white px-3.5 py-2.5 active:bg-slate-50"
            onPress={() => {
              router.push({
                pathname: "/ingredients/edit/[id]",
                params: { id: ingredientItem._id },
              });
            }}
          >
            <View className="flex-1">
              <View className="flex-row flex-wrap items-center">
                <Text className="text-sm font-semibold text-slate-800" numberOfLines={1}>
                  {ingredientItem.name}
                </Text>
                {ingredientItem.productionRecipe && (
                  <View className="ml-2 rounded-full bg-blue-50 px-2 py-0.5">
                    <Text className="text-[10px] font-bold uppercase tracking-wide text-blue-600">
                      Prepared
                    </Text>
                  </View>
                )}
              </View>
              {subtitle ? (
                <Text className="mt-0.5 text-xs text-slate-400" numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>

            {stockValue}

            <Ionicons name="chevron-forward" size={16} color="#CBD5E1" style={{ marginLeft: 8 }} />
          </Pressable>
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
        <Pressable
          className="mb-2.5 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4 py-3"
          onPress={() => {
            router.push({
              pathname: "/ingredients/edit/[id]",
              params: { id: ingredientItem._id },
            });
          }}
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-blue-50">
            <Ionicons name="nutrition-outline" size={18} color="#2563EB" />
          </View>

          <View className="ml-3 flex-1">
            <View className="flex-row flex-wrap items-center">
              <Text
                className="text-base font-bold text-slate-900"
                numberOfLines={1}
              >
                {ingredientItem.name}
              </Text>

              {ingredientItem.isGeneric && (
                <View className="ml-2 rounded-full bg-violet-50 px-2 py-0.5">
                  <Text className="text-[10px] font-bold uppercase tracking-wide text-violet-600">
                    Generic
                  </Text>
                </View>
              )}

              {ingredientItem.productionRecipe && (
                <View className="ml-2 rounded-full bg-blue-50 px-2 py-0.5">
                  <Text className="text-[10px] font-bold uppercase tracking-wide text-blue-600">
                    Prepared
                  </Text>
                </View>
              )}
            </View>

            {!ingredientItem.isGeneric &&
              (() => {
                const brandName = getReferenceName(ingredientItem.brand);
                const subtitle = [brandName, locationNames]
                  .filter(Boolean)
                  .join(" · ");
                return subtitle ? (
                  <Text
                    className="mt-1 text-sm text-slate-500"
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
            size={20}
            color="#94A3B8"
            style={{ marginLeft: 10 }}
          />
        </Pressable>
      </ReanimatedSwipeable>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" />
        <Text className="mt-3 text-slate-500">Loading pantry...</Text>
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
    <SafeAreaView className="flex-1 bg-slate-50">
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
                <Text className="flex-1 text-3xl font-bold text-slate-950">
                  Your Pantry
                </Text>
                {pantryViewMode === "locations" && (
                  <Pressable
                    className={`mr-2 h-10 items-center justify-center rounded-full px-3 ${
                      locationEditMode ? "bg-blue-600" : "bg-slate-100 active:bg-slate-200"
                    }`}
                    onPress={() => {
                      setLocationEditMode((v) => !v);
                      setIsAddingLocation(false);
                      setNewLocationName("");
                    }}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        locationEditMode ? "text-white" : "text-slate-600"
                      }`}
                    >
                      {locationEditMode ? "Done" : "Edit"}
                    </Text>
                  </Pressable>
                )}
                {pantryViewMode === "list" && expandedLocations.size > 0 && (
                  <Pressable
                    className="mr-2 h-10 items-center justify-center rounded-full bg-slate-100 px-3 active:bg-slate-200"
                    onPress={() => setExpandedLocations(new Set())}
                  >
                    <Text className="text-sm font-semibold text-slate-600">
                      Collapse all
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  className="mr-2 h-10 w-10 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200"
                  onPress={() => router.push("/grocery-list")}
                >
                  <Ionicons name="cart-outline" size={19} color="#475569" />
                </Pressable>
                <Pressable
                  className="h-10 w-10 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200"
                  onPress={() => {
                    setPantryViewMode((m) => m === "locations" ? "list" : "locations");
                    setLocationEditMode(false);
                    setIsAddingLocation(false);
                  }}
                >
                  <Ionicons
                    name={pantryViewMode === "locations" ? "list-outline" : "apps-outline"}
                    size={20}
                    color="#475569"
                  />
                </Pressable>
              </View>

              <Text className="mt-1 text-base text-slate-500">
                {pantryViewMode === "locations"
                  ? "Browse ingredients by storage location"
                  : "All pantry items grouped by location"}
              </Text>

              <View className="mt-3 flex-row items-center">
                <View className="h-2 w-6 rounded-full bg-blue-600" />
                <View className="ml-2 h-2 w-2 rounded-full bg-slate-300" />
                <View className="ml-2 h-2 w-2 rounded-full bg-slate-300" />
                <Text className="ml-3 text-xs font-medium text-slate-400">
                  Swipe left for ingredients
                </Text>
              </View>

              {expiredPantryItems.length > 0 && (
                <Pressable
                  className="mt-3 flex-row items-center rounded-2xl bg-red-50 px-4 py-3 active:bg-red-100"
                  onPress={revealExpiredItems}
                >
                  <Ionicons name="alert-circle" size={18} color="#DC2626" />
                  <Text className="ml-2.5 flex-1 text-sm font-semibold text-red-700">
                    {expiredPantryItems.length} {expiredPantryItems.length === 1 ? "item" : "items"}{" "}
                    expired
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color="#DC2626" />
                </Pressable>
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
                        <Pressable
                          disabled={locationEditMode}
                          className="h-44 justify-between rounded-2xl border border-slate-200 bg-white p-5"
                          onPress={() =>
                            router.push({ pathname: "/pantry/location/[id]", params: { id: locationId, name: location.name } })
                          }
                        >
                          <View className="h-11 w-11 items-center justify-center rounded-full bg-blue-50">
                            <Ionicons name="file-tray-stacked-outline" size={20} color="#2563EB" />
                          </View>
                          <View>
                            <Text className="text-lg font-bold text-slate-900">{location.name}</Text>
                            <Text className="mt-1 text-sm text-slate-500">
                              {itemCount} {itemCount === 1 ? "item" : "items"}
                            </Text>
                          </View>
                        </Pressable>

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
                      <View className="mb-4 h-44 w-[48%] justify-between rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 p-5">
                        <View className="h-11 w-11 items-center justify-center rounded-full bg-blue-100">
                          <Ionicons name="file-tray-stacked-outline" size={20} color="#2563EB" />
                        </View>
                        <View>
                          <TextInput
                            value={newLocationName}
                            onChangeText={setNewLocationName}
                            onSubmitEditing={() => void handleCreateLocation()}
                            autoFocus
                            placeholder="Location name"
                            placeholderTextColor="#94A3B8"
                            returnKeyType="done"
                            className="text-base font-bold text-slate-900"
                          />
                          <View className="mt-2 flex-row gap-2">
                            <Pressable
                              disabled={savingLocation}
                              className="h-8 w-8 items-center justify-center rounded-full bg-blue-600 active:bg-blue-700"
                              onPress={() => void handleCreateLocation()}
                            >
                              <Ionicons name="checkmark" size={18} color="white" />
                            </Pressable>
                            <Pressable
                              className="h-8 w-8 items-center justify-center rounded-full bg-white"
                              onPress={() => {
                                setIsAddingLocation(false);
                                setNewLocationName("");
                              }}
                            >
                              <Ionicons name="close" size={18} color="#475569" />
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    ) : (
                      <Pressable
                        className="mb-4 h-44 w-[48%] items-center justify-center rounded-2xl border-2 border-dashed border-slate-300"
                        onPress={() => setIsAddingLocation(true)}
                      >
                        <Ionicons name="add-circle-outline" size={28} color="#94A3B8" />
                        <Text className="mt-2 text-sm font-semibold text-slate-400">
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
                  <View className="items-center rounded-2xl border border-slate-200 bg-white px-6 py-16">
                    <Ionicons name="file-tray-outline" size={42} color="#94A3B8" />
                    <Text className="mt-4 text-lg font-bold text-slate-900">Pantry is empty</Text>
                    <Text className="mt-2 text-center text-slate-500">Add items to get started.</Text>
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
                          <Text className="text-xs font-bold uppercase tracking-widest text-slate-400">
                            {group.name}
                            <Text className="font-semibold text-slate-300"> · {group.items.length}</Text>
                          </Text>
                          <Ionicons
                            name={isCollapsed ? "chevron-forward" : "chevron-down"}
                            size={16}
                            color="#CBD5E1"
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
                              ingredientName={ingName}
                              quantityAvailable={pantryItem.quantityAvailable}
                              quantityUnit={pantryItem.quantityUnit}
                              busy={busyPantryItemId === pantryItem._id}
                              rightBadge={
                                expiryState === "expired" ? (
                                  <View className="mr-3 rounded-full bg-red-100 px-2.5 py-1">
                                    <Text className="text-xs font-semibold text-red-600">Expired</Text>
                                  </View>
                                ) : expiryState === "soon" ? (
                                  <View className="mr-3 rounded-full bg-amber-100 px-2.5 py-1">
                                    <Text className="text-xs font-semibold text-amber-600">
                                      {daysUntilExpiry === 0 ? "Today" : `${daysUntilExpiry}d`}
                                    </Text>
                                  </View>
                                ) : undefined
                              }
                              onPress={() =>
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
                <Text className="flex-1 text-3xl font-bold text-slate-950">
                  All Your Ingredients
                </Text>
                {expandedCategories.size > 0 && (
                  <Pressable
                    className="h-10 items-center justify-center rounded-full bg-slate-100 px-3 active:bg-slate-200"
                    onPress={() => setExpandedCategories(new Set())}
                  >
                    <Text className="text-sm font-semibold text-slate-600">
                      Collapse all
                    </Text>
                  </Pressable>
                )}
              </View>

              <Text className="mt-1 text-base text-slate-500">
                View every ingredient in one list
              </Text>

              <View className="mt-3 flex-row items-center">
                <View className="h-2 w-2 rounded-full bg-slate-300" />
                <View className="ml-2 h-2 w-6 rounded-full bg-blue-600" />
                <View className="ml-2 h-2 w-2 rounded-full bg-slate-300" />
                <Text className="ml-3 text-xs font-medium text-slate-400">
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
                <View className="items-center rounded-2xl border border-slate-200 bg-white px-6 py-16">
                  <Ionicons
                    name="nutrition-outline"
                    size={42}
                    color="#94A3B8"
                  />

                  <Text className="mt-4 text-lg font-bold text-slate-900">
                    No ingredients yet
                  </Text>

                  <Text className="mt-2 text-center text-slate-500">
                    Add an ingredient to start building your pantry.
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
                      <Text className="text-xs font-bold uppercase tracking-widest text-slate-400">
                        {group.category}
                        <Text className="font-semibold text-slate-300"> · {group.items.length}</Text>
                      </Text>
                      <Ionicons
                        name={isCollapsed ? "chevron-forward" : "chevron-down"}
                        size={16}
                        color="#CBD5E1"
                      />
                    </Pressable>

                    {!isCollapsed &&
                      buildIngredientTree(group.items).map(
                        ({ parent, children }) => (
                          <View key={parent._id}>
                            {renderIngredientCard(parent)}

                            {children.length > 0 && (
                              <View className="mb-1 ml-6 border-l-2 border-slate-100 pl-4">
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
                <Text className="flex-1 text-3xl font-bold text-slate-950">
                  Meal Preps
                </Text>
                {expandedMealPrepCategories.size > 0 && (
                  <Pressable
                    className="h-10 items-center justify-center rounded-full bg-slate-100 px-3 active:bg-slate-200"
                    onPress={() => setExpandedMealPrepCategories(new Set())}
                  >
                    <Text className="text-sm font-semibold text-slate-600">
                      Collapse all
                    </Text>
                  </Pressable>
                )}
              </View>

              <Text className="mt-1 text-base text-slate-500">
                Batches you&apos;ve made ahead, ready to reheat
              </Text>

              <View className="mt-3 flex-row items-center">
                <View className="h-2 w-2 rounded-full bg-slate-300" />
                <View className="ml-2 h-2 w-2 rounded-full bg-slate-300" />
                <View className="ml-2 h-2 w-6 rounded-full bg-blue-600" />
                <Text className="ml-3 text-xs font-medium text-slate-400">
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
                <View className="items-center rounded-2xl border border-slate-200 bg-white px-6 py-16">
                  <Ionicons
                    name="flask-outline"
                    size={42}
                    color="#94A3B8"
                  />

                  <Text className="mt-4 text-lg font-bold text-slate-900">
                    No meal preps yet
                  </Text>

                  <Text className="mt-2 text-center text-slate-500">
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
                      <Text className="text-xs font-bold uppercase tracking-widest text-slate-400">
                        {group.category}
                        <Text className="font-semibold text-slate-300"> · {group.items.length}</Text>
                      </Text>
                      <Ionicons
                        name={isCollapsed ? "chevron-forward" : "chevron-down"}
                        size={16}
                        color="#CBD5E1"
                      />
                    </Pressable>

                    {!isCollapsed &&
                      buildIngredientTree(group.items).map(
                        ({ parent, children }) => (
                          <View key={parent._id}>
                            {renderIngredientCard(parent)}

                            {children.length > 0 && (
                              <View className="mb-1 ml-6 border-l-2 border-slate-100 pl-4">
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
            onPress={closeSearch}
          />
        )}

        {/* Search bar stays fixed above both pages */}
        <View
          className={`absolute left-4 right-4 top-3 z-20 overflow-hidden rounded-3xl bg-white shadow-lg ${
            isSearchActive ? "bottom-4" : ""
          }`}
        >
          <View className="flex-row items-center p-3">
            <View className="h-12 flex-1 flex-row items-center rounded-2xl bg-slate-100 px-4">
              <Ionicons name="search-outline" size={21} color="#64748b" />

              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                onFocus={() => setIsSearchActive(true)}
                placeholder={
                  activePage === "pantry"
                    ? "Search entire pantry"
                    : activePage === "mealPreps"
                      ? "Search meal preps"
                      : "Search all ingredients"
                }
                placeholderTextColor="#94a3b8"
                className="ml-3 flex-1 text-base text-slate-900"
              />

              {searchText.length > 0 && (
                <Pressable onPress={() => setSearchText("")}>
                  <Ionicons name="close-circle" size={21} color="#94a3b8" />
                </Pressable>
              )}
            </View>

            <Pressable
              className="ml-3 h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 active:bg-blue-700"
              onPress={() => {
                if (activePage === "pantry") {
                  setPantryAddMenuVisible(true);
                  return;
                }
                setAddMenuVisible(true);
              }}
            >
              <Ionicons name="add" size={28} color="white" />
            </Pressable>
          </View>

          {isSearchActive && (
            <View className="flex-1 border-t border-slate-100 px-4 pb-4">
              <View className="flex-row items-center justify-between py-3">
                <Text className="text-lg font-bold text-slate-900">
                  {activePage === "pantry"
                    ? "Pantry"
                    : activePage === "mealPreps"
                      ? "Meal preps"
                      : "All ingredients"}
                </Text>

                <Pressable onPress={closeSearch}>
                  <Text className="font-semibold text-blue-700">Cancel</Text>
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
                      <Text className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                        {group.name}
                      </Text>

                      {group.items.map((pantryItem) => (
                        <Pressable
                          key={pantryItem._id}
                          className="mb-2 flex-row items-center rounded-2xl bg-slate-50 p-3"
                          onPress={() => {
                            closeSearch();
                            router.push({
                              pathname: "/pantry/edit/[id]",
                              params: { id: pantryItem._id },
                            });
                          }}
                        >
                          <View className="h-11 w-11 items-center justify-center rounded-full bg-blue-50">
                            <Ionicons
                              name="nutrition-outline"
                              size={21}
                              color="#2563EB"
                            />
                          </View>

                          <View className="ml-3 flex-1">
                            <Text className="font-semibold text-slate-900">
                              {getIngredientName(pantryItem)}
                            </Text>

                            <Text className="mt-0.5 text-sm text-slate-500">
                              {pantryItem.quantityAvailable}{" "}
                              {pantryItem.quantityUnit}
                            </Text>
                          </View>

                          <Ionicons
                            name="chevron-forward"
                            size={20}
                            color="#94a3b8"
                          />
                        </Pressable>
                      ))}
                    </View>
                  )}
                  ListEmptyComponent={
                    <View className="items-center px-6 py-16">
                      <Ionicons name="search-outline" size={42} color="#94a3b8" />
                      <Text className="mt-4 text-lg font-bold text-slate-900">
                        No pantry items found
                      </Text>
                      <Text className="mt-2 text-center text-slate-500">
                        Try a different ingredient name, category, or location.
                      </Text>
                    </View>
                  }
                />
              ) : (
                <FlatList
                  data={activePage === "mealPreps" ? filteredMealPreps : filteredIngredients}
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
                      <Pressable
                        className="mb-2 flex-row items-center rounded-2xl bg-slate-50 p-3"
                        onPress={() => {
                          closeSearch();
                          router.push({
                            pathname: "/ingredients/edit/[id]",
                            params: { id: ingredient._id },
                          });
                        }}
                      >
                        <View className="h-11 w-11 items-center justify-center rounded-full bg-blue-50">
                          <Ionicons
                            name="nutrition-outline"
                            size={21}
                            color="#2563EB"
                          />
                        </View>

                        <View className="ml-3 flex-1">
                          <Text
                            className="font-semibold text-slate-900"
                            numberOfLines={1}
                          >
                            {ingredient.name}
                          </Text>

                          {ingredient.productionRecipe ? (
                            <Text className="mt-0.5 text-sm font-medium text-blue-600">
                              Prepared{ingredient.isGeneric ? " · Generic" : ""}
                            </Text>
                          ) : ingredient.isGeneric ? (
                            <Text className="mt-0.5 text-sm font-medium text-violet-600">
                              Generic
                            </Text>
                          ) : (
                            <Text className="mt-0.5 text-sm text-slate-500">
                              {[brandName, categoryName].filter(Boolean).join(" · ")}
                            </Text>
                          )}
                        </View>

                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color="#94a3b8"
                        />
                      </Pressable>
                    );
                  }}
                  ListEmptyComponent={
                    <View className="items-center px-6 py-16">
                      <Ionicons name="search-outline" size={42} color="#94a3b8" />
                      <Text className="mt-4 text-lg font-bold text-slate-900">
                        No ingredients found
                      </Text>
                      <Text className="mt-2 text-center text-slate-500">
                        Try searching by name, brand, or category.
                      </Text>
                    </View>
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
        <View className="flex-1 justify-end bg-black/30">
          <Pressable
            className="absolute inset-0"
            onPress={() => setAddMenuVisible(false)}
          />

          <View className="rounded-t-[32px] bg-white px-5 pb-10 pt-4">
            <View className="mb-5 self-center h-1.5 w-12 rounded-full bg-slate-300" />

            <Text className="text-2xl font-bold text-slate-950">
              Add ingredient
            </Text>

            <Text className="mt-1 text-base text-slate-500">
              Choose how you would like to create a new ingredient.
            </Text>

            <Pressable
              className="mt-6 flex-row items-center rounded-3xl border border-slate-200 bg-white p-4 active:bg-slate-50"
              onPress={() => {
                setAddMenuVisible(false);
                router.push("/ingredients/add_manual");
              }}
            >
              <View className="h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                <Ionicons name="create-outline" size={27} color="#2563EB" />
              </View>

              <View className="ml-4 flex-1">
                <Text className="text-lg font-bold text-slate-900">
                  Add manually
                </Text>

                <Text className="mt-1 text-sm leading-5 text-slate-500">
                  Enter the ingredient details, brand, category, and nutrition
                  information.
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={22} color="#94A3B8" />
            </Pressable>

            <Pressable
              className="mt-3 flex-row items-center rounded-3xl border border-slate-200 bg-white p-4 active:bg-slate-50"
              onPress={() => {
                setAddMenuVisible(false);
                setScanContext("ingredient");
                setScannerVisible(true);
              }}
            >
              <View className="h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                <Ionicons name="barcode-outline" size={29} color="#2563EB" />
              </View>

              <View className="ml-4 flex-1">
                <Text className="text-lg font-bold text-slate-900">
                  Scan barcode
                </Text>

                <Text className="mt-1 text-sm leading-5 text-slate-500">
                  Scan a packaged product to fill in its information.
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={22} color="#94A3B8" />
            </Pressable>

            <Pressable
              className="mt-5 items-center rounded-2xl bg-slate-100 py-4"
              onPress={() => setAddMenuVisible(false)}
            >
              <Text className="text-base font-semibold text-slate-700">
                Cancel
              </Text>
            </Pressable>
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
        <View className="flex-1 justify-end bg-black/30">
          <Pressable
            className="absolute inset-0"
            onPress={() => setPantryAddMenuVisible(false)}
          />

          <View className="rounded-t-[32px] bg-white px-5 pb-10 pt-4">
            <View className="mb-5 self-center h-1.5 w-12 rounded-full bg-slate-300" />

            <Text className="text-2xl font-bold text-slate-950">Add pantry item</Text>
            <Text className="mt-1 text-base text-slate-500">
              Choose how you would like to add an item.
            </Text>

            <Pressable
              className="mt-6 flex-row items-center rounded-3xl border border-slate-200 bg-white p-4 active:bg-slate-50"
              onPress={() => {
                setPantryAddMenuVisible(false);
                router.push("/pantry/add_by_ingredient");
              }}
            >
              <View className="h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                <Ionicons name="create-outline" size={27} color="#2563EB" />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-lg font-bold text-slate-900">Add manually</Text>
                <Text className="mt-1 text-sm leading-5 text-slate-500">
                  Search or create an ingredient and set the quantity.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#94A3B8" />
            </Pressable>

            <Pressable
              className="mt-3 flex-row items-center rounded-3xl border border-slate-200 bg-white p-4 active:bg-slate-50"
              onPress={() => {
                setPantryAddMenuVisible(false);
                setScanContext("pantry");
                setScannerVisible(true);
              }}
            >
              <View className="h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                <Ionicons name="barcode-outline" size={29} color="#2563EB" />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-lg font-bold text-slate-900">Scan barcode</Text>
                <Text className="mt-1 text-sm leading-5 text-slate-500">
                  Scan a product barcode to fill in its details.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#94A3B8" />
            </Pressable>

            <Pressable
              className="mt-3 flex-row items-center rounded-3xl border border-slate-200 bg-white p-4 active:bg-slate-50"
              onPress={() => {
                setPantryAddMenuVisible(false);
                setReceiptScannerVisible(true);
              }}
            >
              <View className="h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                <Ionicons name="receipt-outline" size={27} color="#2563EB" />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-lg font-bold text-slate-900">Scan receipt</Text>
                <Text className="mt-1 text-sm leading-5 text-slate-500">
                  Beta — photograph a receipt. Auto-fill isn&apos;t built yet, this just captures the photo.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#94A3B8" />
            </Pressable>

            <Pressable
              className="mt-5 items-center rounded-2xl bg-slate-100 py-4"
              onPress={() => setPantryAddMenuVisible(false)}
            >
              <Text className="text-base font-semibold text-slate-700">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onProductFound={(product: ScannedProduct) => {
          setScannerVisible(false);

          const scannedParams = {
            scannedName: product.name,
            scannedBarcode: product.barcode,
            scannedBrand: product.brand ?? "",
            scannedQuantity: product.packageQuantity != null ? String(product.packageQuantity) : "",
            scannedQuantityUnit: product.packageUnit ?? "",
            scannedServingSize: String(product.servingSize),
            scannedServingUnit: product.servingUnit,
            scannedCalories: product.calories != null ? String(Math.round(product.calories)) : "",
            scannedProtein: product.protein != null ? String(Math.round(product.protein * 10) / 10) : "",
            scannedCarbs: product.carbs != null ? String(Math.round(product.carbs * 10) / 10) : "",
            scannedFats: product.fats != null ? String(Math.round(product.fats * 10) / 10) : "",
            scannedFiber: product.fiber != null ? String(Math.round(product.fiber * 10) / 10) : "",
            scannedSodium: product.sodium != null ? String(product.sodium) : "",
          };

          const match = ingredients.find((i) => barcodesMatch(i.barcode, product.barcode));

          if (scanContext === "pantry") {
            if (match) {
              router.push({
                pathname: "/pantry/add_by_ingredient",
                params: { ingredientId: match._id },
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
            Alert.alert(
              "Already in your catalog",
              `"${match.name}" is already an ingredient.`,
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "View ingredient",
                  onPress: () =>
                    router.push({
                      pathname: "/ingredients/edit/[id]",
                      params: { id: match._id },
                    }),
                },
              ],
            );
            return;
          }

          router.push({ pathname: "/ingredients/add_manual", params: scannedParams });
        }}
      />

      <ReceiptScannerModal
        visible={receiptScannerVisible}
        onClose={() => setReceiptScannerVisible(false)}
        onCaptured={() => {
          setReceiptScannerVisible(false);
          Alert.alert(
            "Receipt captured",
            "Saved for now — automatic parsing (matching items, prices, and store) isn't wired up yet. This step is just testing the capture flow.",
          );
        }}
      />

      <SplitPantryItemModal
        visible={!!splittingItem}
        item={splittingItem}
        ingredientName={splittingItem ? getIngredientName(splittingItem) : ""}
        storageLocations={storageLocations}
        onClose={() => setSplittingItem(null)}
        onSplit={handleSplitComplete}
      />
    </SafeAreaView>
  );
}
