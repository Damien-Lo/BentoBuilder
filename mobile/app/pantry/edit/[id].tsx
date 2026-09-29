import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
  createStore,
  getStorageLocations,
  getStores,
  getUnitSuggestions,
  type SelectOption,
} from "@/src/services/optionsApi";
import { deletePantryItem, getPantryItemById, updatePantryItem } from "@/src/services/pantryApi";
import type { PantryItem } from "@/src/types/pantry";
import {
  DatePickerField,
  FieldLabel,
  FormCard,
  DurationExpiryInput,
  PriceInput,
  QuantityServingInput,
  SearchableObjectDropdown,
} from "@/src/components/forms";
import { loadSettings } from "@/src/services/settingsService";
import { resolveOrCreateOption } from "@/src/utils/resolveOrCreateOption";
import { toDateOnly } from "@/src/utils/date";
import { useScrollFocusSection } from "@/src/hooks/useScrollFocusSection";
import { getIngredientConversions, type CustomUnitConversion } from "@/src/utils/unitConversion";

type ReferenceObject = { _id?: string; id?: string; name?: string };

function isReferenceObject(v: unknown): v is ReferenceObject {
  return typeof v === "object" && v !== null;
}

function getReferenceId(v: unknown): string {
  if (typeof v === "string") return v;
  if (!isReferenceObject(v)) return "";
  if (typeof v._id === "string") return v._id;
  if (typeof v.id === "string") return v.id;
  return "";
}

function getReferenceName(v: unknown): string {
  if (!isReferenceObject(v)) return "";
  return typeof v.name === "string" ? v.name : "";
}

function getIngredientName(item: PantryItem): string {
  const ing = item.ingredient as unknown;
  if (
    isReferenceObject(ing) &&
    typeof (ing as ReferenceObject).name === "string"
  ) {
    return (ing as ReferenceObject).name!;
  }
  return "Unknown ingredient";
}

function getIngredientId(item: PantryItem): string {
  return getReferenceId(item.ingredient as unknown);
}

interface FormState {
  quantityAvailable: string;
  quantityUnit: string;
  storageLocationId: string;
  storageLocationName: string;
  purchaseDate: string;
  expiryDate: string;
  purchasePrice: string;
  storeId: string;
  storeName: string;
  notes: string;
}

function itemToForm(item: PantryItem): FormState {
  return {
    quantityAvailable: String(item.quantityAvailable ?? ""),
    quantityUnit: item.quantityUnit ?? "",
    storageLocationId: getReferenceId(item.storageLocation as unknown),
    storageLocationName: getReferenceName(item.storageLocation as unknown),
    purchaseDate: toDateOnly(item.purchaseDate),
    expiryDate: toDateOnly(item.expiryDate),
    purchasePrice: item.purchasePrice != null ? String(item.purchasePrice) : "",
    storeId: getReferenceId(item.store as unknown),
    storeName: getReferenceName(item.store as unknown),
    notes: item.notes ?? "",
  };
}

