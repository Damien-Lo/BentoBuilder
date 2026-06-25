import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import {
  getIngredients,
  type Ingredient,
} from "@/src/services/ingredientApi";

import {
  getStorageLocations,
  getUnitSuggestions,
  type SelectOption,
} from "@/src/services/optionsApi";

import { createPantryItem } from "@/src/services/pantryApi";

type SelectedIngredientCardProps = {
  ingredient: Ingredient;
  onClear: () => void;
};

function getReferenceName(
  reference: string | SelectOption | null | undefined
): string {
  if (
    typeof reference === "object" &&
    reference !== null &&
    typeof reference.name === "string"
  ) {
    return reference.name;
  }

  return "";
}

function SelectedIngredientCard({
  ingredient,
  onClear,
}: SelectedIngredientCardProps) {
  const brandName = getReferenceName(ingredient.brand);
  const categoryName = getReferenceName(ingredient.category);

  return (
    <View className="rounded-3xl border border-blue-200 bg-blue-50 p-4">
      <View className="flex-row items-center">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-blue-100">
          <Ionicons
            name="nutrition-outline"
            size={27}
            color="#2563EB"
          />
        </View>

        <View className="ml-4 flex-1">
          <Text className="text-lg font-bold text-slate-950">
            {ingredient.name}
          </Text>

          {(brandName || categoryName) && (
            <Text className="mt-1 text-sm text-slate-500">
              {[brandName, categoryName].filter(Boolean).join(" • ")}
            </Text>
          )}
        </View>

        <Pressable
          className="h-10 w-10 items-center justify-center rounded-full bg-white"
          onPress={onClear}
        >
          <Ionicons
            name="close"
            size={21}
            color="#475569"
          />
        </Pressable>
      </View>
    </View>
  );
}

