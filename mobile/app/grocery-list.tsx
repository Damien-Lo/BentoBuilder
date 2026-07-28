import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import {
  createStorageLocation,
  getStorageLocations,
  getUnitSuggestions,
  type SelectOption,
} from "@/src/services/optionsApi";
import { addIngredientToPantry, getPantryItems } from "@/src/services/pantryApi";
import type { PantryItem } from "@/src/types/pantry";
import {
  CreatableStringDropdown,
  DurationExpiryInput,
  FieldLabel,
  SearchableObjectDropdown,
} from "@/src/components/forms";
import {
  clearCompletedGroceryItems,
  createGroceryItem,
  deleteGroceryItem,
  getGroceryItems,
  updateGroceryItem,
  type GroceryItem,
  type GroceryItemStatus,
} from "@/src/services/groceryListApi";
import { loadSettings } from "@/src/services/settingsService";
import { getRelatedUnits, type CustomUnitConversion } from "@/src/utils/unitConversion";
import { addDurationToDate, todayDateInputString } from "@/src/utils/date";
import { resolveOrCreateOption } from "@/src/utils/resolveOrCreateOption";
import {
  recentPantryEntries,
  referenceId,
  referenceName,
  suggestExpiryDuration,
  suggestStorageLocation,
} from "@/src/utils/pantryDefaults";

// A pendingLog item can only be logged to pantry directly when it's linked
// to a specific/branded ingredient — generics can't hold pantry stock
// (mirrors the same rule enforced by the pantry API), and free-text items
// have no ingredient to log at all. Both of those are a future step.
function isDirectlyLoggable(item: GroceryItem): boolean {
  return (
    typeof item.ingredient === "object" &&
    item.ingredient !== null &&
    !item.ingredient.isGeneric
  );
}

