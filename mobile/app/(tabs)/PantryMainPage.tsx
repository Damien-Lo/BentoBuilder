import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
  ScrollView
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getStorageLocations,
  type SelectOption,
} from "@/src/services/optionsApi";
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

  if (
    isReferenceObject(value) &&
    typeof value.name === "string"
  ) {
    return value.name;
  }

  return "";
}

function getIngredientField(
  item: PantryItem,
  field: "name" | "brand" | "category"
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
  return getReferenceName(getIngredientField(item, "name")) ||
    String(getIngredientField(item, "name") ?? "Unnamed ingredient");
}

function getIngredientBrandName(item: PantryItem): string {
  return getReferenceName(getIngredientField(item, "brand"));
}

function getIngredientCategoryName(item: PantryItem): string {
  return getReferenceName(getIngredientField(item, "category"));
}

export default function PantryMainPage() {
  const router = useRouter();

  const [addMenuVisible, setAddMenuVisible] = useState(false);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPantryPage() {
      setIsLoading(true);

      try {
        const [loadedLocations, loadedItems] = await Promise.all([
          getStorageLocations(),
          getPantryItems(),
        ]);

        if (cancelled) {
          return;
        }

        setStorageLocations(
          Array.isArray(loadedLocations) ? loadedLocations : []
        );
        setPantryItems(Array.isArray(loadedItems) ? loadedItems : []);
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
      storageLocations.map((location) => [
        String(location._id),
        location,
      ])
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
        value.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [pantryItems, searchText, storageLocationById]);

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
      a.name.localeCompare(b.name)
    );
  }, [filteredItems, storageLocationById]);

  const closeSearch = () => {
    Keyboard.dismiss();
    setIsSearchActive(false);
    setSearchText("");
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" />
        <Text className="mt-3 text-slate-500">Loading pantry...</Text>
      </SafeAreaView>
    );
  }

return (
  <SafeAreaView className="flex-1 bg-slate-50">
    <View className="flex-1">
      {/* Pantry heading */}
      <View className="px-5 pt-24">
        <Text className="text-3xl font-bold text-slate-950">
          Your Pantry
        </Text>

        <Text className="mt-1 text-base text-slate-500">
          Browse ingredients by storage location
        </Text>
      </View>

      {/* Scrollable storage-location cards */}
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
                item.storageLocation as unknown
              );

              return itemLocationId === locationId;
            }).length;

            return (
              <Pressable
                key={locationId}
                className="mb-4 h-44 w-[48%] justify-between rounded-3xl bg-white p-5 shadow-sm"
                onPress={() => {
                  console.log("Open location:", location.name);
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

      {isSearchActive && (
        <Pressable
          className="absolute inset-0 z-10 bg-black/30"
          onPress={closeSearch}
        />
      )}

      {/* Search bar */}
      <View
        className={`absolute left-4 right-4 top-3 z-20 overflow-hidden rounded-3xl bg-white shadow-lg ${
          isSearchActive ? "bottom-4" : ""
        }`}
      >
        <View className="flex-row items-center p-3">
          <View className="h-12 flex-1 flex-row items-center rounded-2xl bg-slate-100 px-4">
            <Ionicons
              name="search-outline"
              size={21}
              color="#64748b"
            />

            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              onFocus={() => setIsSearchActive(true)}
              placeholder="Search entire pantry"
              placeholderTextColor="#94a3b8"
              className="ml-3 flex-1 text-base text-slate-900"
            />

            {searchText.length > 0 && (
              <Pressable onPress={() => setSearchText("")}>
                <Ionicons
                  name="close-circle"
                  size={21}
                  color="#94a3b8"
                />
              </Pressable>
            )}
          </View>

          <Pressable
            className="ml-3 h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 active:bg-blue-700"
            onPress={() => setAddMenuVisible(true)}
          >
            <Ionicons name="add" size={28} color="white" />
          </Pressable>
        </View>

        {isSearchActive && (
          <View className="flex-1 border-t border-slate-100 px-4 pb-4">
            <View className="flex-row items-center justify-between py-3">
              <Text className="text-lg font-bold text-slate-900">
                Pantry ingredients
              </Text>

              <Pressable onPress={closeSearch}>
                <Text className="font-semibold text-blue-700">
                  Cancel
                </Text>
              </Pressable>
            </View>

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
                        console.log(
                          "Open ingredient:",
                          pantryItem._id
                        );
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
                  <Ionicons
                    name="search-outline"
                    size={42}
                    color="#94a3b8"
                  />

                  <Text className="mt-4 text-lg font-bold text-slate-900">
                    No ingredients found
                  </Text>

                  <Text className="mt-2 text-center text-slate-500">
                    Try searching for another ingredient, category, or
                    storage location.
                  </Text>
                </View>
              }
            />
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
            Add pantry item
          </Text>

          <Text className="mt-1 text-base text-slate-500">
            Choose how you would like to add an ingredient.
          </Text>

          <Pressable
            className="mt-6 flex-row items-center rounded-3xl border border-slate-200 bg-white p-4 active:bg-slate-50"
            onPress={() => {
              setAddMenuVisible(false);
              router.push("/pantry/add_manual");
            }}
          >
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-blue-100">
              <Ionicons
                name="create-outline"
                size={27}
                color="#2563EB"
              />
            </View>

            <View className="ml-4 flex-1">
              <Text className="text-lg font-bold text-slate-900">
                Add manually
              </Text>

              <Text className="mt-1 text-sm leading-5 text-slate-500">
                Enter the ingredient, quantity, storage, and nutrition
                information.
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={22}
              color="#94A3B8"
            />
          </Pressable>

          <Pressable
            className="mt-3 flex-row items-center rounded-3xl border border-slate-200 bg-white p-4 active:bg-slate-50"
            onPress={() => {
              setAddMenuVisible(false);
            }}
          >
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <Ionicons
                name="barcode-outline"
                size={29}
                color="#475569"
              />
            </View>

            <View className="ml-4 flex-1">
              <Text className="text-lg font-bold text-slate-900">
                Scan barcode
              </Text>

              <Text className="mt-1 text-sm leading-5 text-slate-500">
                Scan a packaged product to fill in its information.
              </Text>
            </View>

            <View className="rounded-full bg-slate-100 px-3 py-1">
              <Text className="text-xs font-semibold text-slate-500">
                Soon
              </Text>
            </View>
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
  </SafeAreaView>
);
}
