import { useCallback, useMemo, useRef, useState } from "react";
import {
  BarcodeScannerModal,
  type ScannedProduct,
} from "@/src/components/BarcodeScannerModal";
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
  getStorageLocations,
  type SelectOption,
} from "@/src/services/optionsApi";

import {
  deleteIngredient,
  getIngredients,
  type Ingredient,
} from "@/src/services/ingredientApi";

import { getPantryItems } from "@/src/services/pantryApi";
import type { PantryItem } from "@/src/types/pantry";
import { barcodesMatch } from "@/src/utils/barcode";
import { loadSettings } from "@/src/services/settingsService";
import { convertUnits, type CustomUnitConversion } from "@/src/utils/unitConversion";
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

type ActivePage = "pantry" | "ingredients" | "grocery";

type GroceryItem = {
  id: string;
  name: string;
  checked: boolean;
};

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
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [activePage, setActivePage] = useState<ActivePage>("pantry");
  const [pantryViewMode, setPantryViewMode] = useState<"locations" | "list">("locations");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set());
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);
  const [newGroceryText, setNewGroceryText] = useState("");
  const [customUnitConversions, setCustomUnitConversions] = useState<CustomUnitConversion[]>([]);

  const toggleLocation = (id: string) => {
    setExpandedLocations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const addGroceryItem = () => {
    const name = newGroceryText.trim();
    if (!name) return;
    setGroceryItems(prev => [...prev, { id: Date.now().toString(), name, checked: false }]);
    setNewGroceryText("");
  };

  const toggleGroceryItem = (id: string) => {
    setGroceryItems(prev => prev.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
  };

  const deleteGroceryItem = (id: string) => {
    setGroceryItems(prev => prev.filter(i => i.id !== id));
  };

  const clearCheckedGroceryItems = () => {
    setGroceryItems(prev => prev.filter(i => !i.checked));
  };

  const grocerySuggestions = useMemo(() => {
    const q = newGroceryText.trim().toLowerCase();
    if (!q) return [];
    return ingredients.filter(i => i.name.toLowerCase().includes(q)).slice(0, 5);
  }, [ingredients, newGroceryText]);

  const isFirstLoad = useRef(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const showSpinner = isFirstLoad.current;
      if (showSpinner) setIsLoading(true);

      async function loadPantryPage() {
        try {
          const [loadedLocations, loadedPantryItems, loadedIngredients, loadedSettings] =
            await Promise.all([
              getStorageLocations(),
              getPantryItems(),
              getIngredients(),
              loadSettings(),
            ]);

          if (cancelled) return;

          setStorageLocations(Array.isArray(loadedLocations) ? loadedLocations : []);
          setPantryItems(Array.isArray(loadedPantryItems) ? loadedPantryItems : []);
          setIngredients(Array.isArray(loadedIngredients) ? loadedIngredients : []);
          setCustomUnitConversions(loadedSettings.unitConversions ?? []);
        } catch (error) {
          console.error("Error loading pantry page:", error);
          if (!cancelled && showSpinner) {
            setStorageLocations([]);
            setPantryItems([]);
            setIngredients([]);
          }
        } finally {
          if (!cancelled) {
            isFirstLoad.current = false;
            setIsLoading(false);
          }
        }
      }

      void loadPantryPage();

      return () => { cancelled = true; };
    }, []),
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

  // Generic ingredients never hold pantry stock directly — their total is
  // the sum of every specific/branded variant's stock that shares their
  // unit (a generic's threshold in "tbsp" can't be checked against a
  // variant's stock recorded in "ml").
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
      const childId = getReferenceId(pantryItem.ingredient as unknown);
      const child = ingredientById.get(childId);
      if (!child) continue;

      const parentId = getReferenceId(child.genericParent as unknown);
      if (!parentId) continue;

      const parent = ingredientById.get(parentId);
      if (!parent || !parent.defaultPortionUnit) continue;

      const converted = convertUnits(
        Number(pantryItem.quantityAvailable ?? 0),
        pantryItem.quantityUnit,
        parent.defaultPortionUnit,
        customUnitConversions,
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
      ];

      return searchableValues.some((value) =>
        value.toLowerCase().includes(normalizedSearch),
      );
    });
  }, [pantryItems, searchText, storageLocationById]);

  const filteredIngredients = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) {
      return ingredients;
    }

    return ingredients.filter((ingredient) => {
      const brandName =
        typeof ingredient.brand === "object" && ingredient.brand !== null
          ? (ingredient.brand.name ?? "")
          : "";

      const categoryName =
        typeof ingredient.category === "object" && ingredient.category !== null
          ? (ingredient.category.name ?? "")
          : "";

      return [
        ingredient.name,
        brandName,
        categoryName,
        ingredient.barcode ?? "",
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [ingredients, searchText]);

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

    return Array.from(groups.values()).sort((a, b) => {
      if (a.category === "Uncategorised") return 1;
      if (b.category === "Uncategorised") return -1;
      return a.category.localeCompare(b.category);
    });
  }, [filteredIngredients]);

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
        className={`items-center justify-center bg-red-500 active:bg-red-600 ${
          isChild ? "mb-2 w-16 rounded-2xl" : "mb-3 w-20 rounded-3xl"
        }`}
        onPress={() => handleDeleteIngredient(ingredientItem._id, ingredientItem.name)}
      >
        <Ionicons name="trash-outline" size={isChild ? 18 : 22} color="white" />
      </Pressable>
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
            className="mb-2 flex-row items-center rounded-2xl bg-white px-3.5 py-2.5 shadow-sm active:bg-slate-50"
            onPress={() => {
              router.push({
                pathname: "/ingredients/edit/[id]",
                params: { id: ingredientItem._id },
              });
            }}
          >
            <View className="flex-1">
              <Text className="text-sm font-semibold text-slate-800" numberOfLines={1}>
                {ingredientItem.name}
              </Text>
              {subtitle ? (
                <Text className="mt-0.5 text-xs text-slate-400" numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>

            <View className="flex-row items-center">
              <View className={`mr-2 h-2 w-2 rounded-full ${statusDotColor}`} />
              <Text className="text-sm text-slate-500">
                {isInStock ? `${totalQuantity} ${displayUnit ?? ""}`.trim() : "—"}
              </Text>
            </View>

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
          className="mb-3 flex-row items-center rounded-3xl bg-white px-4 py-2.5 shadow-sm"
          onPress={() => {
            router.push({
              pathname: "/ingredients/edit/[id]",
              params: { id: ingredientItem._id },
            });
          }}
        >
          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-blue-100">
            <Ionicons name="nutrition-outline" size={20} color="#2563EB" />
          </View>

          <View className="ml-4 flex-1">
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

          <View className="items-end">
            <Text
              className={`text-sm font-semibold ${
                isAlwaysAvailable
                  ? "text-blue-600"
                  : isLowStock
                    ? "text-amber-600"
                    : isInStock
                      ? "text-emerald-600"
                      : "text-slate-400"
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

            {isInStock && !isAlwaysAvailable ? (
              <Text className="mt-1 text-sm text-slate-500">
                {totalQuantity} {displayUnit}
              </Text>
            ) : null}
          </View>

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

    if (pageIndex === 0) setActivePage("pantry");
    else if (pageIndex === 1) setActivePage("ingredients");
    else setActivePage("grocery");

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
                <Pressable
                  className="h-10 w-10 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200"
                  onPress={() => setPantryViewMode((m) => m === "locations" ? "list" : "locations")}
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

                    return (
                      <Pressable
                        key={locationId}
                        className="mb-4 h-44 w-[48%] justify-between rounded-3xl bg-white p-5 shadow-sm"
                        onPress={() =>
                          router.push({ pathname: "/pantry/location/[id]", params: { id: locationId, name: location.name } })
                        }
                      >
                        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
                          <Ionicons name="file-tray-stacked-outline" size={25} color="#2563EB" />
                        </View>
                        <View>
                          <Text className="text-lg font-bold text-slate-900">{location.name}</Text>
                          <Text className="mt-1 text-sm text-slate-500">
                            {itemCount} {itemCount === 1 ? "item" : "items"}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            ) : (
              <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 120 }}
                showsVerticalScrollIndicator={false}
              >
                {groupedItems.length === 0 ? (
                  <View className="items-center rounded-3xl bg-white px-6 py-16 shadow-sm">
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
                          className="mb-2 flex-row items-center justify-between py-1"
                          onPress={() => toggleLocation(group.id)}
                        >
                          <Text className="text-sm font-bold uppercase tracking-wide text-slate-500">
                            {group.name}
                            <Text className="font-normal"> ({group.items.length})</Text>
                          </Text>
                          <Ionicons
                            name={isCollapsed ? "chevron-forward" : "chevron-down"}
                            size={16}
                            color="#94A3B8"
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
                            <Pressable
                              key={pantryItem._id}
                              className="mb-3 flex-row items-center rounded-3xl bg-white p-4 shadow-sm active:bg-slate-50"
                              onPress={() =>
                                router.push({ pathname: "/pantry/edit/[id]", params: { id: pantryItem._id } })
                              }
                            >
                              <View className="h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
                                <Ionicons name="nutrition-outline" size={19} color="#2563EB" />
                              </View>

                              <View className="ml-3 flex-1">
                                <Text className="font-semibold text-slate-900" numberOfLines={1}>
                                  {ingName}
                                </Text>
                                <Text className="mt-0.5 text-sm text-slate-500">
                                  {pantryItem.quantityAvailable} {pantryItem.quantityUnit}
                                </Text>
                              </View>

                              {expiryState === "expired" && (
                                <View className="mr-3 rounded-full bg-red-100 px-2.5 py-1">
                                  <Text className="text-xs font-semibold text-red-600">Expired</Text>
                                </View>
                              )}
                              {expiryState === "soon" && (
                                <View className="mr-3 rounded-full bg-amber-100 px-2.5 py-1">
                                  <Text className="text-xs font-semibold text-amber-600">
                                    {daysUntilExpiry === 0 ? "Today" : `${daysUntilExpiry}d`}
                                  </Text>
                                </View>
                              )}

                              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                            </Pressable>
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
              <Text className="text-3xl font-bold text-slate-950">
                All Your Ingredients
              </Text>

              <Text className="mt-1 text-base text-slate-500">
                View every ingredient in one list
              </Text>

              <View className="mt-3 flex-row items-center">
                <View className="h-2 w-2 rounded-full bg-slate-300" />
                <View className="ml-2 h-2 w-6 rounded-full bg-blue-600" />
                <View className="ml-2 h-2 w-2 rounded-full bg-slate-300" />
                <Text className="ml-3 text-xs font-medium text-slate-400">
                  Swipe left for grocery list
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
                <View className="items-center rounded-3xl bg-white px-6 py-16 shadow-sm">
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
                  <View key={group.category} className="mb-2">
                    <Pressable
                      className="mb-2 flex-row items-center justify-between py-1"
                      onPress={() => toggleCategory(group.category)}
                    >
                      <Text className="text-sm font-bold uppercase tracking-wide text-slate-500">
                        {group.category}
                        <Text className="font-normal"> ({group.items.length})</Text>
                      </Text>
                      <Ionicons
                        name={isCollapsed ? "chevron-forward" : "chevron-down"}
                        size={16}
                        color="#94A3B8"
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

          {/* Page 3: Grocery list */}
          <View style={{ width: screenWidth }} className="flex-1">
            <View className="px-5 pt-24">
              <Text className="text-3xl font-bold text-slate-950">Grocery List</Text>
              <Text className="mt-1 text-base text-slate-500">Items to pick up</Text>
              <View className="mt-3 flex-row items-center">
                <View className="h-2 w-2 rounded-full bg-slate-300" />
                <View className="ml-2 h-2 w-2 rounded-full bg-slate-300" />
                <View className="ml-2 h-2 w-6 rounded-full bg-blue-600" />
                <Text className="ml-3 text-xs font-medium text-slate-400">
                  Swipe right to return to ingredients
                </Text>
              </View>
            </View>

            {/* Add item row */}
            <View className="mx-5 mt-5 flex-row items-center gap-3">
              <View className="h-12 flex-1 flex-row items-center rounded-2xl bg-white px-4 shadow-sm">
                <TextInput
                  value={newGroceryText}
                  onChangeText={setNewGroceryText}
                  onSubmitEditing={addGroceryItem}
                  returnKeyType="done"
                  placeholder="Search ingredients or add any item…"
                  placeholderTextColor="#94A3B8"
                  className="flex-1 text-base text-slate-900"
                />
                {newGroceryText.length > 0 && (
                  <Pressable onPress={() => setNewGroceryText("")}>
                    <Ionicons name="close-circle" size={18} color="#94A3B8" />
                  </Pressable>
                )}
              </View>
              <Pressable
                onPress={addGroceryItem}
                className="h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 active:bg-blue-700"
              >
                <Ionicons name="add" size={26} color="white" />
              </Pressable>
            </View>

            {/* Ingredient suggestions */}
            {grocerySuggestions.length > 0 && (
              <View className="mx-5 mt-2 overflow-hidden rounded-2xl bg-white shadow-sm">
                {grocerySuggestions.map((ing, idx) => {
                  const categoryName =
                    typeof ing.category === "object" && ing.category !== null
                      ? ((ing.category as { name?: string }).name ?? "")
                      : "";
                  return (
                    <Pressable
                      key={ing._id}
                      onPress={() => {
                        setGroceryItems(prev => [
                          ...prev,
                          { id: Date.now().toString(), name: ing.name, checked: false },
                        ]);
                        setNewGroceryText("");
                      }}
                      className={`flex-row items-center px-4 py-3 active:bg-slate-50 ${
                        idx > 0 ? "border-t border-slate-100" : ""
                      }`}
                    >
                      <View className="h-8 w-8 items-center justify-center rounded-xl bg-blue-100">
                        <Ionicons name="nutrition-outline" size={16} color="#2563EB" />
                      </View>
                      <View className="ml-3 flex-1">
                        <Text className="font-medium text-slate-900">{ing.name}</Text>
                        {categoryName ? (
                          <Text className="text-xs text-slate-400">{categoryName}</Text>
                        ) : null}
                      </View>
                      <Ionicons name="add-circle-outline" size={20} color="#2563EB" />
                    </Pressable>
                  );
                })}
                {/* Option to add exactly what was typed if it doesn't exactly match */}
                {!grocerySuggestions.some(
                  i => i.name.toLowerCase() === newGroceryText.trim().toLowerCase(),
                ) && (
                  <Pressable
                    onPress={addGroceryItem}
                    className="flex-row items-center border-t border-slate-100 px-4 py-3 active:bg-slate-50"
                  >
                    <View className="h-8 w-8 items-center justify-center rounded-xl bg-slate-100">
                      <Ionicons name="add" size={16} color="#475569" />
                    </View>
                    <Text className="ml-3 flex-1 font-medium text-slate-700">
                      Add &quot;{newGroceryText.trim()}&quot;
                    </Text>
                  </Pressable>
                )}
              </View>
            )}

            <ScrollView
              className="flex-1"
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {groceryItems.length === 0 ? (
                <View className="mt-8 items-center rounded-3xl bg-white px-6 py-16 shadow-sm">
                  <Ionicons name="cart-outline" size={42} color="#94A3B8" />
                  <Text className="mt-4 text-lg font-bold text-slate-900">List is empty</Text>
                  <Text className="mt-2 text-center text-slate-500">
                    Add items above to start your grocery list.
                  </Text>
                </View>
              ) : (
                <>
                  {groceryItems.map((item) => (
                    <ReanimatedSwipeable
                      key={item.id}
                      friction={2}
                      rightThreshold={40}
                      renderLeftActions={() => (
                        <Pressable
                          className="mb-3 w-20 items-center justify-center rounded-3xl bg-red-500 active:bg-red-600"
                          onPress={() => deleteGroceryItem(item.id)}
                        >
                          <Ionicons name="trash-outline" size={22} color="white" />
                        </Pressable>
                      )}
                    >
                      <Pressable
                        onPress={() => toggleGroceryItem(item.id)}
                        className="mb-3 flex-row items-center rounded-3xl bg-white p-4 shadow-sm active:bg-slate-50"
                      >
                        <View
                          className={`h-6 w-6 items-center justify-center rounded-full border-2 ${
                            item.checked ? "border-emerald-500 bg-emerald-500" : "border-slate-300"
                          }`}
                        >
                          {item.checked && (
                            <Ionicons name="checkmark" size={14} color="white" />
                          )}
                        </View>
                        <Text
                          className={`ml-4 flex-1 text-base ${
                            item.checked
                              ? "text-slate-400 line-through"
                              : "font-medium text-slate-900"
                          }`}
                        >
                          {item.name}
                        </Text>
                      </Pressable>
                    </ReanimatedSwipeable>
                  ))}

                  {groceryItems.some(i => i.checked) && (
                    <Pressable
                      onPress={clearCheckedGroceryItems}
                      className="mt-2 items-center rounded-2xl bg-slate-100 py-3 active:bg-slate-200"
                    >
                      <Text className="text-sm font-semibold text-slate-500">
                        Clear checked items
                      </Text>
                    </Pressable>
                  )}
                </>
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
                    : activePage === "ingredients"
                    ? "Search all ingredients"
                    : "Grocery list"
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

            {activePage !== "grocery" && (
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
            )}
          </View>

          {isSearchActive && (
            <View className="flex-1 border-t border-slate-100 px-4 pb-4">
              <View className="flex-row items-center justify-between py-3">
                <Text className="text-lg font-bold text-slate-900">
                  {activePage === "pantry" ? "Pantry" : "All ingredients"}
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
                          }}
                        >
                          <View className="h-11 w-11 items-center justify-center rounded-xl bg-blue-100">
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
                  data={filteredIngredients}
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
                        <View className="h-11 w-11 items-center justify-center rounded-xl bg-blue-100">
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

                          {ingredient.isGeneric ? (
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
              <View className="h-14 w-14 items-center justify-center rounded-2xl bg-blue-100">
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
              <View className="h-14 w-14 items-center justify-center rounded-2xl bg-blue-100">
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
              <View className="h-14 w-14 items-center justify-center rounded-2xl bg-blue-100">
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
              <View className="h-14 w-14 items-center justify-center rounded-2xl bg-blue-100">
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

          if (scanContext === "pantry") {
            const match = ingredients.find((i) => barcodesMatch(i.barcode, product.barcode));
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

          router.push({ pathname: "/ingredients/add_manual", params: scannedParams });
        }}
      />
    </SafeAreaView>
  );
}
