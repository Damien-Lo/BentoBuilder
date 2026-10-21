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

import { useWideForm } from "@/src/components/forms/wideForm";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
  createStore,
  getStorageLocations,
  getStores,
  getUnitSuggestions,
  type SelectOption,
} from "@/src/services/optionsApi";
import { deletePantryItem, getMoveSuggestion, getPantryItemById, updatePantryItem, type MoveSuggestion } from "@/src/services/pantryApi";
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
import { formatDateDisplay, toDateOnly, todayDateInputString } from "@/src/utils/date";
import { useScrollFocusSection } from "@/src/hooks/useScrollFocusSection";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitPage, OrbitSection, useOrbitTheme } from "@/src/theme/orbit";
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
  // The day it was opened, or "" while it's still sealed.
  openedDate: string;
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
    openedDate: toDateOnly(item.openedDate),
    purchasePrice: item.purchasePrice != null ? String(item.purchasePrice) : "",
    storeId: getReferenceId(item.store as unknown),
    storeName: getReferenceName(item.store as unknown),
    notes: item.notes ?? "",
  };
}

export default function EditPantryItemScreen() {
  return (
    <OrbitSection section="kitchen">
      <EditPantryItem />
    </OrbitSection>
  );
}

function EditPantryItem() {
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
  // Moved to a different place than it's saved in: the expiry date offered
  // for there (a move gives it a new one), or null when it's back where it was.
  const [move, setMove] = useState<MoveSuggestion | null>(null);

  // Picking a location. Somewhere new is a move: the expiry date becomes
  // the one for there — what this ingredient was given on that kind of move
  // before, or a usual figure — still to be changed by hand before saving.
  // Opening it — the seal broken, the packaging off — is the same kind of
  // thing as a move: a change of state, with a new expiry date offered.
  function toggleOpened() {
    if (!item || !form) return;
    const original = itemToForm(item);
    if (form.openedDate) {
      update("openedDate", "");
      // (Back to the date it had, unless it's also been moved.)
      if (move?.kind === "opened") {
        setMove(null);
        update("expiryDate", original.expiryDate);
      }
      return;
    }
    update("openedDate", todayDateInputString());
    getMoveSuggestion(item._id, { kind: "opened" }, todayDateInputString()).then(
      (suggestion) => {
        // A move's date stands if there's one already: it's the bigger change.
        if (move) return;
        setMove(suggestion);
        update("expiryDate", suggestion.expiryDate);
      },
      () => {},
    );
  }

  function pickLocation(loc: SelectOption) {
    if (!item || !form) return;
    update("storageLocationId", loc._id);
    update("storageLocationName", loc.name);
    setShowLocationPicker(false);
    const original = itemToForm(item);
    if (loc._id === original.storageLocationId) {
      // (Unless it's been opened here too: then that's the change standing.)
      if (move?.kind !== "opened") {
        setMove(null);
        update("expiryDate", original.expiryDate);
      }
      return;
    }
    getMoveSuggestion(item._id, { to: loc._id }, todayDateInputString()).then(
      (suggestion) => {
        setMove(suggestion);
        update("expiryDate", suggestion.expiryDate);
      },
      () => setMove(null),
    );
  }

  // Scrolls whichever field was just focused/opened into view — see
  // useScrollFocusSection for why zIndex has to descend in on-screen order
  // (only the fields that can show a dropdown need one; plain text fields
  // default to 0 and don't need to be listed here). Store is the only
  // dropdown-capable field on this page.
  const layout = useWideForm();
  // On a phone, in Orbit's look, light or dark (`o`: its colours); a
  // desktop browser keeps the desktop's for now. The cards, fields and
  // dropdowns in it follow by themselves (OrbitPage).
  const { colors, dark } = useOrbitTheme();
  const o = layout.wide ? null : colors;
  const field = o && { backgroundColor: o.surface, borderColor: o.border };
  // Soft tints, in either theme.
  const tint = (light: string, darkTint: string) => (dark ? darkTint : light);
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
        openedDate: form.openedDate || null,
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
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50" style={o && { backgroundColor: o.canvas }}>
        <ActivityIndicator size="large" color={o?.muted ?? "#2563EB"} />
        <Text className="mt-3 text-slate-500" style={o && { color: o.muted }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  if (!item || !form) return null;

  const ingredientName = getIngredientName(item);
  const ingredientId = getIngredientId(item);

  return (
    <OrbitPage on={!!o}>
    <SafeAreaView className="flex-1 bg-slate-50" style={o && { backgroundColor: o.canvas }} edges={o ? ["top", "left", "right"] : undefined}>
      <KeyboardAvoidingView
        className="flex-1"
        style={layout.page}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header (phone): the way back and Save over a large title, on
            the page itself */}
        {o ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -4 }}>
              <Tap onPress={() => router.back()} disabled={saving} accessibilityLabel="Cancel" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: o.surface, borderWidth: 1, borderColor: o.border }} pressedStyle={{ backgroundColor: o.pill }}>
                <Ionicons name="chevron-back" size={22} color={o.text} />
              </Tap>
              <View style={{ flex: 1 }} />
              <Tap disabled={saving} onPress={() => void handleSave()} style={{ height: 40, justifyContent: "center", paddingHorizontal: 18, borderRadius: 20, backgroundColor: o.ink, opacity: saving ? 0.5 : 1 }} pressedStyle={{ opacity: 0.8 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: o.onInk }}>{saving ? "Saving..." : "Save"}</Text>
              </Tap>
            </View>
            <Text numberOfLines={2} style={{ marginTop: 12, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: o.text }}>
              {ingredientName}
            </Text>
          </View>
        ) : (
          // Header
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
        )}

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
          {ingredientId ? (() => {
            const openIngredient = () =>
              router.push({
                pathname: "/ingredients/edit/[id]",
                params: { id: ingredientId },
              });
            const link = (
              <>
                <View className="h-10 w-10 items-center justify-center rounded-full bg-blue-50" style={o && { backgroundColor: o.pill }}>
                  <Ionicons name="nutrition-outline" size={18} color={o?.onPill ?? "#2563EB"} />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-semibold text-slate-900" style={o && { color: o.text }}>
                    {ingredientName}
                  </Text>
                  <Text className="mt-0.5 text-xs text-slate-400" style={o && { color: o.faint }}>
                    Tap to view ingredient details
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={o?.faint ?? "#94A3B8"} />
              </>
            );
            return o ? (
              <Tap
                onPress={openIngredient}
                style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", borderRadius: 20, borderWidth: 1, borderColor: o.border, backgroundColor: o.surface, padding: 16 }}
                pressedStyle={{ backgroundColor: o.pill }}
              >
                {link}
              </Tap>
            ) : (
              <Pressable
                className="mb-3 flex-row items-center rounded-3xl border border-slate-200 bg-white p-4 active:bg-slate-50"
                onPress={openIngredient}
              >
                {link}
              </Pressable>
            );
          })() : null}

          {/* (In a desktop browser: two columns.) */}
          <View style={layout.columns}>
          <View style={[layout.column, { zIndex: 2 }]}>
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
          </View>
          <View style={[layout.column, { zIndex: 1 }]}>

          <FormCard icon="calendar-outline" title="Where & when" description="Where it's stored, and when it expires." zIndex={20}>
            <FieldLabel text="Storage location" />
            {/* (Over the fields below it while its list is open.) */}
            <View className="relative" style={{ zIndex: showLocationPicker ? 30 : 0 }}>
              <Pressable
                className="flex-row items-center rounded-2xl border border-slate-200 bg-white px-4"
                style={[{ height: 56 }, field]}
                onPress={() => {
                  setShowLocationPicker((v) => !v);
                }}
              >
                <Ionicons
                  name="file-tray-stacked-outline"
                  size={20}
                  color={o?.muted ?? "#64748B"}
                />
                <Text
                  className={`ml-3 flex-1 text-base ${form.storageLocationId ? "text-slate-950" : "text-slate-400"}`}
                  style={o && { color: form.storageLocationId ? o.text : o.faint }}
                >
                  {form.storageLocationName || "Choose a location"}
                </Text>
                <Ionicons
                  name={showLocationPicker ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={o?.muted ?? "#64748B"}
                />
              </Pressable>

              {showLocationPicker && (
                <View
                  className="absolute left-0 right-0 top-16 z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
                  style={[{ elevation: 20 }, field]}
                >
                  {storageLocations.map((loc) => (
                    <Pressable
                      key={loc._id}
                      className="border-b border-slate-100 px-4 py-4"
                      style={o && { borderBottomColor: o.border }}
                      onPress={() => pickLocation(loc)}
                    >
                      <Text className="text-base text-slate-800" style={o && { color: loc._id === form.storageLocationId ? o.ink : o.text }}>{loc.name}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Sealed, or opened: opening it changes how long it keeps. */}
            {o ? (
              <Tap onPress={toggleOpened} accessibilityRole="checkbox" accessibilityLabel="Opened" style={{ marginTop: 12, height: 52, flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: o.border, backgroundColor: o.surface, paddingHorizontal: 16 }} pressedStyle={{ backgroundColor: o.pill }}>
                <Ionicons name={form.openedDate ? "checkbox" : "square-outline"} size={20} color={form.openedDate ? o.ink : o.muted} />
                <Text style={{ marginLeft: 12, flex: 1, fontSize: 16, color: o.text }}>Opened</Text>
                <Text style={{ fontSize: 14, color: o.muted }}>{form.openedDate ? formatDateDisplay(form.openedDate) : "Still sealed"}</Text>
              </Tap>
            ) : (
              <Pressable onPress={toggleOpened} accessibilityRole="checkbox" accessibilityLabel="Opened" className="mt-3 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4 active:bg-slate-50" style={{ height: 52 }}>
                <Ionicons name={form.openedDate ? "checkbox" : "square-outline"} size={20} color={form.openedDate ? "#2563EB" : "#64748B"} />
                <Text className="ml-3 flex-1 text-base text-slate-900">Opened</Text>
                <Text className="text-sm text-slate-500">{form.openedDate ? formatDateDisplay(form.openedDate) : "Still sealed"}</Text>
              </Pressable>
            )}

            {/* A change of state: what the new date is, and why. */}
            {move && (
              <View className="mb-3 mt-3 flex-row rounded-2xl bg-violet-50 px-3 py-2.5" style={o && { backgroundColor: tint("#F5F3FF", "rgba(139,92,246,0.18)") }}>
                <Ionicons name={move.kind === "thawed" ? "water-outline" : move.kind === "frozen" ? "snow-outline" : move.kind === "opened" ? "cut-outline" : "swap-horizontal"} size={17} color={o ? tint("#6D28D9", "#C4B5FD") : "#6D28D9"} style={{ marginTop: 1 }} />
                <Text className="ml-2 flex-1 text-[13px] leading-5 text-violet-900" style={o && { color: tint("#4C1D95", "#DDD6FE") }}>
                  {move.kind === "thawed" ? "Out of the freezer" : move.kind === "frozen" ? "Into the freezer" : move.kind === "opened" ? "Opened" : `Moved to ${form.storageLocationName}`}: the expiry date is now{" "}
                  <Text className="font-semibold">{formatDateDisplay(move.expiryDate)}</Text>, {move.days} day{move.days === 1 ? "" : "s"} from today (
                  {move.learned ? "what you\u2019ve given it before" : "a usual figure"}). Change it below if that isn&apos;t right.
                </Text>
              </View>
            )}

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

            <View className="mt-3 rounded-2xl bg-blue-50/60 px-3 pb-3 pt-1" {...expiryDurationSection.wrapperProps} style={[expiryDurationSection.wrapperProps.style, o && { backgroundColor: o.pill }]}>
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
                placeholderTextColor={o?.faint ?? "#94A3B8"}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                className="min-h-24 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950"
                style={o && { ...field, color: o.text }}
              />
            </View>
          </FormCard>
          </View>
          </View>

          {o ? (
            <View>
              <Tap
                disabled={saving}
                onPress={() => void handleSave()}
                style={{ marginTop: 8, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: o.ink, opacity: saving ? 0.5 : 1 }}
                pressedStyle={{ opacity: 0.85 }}
              >
                <Text style={{ fontSize: 16, fontWeight: "700", color: o.onInk }}>{saving ? "Saving..." : "Save changes"}</Text>
              </Tap>

              <Tap
                disabled={saving}
                onPress={handleDelete}
                style={{ marginTop: 12, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: tint("#FEF2F2", "rgba(248,113,113,0.14)") }}
                pressedStyle={{ opacity: 0.7 }}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: o.danger }}>Delete pantry entry</Text>
              </Tap>
            </View>
          ) : (
            <View style={layout.actions}>
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
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </OrbitPage>
  );
}