export default function AddPantryItemByIngredientScreen() {
  const router = useRouter();

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [storageLocations, setStorageLocations] = useState<
    SelectOption[]
  >([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);

  const [selectedIngredient, setSelectedIngredient] =
    useState<Ingredient | null>(null);

  const [searchText, setSearchText] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [quantityUnit, setQuantityUnit] = useState("item");
  const [storageLocationId, setStorageLocationId] = useState("");

  const [showUnitOptions, setShowUnitOptions] = useState(false);
  const [showLocationOptions, setShowLocationOptions] =
    useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPageData() {
      try {
        const [
          loadedIngredients,
          loadedStorageLocations,
          loadedUnits,
        ] = await Promise.all([
          getIngredients(),
          getStorageLocations(),
          getUnitSuggestions(),
        ]);

        if (cancelled) {
          return;
        }

        setIngredients(
          Array.isArray(loadedIngredients)
            ? loadedIngredients
            : []
        );

        setStorageLocations(
          Array.isArray(loadedStorageLocations)
            ? loadedStorageLocations
            : []
        );

        setUnitOptions(
          Array.isArray(loadedUnits) ? loadedUnits : []
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not load ingredients.";

        Alert.alert("Unable to load page", message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPageData();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredIngredients = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    const activeIngredients = ingredients.filter(
      (ingredient) => !ingredient.isArchived
    );

    if (!query) {
      return activeIngredients;
    }

    return activeIngredients.filter((ingredient) => {
      const brandName = getReferenceName(ingredient.brand);
      const categoryName = getReferenceName(
        ingredient.category
      );

      const searchableValues = [
        ingredient.name,
        brandName,
        categoryName,
        ingredient.barcode ?? "",
        ingredient.description ?? "",
      ];

      return searchableValues.some((value) =>
        value.toLowerCase().includes(query)
      );
    });
  }, [ingredients, searchText]);

  const selectedStorageLocation = useMemo(
    () =>
      storageLocations.find(
        (location) => location._id === storageLocationId
      ),
    [storageLocationId, storageLocations]
  );

  async function handleSave() {
    if (!selectedIngredient) {
      Alert.alert(
        "Select an ingredient",
        "Choose an ingredient before adding it to your pantry."
      );
      return;
    }

    const parsedQuantity = Number(quantity);

    if (
      !Number.isFinite(parsedQuantity) ||
      parsedQuantity < 0
    ) {
      Alert.alert(
        "Invalid quantity",
        "Enter a valid quantity of zero or greater."
      );
      return;
    }

    if (!quantityUnit.trim()) {
      Alert.alert(
        "Unit required",
        "Select or enter a quantity unit."
      );
      return;
    }

    if (!storageLocationId) {
      Alert.alert(
        "Storage location required",
        "Select where this ingredient is stored."
      );
      return;
    }

    try {
      setSaving(true);

      await createPantryItem({
        ingredient: selectedIngredient._id,
        storageLocation: storageLocationId,
        quantityAvailable: parsedQuantity,
        quantityUnit: quantityUnit.trim(),

        /*
         * Add any other fields required by your backend here.
         *
         * Examples:
         *
         * minimumQuantity: 0,
         * lowStockThreshold: 0,
         * purchasedDate: new Date().toISOString(),
         * expiryDate: null,
         * openedDate: null,
         * purchasePrice: null,
         * notes: "",
         */
      });

      Alert.alert(
        "Added to pantry",
        `${selectedIngredient.name} was added to ${
          selectedStorageLocation?.name ?? "your pantry"
        }.`,
        [
          {
            text: "Done",
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not add the pantry item.";

      Alert.alert("Unable to add item", message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />

        <Text className="mt-4 text-base text-slate-500">
          Loading ingredients...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
          <Pressable
            className="h-11 w-11 items-center justify-center rounded-full"
            onPress={() => router.back()}
          >
            <Ionicons
              name="chevron-back"
              size={26}
              color="#0F172A"
            />
          </Pressable>

          <View className="ml-2 flex-1">
            <Text className="text-xl font-bold text-slate-950">
              Add to pantry
            </Text>

            <Text className="text-sm text-slate-500">
              Choose an existing ingredient
            </Text>
          </View>
        </View>

        {!selectedIngredient ? (
          <View className="flex-1 px-5 pt-5">
            {/* Search */}
            <View className="h-14 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4">
              <Ionicons
                name="search-outline"
                size={21}
                color="#64748B"
              />

              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search all ingredients"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
                className="ml-3 flex-1 text-base text-slate-950"
              />

              {searchText.length > 0 && (
                <Pressable
                  onPress={() => setSearchText("")}
                >
                  <Ionicons
                    name="close-circle"
                    size={21}
                    color="#94A3B8"
                  />
                </Pressable>
              )}
            </View>

            <Text className="mb-3 mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">
              Ingredients
            </Text>

            <FlatList
              data={filteredIngredients}
              keyExtractor={(ingredient) => ingredient._id}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingBottom: 40,
              }}
              renderItem={({ item: ingredient }) => {
                const brandName = getReferenceName(
                  ingredient.brand
                );

                const categoryName = getReferenceName(
                  ingredient.category
                );

                return (
                  <Pressable
                    className="mb-3 flex-row items-center rounded-3xl border border-slate-200 bg-white p-4 active:bg-slate-50"
                    onPress={() => {
                      setSelectedIngredient(ingredient);

                      if (ingredient.defaultPortionUnit) {
                        setQuantityUnit(
                          ingredient.defaultPortionUnit
                        );
                      }

                      if (
                        ingredient.defaultPortionAmount !==
                        undefined
                      ) {
                        setQuantity(
                          String(
                            ingredient.defaultPortionAmount
                          )
                        );
                      }
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
                      <Text className="text-base font-bold text-slate-950">
                        {ingredient.name}
                      </Text>

                      {(brandName || categoryName) && (
                        <Text className="mt-1 text-sm text-slate-500">
                          {[brandName, categoryName]
                            .filter(Boolean)
                            .join(" • ")}
                        </Text>
                      )}
                    </View>

                    <Ionicons
                      name="chevron-forward"
                      size={21}
                      color="#94A3B8"
                    />
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View className="items-center px-6 py-16">
                  <Ionicons
                    name="search-outline"
                    size={44}
                    color="#94A3B8"
                  />

                  <Text className="mt-4 text-lg font-bold text-slate-950">
                    No ingredients found
                  </Text>

                  <Text className="mt-2 text-center text-slate-500">
                    Try another search or create a new ingredient
                    from the ingredients page.
                  </Text>
                </View>
              }
            />
          </View>
        ) : (
          <View className="flex-1 px-5 pt-5">
            <SelectedIngredientCard
              ingredient={selectedIngredient}
              onClear={() => {
                setSelectedIngredient(null);
                setShowLocationOptions(false);
                setShowUnitOptions(false);
              }}
            />

            {/* Quantity */}
            <Text className="mb-2 mt-6 text-sm font-semibold text-slate-700">
              Quantity
            </Text>

            <View className="flex-row">
              <TextInput
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                placeholder="1"
                placeholderTextColor="#94A3B8"
                className="mr-3 h-14 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
              />

              <View className="relative flex-1">
                <Pressable
                  className="h-14 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4"
                  onPress={() => {
                    setShowUnitOptions((current) => !current);
                    setShowLocationOptions(false);
                  }}
                >
                  <Text
                    className={`flex-1 text-base ${
                      quantityUnit
                        ? "text-slate-950"
                        : "text-slate-400"
                    }`}
                  >
                    {quantityUnit || "Unit"}
                  </Text>

                  <Ionicons
                    name={
                      showUnitOptions
                        ? "chevron-up"
                        : "chevron-down"
                    }
                    size={18}
                    color="#64748B"
                  />
                </Pressable>

                {showUnitOptions && (
                  <View
                    className="absolute left-0 right-0 top-16 z-50 max-h-52 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
                    style={{ elevation: 20 }}
                  >
                    <FlatList
                      data={unitOptions}
                      keyExtractor={(unit) => unit}
                      keyboardShouldPersistTaps="handled"
                      renderItem={({ item: unit }) => (
                        <Pressable
                          className="border-b border-slate-100 px-4 py-3"
                          onPress={() => {
                            setQuantityUnit(unit);
                            setShowUnitOptions(false);
                          }}
                        >
                          <Text className="text-base text-slate-800">
                            {unit}
                          </Text>
                        </Pressable>
                      )}
                    />
                  </View>
                )}
              </View>
            </View>

            {/* Storage location */}
            <Text className="mb-2 mt-6 text-sm font-semibold text-slate-700">
              Storage location
            </Text>

            <View className="relative">
              <Pressable
                className="h-14 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4"
                onPress={() => {
                  setShowLocationOptions((current) => !current);
                  setShowUnitOptions(false);
                }}
              >
                <Ionicons
                  name="file-tray-stacked-outline"
                  size={21}
                  color="#64748B"
                />

                <Text
                  className={`ml-3 flex-1 text-base ${
                    selectedStorageLocation
                      ? "text-slate-950"
                      : "text-slate-400"
                  }`}
                >
                  {selectedStorageLocation?.name ??
                    "Choose a storage location"}
                </Text>

                <Ionicons
                  name={
                    showLocationOptions
                      ? "chevron-up"
                      : "chevron-down"
                  }
                  size={18}
                  color="#64748B"
                />
              </Pressable>

              {showLocationOptions && (
                <View
                  className="absolute left-0 right-0 top-16 z-50 max-h-60 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
                  style={{ elevation: 20 }}
                >
                  <FlatList
                    data={storageLocations}
                    keyExtractor={(location) => location._id}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item: location }) => (
                      <Pressable
                        className="border-b border-slate-100 px-4 py-4"
                        onPress={() => {
                          setStorageLocationId(location._id);
                          setShowLocationOptions(false);
                        }}
                      >
                        <Text className="text-base text-slate-800">
                          {location.name}
                        </Text>
                      </Pressable>
                    )}
                  />
                </View>
              )}
            </View>

            <View className="mt-auto pb-6 pt-8">
              <Pressable
                disabled={saving}
                className={`h-14 items-center justify-center rounded-2xl ${
                  saving ? "bg-blue-400" : "bg-blue-600"
                }`}
                onPress={() => void handleSave()}
              >
                {saving ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-base font-bold text-white">
                    Add to pantry
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}