import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";

import {
  getStorageLocations,
  getUnitSuggestions,
  type SelectOption,
} from "@/src/services/optionsApi";

import { addIngredientToPantry, getPantryItems } from "@/src/services/pantryApi";
import type { PantryItem } from "@/src/types/pantry";
import { DateTextInput, DurationExpiryInput, QuantityServingInput } from "@/src/components/forms";
import { addDurationToDate, todayDateInputString } from "@/src/utils/date";
import {
  recentPantryEntries,
  referenceId,
  referenceName,
  suggestExpiryDuration,
  suggestStorageLocation,
} from "@/src/utils/pantryDefaults";

type SelectedIngredientCardProps = {
  ingredient: Ingredient;
  onClear: () => void;
};

function getReferenceName(
  reference: string | SelectOption | null | undefined,
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
    <View className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <View className="flex-row items-center">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-blue-100">
          <Ionicons name="nutrition-outline" size={24} color="#2563EB" />
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
          <Ionicons name="close" size={21} color="#475569" />
        </Pressable>
      </View>
    </View>
  );
}

export default function AddPantryItemByIngredientScreen() {
  const router = useRouter();
  const { locationId, locationName, ingredientId } = useLocalSearchParams<{
    locationId?: string;
    locationName?: string;
    ingredientId?: string;
  }>();

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);

  const [selectedIngredient, setSelectedIngredient] =
    useState<Ingredient | null>(null);

  const [searchText, setSearchText] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [quantityUnit, setQuantityUnit] = useState("item");
  const [storageLocationId, setStorageLocationId] = useState(locationId ?? "");
  // A location passed in via route params (e.g. "add here" from a specific
  // storage location page) is itself a deliberate choice — don't let the
  // suggestion effect below override it.
  const [storageLocationTouched, setStorageLocationTouched] = useState(!!locationId);
  const [purchaseDate, setPurchaseDate] = useState(todayDateInputString());
  const [expiryDate, setExpiryDate] = useState("");
  const [expiryTouched, setExpiryTouched] = useState(false);

  const [showLocationOptions, setShowLocationOptions] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPageData() {
      try {
        const [loadedIngredients, loadedStorageLocations, loadedUnits, loadedPantryItems] =
          await Promise.all([
            getIngredients(),
            getStorageLocations(),
            getUnitSuggestions(),
            getPantryItems(),
          ]);

        if (cancelled) {
          return;
        }

        const ingredientList = Array.isArray(loadedIngredients) ? loadedIngredients : [];
        setIngredients(ingredientList);

        setStorageLocations(
          Array.isArray(loadedStorageLocations) ? loadedStorageLocations : [],
        );

        setUnitOptions(Array.isArray(loadedUnits) ? loadedUnits : []);
        setPantryItems(Array.isArray(loadedPantryItems) ? loadedPantryItems : []);

        if (ingredientId) {
          const match = ingredientList.find((i) => i._id === ingredientId);
          if (match) {
            setSelectedIngredient(match);
            setQuantityUnit(match.defaultPortionUnit ?? "item");
          }
        }
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
      (ingredient) => !ingredient.isArchived,
    );

    if (!query) {
      return activeIngredients;
    }

    return activeIngredients.filter((ingredient) => {
      const brandName = getReferenceName(ingredient.brand);
      const categoryName = getReferenceName(ingredient.category);

      const searchableValues = [
        ingredient.name,
        brandName,
        categoryName,
        ingredient.barcode ?? "",
        ingredient.description ?? "",
      ];

      return searchableValues.some((value) =>
        value.toLowerCase().includes(query),
      );
    });
  }, [ingredients, searchText]);

  const selectedStorageLocation = useMemo(
    () =>
      storageLocations.find((location) => location._id === storageLocationId),
    [storageLocationId, storageLocations],
  );

  // Recent pantry history for whichever ingredient is selected — the basis
  // for both "smart default" suggestions below.
  const recentIngredientHistory = useMemo(() => {
    if (!selectedIngredient) return [];
    return recentPantryEntries(
      pantryItems.filter((item) => referenceId(item.ingredient) === selectedIngredient._id),
    );
  }, [pantryItems, selectedIngredient]);

  const suggestedLocation = useMemo(
    () => suggestStorageLocation(recentIngredientHistory),
    [recentIngredientHistory],
  );

  const suggestedExpiryDuration = useMemo(
    () => suggestExpiryDuration(recentIngredientHistory),
    [recentIngredientHistory],
  );

  // What actually drives the auto-fills below: the ingredient's own saved
  // default if it has one, otherwise the live suggestion from history.
  const effectiveLocation = useMemo(() => {
    const savedId = referenceId(selectedIngredient?.defaultStorageLocation);
    if (savedId) {
      const name =
        referenceName(selectedIngredient?.defaultStorageLocation) ||
        storageLocations.find((location) => location._id === savedId)?.name ||
        "";
      return { id: savedId, name };
    }
    return suggestedLocation;
  }, [selectedIngredient, suggestedLocation, storageLocations]);

  const effectiveExpiryDuration = useMemo(() => {
    if (
      selectedIngredient?.defaultExpiryDurationAmount != null &&
      selectedIngredient.defaultExpiryDurationUnit
    ) {
      return {
        amount: selectedIngredient.defaultExpiryDurationAmount,
        unit: selectedIngredient.defaultExpiryDurationUnit,
      };
    }
    return suggestedExpiryDuration;
  }, [selectedIngredient, suggestedExpiryDuration]);

  useEffect(() => {
    if (storageLocationTouched || !effectiveLocation) return;
    setStorageLocationId(effectiveLocation.id);
  }, [effectiveLocation, storageLocationTouched]);

  useEffect(() => {
    if (expiryTouched || !effectiveExpiryDuration) return;
    setExpiryDate(
      addDurationToDate(purchaseDate, effectiveExpiryDuration.amount, effectiveExpiryDuration.unit),
    );
  }, [purchaseDate, effectiveExpiryDuration, expiryTouched]);

  async function handleSave() {
    if (!selectedIngredient) {
      Alert.alert(
        "Select an ingredient",
        "Choose an ingredient before adding it to your pantry.",
      );
      return;
    }

    const parsedQuantity = Number(quantity);

    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      Alert.alert(
        "Invalid quantity",
        "Enter a valid quantity of zero or greater.",
      );
      return;
    }

    if (!quantityUnit.trim()) {
      Alert.alert("Unit required", "Select or enter a quantity unit.");
      return;
    }

    if (!storageLocationId) {
      Alert.alert(
        "Storage location required",
        "Select where this ingredient is stored.",
      );
      return;
    }

    try {
      setSaving(true);

      await addIngredientToPantry({
        ingredient: selectedIngredient._id,
        storageLocation: storageLocationId,
        quantityAvailable: parsedQuantity,
        quantityUnit: quantityUnit.trim(),
        purchaseDate: purchaseDate.trim() || undefined,
        expiryDate: expiryDate.trim() || undefined,
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
        ],
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
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>

          <View className="ml-2 flex-1">
            <Text className="text-xl font-bold text-slate-950">
              Add to pantry
            </Text>

            <Text className="text-sm text-slate-500">
              {locationName ? `Storing in ${locationName}` : "Choose an existing ingredient"}
            </Text>
          </View>
        </View>

        {!selectedIngredient ? (
          <View className="flex-1 px-5 pt-5">
            {/* Search */}
            <View className="h-14 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4">
              <Ionicons name="search-outline" size={21} color="#64748B" />

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
                <Pressable onPress={() => setSearchText("")}>
                  <Ionicons name="close-circle" size={21} color="#94A3B8" />
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
                const brandName = getReferenceName(ingredient.brand);

                const categoryName = getReferenceName(ingredient.category);

                return (
                  <Pressable
                    className="mb-2.5 flex-row items-center rounded-2xl border border-slate-200 bg-white p-4 active:bg-slate-50"
                    onPress={() => {
                      setSelectedIngredient(ingredient);

                      if (ingredient.defaultPortionUnit) {
                        setQuantityUnit(ingredient.defaultPortionUnit);
                      }

                      if (ingredient.defaultPortionAmount !== undefined) {
                        setQuantity(String(ingredient.defaultPortionAmount));
                      }

                      // A location passed in via route params stays pinned
                      // regardless of which ingredient gets picked; otherwise
                      // let this ingredient's own suggestion apply fresh.
                      if (!locationId) {
                        setStorageLocationId("");
                        setStorageLocationTouched(false);
                      }
                      setExpiryDate("");
                      setExpiryTouched(false);
                    }}
                  >
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                      <Ionicons
                        name="nutrition-outline"
                        size={18}
                        color="#2563EB"
                      />
                    </View>

                    <View className="ml-3 flex-1">
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
                  <Ionicons name="search-outline" size={44} color="#94A3B8" />

                  <Text className="mt-4 text-lg font-bold text-slate-950">
                    No ingredients found
                  </Text>

                  <Text className="mt-2 text-center text-slate-500">
                    Try another search or create a new ingredient from the
                    ingredients page.
                  </Text>
                </View>
              }
            />
          </View>
        ) : (
          <View className="flex-1 px-5 pt-5">
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <SelectedIngredientCard
              ingredient={selectedIngredient}
              onClear={() => {
                setSelectedIngredient(null);
                setShowLocationOptions(false);
              }}
            />

            {/* Quantity */}
            <Text className="mb-2 mt-6 text-sm font-semibold text-slate-700">
              Quantity
            </Text>

            <QuantityServingInput
              quantityAvailable={quantity}
              quantityUnit={quantityUnit}
              onChangeQuantity={setQuantity}
              onChangeUnit={setQuantityUnit}
              unitOptions={unitOptions}
              onAddUnit={(unit) => {
                const trimmed = unit.trim();
                if (!trimmed) return;
                setUnitOptions((current) =>
                  current.some((u) => u.toLowerCase() === trimmed.toLowerCase())
                    ? current
                    : [...current, trimmed].sort((a, b) => a.localeCompare(b)),
                );
              }}
              defaultPortionAmount={selectedIngredient.defaultPortionAmount}
              defaultPortionUnit={selectedIngredient.defaultPortionUnit}
            />

            {/* Storage location */}
            <Text className="mb-2 mt-6 text-sm font-semibold text-slate-700">
              Storage location
            </Text>

            {effectiveLocation && !storageLocationTouched ? (
              <Text className="mb-2 text-xs leading-4 text-slate-500">
                Auto-filled from{" "}
                {selectedIngredient.defaultStorageLocation
                  ? "this ingredient's default"
                  : "recent purchase history"}
                .
              </Text>
            ) : null}

            <View className="relative">
              <Pressable
                className="h-14 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4"
                onPress={() => {
                  setShowLocationOptions((current) => !current);
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
                  {selectedStorageLocation?.name ?? "Choose a storage location"}
                </Text>

                <Ionicons
                  name={showLocationOptions ? "chevron-up" : "chevron-down"}
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
                          setStorageLocationTouched(true);
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

            {/* Dates */}
            <View className="mt-6 flex-row">
              <View className="mr-3 flex-1">
                <Text className="mb-2 text-sm font-semibold text-slate-700">
                  Purchase date
                </Text>
                <DateTextInput
                  value={purchaseDate}
                  onChangeText={setPurchaseDate}
                  className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
                />
              </View>
              <View className="flex-1">
                <Text className="mb-2 text-sm font-semibold text-slate-700">
                  Expiry date
                </Text>
                <DateTextInput
                  value={expiryDate}
                  onChangeText={(value) => {
                    setExpiryDate(value);
                    setExpiryTouched(true);
                  }}
                  className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
                />
              </View>
            </View>

            {effectiveExpiryDuration && !expiryTouched ? (
              <Text className="mt-2 text-xs leading-4 text-slate-500">
                Expiry auto-filled from{" "}
                {selectedIngredient.defaultExpiryDurationAmount != null
                  ? "this ingredient's default"
                  : "recent purchase history"}{" "}
                ({effectiveExpiryDuration.amount} {effectiveExpiryDuration.unit}
                {effectiveExpiryDuration.amount > 1 ? "s" : ""}).
              </Text>
            ) : null}

            <Text className="mb-2 mt-4 text-sm font-semibold text-slate-700">
              Or set expiry from purchase date
            </Text>
            <DurationExpiryInput
              purchaseDate={purchaseDate}
              initialAmount={
                effectiveExpiryDuration ? String(effectiveExpiryDuration.amount) : undefined
              }
              initialUnit={effectiveExpiryDuration?.unit}
              onApply={(value) => {
                setExpiryDate(value);
                setExpiryTouched(true);
              }}
            />
          </ScrollView>

            <View className="pb-6 pt-4">
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
