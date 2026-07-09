import { useEffect, useMemo, useState } from "react";
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
import { useRouter } from "expo-router";
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

type ActivePage = "pantry" | "ingredients";

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

function getReferenceName(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

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

export default function PantryMainPage() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const [addMenuVisible, setAddMenuVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [activePage, setActivePage] = useState<ActivePage>("pantry");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;

    async function loadPantryPage() {
      setIsLoading(true);

      try {
        const [loadedLocations, loadedPantryItems, loadedIngredients] =
          await Promise.all([
            getStorageLocations(),
            getPantryItems(),
            getIngredients(),
          ]);

        if (cancelled) {
          return;
        }

        setStorageLocations(
          Array.isArray(loadedLocations) ? loadedLocations : [],
        );
        setPantryItems(
          Array.isArray(loadedPantryItems) ? loadedPantryItems : [],
        );

        setIngredients(
          Array.isArray(loadedIngredients) ? loadedIngredients : [],
        );

        console.log("Loaded Ingredients: ", loadedIngredients);
      } catch (error) {
        console.error("Error loading pantry page:", error);

        if (!cancelled) {
          setStorageLocations([]);
          setPantryItems([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadPantryPage();

    return () => {
      cancelled = true;
    };
  }, []);

  const storageLocationById = useMemo(() => {
    return new Map(
      storageLocations.map((location) => [String(location._id), location]),
    );
  }, [storageLocations]);

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

    setActivePage(pageIndex === 0 ? "pantry" : "ingredients");

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
              <Text className="text-3xl font-bold text-slate-950">
                Your Pantry
              </Text>

              <Text className="mt-1 text-base text-slate-500">
                Browse ingredients by storage location
              </Text>

              <View className="mt-3 flex-row items-center">
                <View className="h-2 w-6 rounded-full bg-blue-600" />
                <View className="ml-2 h-2 w-2 rounded-full bg-slate-300" />
                <Text className="ml-3 text-xs font-medium text-slate-400">
                  Swipe left for all ingredients
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
              <View className="flex-row flex-wrap justify-between">
                {storageLocations.map((location) => {
                  const locationId = String(location._id);

                  const itemCount = pantryItems.filter((item) => {
                    const itemLocationId = getReferenceId(
                      item.storageLocation as unknown,
                    );

                    return itemLocationId === locationId;
                  }).length;

                  return (
                    <Pressable
                      key={locationId}
                      className="mb-4 h-44 w-[48%] justify-between rounded-3xl bg-white p-5 shadow-sm"
                      onPress={() => {
                        router.push({
                          pathname: "/pantry/location/[id]",
                          params: { id: locationId, name: location.name },
                        });
                      }}
                    >
                      <View className="h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
                        <Ionicons
                          name="file-tray-stacked-outline"
                          size={25}
                          color="#2563EB"
                        />
                      </View>

                      <View>
                        <Text className="text-lg font-bold text-slate-900">
                          {location.name}
                        </Text>

                        <Text className="mt-1 text-sm text-slate-500">
                          {itemCount} {itemCount === 1 ? "item" : "items"}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
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
                <Text className="ml-3 text-xs font-medium text-slate-400">
                  Swipe right to return to pantry
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
                  const isCollapsed = collapsedCategories.has(group.category);
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

                    {!isCollapsed && group.items.map((ingredientItem) => {
                      const ingredientPantryItems = pantryItems.filter(
                        (p) =>
                          getReferenceId(p.ingredient as unknown) ===
                          ingredientItem._id,
                      );

                      const totalQuantity = ingredientPantryItems.reduce(
                        (sum, p) => sum + Number(p.quantityAvailable ?? 0),
                        0,
                      );
                      const isInStock = totalQuantity > 0;
                      const locationNames = [
                        ...new Set(
                          ingredientPantryItems.map((p) =>
                            getStorageLocationName(p),
                          ),
                        ),
                      ].join(", ");

                      return (
                        <ReanimatedSwipeable
                          key={ingredientItem._id}
                          friction={2}
                          rightThreshold={40}
                          renderLeftActions={() => (
                            <Pressable
                              className="mb-3 w-20 items-center justify-center rounded-3xl bg-red-500 active:bg-red-600"
                              onPress={() =>
                                handleDeleteIngredient(
                                  ingredientItem._id,
                                  ingredientItem.name,
                                )
                              }
                            >
                              <Ionicons
                                name="trash-outline"
                                size={22}
                                color="white"
                              />
                            </Pressable>
                          )}
                        >
                          <Pressable
                            className="mb-3 flex-row items-center rounded-3xl bg-white p-4 shadow-sm"
                            onPress={() => {
                              router.push({
                                pathname: "/ingredients/edit/[id]",
                                params: { id: ingredientItem._id },
                              });
                            }}
                          >
                            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
                              <Ionicons
                                name="nutrition-outline"
                                size={23}
                                color="#2563EB"
                              />
                            </View>

                            <View className="ml-4 flex-1">
                              <Text className="text-base font-bold text-slate-900">
                                {ingredientItem.name}
                              </Text>

                              {locationNames ? (
                                <Text className="mt-1 text-sm text-slate-500">
                                  {locationNames}
                                </Text>
                              ) : null}
                            </View>

                            <View className="items-end">
                              <Text
                                className={`text-sm font-semibold ${
                                  isInStock
                                    ? "text-emerald-600"
                                    : "text-slate-400"
                                }`}
                              >
                                {isInStock ? "In stock" : "Out of stock"}
                              </Text>

                              {isInStock ? (
                                <Text className="mt-1 text-sm text-slate-500">
                                  {totalQuantity}{" "}
                                  {ingredientPantryItems[0]?.quantityUnit}
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
                    })}
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
                  router.push("/pantry/add_by_ingredient");
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
                          <Text className="font-semibold text-slate-900">
                            {ingredient.name}
                          </Text>
                          <Text className="mt-0.5 text-sm text-slate-500">
                            {[brandName, categoryName].filter(Boolean).join(" · ")}
                          </Text>
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

      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onProductFound={(product: ScannedProduct) => {
          setScannerVisible(false);
          router.push({
            pathname: "/ingredients/add_manual",
            params: {
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
            },
          });
        }}
      />
    </SafeAreaView>
  );
}
