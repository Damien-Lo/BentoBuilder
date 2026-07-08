import { useEffect, useState } from "react";
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
  getStorageLocations,
  getUnitSuggestions,
  type SelectOption,
} from "@/src/services/optionsApi";
import {
  getPantryItemById,
  updatePantryItem,
} from "@/src/services/pantryApi";
import type { PantryItem } from "@/src/types/pantry";

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
  if (isReferenceObject(ing) && typeof (ing as ReferenceObject).name === "string") {
    return (ing as ReferenceObject).name!;
  }
  return "Unknown ingredient";
}

function toDateInput(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return dateStr.slice(0, 10);
}

interface FormState {
  quantityAvailable: string;
  quantityUnit: string;
  storageLocationId: string;
  storageLocationName: string;
  purchaseDate: string;
  expiryDate: string;
  notes: string;
}

function itemToForm(item: PantryItem): FormState {
  return {
    quantityAvailable: String(item.quantityAvailable ?? ""),
    quantityUnit: item.quantityUnit ?? "",
    storageLocationId: getReferenceId(item.storageLocation as unknown),
    storageLocationName: getReferenceName(item.storageLocation as unknown),
    purchaseDate: toDateInput(item.purchaseDate),
    expiryDate: toDateInput(item.expiryDate),
    notes: item.notes ?? "",
  };
}

export default function EditPantryItemScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [item, setItem] = useState<PantryItem | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const [loadedItem, loadedLocations, loadedUnits] = await Promise.all([
          getPantryItemById(id),
          getStorageLocations(),
          getUnitSuggestions(),
        ]);

        if (cancelled) return;

        setItem(loadedItem);
        setForm(itemToForm(loadedItem));
        setStorageLocations(Array.isArray(loadedLocations) ? loadedLocations : []);
        setUnitOptions(Array.isArray(loadedUnits) ? loadedUnits : []);
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
    return () => { cancelled = true; };
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

    try {
      setSaving(true);
      await updatePantryItem(id, {
        quantityAvailable: qty,
        quantityUnit: form.quantityUnit.trim(),
        storageLocation: form.storageLocationId,
        purchaseDate: form.purchaseDate || undefined,
        expiryDate: form.expiryDate || undefined,
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
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Quantity row */}
          <Text className="mb-1.5 text-sm font-semibold text-slate-700">
            Quantity
          </Text>
          <View className="mb-5 flex-row">
            <TextInput
              value={form.quantityAvailable}
              onChangeText={(v) => update("quantityAvailable", v)}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#94A3B8"
              className="mr-3 h-14 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
            />

            {/* Unit picker */}
            <View className="relative flex-1">
              <Pressable
                className="h-14 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4"
                onPress={() => {
                  setShowUnitPicker((v) => !v);
                  setShowLocationPicker(false);
                }}
              >
                <Text
                  className={`flex-1 text-base ${form.quantityUnit ? "text-slate-950" : "text-slate-400"}`}
                >
                  {form.quantityUnit || "Unit"}
                </Text>
                <Ionicons
                  name={showUnitPicker ? "chevron-up" : "chevron-down"}
                  size={18}
                  color="#64748B"
                />
              </Pressable>

              {showUnitPicker && (
                <View
                  className="absolute left-0 right-0 top-16 z-50 max-h-52 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
                  style={{ elevation: 20 }}
                >
                  {unitOptions.map((unit) => (
                    <Pressable
                      key={unit}
                      className="border-b border-slate-100 px-4 py-3"
                      onPress={() => {
                        update("quantityUnit", unit);
                        setShowUnitPicker(false);
                      }}
                    >
                      <Text className="text-base text-slate-800">{unit}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </View>

          {/* Storage location */}
          <Text className="mb-1.5 text-sm font-semibold text-slate-700">
            Storage location
          </Text>
          <View className="relative mb-5">
            <Pressable
              className="h-14 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4"
              onPress={() => {
                setShowLocationPicker((v) => !v);
                setShowUnitPicker(false);
              }}
            >
              <Ionicons name="file-tray-stacked-outline" size={20} color="#64748B" />
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

          {/* Dates */}
          <View className="mb-5 flex-row">
            <View className="mr-3 flex-1">
              <Text className="mb-1.5 text-sm font-semibold text-slate-700">
                Purchase date
              </Text>
              <TextInput
                value={form.purchaseDate}
                onChangeText={(v) => update("purchaseDate", v)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
              />
            </View>
            <View className="flex-1">
              <Text className="mb-1.5 text-sm font-semibold text-slate-700">
                Expiry date
              </Text>
              <TextInput
                value={form.expiryDate}
                onChangeText={(v) => update("expiryDate", v)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
              />
            </View>
          </View>

          {/* Notes */}
          <Text className="mb-1.5 text-sm font-semibold text-slate-700">
            Notes
          </Text>
          <TextInput
            value={form.notes}
            onChangeText={(v) => update("notes", v)}
            placeholder="Optional notes"
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            className="min-h-24 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
