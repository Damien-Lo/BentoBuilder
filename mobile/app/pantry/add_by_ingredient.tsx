import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
  createStore,
  getStorageLocations,
  getStores,
  getUnitSuggestions,
  type SelectOption,
} from "@/src/services/optionsApi";

import { addIngredientToPantry, getPantryItems } from "@/src/services/pantryApi";
import type { PantryItem } from "@/src/types/pantry";
import {
  CreatableStringDropdown,
  CreateGenericIngredientModal,
  DatePickerField,
  FieldLabel,
  FormCard,
  DurationExpiryInput,
  PriceInput,
  SearchableObjectDropdown,
  SegmentedToggle,
  UnitFamilyDropdown,
} from "@/src/components/forms";
import { loadSettings } from "@/src/services/settingsService";
import { resolveOrCreateOption } from "@/src/utils/resolveOrCreateOption";
import { useWideForm } from "@/src/components/forms/wideForm";
import { useScrollFocusSection } from "@/src/hooks/useScrollFocusSection";
import { Tap } from "@/src/components/ui/Tap";
import { WebFormHeader } from "@/src/components/ingredients/web/WebFormHeader";
import { Button } from "@/src/components/web/ui";
import { OrbitPage, OrbitSection, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import { addDurationToDate, todayDateInputString } from "@/src/utils/date";
import {
  recentPantryEntries,
  referenceId,
  resolveEffectiveExpiryDuration,
  resolveEffectiveStorageLocation,
  suggestStore,
} from "@/src/utils/pantryDefaults";
import {
  convertAmountForUnitChange,
  convertUnits,
  getIngredientConversions,
  getRelatedUnits,
  type CustomUnitConversion,
} from "@/src/utils/unitConversion";

// One row = one physical pantry instance (a bag, a steak, a bottle) — its
// own amount and unit. For a piece-labeled ingredient (steak, fillet, ...)
// a row IS one piece, always; there's no separate count to set.
type QuantityRow = { amount: string; unit: string };

// A single price paid for a batch of rows is split by weight (a 227g steak
// costs more of the receipt total than a 150g one), not evenly — falls
// back to an even split only when the rows' units can't all be converted
// to a common one, since an unconvertible mix has no meaningful "weight."
// Rounds to cents and nudges the last row so the split still adds back up
// to what was actually paid.
function splitPriceByWeight(
  rows: { amount: number; unit: string }[],
  totalPrice: number,
  conversions: CustomUnitConversion[],
): number[] {
  if (rows.length <= 1) return [totalPrice];

  const baseUnit = rows[0].unit;
  const weights = rows.map((row) =>
    row.unit === baseUnit ? row.amount : convertUnits(row.amount, row.unit, baseUnit, conversions),
  );

  const totalWeight = weights.reduce(
    (sum: number | null, w) => (sum == null || w == null ? null : sum + w),
    0,
  );

  if (totalWeight == null || totalWeight <= 0) {
    const even = Math.round((totalPrice / rows.length) * 100) / 100;
    return rows.map(() => even);
  }

  const rounded = weights.map((w) => Math.round((totalPrice * (w as number) / totalWeight) * 100) / 100);
  const roundingRemainder = Math.round((totalPrice - rounded.reduce((sum, v) => sum + v, 0)) * 100) / 100;
  rounded[rounded.length - 1] = Math.round((rounded[rounded.length - 1] + roundingRemainder) * 100) / 100;
  return rounded;
}

type SelectedIngredientCardProps = {
  ingredient: Ingredient;
  onClear: () => void;
  // The page's Orbit colours on a phone, or null for the older look.
  o: OrbitColors | null;
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
  o,
}: SelectedIngredientCardProps) {
  const brandName = getReferenceName(ingredient.brand);
  const categoryName = getReferenceName(ingredient.category);

  return (
    <View className="rounded-2xl border border-blue-200 bg-blue-50 p-4" style={o && { backgroundColor: o.surface, borderColor: o.selectedRing, borderRadius: 20 }}>
      <View className="flex-row items-center">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-blue-100" style={o && { backgroundColor: o.ink }}>
          <Ionicons name="nutrition-outline" size={24} color={o?.onInk ?? "#2563EB"} />
        </View>

        <View className="ml-4 flex-1">
          <Text className="text-lg font-bold text-slate-950" style={o && { color: o.text }}>
            {ingredient.name}
          </Text>

          {(brandName || categoryName) && (
            <Text className="mt-1 text-sm text-slate-500" style={o && { color: o.muted }}>
              {[brandName, categoryName].filter(Boolean).join(" • ")}
            </Text>
          )}
        </View>

        {o ? (
          <Tap onPress={onClear} accessibilityLabel="Choose another" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: o.pill }} pressedStyle={{ opacity: 0.7 }}>
            <Ionicons name="close" size={21} color={o.onPill} />
          </Tap>
        ) : (
          <Pressable
            className="h-10 w-10 items-center justify-center rounded-full bg-white"
            onPress={onClear}
          >
            <Ionicons name="close" size={21} color="#475569" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function AddPantryItemByIngredientScreen() {
  return (
    <OrbitSection section="kitchen">
      <AddPantryItemByIngredient />
    </OrbitSection>
  );
}

function AddPantryItemByIngredient() {
  const router = useRouter();
  const { locationId, locationName, ingredientId, scannedQuantity, scannedQuantityUnit } = useLocalSearchParams<{
    locationId?: string;
    locationName?: string;
    ingredientId?: string;
    // Set only when arriving from a barcode scan that matched an existing
    // ingredient (see PantryMainPage's scanner handler) — the real scanned
    // package amount, e.g. "473" / "ml" for a bottle. Takes priority over
    // the ingredient's own defaultPortionAmount/Unit (a single-serving
    // size, e.g. "15 ml" for fish sauce) below, which is only a sane
    // default for the no-scan manual-add case.
    scannedQuantity?: string;
    scannedQuantityUnit?: string;
  }>();

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);
  const [stores, setStores] = useState<SelectOption[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [customUnitConversions, setCustomUnitConversions] = useState<CustomUnitConversion[]>([]);

  const [selectedIngredient, setSelectedIngredient] =
    useState<Ingredient | null>(null);

  const [searchText, setSearchText] = useState("");
  const [browseKind, setBrowseKind] = useState<"ingredient" | "mealPrep">("ingredient");
  const [showCreateIngredient, setShowCreateIngredient] = useState(false);
  const [quantityRows, setQuantityRows] = useState<QuantityRow[]>([
    { amount: "1", unit: "item" },
  ]);
  const [storageLocationId, setStorageLocationId] = useState(locationId ?? "");
  // A location passed in via route params (e.g. "add here" from a specific
  // storage location page) is itself a deliberate choice — don't let the
  // suggestion effect below override it.
  const [storageLocationTouched, setStorageLocationTouched] = useState(!!locationId);
  const [purchaseDate, setPurchaseDate] = useState(todayDateInputString());
  const [expiryDate, setExpiryDate] = useState("");
  const [expiryTouched, setExpiryTouched] = useState(false);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeDraft, setStoreDraft] = useState("");
  const [storeTouched, setStoreTouched] = useState(false);
  const [notes, setNotes] = useState("");

  const [showLocationOptions, setShowLocationOptions] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Scrolls whichever field was just focused/opened into view — see
  // useScrollFocusSection for why zIndex has to descend in on-screen order
  // (only the fields that can show a dropdown need one; plain text fields
  // default to 0 and don't need to be listed here). Store is the only
  // dropdown-capable field on this page.
  const layout = useWideForm();
  // In Orbit's look, light or dark (`o`: its colours) — on a phone, and in
  // a desktop browser with the desktop's own header and two columns. The
  // cards, fields, dropdowns and toggle in it follow by themselves
  // (OrbitPage).
  const { colors } = useOrbitTheme();
  const o = colors;
  const field = o && { backgroundColor: o.surface, borderColor: o.border };
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

    async function loadPageData() {
      try {
        const [
          loadedIngredients,
          loadedStorageLocations,
          loadedStores,
          loadedUnits,
          loadedPantryItems,
          loadedSettings,
        ] = await Promise.all([
          getIngredients(),
          getStorageLocations(),
          getStores(),
          getUnitSuggestions(),
          getPantryItems(),
          loadSettings(),
        ]);

        if (cancelled) {
          return;
        }

        const ingredientList = Array.isArray(loadedIngredients) ? loadedIngredients : [];
        setIngredients(ingredientList);

        setStorageLocations(
          Array.isArray(loadedStorageLocations) ? loadedStorageLocations : [],
        );

        setStores(Array.isArray(loadedStores) ? loadedStores : []);

        setUnitOptions(Array.isArray(loadedUnits) ? loadedUnits : []);
        setPantryItems(Array.isArray(loadedPantryItems) ? loadedPantryItems : []);
        setCustomUnitConversions(loadedSettings.unitConversions ?? []);

        if (ingredientId) {
          const match = ingredientList.find((i) => i._id === ingredientId);
          if (match) {
            setSelectedIngredient(match);
            setQuantityRows([
              {
                amount: scannedQuantity ?? (match.defaultPortionAmount != null ? String(match.defaultPortionAmount) : "1"),
                unit: scannedQuantityUnit || match.defaultPortionUnit || "item",
              },
            ]);
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
      (ingredient) =>
        !ingredient.isArchived &&
        Boolean(ingredient.isMealPrep) === (browseKind === "mealPrep"),
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
  }, [ingredients, searchText, browseKind]);

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

  // What actually drives the auto-fills below: the ingredient's own saved
  // default if it has one, otherwise the live suggestion from history.
  const effectiveLocation = useMemo(
    () =>
      resolveEffectiveStorageLocation(
        selectedIngredient?.defaultStorageLocation,
        storageLocations,
        recentIngredientHistory,
      ),
    [selectedIngredient, storageLocations, recentIngredientHistory],
  );

  const effectiveExpiryDuration = useMemo(
    () =>
      resolveEffectiveExpiryDuration(
        selectedIngredient?.defaultExpiryDurationAmount,
        selectedIngredient?.defaultExpiryDurationUnit,
        recentIngredientHistory,
      ),
    [selectedIngredient, recentIngredientHistory],
  );

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

  // The most frequently bought-from store across this ingredient's recent
  // history — no per-ingredient "default store" to check first, since store
  // is purely a per-purchase attribute.
  const suggestedStore = useMemo(
    () => suggestStore(recentIngredientHistory),
    [recentIngredientHistory],
  );

  useEffect(() => {
    if (storeTouched || !suggestedStore) return;
    setStoreId(suggestedStore.id);
    setStoreName(suggestedStore.name);
    setStoreDraft(suggestedStore.name);
  }, [suggestedStore, storeTouched]);

  const ingredientConversions = useMemo(
    () => getIngredientConversions(selectedIngredient, customUnitConversions),
    [selectedIngredient, customUnitConversions],
  );

  // Restricts a row's unit dropdown to the ingredient's own convertible
  // family (e.g. g/kg/oz) once it has a default unit to anchor one — same
  // rule already applied to recipe ingredient rows — so a unit that would
  // never participate in stock/availability math can't get picked.
  const familyUnits = useMemo(
    () =>
      selectedIngredient?.defaultPortionUnit
        ? getRelatedUnits(selectedIngredient.defaultPortionUnit, ingredientConversions)
        : [],
    [selectedIngredient, ingredientConversions],
  );

  function addQuantityRow() {
    setQuantityRows((rows) => {
      const last = rows[rows.length - 1];
      return [...rows, { amount: last?.amount ?? "1", unit: last?.unit ?? "item" }];
    });
  }

  function removeQuantityRow(index: number) {
    setQuantityRows((rows) => rows.filter((_, i) => i !== index));
  }

  function updateQuantityRowAmount(index: number, value: string) {
    setQuantityRows((rows) =>
      rows.map((row, i) => (i === index ? { ...row, amount: value } : row)),
    );
  }

  function updateQuantityRowUnit(index: number, unit: string) {
    setQuantityRows((rows) =>
      rows.map((row, i) => {
        if (i !== index) return row;
        const converted = convertAmountForUnitChange(
          Number(row.amount),
          row.unit,
          unit,
          ingredientConversions,
        );
        return { amount: converted != null ? String(converted) : row.amount, unit };
      }),
    );
  }

  // Shared by tapping a search result and by finishing the "create a new
  // ingredient" flow below — both land on the same quantity form.
  function handleSelectIngredient(ingredient: Ingredient) {
    setSelectedIngredient(ingredient);

    setQuantityRows([
      {
        amount: ingredient.defaultPortionAmount != null ? String(ingredient.defaultPortionAmount) : "1",
        unit: ingredient.defaultPortionUnit ?? "item",
      },
    ]);

    // A location passed in via route params stays pinned regardless of
    // which ingredient gets picked; otherwise let this ingredient's own
    // suggestion apply fresh.
    if (!locationId) {
      setStorageLocationId("");
      setStorageLocationTouched(false);
    }
    setExpiryDate("");
    setExpiryTouched(false);
    setPurchasePrice("");
    setStoreId("");
    setStoreName("");
    setStoreDraft("");
    setStoreTouched(false);
    setNotes("");
    setShowMoreDetails(false);
  }

  async function handleCreateStore(name: string): Promise<SelectOption> {
    const store = await createStore(name);
    setStores((current) =>
      current.some((s) => s._id === store._id)
        ? current
        : [...current, store].sort((a, b) => a.name.localeCompare(b.name)),
    );
    return store;
  }

  async function handleSave() {
    if (!selectedIngredient) {
      Alert.alert(
        "Select an ingredient",
        "Choose an ingredient before adding it to your pantry.",
      );
      return;
    }

    const parsedRows = quantityRows.map((row) => ({
      amount: Number(row.amount),
      unit: row.unit.trim(),
    }));

    if (parsedRows.some((row) => !Number.isFinite(row.amount) || row.amount <= 0)) {
      Alert.alert(
        "Invalid quantity",
        "Enter an amount greater than zero for every row.",
      );
      return;
    }

    if (parsedRows.some((row) => !row.unit)) {
      Alert.alert("Unit required", "Select or enter a unit for every row.");
      return;
    }

    if (!storageLocationId) {
      Alert.alert(
        "Storage location required",
        "Select where this ingredient is stored.",
      );
      return;
    }

    if (purchasePrice.trim()) {
      const parsedPrice = Number(purchasePrice);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        Alert.alert("Invalid price", "Enter a valid price of 0 or more.");
        return;
      }
    }

    // A price entered once for a batch of rows is the total for all of
    // them, not each — split proportionally to each row's weight so a
    // bigger piece is charged more of the total than a smaller one.
    const totalPrice = purchasePrice.trim() ? Number(purchasePrice) : undefined;
    const perRowPrices = totalPrice != null
      ? splitPriceByWeight(parsedRows, totalPrice, ingredientConversions)
      : parsedRows.map(() => undefined);

    try {
      setSaving(true);

      const store = await resolveOrCreateOption(stores, storeId, storeDraft, handleCreateStore);
      if (store && !stores.some((s) => s._id === store._id)) {
        setStores((prev) => [...prev, store]);
      }

      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        await addIngredientToPantry({
          ingredient: selectedIngredient._id,
          storageLocation: storageLocationId,
          quantityAvailable: row.amount,
          quantityUnit: row.unit,
          purchaseDate: purchaseDate.trim() || undefined,
          expiryDate: expiryDate.trim() || undefined,
          purchasePrice: perRowPrices[i],
          store: store ? store._id : null,
          notes: notes.trim() || undefined,
        });
      }

      Alert.alert(
        "Added to pantry",
        parsedRows.length > 1
          ? `${parsedRows.length} entries of ${selectedIngredient.name} were added to ${
              selectedStorageLocation?.name ?? "your pantry"
            }.`
          : `${selectedIngredient.name} was added to ${
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
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50" style={o && { backgroundColor: o.canvas }}>
        <ActivityIndicator size="large" color={o?.muted ?? "#2563EB"} />

        <Text className="mt-4 text-base text-slate-500" style={o && { color: o.muted }}>
          Loading ingredients...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <OrbitPage>
    <SafeAreaView className="flex-1 bg-slate-50" style={o && { backgroundColor: o.canvas }}>
      <KeyboardAvoidingView
        className="flex-1"
        style={layout.page}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header (phone): the way back over a large title, on the page itself */}
        {!layout.wide ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -4 }}>
              <Tap onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: o.surface, borderWidth: 1, borderColor: o.border }} pressedStyle={{ backgroundColor: o.pill }}>
                <Ionicons name="chevron-back" size={22} color={o.text} />
              </Tap>
            </View>
            <Text style={{ marginTop: 12, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: o.text }}>Add to pantry</Text>
            <Text style={{ marginTop: 2, fontSize: 14, color: o.muted }}>
              {locationName ? `Storing in ${locationName}` : "Choose an existing ingredient"}
            </Text>
          </View>
        ) : (
          // (Desktop: the title beside the way back.)
          <WebFormHeader
            title="Add to pantry"
            subtitle={locationName ? `Storing in ${locationName}` : "Choose an existing ingredient"}
            onBack={() => router.back()}
          />
        )}

        {!selectedIngredient ? (
          <View className="flex-1 px-5 pt-5" style={o && { paddingHorizontal: 16, paddingTop: 16 }}>
            <SegmentedToggle<"ingredient" | "mealPrep">
              options={[
                { value: "ingredient", label: "Ingredients" },
                { value: "mealPrep", label: "Meal preps" },
              ]}
              value={browseKind}
              onChange={setBrowseKind}
            />

            {/* Search */}
            <View className="mt-4 h-14 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4" style={o && { ...field, height: 48, borderRadius: 16, paddingHorizontal: 14 }}>
              <Ionicons name="search-outline" size={o ? 20 : 21} color={o?.muted ?? "#64748B"} />

              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder={
                  browseKind === "mealPrep" ? "Search meal preps" : "Search all ingredients"
                }
                placeholderTextColor={o?.faint ?? "#94A3B8"}
                autoCapitalize="none"
                autoCorrect={false}
                className="ml-3 flex-1 text-base text-slate-950"
                style={o && { color: o.text }}
              />

              {searchText.length > 0 && (
                <Pressable onPress={() => setSearchText("")}>
                  <Ionicons name="close-circle" size={21} color={o?.faint ?? "#94A3B8"} />
                </Pressable>
              )}
            </View>

            <Text className="mb-3 mt-6 text-sm font-bold uppercase tracking-wide text-slate-500" style={o && { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: o.faint, marginLeft: 4, marginBottom: 8 }}>
              {browseKind === "mealPrep" ? "Meal Preps" : "Ingredients"}
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

                const row = (
                  <>
                      <View className="h-10 w-10 items-center justify-center rounded-full bg-blue-50" style={o && { backgroundColor: o.pill }}>
                        <Ionicons
                          name="nutrition-outline"
                          size={18}
                          color={o?.onPill ?? "#2563EB"}
                        />
                      </View>

                      <View className="ml-3 flex-1">
                        <Text className="text-base font-bold text-slate-950" style={o && { fontSize: 15, fontWeight: "600", color: o.text }}>
                          {ingredient.name}
                        </Text>

                        {(brandName || categoryName) && (
                          <Text className="mt-1 text-sm text-slate-500" style={o && { marginTop: 2, fontSize: 13, color: o.muted }}>
                            {[brandName, categoryName]
                              .filter(Boolean)
                              .join(" • ")}
                          </Text>
                        )}
                      </View>

                      <Ionicons
                        name="chevron-forward"
                        size={o ? 18 : 21}
                        color={o?.faint ?? "#94A3B8"}
                      />
                  </>
                );

                return o ? (
                  <Tap
                    onPress={() => handleSelectIngredient(ingredient)}
                    style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", borderRadius: 18, borderWidth: 1, borderColor: o.border, backgroundColor: o.surface, paddingHorizontal: 14, paddingVertical: 12 }}
                    pressedStyle={{ backgroundColor: o.pill }}
                  >
                    {row}
                  </Tap>
                ) : (
                  <Pressable
                    className="mb-2.5 flex-row items-center rounded-2xl border border-slate-200 bg-white p-4 active:bg-slate-50"
                    onPress={() => handleSelectIngredient(ingredient)}
                  >
                    {row}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View className="items-center px-6 py-16">
                  <Ionicons name="search-outline" size={44} color={o?.faint ?? "#94A3B8"} />

                  <Text className="mt-4 text-lg font-bold text-slate-950" style={o && { color: o.text }}>
                    {browseKind === "mealPrep" ? "No meal preps found" : "No ingredients found"}
                  </Text>

                  <Text className="mt-2 text-center text-slate-500" style={o && { color: o.muted }}>
                    {browseKind === "mealPrep"
                      ? "Meal preps come from a recipe's \"Prepares\" section, not created here — try another search, or check the Meal Preps tab on the pantry page."
                      : "Try another search, or create a new ingredient below."}
                  </Text>

                  {browseKind === "ingredient" && (o ? (
                    <Tap
                      onPress={() => setShowCreateIngredient(true)}
                      style={{ marginTop: 20, height: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 20, borderRadius: 16, backgroundColor: o.ink }}
                      pressedStyle={{ opacity: 0.85 }}
                    >
                      <Ionicons name="add-circle-outline" size={18} color={o.onInk} />
                      <Text style={{ marginLeft: 8, fontSize: 15, fontWeight: "600", color: o.onInk }}>
                        Create &quot;{searchText.trim()}&quot;
                      </Text>
                    </Tap>
                  ) : (
                    <Pressable
                      className="mt-5 flex-row items-center rounded-2xl bg-blue-600 px-5 py-3 active:bg-blue-700"
                      onPress={() => setShowCreateIngredient(true)}
                    >
                      <Ionicons name="add-circle-outline" size={18} color="white" />
                      <Text className="ml-2 font-semibold text-white">
                        Create &quot;{searchText.trim()}&quot;
                      </Text>
                    </Pressable>
                  ))}
                </View>
              }
            />
          </View>
        ) : (
          <View className="flex-1 px-5 pt-5" style={o && { paddingHorizontal: 16, paddingTop: 16 }}>
          <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View ref={scrollAnchorRef} collapsable={false} />
            <SelectedIngredientCard
              o={o}
              ingredient={selectedIngredient}
              onClear={() => {
                setSelectedIngredient(null);
                setShowLocationOptions(false);
              }}
            />

            <View className="h-3" />
            {/* (In a desktop browser: two columns.) */}
            <View style={layout.columns}>
            <View style={[layout.column, { zIndex: 2 }]}>
            <FormCard icon="cube-outline" title="Quantity" description="How much you're adding." zIndex={30}>
            <View className="mt-3" {...quantitySection.wrapperProps}>

            {quantityRows.map((row, index) => (
              <View key={index} className="mb-2 flex-row items-center">
                <TextInput
                  value={row.amount}
                  onChangeText={(value) => updateQuantityRowAmount(index, value)}
                  onFocus={quantitySection.trigger}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={o?.faint ?? "#94A3B8"}
                  className="mr-3 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
                  style={[{ height: 56 }, o && { ...field, color: o.text }]}
                />

                <View className="flex-1">
                  {selectedIngredient.defaultPortionUnit ? (
                    <UnitFamilyDropdown
                      height={56}
                      unit={row.unit || selectedIngredient.defaultPortionUnit}
                      options={familyUnits}
                      onSelect={(unit) => updateQuantityRowUnit(index, unit)}
                    />
                  ) : (
                    <CreatableStringDropdown
                      options={unitOptions}
                      selectedValue={row.unit}
                      placeholder="Unit"
                      onSelect={(unit) => {
                        updateQuantityRowUnit(index, unit);
                        const trimmed = unit.trim();
                        if (!trimmed) return;
                        setUnitOptions((current) =>
                          current.some((u) => u.toLowerCase() === trimmed.toLowerCase())
                            ? current
                            : [...current, trimmed].sort((a, b) => a.localeCompare(b)),
                        );
                      }}
                    />
                  )}
                </View>

                {selectedIngredient.pieceLabel && (
                  <View className="ml-2 rounded-full bg-slate-100 px-2.5 py-2" style={o && { backgroundColor: o.pill }}>
                    <Text className="text-xs font-semibold text-slate-500" style={o && { color: o.onPill }}>
                      1× {selectedIngredient.pieceLabel}
                    </Text>
                  </View>
                )}

                {quantityRows.length > 1 && (
                  <Pressable
                    className="ml-2"
                    hitSlop={8}
                    onPress={() => removeQuantityRow(index)}
                  >
                    <Ionicons name="close-circle" size={22} color={o?.orbit ?? "#CBD5E1"} />
                  </Pressable>
                )}
              </View>
            ))}

            <Pressable
              className="mb-1 mt-1 flex-row items-center self-start active:opacity-60"
              onPress={addQuantityRow}
            >
              <Ionicons name="add-circle-outline" size={18} color={o?.accent ?? "#2563EB"} />
              <Text className="ml-1.5 text-sm font-semibold text-blue-600" style={o && { color: o.accent }}>
                {selectedIngredient.pieceLabel
                  ? `Add another ${selectedIngredient.pieceLabel}`
                  : "Add another entry"}
              </Text>
            </Pressable>
            </View>
            </FormCard>
            </View>
            <View style={[layout.column, { zIndex: 1 }]}>

            <FormCard icon="calendar-outline" title="Where & when" description="Where it's stored, and when it expires." zIndex={20}>
            <FieldLabel text="Storage location" />

            {effectiveLocation && !storageLocationTouched ? (
              <Text className="mb-2 text-xs leading-4 text-slate-500" style={o && { color: o.muted }}>
                Auto-filled from{" "}
                {selectedIngredient.defaultStorageLocation
                  ? "this ingredient's default"
                  : "recent purchase history"}
                .
              </Text>
            ) : null}

            {/* (Over the fields below it while its list is open.) */}
            <View className="relative" style={{ zIndex: showLocationOptions ? 30 : 0 }}>
              <Pressable
                className="flex-row items-center rounded-2xl border border-slate-200 bg-white px-4"
                style={[{ height: 56 }, field]}
                onPress={() => {
                  setShowLocationOptions((current) => !current);
                }}
              >
                <Ionicons
                  name="file-tray-stacked-outline"
                  size={21}
                  color={o?.muted ?? "#64748B"}
                />

                <Text
                  className={`ml-3 flex-1 text-base ${
                    selectedStorageLocation
                      ? "text-slate-950"
                      : "text-slate-400"
                  }`}
                  style={o && { color: selectedStorageLocation ? o.text : o.faint }}
                >
                  {selectedStorageLocation?.name ?? "Choose a storage location"}
                </Text>

                <Ionicons
                  name={showLocationOptions ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={o?.muted ?? "#64748B"}
                />
              </Pressable>

              {showLocationOptions && (
                <View
                  className="absolute left-0 right-0 top-16 z-50 max-h-60 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
                  style={[{ elevation: 20 }, field]}
                >
                  <FlatList
                    data={storageLocations}
                    keyExtractor={(location) => location._id}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item: location }) => (
                      <Pressable
                        className="border-b border-slate-100 px-4 py-4"
                        style={o && { borderBottomColor: o.border }}
                        onPress={() => {
                          setStorageLocationId(location._id);
                          setStorageLocationTouched(true);
                          setShowLocationOptions(false);
                        }}
                      >
                        <Text className="text-base text-slate-800" style={o && { color: location._id === storageLocationId ? o.ink : o.text }}>
                          {location.name}
                        </Text>
                      </Pressable>
                    )}
                  />
                </View>
              )}
            </View>

            {/* Dates */}
            <View className="flex-row gap-3" {...datesSection.wrapperProps}>
              <View className="flex-1">
                <FieldLabel text="Purchase date" />
                <DatePickerField
                  title="Purchase date"
                  value={purchaseDate}
                  onChange={setPurchaseDate}
                  onFocus={datesSection.trigger}
                />
              </View>
              <View className="flex-1">
                <FieldLabel text="Expiry date" />
                <DatePickerField
                  title="Expiry date"
                  value={expiryDate}
                  placeholder="None"
                  clearable
                  onChange={(value) => {
                    setExpiryDate(value);
                    setExpiryTouched(true);
                  }}
                  onFocus={datesSection.trigger}
                />
              </View>
            </View>

            {effectiveExpiryDuration && !expiryTouched ? (
              <Text className="mt-2 text-xs leading-4 text-slate-500" style={o && { color: o.muted }}>
                Expiry auto-filled from{" "}
                {selectedIngredient.defaultExpiryDurationAmount != null
                  ? "this ingredient's default"
                  : "recent purchase history"}{" "}
                ({effectiveExpiryDuration.amount} {effectiveExpiryDuration.unit}
                {effectiveExpiryDuration.amount > 1 ? "s" : ""}).
              </Text>
            ) : null}

            <View className="mt-3 rounded-2xl bg-blue-50/60 px-3 pb-3 pt-1" {...expiryDurationSection.wrapperProps} style={[expiryDurationSection.wrapperProps.style, o && { backgroundColor: o.pill }]}>
            <FieldLabel text="Or set expiry from purchase date" />
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
              onFocus={expiryDurationSection.trigger}
            />
            </View>
            </FormCard>

            <FormCard icon="receipt-outline" title="Purchase details" description="Optional — where you bought it and any notes." zIndex={10}>
            {showMoreDetails || storeId || storeDraft.trim() || purchasePrice.trim() ? (
              <>
                <View className="flex-row gap-3">
                <View className="flex-1" {...storeSection.wrapperProps}>
                <FieldLabel text="Store" />
                <SearchableObjectDropdown<SelectOption>
                  options={stores}
                  selectedId={storeId}
                  selectedName={storeName}
                  placeholder="Search"
                  onOpen={storeSection.trigger}
                  onTextChange={(value) => {
                    if (value !== storeName) setStoreId("");
                    setStoreDraft(value);
                    setStoreTouched(true);
                  }}
                  onSelect={(option) => {
                    setStoreId(option._id);
                    setStoreName(option.name);
                    setStoreDraft(option.name);
                    setStoreTouched(true);
                  }}
                />
                </View>

                <View className="flex-1" {...priceSection.wrapperProps}>
                <FieldLabel text="Price paid" />
                <PriceInput
                  value={purchasePrice}
                  onChangeText={setPurchasePrice}
                  onFocus={priceSection.trigger}
                />
                </View>
                </View>
                {suggestedStore && !storeTouched ? (
                  <Text className="mt-2 text-xs leading-4 text-slate-500" style={o && { color: o.muted }}>
                    Store auto-filled from recent purchase history.
                  </Text>
                ) : null}
              </>
            ) : (
              <Pressable
                className="mt-4 flex-row items-center self-start active:opacity-60"
                onPress={() => setShowMoreDetails(true)}
              >
                <Ionicons name="add-circle-outline" size={16} color={o?.accent ?? "#2563EB"} />
                <Text className="ml-1.5 text-sm font-semibold text-blue-600" style={o && { color: o.accent }}>
                  Add store or price
                </Text>
              </Pressable>
            )}

            <View {...notesSection.wrapperProps}>
            <FieldLabel text="Notes" />
            <TextInput
              value={notes}
              onChangeText={setNotes}
              onFocus={notesSection.trigger}
              placeholder="e.g. Half-used, keep away from the window"
              placeholderTextColor={o?.faint ?? "#94A3B8"}
              multiline
              textAlignVertical="top"
              className="min-h-24 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950"
              style={o && { ...field, color: o.text }}
            />
            </View>
            </FormCard>
            </View>
            </View>
          </ScrollView>

            {layout.wide ? (
              // (Desktop: at a button's size, under the columns' right.)
              <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingTop: 16, paddingBottom: 24 }}>
                <Button label={saving ? "Adding..." : "Add to pantry"} icon="add" kind="primary" onPress={() => !saving && void handleSave()} />
              </View>
            ) : (
            <View className="pb-6 pt-4">
              <Tap
                disabled={saving}
                onPress={() => void handleSave()}
                style={{ height: 56, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: o.ink, opacity: saving ? 0.5 : 1 }}
                pressedStyle={{ opacity: 0.85 }}
              >
                {saving ? (
                  <ActivityIndicator color={o.onInk} />
                ) : (
                  <Text style={{ fontSize: 16, fontWeight: "700", color: o.onInk }}>Add to pantry</Text>
                )}
              </Tap>
            </View>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>

    <CreateGenericIngredientModal
      visible={showCreateIngredient}
      initialName={searchText}
      onClose={() => setShowCreateIngredient(false)}
      onCreated={(ingredient) => {
        setIngredients((prev) => [...prev, ingredient]);
        handleSelectIngredient(ingredient);
        setShowCreateIngredient(false);
      }}
    />
    </OrbitPage>
  );
}