export default function EditPantryItemScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [item, setItem] = useState<PantryItem | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);
  const [stores, setStores] = useState<SelectOption[]>([]);
  const [storeDraft, setStoreDraft] = useState("");
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [customUnitConversions, setCustomUnitConversions] = useState<CustomUnitConversion[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Scrolls whichever field was just focused/opened into view — see
  // useScrollFocusSection for why zIndex has to descend in on-screen order
  // (only the fields that can show a dropdown need one; plain text fields
  // default to 0 and don't need to be listed here). Store is the only
  // dropdown-capable field on this page.
  const scrollRef = useRef<ScrollView>(null);
  const scrollAnchorRef = useRef<View>(null);
  const quantitySection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const datesSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const expiryDurationSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const storeSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 20);
  const priceSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const notesSection = useScrollFocusSection(scrollRef, scrollAnchorRef);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const [loadedItem, loadedLocations, loadedStores, loadedUnits, loadedSettings] = await Promise.all([
          getPantryItemById(id),
          getStorageLocations(),
          getStores(),
          getUnitSuggestions(),
          loadSettings(),
        ]);

        if (cancelled) return;

        const loadedForm = itemToForm(loadedItem);
        setItem(loadedItem);
        setForm(loadedForm);
        setStoreDraft(loadedForm.storeName);
        setStorageLocations(
          Array.isArray(loadedLocations) ? loadedLocations : [],
        );
        setStores(Array.isArray(loadedStores) ? loadedStores : []);
        setUnitOptions(Array.isArray(loadedUnits) ? loadedUnits : []);
        setCustomUnitConversions(loadedSettings.unitConversions ?? []);
      } catch (err) {
        if (!cancelled) {
          Alert.alert(
            "Could not load",
            err instanceof Error ? err.message : "Failed to load pantry item.",
            [{ text: "OK", onPress: () => router.back() }],
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
  }, [id]);

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [field]: value } : f));
  }

  async function handleSave() {
    if (!form) return;

    const qty = Number(form.quantityAvailable);
    if (!Number.isFinite(qty) || qty < 0) {
      Alert.alert("Invalid quantity", "Enter a valid quantity of 0 or more.");
      return;
    }
    if (!form.quantityUnit.trim()) {
      Alert.alert("Unit required", "Enter a quantity unit.");
      return;
    }
    if (!form.storageLocationId) {
      Alert.alert("Location required", "Select a storage location.");
      return;
    }

    const trimmedPrice = form.purchasePrice.trim();
    const price = trimmedPrice ? Number(trimmedPrice) : null;
    if (trimmedPrice && (!Number.isFinite(price) || (price as number) < 0)) {
      Alert.alert("Invalid price", "Enter a valid price of 0 or more.");
      return;
    }

    try {
      setSaving(true);

      const store = await resolveOrCreateOption(stores, form.storeId, storeDraft, createStore);
      if (store && !stores.some((s) => s._id === store._id)) {
        setStores((prev) => [...prev, store]);
      }

      await updatePantryItem(id, {
        quantityAvailable: qty,
        quantityUnit: form.quantityUnit.trim(),
        storageLocation: form.storageLocationId,
        purchaseDate: form.purchaseDate || undefined,
        expiryDate: form.expiryDate || undefined,
        purchasePrice: price,
        store: store ? store._id : null,
        notes: form.notes.trim() || undefined,
      });
      router.back();
    } catch (err) {
      Alert.alert(
        "Could not save",
        err instanceof Error ? err.message : "Failed to save changes.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    Alert.alert("Delete pantry entry", "Remove this entry from your pantry?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setSaving(true);
            await deletePantryItem(id);
            router.back();
          } catch (err) {
            Alert.alert(
              "Unable to delete",
              err instanceof Error ? err.message : "Could not delete entry.",
            );
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="mt-3 text-slate-500">Loading...</Text>
      </SafeAreaView>
    );
  }

  if (!item || !form) return null;

  const ingredientName = getIngredientName(item);
  const ingredientId = getIngredientId(item);

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
          <Pressable
            className="h-11 items-center justify-center px-1 active:opacity-60"
            onPress={() => router.back()}
            disabled={saving}
          >
            <Text className="text-base font-medium text-slate-500">Cancel</Text>
          </Pressable>

          <Text
            className="ml-2 flex-1 text-xl font-bold text-slate-950"
            numberOfLines={1}
          >
            {ingredientName}
          </Text>

          <Pressable
            disabled={saving}
            className={`rounded-xl px-4 py-2 ${saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}
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
            paddingTop: 16,
            paddingBottom: 60,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View ref={scrollAnchorRef} collapsable={false} />
          {/* Ingredient info link */}
          {ingredientId ? (
            <Pressable
              className="mb-3 flex-row items-center rounded-3xl border border-slate-200 bg-white p-4 active:bg-slate-50"
              onPress={() =>
                router.push({
                  pathname: "/ingredients/edit/[id]",
                  params: { id: ingredientId },
                })
              }
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                <Ionicons name="nutrition-outline" size={18} color="#2563EB" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-sm font-semibold text-slate-900">
                  {ingredientName}
                </Text>
                <Text className="mt-0.5 text-xs text-slate-400">
                  Tap to view ingredient details
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </Pressable>
          ) : null}

          <FormCard icon="cube-outline" title="Quantity" description="How much of this entry is left." zIndex={30}>
            <View className="mt-3" {...quantitySection.wrapperProps}>
              <QuantityServingInput
                quantityAvailable={form.quantityAvailable}
                quantityUnit={form.quantityUnit}
                onChangeQuantity={(v) => update("quantityAvailable", v)}
                onChangeUnit={(v) => update("quantityUnit", v)}
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
                defaultPortionAmount={item.ingredient?.defaultPortionAmount}
                defaultPortionUnit={item.ingredient?.defaultPortionUnit}
                initialMode="total"
                customUnitConversions={getIngredientConversions(item.ingredient, customUnitConversions)}
                onFocus={quantitySection.trigger}
              />
            </View>
          </FormCard>

          <FormCard icon="calendar-outline" title="Where & when" description="Where it's stored, and when it expires." zIndex={20}>
            <FieldLabel text="Storage location" />
            <View className="relative">
              <Pressable
                className="flex-row items-center rounded-2xl border border-slate-200 bg-white px-4"
                style={{ height: 56 }}
                onPress={() => {
                  setShowLocationPicker((v) => !v);
                }}
              >
                <Ionicons
                  name="file-tray-stacked-outline"
                  size={20}
                  color="#64748B"
                />
                <Text
                  className={`ml-3 flex-1 text-base ${form.storageLocationId ? "text-slate-950" : "text-slate-400"}`}
                >
                  {form.storageLocationName || "Choose a location"}
                </Text>
                <Ionicons
                  name={showLocationPicker ? "chevron-up" : "chevron-down"}
                  size={18}
                  color="#64748B"
                />
              </Pressable>

              {showLocationPicker && (
                <View
                  className="absolute left-0 right-0 top-16 z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
                  style={{ elevation: 20 }}
                >
                  {storageLocations.map((loc) => (
                    <Pressable
                      key={loc._id}
                      className="border-b border-slate-100 px-4 py-4"
                      onPress={() => {
                        update("storageLocationId", loc._id);
                        update("storageLocationName", loc.name);
                        setShowLocationPicker(false);
                      }}
                    >
                      <Text className="text-base text-slate-800">{loc.name}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <View className="flex-row gap-3" {...datesSection.wrapperProps}>
              <View className="flex-1">
                <FieldLabel text="Purchase date" />
                <DatePickerField
                  title="Purchase date"
                  value={form.purchaseDate}
                  placeholder="None"
                  clearable
                  onChange={(v) => update("purchaseDate", v)}
                  onFocus={datesSection.trigger}
                />
              </View>
              <View className="flex-1">
                <FieldLabel text="Expiry date" />
                <DatePickerField
                  title="Expiry date"
                  value={form.expiryDate}
                  placeholder="None"
                  clearable
                  onChange={(v) => update("expiryDate", v)}
                  onFocus={datesSection.trigger}
                />
              </View>
            </View>

            <View className="mt-3 rounded-2xl bg-blue-50/60 px-3 pb-3 pt-1" {...expiryDurationSection.wrapperProps}>
              <FieldLabel text="Or set expiry from purchase date" />
              <DurationExpiryInput
                purchaseDate={form.purchaseDate}
                onApply={(expiryDate) => update("expiryDate", expiryDate)}
                onFocus={expiryDurationSection.trigger}
              />
            </View>
          </FormCard>

          <FormCard icon="receipt-outline" title="Purchase details" description="Optional — where you bought it and any notes." zIndex={10}>
            <View className="flex-row gap-3">
              <View className="flex-1" {...storeSection.wrapperProps}>
                <FieldLabel text="Store" />
                <SearchableObjectDropdown<SelectOption>
                  options={stores}
                  selectedId={form.storeId}
                  selectedName={form.storeName}
                  placeholder="Search"
                  onOpen={storeSection.trigger}
                  onTextChange={(value) => {
                    if (value !== form.storeName) update("storeId", "");
                    setStoreDraft(value);
                  }}
                  onSelect={(option) => {
                    update("storeId", option._id);
                    update("storeName", option.name);
                    setStoreDraft(option.name);
                  }}
                />
              </View>

              <View className="flex-1" {...priceSection.wrapperProps}>
                <FieldLabel text="Price paid" />
                <PriceInput
                  value={form.purchasePrice}
                  onChangeText={(v) => update("purchasePrice", v)}
                  onFocus={priceSection.trigger}
                />
              </View>
            </View>

            <View {...notesSection.wrapperProps}>
              <FieldLabel text="Notes" />
              <TextInput
                value={form.notes}
                onChangeText={(v) => update("notes", v)}
                onFocus={notesSection.trigger}
                placeholder="Optional notes"
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                className="min-h-24 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950"
              />
            </View>
          </FormCard>

          <Pressable
            disabled={saving}
            onPress={() => void handleSave()}
            className={`mt-2 items-center rounded-2xl py-4 ${saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}
          >
            <Text className="text-base font-semibold text-white">{saving ? "Saving..." : "Save changes"}</Text>
          </Pressable>

          <Pressable
            disabled={saving}
            className="mt-3 items-center rounded-2xl border border-red-200 bg-red-50 py-3.5 active:bg-red-100"
            onPress={handleDelete}
          >
            <Text className="font-semibold text-red-600">Delete pantry entry</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