function getReferenceName(value: unknown): string {
  if (typeof value === "object" && value !== null && "name" in value) {
    const name = (value as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}

export default function GroceryListScreen() {
  const router = useRouter();

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [customUnitConversions, setCustomUnitConversions] = useState<CustomUnitConversion[]>([]);
  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [nameInput, setNameInput] = useState("");
  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [adding, setAdding] = useState(false);

  // Log-to-pantry modal state
  const [loggingItem, setLoggingItem] = useState<GroceryItem | null>(null);
  const [logLocationId, setLogLocationId] = useState("");
  const [logLocationName, setLogLocationName] = useState("");
  const [logLocationDraft, setLogLocationDraft] = useState("");
  const [logPurchaseDate, setLogPurchaseDate] = useState("");
  const [logExpiryDate, setLogExpiryDate] = useState("");
  const [logQuantity, setLogQuantity] = useState("");
  const [logUnit, setLogUnit] = useState("");
  const [logSaving, setLogSaving] = useState(false);
  const [logLocationTouched, setLogLocationTouched] = useState(false);
  const [logExpiryTouched, setLogExpiryTouched] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [
          loadedIngredients,
          loadedUnits,
          loadedGroceryItems,
          loadedSettings,
          loadedLocations,
          loadedPantryItems,
        ] = await Promise.all([
          getIngredients(),
          getUnitSuggestions(),
          getGroceryItems(),
          loadSettings(),
          getStorageLocations(),
          getPantryItems(),
        ]);
        if (!cancelled) {
          setIngredients(Array.isArray(loadedIngredients) ? loadedIngredients : []);
          setUnitOptions(Array.isArray(loadedUnits) ? loadedUnits : []);
          setGroceryItems(loadedGroceryItems);
          setCustomUnitConversions(loadedSettings.unitConversions ?? []);
          setStorageLocations(Array.isArray(loadedLocations) ? loadedLocations : []);
          setPantryItems(Array.isArray(loadedPantryItems) ? loadedPantryItems : []);
        }
      } catch (err) {
        if (!cancelled) {
          Alert.alert(
            "Could not load",
            err instanceof Error ? err.message : "Failed to load the grocery list.",
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
  }, []);

  const grocerySuggestions = useMemo(() => {
    const q = nameInput.trim().toLowerCase();
    if (!q) return [];
    return ingredients.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 5);
  }, [ingredients, nameInput]);

  const selectedIngredient = useMemo(
    () => ingredients.find((i) => i._id === selectedIngredientId) ?? null,
    [ingredients, selectedIngredientId],
  );

  // Once an ingredient is picked, only units in its own family (mass,
  // volume, or a custom conversion linked to it) make sense to buy it in —
  // otherwise fall back to the full suggestion list for free-text items.
  const unitDropdownOptions = selectedIngredient?.defaultPortionUnit
    ? getRelatedUnits(selectedIngredient.defaultPortionUnit, customUnitConversions)
    : unitOptions;

  const toBuyItems = useMemo(
    () => groceryItems.filter((i) => i.status === "toBuy"),
    [groceryItems],
  );
  const pendingLogItems = useMemo(
    () => groceryItems.filter((i) => i.status === "pendingLog"),
    [groceryItems],
  );
  const completedItems = useMemo(
    () => groceryItems.filter((i) => i.status === "completed"),
    [groceryItems],
  );

  function selectSuggestion(ingredient: Ingredient) {
    setNameInput(ingredient.name);
    setSelectedIngredientId(ingredient._id);
    setUnit(ingredient.defaultPortionUnit || unit);
  }

  async function handleAddItem() {
    const name = nameInput.trim();
    if (!name || adding) return;

    try {
      setAdding(true);
      const created = await createGroceryItem({
        ingredient: selectedIngredientId || null,
        name,
        quantity: quantity.trim() ? Number(quantity) : null,
        unit: unit.trim(),
      });
      setGroceryItems((prev) => [...prev, created]);
      setNameInput("");
      setSelectedIngredientId("");
      setQuantity("");
      setUnit("");
    } catch (err) {
      Alert.alert(
        "Could not add item",
        err instanceof Error ? err.message : "Failed to add the item.",
      );
    } finally {
      setAdding(false);
    }
  }

  // toBuy -> pendingLog is the "checked off at the store" step. pendingLog
  // can only go back to toBuy here — advancing to "completed" isn't a plain
  // tap, it happens once the pantry-logging flow (storage location, expiry,
  // etc.) is built and actually completed. Tapping a completed item reverts
  // it by one step too, in case it was logged by mistake.
  function nextStatus(current: GroceryItemStatus): GroceryItemStatus {
    switch (current) {
      case "toBuy":
        return "pendingLog";
      case "pendingLog":
        return "toBuy";
      case "completed":
        return "pendingLog";
    }
  }

  async function handleAdvanceItem(item: GroceryItem) {
    const previousStatus = item.status;
    const status = nextStatus(previousStatus);
    setGroceryItems((prev) =>
      prev.map((i) => (i._id === item._id ? { ...i, status } : i)),
    );
    try {
      await updateGroceryItem(item._id, { status });
    } catch (err) {
      setGroceryItems((prev) =>
        prev.map((i) => (i._id === item._id ? { ...i, status: previousStatus } : i)),
      );
      Alert.alert(
        "Could not update item",
        err instanceof Error ? err.message : "Failed to update the item.",
      );
    }
  }

  async function handleDeleteItem(id: string) {
    const previous = groceryItems;
    setGroceryItems((prev) => prev.filter((i) => i._id !== id));
    try {
      await deleteGroceryItem(id);
    } catch (err) {
      setGroceryItems(previous);
      Alert.alert(
        "Could not delete item",
        err instanceof Error ? err.message : "Failed to delete the item.",
      );
    }
  }

  async function handleClearCompleted() {
    const previous = groceryItems;
    setGroceryItems((prev) => prev.filter((i) => i.status !== "completed"));
    try {
      await clearCompletedGroceryItems();
    } catch (err) {
      setGroceryItems(previous);
      Alert.alert(
        "Could not clear items",
        err instanceof Error ? err.message : "Failed to clear completed items.",
      );
    }
  }

  function handleTapPendingItem(item: GroceryItem) {
    if (!isDirectlyLoggable(item)) {
      Alert.alert(
        "Not supported yet",
        typeof item.ingredient === "object" && item.ingredient?.isGeneric
          ? "Logging a generic ingredient to the pantry means picking which specific/branded product you bought — that flow isn't built yet."
          : "This item isn't linked to a catalog ingredient, so it can't be logged to the pantry yet.",
      );
      return;
    }

    const ingredient = item.ingredient as { defaultPortionUnit?: string };

    setLoggingItem(item);
    setLogLocationId("");
    setLogLocationName("");
    setLogLocationDraft("");
    setLogLocationTouched(false);
    setLogPurchaseDate(todayDateInputString());
    setLogExpiryDate("");
    setLogExpiryTouched(false);
    setLogQuantity(item.quantity != null ? String(item.quantity) : "");
    setLogUnit(item.unit || ingredient.defaultPortionUnit || "");
  }

  function closeLogModal() {
    setLoggingItem(null);
  }

  const loggingIngredientUnit =
    loggingItem && typeof loggingItem.ingredient === "object" && loggingItem.ingredient
      ? loggingItem.ingredient.defaultPortionUnit
      : undefined;

  const logUnitOptions = loggingIngredientUnit
    ? getRelatedUnits(loggingIngredientUnit, customUnitConversions)
    : unitOptions;

  const loggingIngredientId =
    loggingItem && typeof loggingItem.ingredient === "object" && loggingItem.ingredient
      ? loggingItem.ingredient._id
      : null;

  // The grocery item's populated ingredient is a thin projection — look up
  // the full record (with defaultStorageLocation/defaultExpiryDuration...)
  // from the ingredient catalog already loaded on this page.
  const loggingFullIngredient = useMemo(
    () => (loggingIngredientId ? ingredients.find((i) => i._id === loggingIngredientId) ?? null : null),
    [ingredients, loggingIngredientId],
  );

  const recentLoggingHistory = useMemo(() => {
    if (!loggingIngredientId) return [];
    return recentPantryEntries(
      pantryItems.filter((item) => referenceId(item.ingredient) === loggingIngredientId),
    );
  }, [pantryItems, loggingIngredientId]);

  const suggestedLogLocation = useMemo(
    () => suggestStorageLocation(recentLoggingHistory),
    [recentLoggingHistory],
  );

  const suggestedLogExpiryDuration = useMemo(
    () => suggestExpiryDuration(recentLoggingHistory),
    [recentLoggingHistory],
  );

  // What actually drives the auto-fills below: the ingredient's own saved
  // default if it has one, otherwise the live suggestion from history.
  const effectiveLogLocation = useMemo(() => {
    const savedId = referenceId(loggingFullIngredient?.defaultStorageLocation);
    if (savedId) {
      const name =
        referenceName(loggingFullIngredient?.defaultStorageLocation) ||
        storageLocations.find((location) => location._id === savedId)?.name ||
        "";
      return { id: savedId, name };
    }
    return suggestedLogLocation;
  }, [loggingFullIngredient, suggestedLogLocation, storageLocations]);

  const effectiveLogExpiryDuration = useMemo(() => {
    if (
      loggingFullIngredient?.defaultExpiryDurationAmount != null &&
      loggingFullIngredient.defaultExpiryDurationUnit
    ) {
      return {
        amount: loggingFullIngredient.defaultExpiryDurationAmount,
        unit: loggingFullIngredient.defaultExpiryDurationUnit,
      };
    }
    return suggestedLogExpiryDuration;
  }, [loggingFullIngredient, suggestedLogExpiryDuration]);

  useEffect(() => {
    if (!loggingItem || logLocationTouched || !effectiveLogLocation) return;
    setLogLocationId(effectiveLogLocation.id);
    setLogLocationName(effectiveLogLocation.name);
    setLogLocationDraft(effectiveLogLocation.name);
  }, [loggingItem, effectiveLogLocation, logLocationTouched]);

  useEffect(() => {
    if (!loggingItem || logExpiryTouched || !effectiveLogExpiryDuration) return;
    setLogExpiryDate(
      addDurationToDate(logPurchaseDate, effectiveLogExpiryDuration.amount, effectiveLogExpiryDuration.unit),
    );
  }, [loggingItem, logPurchaseDate, effectiveLogExpiryDuration, logExpiryTouched]);

  async function handleCreatePantryEntry() {
    if (!loggingItem) return;

    const ingredientId =
      typeof loggingItem.ingredient === "object" && loggingItem.ingredient
        ? loggingItem.ingredient._id
        : null;
    if (!ingredientId) return;

    const qty = Number(logQuantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert("Invalid quantity", "Enter a quantity greater than 0.");
      return;
    }
    if (!logUnit.trim()) {
      Alert.alert("Unit required", "Select or enter a unit.");
      return;
    }

    try {
      setLogSaving(true);

      const storageLocation = await resolveOrCreateOption(
        storageLocations,
        logLocationId,
        logLocationDraft,
        createStorageLocation,
      );
      if (!storageLocation) {
        Alert.alert("Storage location required", "Search or type a storage location.");
        return;
      }
      if (!storageLocations.some((l) => l._id === storageLocation._id)) {
        setStorageLocations((prev) => [...prev, storageLocation]);
      }

      await addIngredientToPantry({
        ingredient: ingredientId,
        storageLocation: storageLocation._id,
        quantityAvailable: qty,
        quantityUnit: logUnit.trim(),
        purchaseDate: logPurchaseDate || undefined,
        expiryDate: logExpiryDate || undefined,
      });

      const updated = await updateGroceryItem(loggingItem._id, { status: "completed" });
      setGroceryItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
      setLoggingItem(null);
    } catch (err) {
      Alert.alert(
        "Could not log to pantry",
        err instanceof Error ? err.message : "Failed to create the pantry entry.",
      );
    } finally {
      setLogSaving(false);
    }
  }

  function renderGroceryRow(item: GroceryItem) {
    const isPending = item.status === "pendingLog";
    const isCompleted = item.status === "completed";

    const circleClassName = isCompleted
      ? "border-emerald-500 bg-emerald-500"
      : isPending
        ? "border-amber-500 bg-amber-500"
        : "border-slate-300";

    return (
      <ReanimatedSwipeable
        key={item._id}
        friction={2}
        rightThreshold={40}
        renderLeftActions={() => (
          <Pressable
            className="mb-2.5 w-20 items-center justify-center rounded-2xl bg-red-500 active:bg-red-600"
            onPress={() => void handleDeleteItem(item._id)}
          >
            <Ionicons name="trash-outline" size={22} color="white" />
          </Pressable>
        )}
      >
        <Pressable
          onPress={() =>
            isPending ? handleTapPendingItem(item) : void handleAdvanceItem(item)
          }
          className="mb-2.5 flex-row items-center rounded-2xl border border-slate-200 bg-white p-4 active:bg-slate-50"
        >
          <View className={`h-6 w-6 items-center justify-center rounded-full border-2 ${circleClassName}`}>
            {isCompleted && <Ionicons name="checkmark" size={14} color="white" />}
            {isPending && <Ionicons name="time-outline" size={13} color="white" />}
          </View>
          <View className="ml-4 flex-1">
            <Text
              className={`text-base ${
                isCompleted ? "text-slate-400 line-through" : "font-medium text-slate-900"
              }`}
            >
              {item.name}
            </Text>
            {isPending ? (
              <Text className="mt-0.5 text-xs text-amber-600">
                {isDirectlyLoggable(item) ? "Tap to log to pantry" : "Tap for more info"}
              </Text>
            ) : (
              !isCompleted &&
              typeof item.ingredient === "object" &&
              item.ingredient && (
                <Text className="mt-0.5 text-xs text-blue-500">
                  {item.ingredient.isGeneric ? "Generic ingredient" : "Linked ingredient"}
                </Text>
              )
            )}
          </View>
          {(item.quantity != null || item.unit) && (
            <Text className="ml-2 text-sm text-slate-400">
              {item.quantity ?? ""} {item.unit ?? ""}
            </Text>
          )}
        </Pressable>
      </ReanimatedSwipeable>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="mt-3 text-slate-500">Loading grocery list...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
          <Pressable
            className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>
          <Text className="ml-2 flex-1 text-xl font-bold text-slate-950">Grocery List</Text>
        </View>

        {/* Add item row */}
        <View className="mx-5 mt-5 flex-row items-center gap-3">
          <View className="h-12 flex-1 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4">
            <TextInput
              value={nameInput}
              onChangeText={(value) => {
                setNameInput(value);
                if (selectedIngredientId) {
                  const selected = ingredients.find((i) => i._id === selectedIngredientId);
                  if (selected?.name !== value) setSelectedIngredientId("");
                }
              }}
              onSubmitEditing={() => void handleAddItem()}
              returnKeyType="done"
              placeholder="Search ingredients or add any item…"
              placeholderTextColor="#94A3B8"
              className="flex-1 text-base text-slate-900"
            />
            {nameInput.length > 0 && (
              <Pressable
                onPress={() => {
                  setNameInput("");
                  setSelectedIngredientId("");
                }}
              >
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </Pressable>
            )}
          </View>
          <Pressable
            disabled={adding}
            onPress={() => void handleAddItem()}
            className={`h-12 w-12 items-center justify-center rounded-2xl ${
              adding ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
            }`}
          >
            <Ionicons name="add" size={26} color="white" />
          </Pressable>
        </View>

        {/* Quantity + unit — optional, applies to the item about to be added */}
        <View className="mx-5 mt-3 flex-row items-center gap-3">
          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            placeholder="Qty"
            placeholderTextColor="#94A3B8"
            className="h-12 w-20 rounded-2xl border border-slate-200 bg-white px-3 text-center text-base text-slate-900"
          />
          <View className="flex-1">
            <CreatableStringDropdown
              options={unitDropdownOptions}
              selectedValue={unit}
              placeholder="Unit (optional)"
              onSelect={setUnit}
            />
          </View>
        </View>

        {/* Ingredient suggestions */}
        {grocerySuggestions.length > 0 && (
          <View className="mx-5 mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {grocerySuggestions.map((ing, idx) => {
              const categoryName = getReferenceName(ing.category);
              return (
                <Pressable
                  key={ing._id}
                  onPress={() => selectSuggestion(ing)}
                  className={`flex-row items-center px-4 py-3 active:bg-slate-50 ${
                    idx > 0 ? "border-t border-slate-100" : ""
                  }`}
                >
                  <View className="h-8 w-8 items-center justify-center rounded-full bg-blue-50">
                    <Ionicons name="nutrition-outline" size={16} color="#2563EB" />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="font-medium text-slate-900">{ing.name}</Text>
                    <Text className="text-xs text-slate-400">
                      {[ing.isGeneric ? "Generic" : null, categoryName || null]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  {selectedIngredientId === ing._id && (
                    <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
                  )}
                </Pressable>
              );
            })}
            {!grocerySuggestions.some(
              (i) => i.name.toLowerCase() === nameInput.trim().toLowerCase(),
            ) && (
              <Pressable
                onPress={() => void handleAddItem()}
                className="flex-row items-center border-t border-slate-100 px-4 py-3 active:bg-slate-50"
              >
                <View className="h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                  <Ionicons name="add" size={16} color="#475569" />
                </View>
                <Text className="ml-3 flex-1 font-medium text-slate-700">
                  Add &quot;{nameInput.trim()}&quot; as a one-off item
                </Text>
              </Pressable>
            )}
          </View>
        )}

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {groceryItems.length === 0 ? (
            <View className="mt-8 items-center rounded-2xl border border-slate-200 bg-white px-6 py-16">
              <Ionicons name="cart-outline" size={42} color="#94A3B8" />
              <Text className="mt-4 text-lg font-bold text-slate-900">List is empty</Text>
              <Text className="mt-2 text-center text-slate-500">
                Add items above to start your grocery list.
              </Text>
            </View>
          ) : (
            <>
              {toBuyItems.length > 0 && (
                <View className="mb-5">
                  <Text className="mb-2.5 text-xs font-bold uppercase tracking-widest text-slate-400">
                    To buy <Text className="font-semibold text-slate-300">· {toBuyItems.length}</Text>
                  </Text>
                  {toBuyItems.map(renderGroceryRow)}
                </View>
              )}

              {pendingLogItems.length > 0 && (
                <View className="mb-5">
                  <Text className="mb-2.5 text-xs font-bold uppercase tracking-widest text-slate-400">
                    Pending pantry log{" "}
                    <Text className="font-semibold text-slate-300">· {pendingLogItems.length}</Text>
                  </Text>
                  {pendingLogItems.map(renderGroceryRow)}
                </View>
              )}

              {completedItems.length > 0 && (
                <View className="mb-5">
                  <Text className="mb-2.5 text-xs font-bold uppercase tracking-widest text-slate-400">
                    Completed <Text className="font-semibold text-slate-300">· {completedItems.length}</Text>
                  </Text>
                  {completedItems.map(renderGroceryRow)}

                  <Pressable
                    onPress={() => void handleClearCompleted()}
                    className="mt-2 items-center rounded-2xl bg-slate-100 py-3 active:bg-slate-200"
                  >
                    <Text className="text-sm font-semibold text-slate-500">
                      Clear completed items
                    </Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Log to pantry — small overlay card, not a full sheet */}
      <Modal visible={!!loggingItem} transparent animationType="fade" onRequestClose={closeLogModal}>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View className="flex-1 items-center justify-center bg-black/40 px-6">
            <Pressable className="absolute inset-0" onPress={closeLogModal} />

            <View className="w-full rounded-3xl bg-white p-5">
              <Text className="text-lg font-bold text-slate-950">{loggingItem?.name}</Text>
              <Text className="mt-0.5 mb-4 text-sm text-slate-400">Log to pantry</Text>

              <FieldLabel text="Storage location" required />
              <SearchableObjectDropdown<SelectOption>
                options={storageLocations}
                selectedId={logLocationId}
                selectedName={logLocationName}
                placeholder="Search or type a new location"
                onTextChange={(value) => {
                  if (value !== logLocationName) setLogLocationId("");
                  setLogLocationDraft(value);
                  setLogLocationTouched(true);
                }}
                onSelect={(option) => {
                  setLogLocationId(option._id);
                  setLogLocationName(option.name);
                  setLogLocationDraft(option.name);
                  setLogLocationTouched(true);
                }}
              />
              {effectiveLogLocation && !logLocationTouched ? (
                <Text className="mt-1.5 text-xs leading-4 text-slate-400">
                  Auto-filled from{" "}
                  {loggingFullIngredient?.defaultStorageLocation
                    ? "this ingredient's default"
                    : "recent purchase history"}
                  .
                </Text>
              ) : null}

              <View className="mt-3 flex-row">
                <View className="mr-3 flex-1">
                  <FieldLabel text="Purchase date" />
                  <TextInput
                    value={logPurchaseDate}
                    onChangeText={setLogPurchaseDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
                  />
                </View>
                <View className="flex-1">
                  <FieldLabel text="Expiry date" />
                  <TextInput
                    value={logExpiryDate}
                    onChangeText={(value) => {
                      setLogExpiryDate(value);
                      setLogExpiryTouched(true);
                    }}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
                  />
                </View>
              </View>

              {effectiveLogExpiryDuration && !logExpiryTouched ? (
                <Text className="mt-1.5 text-xs leading-4 text-slate-400">
                  Expiry auto-filled from{" "}
                  {loggingFullIngredient?.defaultExpiryDurationAmount != null
                    ? "this ingredient's default"
                    : "recent purchase history"}{" "}
                  ({effectiveLogExpiryDuration.amount} {effectiveLogExpiryDuration.unit}
                  {effectiveLogExpiryDuration.amount > 1 ? "s" : ""}).
                </Text>
              ) : null}

              <View className="mt-2">
                <DurationExpiryInput
                  purchaseDate={logPurchaseDate}
                  initialAmount={
                    effectiveLogExpiryDuration ? String(effectiveLogExpiryDuration.amount) : undefined
                  }
                  initialUnit={effectiveLogExpiryDuration?.unit}
                  onApply={(value) => {
                    setLogExpiryDate(value);
                    setLogExpiryTouched(true);
                  }}
                />
              </View>

              <View className="mt-3 flex-row items-center gap-3">
                <TextInput
                  value={logQuantity}
                  onChangeText={setLogQuantity}
                  keyboardType="decimal-pad"
                  placeholder="Qty"
                  placeholderTextColor="#94A3B8"
                  className="h-12 w-20 rounded-2xl border border-slate-200 bg-white px-3 text-center text-base text-slate-900"
                />
                <View className="flex-1">
                  <CreatableStringDropdown
                    options={logUnitOptions}
                    selectedValue={logUnit}
                    placeholder="Unit"
                    onSelect={setLogUnit}
                  />
                </View>
              </View>

              <View className="mt-5 flex-row gap-3">
                <Pressable
                  disabled={logSaving}
                  onPress={closeLogModal}
                  className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200"
                >
                  <Text className="text-sm font-semibold text-slate-600">Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={logSaving}
                  onPress={() => void handleCreatePantryEntry()}
                  className={`flex-1 items-center rounded-2xl py-3.5 ${
                    logSaving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
                  }`}
                >
                  <Text className="text-sm font-semibold text-white">
                    {logSaving ? "Adding..." : "Add"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
