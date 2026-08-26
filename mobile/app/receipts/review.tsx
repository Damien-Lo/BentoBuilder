import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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

import { BarcodeScannerModal, type ScannedProduct } from "@/src/components/BarcodeScannerModal";
import {
  DateTextInput,
  DurationExpiryInput,
  FieldLabel,
  PriceInput,
  SearchableObjectDropdown,
  SegmentedToggle,
} from "@/src/components/forms";
import {
  getIngredients,
  createIngredient,
  type Ingredient,
  type IngredientNutrition,
} from "@/src/services/ingredientApi";
import {
  createBrand,
  createCategory,
  createStore,
  getBrands,
  getCategories,
  getStorageLocations,
  getStores,
} from "@/src/services/optionsApi";
import { addIngredientToPantry, getPantryItems } from "@/src/services/pantryApi";
import {
  getLastParsedReceipt,
  type ReceiptLineItem,
  type ReceiptNutrition,
  type ReceiptParseResult,
} from "@/src/services/receiptApi";
import type { SelectOption } from "@/src/types/options";
import type { PantryItem } from "@/src/types/pantry";
import { barcodesMatch } from "@/src/utils/barcode";
import {
  recentPantryEntries,
  referenceId,
  referenceName,
  resolveEffectiveExpiryDuration,
  resolveEffectiveStorageLocation,
  type SuggestedExpiryDuration,
} from "@/src/utils/pantryDefaults";
import { resolveOrCreateOption } from "@/src/utils/resolveOrCreateOption";
import { addDurationToDate, todayDateInputString } from "@/src/utils/date";
import { takePendingReceipt } from "@/src/utils/receiptReviewStore";

interface ReviewRow {
  key: string;
  lineItem: ReceiptLineItem;
  checked: boolean;
  matchedIngredientId: string | null;
  name: string;
  quantity: string;
  unit: string;
  price: string;
  storageLocationId: string;
  storageLocationName: string;
  expiryDate: string;
  expiryTouched: boolean;
  expirySuggestion: SuggestedExpiryDuration | null;
  error?: string;

  // Only meaningful while matchedIngredientId is null — a new ingredient
  // being proposed, editable before it's actually created on confirm.
  isGeneric: boolean;
  brandId: string;
  brandName: string;
  categoryId: string;
  categoryName: string;
  genericParentId: string;
  genericName: string;
  barcode: string | null;
  nutrition: ReceiptNutrition;
  defaultPortionAmount: number;
  defaultPortionUnit: string;
}

// Ingredient.nutrition uses optional numbers; ReviewRow.nutrition uses
// nullable numbers (so an empty editable field has a clear "unset" value) —
// this just bridges the two.
function toReceiptNutrition(nutrition?: IngredientNutrition): ReceiptNutrition {
  return {
    calories: nutrition?.calories ?? null,
    protein: nutrition?.protein ?? null,
    carbs: nutrition?.carbs ?? null,
    fats: nutrition?.fats ?? null,
    fiber: nutrition?.fiber ?? null,
    sodium: nutrition?.sodium ?? null,
  };
}

export default function ReceiptReviewPage() {
  const router = useRouter();

  const [receipt, setReceipt] = useState<ReceiptParseResult | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [barcodeScanRowKey, setBarcodeScanRowKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeDraft, setStoreDraft] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayDateInputString());

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);
  const [stores, setStores] = useState<SelectOption[]>([]);
  const [brands, setBrands] = useState<SelectOption[]>([]);
  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const genericIngredients = ingredients.filter((ingredient) => ingredient.isGeneric);

  useEffect(() => {
    let cancelled = false;

    async function loadReferenceData(pending: ReceiptParseResult) {
      try {
        const [
          loadedIngredients,
          loadedStorageLocations,
          loadedStores,
          loadedBrands,
          loadedCategories,
          loadedPantryItems,
        ] = await Promise.all([
          getIngredients(),
          getStorageLocations(),
          getStores(),
          getBrands(),
          getCategories(),
          getPantryItems(),
        ]);

        if (cancelled) return;

        const ingredientList = Array.isArray(loadedIngredients) ? loadedIngredients : [];
        const locationList = Array.isArray(loadedStorageLocations) ? loadedStorageLocations : [];
        const storeList = Array.isArray(loadedStores) ? loadedStores : [];
        const brandList = Array.isArray(loadedBrands) ? loadedBrands : [];
        const categoryList = Array.isArray(loadedCategories) ? loadedCategories : [];
        const pantryList = Array.isArray(loadedPantryItems) ? loadedPantryItems : [];

        setIngredients(ingredientList);
        setStorageLocations(locationList);
        setStores(storeList);
        setBrands(brandList);
        setCategories(categoryList);
        setPantryItems(pantryList);

        const existingStore = pending.storeName
          ? storeList.find(
              (s) => s.name.trim().toLowerCase() === pending.storeName!.trim().toLowerCase(),
            )
          : undefined;
        if (existingStore) setStoreId(existingStore._id);

        const effectivePurchaseDate = pending.purchaseDate || todayDateInputString();

        setRows(
          pending.lineItems.map((lineItem, index) => {
            const matched = lineItem.matchedIngredientId
              ? ingredientList.find((ing) => ing._id === lineItem.matchedIngredientId)
              : null;
            const proposal = lineItem.proposedIngredient;

            const history = matched
              ? recentPantryEntries(
                  pantryList.filter((item) => referenceId(item.ingredient) === matched._id),
                )
              : [];

            const suggestedLocation = matched
              ? resolveEffectiveStorageLocation(matched.defaultStorageLocation, locationList, history)
              : null;

            const suggestedExpiry = matched
              ? resolveEffectiveExpiryDuration(
                  matched.defaultExpiryDurationAmount,
                  matched.defaultExpiryDurationUnit,
                  history,
                )
              : null;

            const proposedBrand = proposal?.brandName
              ? brandList.find((b) => b.name.trim().toLowerCase() === proposal.brandName!.trim().toLowerCase())
              : undefined;
            const proposedCategory = proposal?.categoryId
              ? categoryList.find((c) => c._id === proposal.categoryId)
              : undefined;
            const proposedGenericParent = proposal?.genericName
              ? ingredientList.find(
                  (ing) => ing.isGeneric && ing.name.trim().toLowerCase() === proposal.genericName!.trim().toLowerCase(),
                )
              : undefined;

            return {
              key: `${index}-${lineItem.rawText}`,
              lineItem,
              checked: lineItem.confidence !== "low",
              matchedIngredientId: matched?._id ?? null,
              name: matched?.name ?? proposal?.name ?? lineItem.rawText,
              quantity: String(lineItem.quantity),
              unit: lineItem.unit,
              price: lineItem.price != null ? String(lineItem.price) : "",
              storageLocationId: suggestedLocation?.id ?? "",
              storageLocationName: suggestedLocation?.name ?? "",
              expiryDate: suggestedExpiry
                ? addDurationToDate(effectivePurchaseDate, suggestedExpiry.amount, suggestedExpiry.unit)
                : "",
              expiryTouched: false,
              expirySuggestion: suggestedExpiry,

              isGeneric: proposal?.isGeneric ?? true,
              brandId: proposedBrand?._id ?? "",
              brandName: proposal?.brandName ?? "",
              categoryId: proposedCategory?._id ?? "",
              categoryName: proposedCategory?.name ?? proposal?.newCategoryName ?? "",
              genericParentId: proposedGenericParent?._id ?? "",
              genericName: proposedGenericParent?.name ?? proposal?.genericName ?? "",
              barcode: null,
              nutrition: matched
                ? toReceiptNutrition(matched.nutrition)
                : proposal?.estimatedNutrition ?? {
                    calories: null, protein: null, carbs: null, fats: null, fiber: null, sodium: null,
                  },
              defaultPortionAmount: matched?.defaultPortionAmount ?? proposal?.defaultPortionAmount ?? 1,
              defaultPortionUnit: matched?.defaultPortionUnit ?? proposal?.defaultPortionUnit ?? "item",
            };
          }),
        );
      } catch (error) {
        Alert.alert(
          "Couldn't load pantry data",
          error instanceof Error ? error.message : "Something went wrong.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function init() {
      let pending = takePendingReceipt();

      if (!pending) {
        // Dev convenience — falls back to the last real scan saved
        // server-side, so the review screen can be reworked/reloaded
        // without re-scanning a receipt each time.
        try {
          pending = await getLastParsedReceipt();
        } catch {
          // fall through to the "nothing to review" case below
        }
      }

      if (cancelled) return;

      if (!pending) {
        Alert.alert("No receipt to review", "Scan a receipt first.");
        router.back();
        return;
      }

      setReceipt(pending);
      setStoreName(pending.storeName ?? "");
      setStoreDraft(pending.storeName ?? "");
      if (pending.purchaseDate) setPurchaseDate(pending.purchaseDate);

      await loadReferenceData(pending);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function updateRow(key: string, updates: Partial<ReviewRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...updates } : row)));
  }

  // Keeps every row's not-yet-hand-edited expiry date in sync with the
  // receipt-wide purchase date, the same way the plain add-to-pantry form
  // recomputes expiry when purchase date changes.
  useEffect(() => {
    setRows((prev) =>
      prev.map((row) =>
        !row.expiryTouched && row.expirySuggestion
          ? {
              ...row,
              expiryDate: addDurationToDate(
                purchaseDate,
                row.expirySuggestion.amount,
                row.expirySuggestion.unit,
              ),
            }
          : row,
      ),
    );
  }, [purchaseDate]);

  async function handleCreateStore(name: string): Promise<SelectOption> {
    const store = await createStore(name);
    setStores((prev) => (prev.some((s) => s._id === store._id) ? prev : [...prev, store]));
    return store;
  }

  // Shared by both the exact-match-while-typing case and explicitly tapping
  // a suggestion from the name dropdown — snaps a row onto a real ingredient.
  function applyIngredientMatch(rowKey: string, ingredient: Ingredient) {
    const history = recentPantryEntries(
      pantryItems.filter((item) => referenceId(item.ingredient) === ingredient._id),
    );
    const suggestedLocation = resolveEffectiveStorageLocation(
      ingredient.defaultStorageLocation,
      storageLocations,
      history,
    );
    const suggestedExpiry = resolveEffectiveExpiryDuration(
      ingredient.defaultExpiryDurationAmount,
      ingredient.defaultExpiryDurationUnit,
      history,
    );
    updateRow(rowKey, {
      name: ingredient.name,
      matchedIngredientId: ingredient._id,
      storageLocationId: suggestedLocation?.id ?? "",
      storageLocationName: suggestedLocation?.name ?? "",
      expiryDate: suggestedExpiry
        ? addDurationToDate(purchaseDate, suggestedExpiry.amount, suggestedExpiry.unit)
        : "",
      expiryTouched: false,
      expirySuggestion: suggestedExpiry,
      nutrition: toReceiptNutrition(ingredient.nutrition),
      defaultPortionAmount: ingredient.defaultPortionAmount ?? 1,
      defaultPortionUnit: ingredient.defaultPortionUnit ?? "item",
      error: undefined,
    });
  }

  // The name field doubles as a manual matching control: typing something
  // that exactly matches an existing ingredient snaps this row onto it
  // (catches Gemini having missed a match); editing a currently-matched
  // row's name away from that ingredient's real name un-matches it (catches
  // Gemini having matched the wrong thing) rather than silently keeping a
  // now-incorrect link.
  function handleNameChange(rowKey: string, value: string) {
    const trimmed = value.trim().toLowerCase();
    const exactMatch = trimmed
      ? ingredients.find((ing) => ing.name.trim().toLowerCase() === trimmed)
      : undefined;

    if (exactMatch) {
      applyIngredientMatch(rowKey, exactMatch);
      return;
    }

    const row = rows.find((r) => r.key === rowKey);
    const wasMatched = !!row?.matchedIngredientId;

    updateRow(rowKey, {
      name: value,
      // Only reset the new-ingredient proposal fields when *un*-matching —
      // editing the name on a row that was already "New" shouldn't wipe out
      // whatever proposal (nutrition, brand, etc.) is already there.
      ...(wasMatched
        ? {
            matchedIngredientId: null,
            isGeneric: true,
            brandId: "",
            brandName: "",
            categoryId: "",
            categoryName: "",
            genericParentId: "",
            genericName: "",
            barcode: null,
            nutrition: {
              calories: null, protein: null, carbs: null, fats: null, fiber: null, sodium: null,
            },
            defaultPortionAmount: 1,
            defaultPortionUnit: "item",
            expirySuggestion: null,
          }
        : {}),
    });
  }

  function handleBarcodeScanned(product: ScannedProduct) {
    const rowKey = barcodeScanRowKey;
    setBarcodeScanRowKey(null);
    if (!rowKey) return;

    const row = rows.find((r) => r.key === rowKey);
    if (!row) return;

    // A barcode is authoritative — always re-check against the real catalog
    // regardless of the row's current state. This is what lets a wrong
    // existing match get corrected, and lets a generic match upgrade
    // straight to an already-tracked specific variant instead of proposing
    // a duplicate.
    const existingMatch = ingredients.find((ing) => barcodesMatch(ing.barcode, product.barcode));

    if (existingMatch) {
      const history = recentPantryEntries(
        pantryItems.filter((item) => referenceId(item.ingredient) === existingMatch._id),
      );
      const suggestedLocation = resolveEffectiveStorageLocation(
        existingMatch.defaultStorageLocation,
        storageLocations,
        history,
      );
      const suggestedExpiry = resolveEffectiveExpiryDuration(
        existingMatch.defaultExpiryDurationAmount,
        existingMatch.defaultExpiryDurationUnit,
        history,
      );
      updateRow(rowKey, {
        matchedIngredientId: existingMatch._id,
        name: existingMatch.name,
        storageLocationId: suggestedLocation?.id ?? "",
        storageLocationName: suggestedLocation?.name ?? "",
        expiryDate: suggestedExpiry
          ? addDurationToDate(purchaseDate, suggestedExpiry.amount, suggestedExpiry.unit)
          : "",
        expiryTouched: false,
        expirySuggestion: suggestedExpiry,
        error: undefined,
      });
      return;
    }

    // No existing ingredient has this barcode — this row becomes a proposal
    // to create a new specific/branded ingredient with real label data. If
    // the row was already matched to something, carry that connection
    // forward as the new ingredient's generic parent instead of losing it:
    // matched-to-a-generic links directly to that generic; matched-to-a-
    // specific (whose own barcode just didn't match this scan) links to
    // *that* ingredient's own generic parent, if it has one.
    const previouslyMatched = row.matchedIngredientId
      ? ingredients.find((ing) => ing._id === row.matchedIngredientId)
      : null;

    let genericParentId = row.genericParentId;
    let genericName = row.genericName;
    if (previouslyMatched) {
      if (previouslyMatched.isGeneric) {
        genericParentId = previouslyMatched._id;
        genericName = previouslyMatched.name;
      } else if (previouslyMatched.genericParent) {
        genericParentId = referenceId(previouslyMatched.genericParent) || genericParentId;
        genericName = referenceName(previouslyMatched.genericParent) || genericName;
      }
    }

    updateRow(rowKey, {
      matchedIngredientId: null,
      name: product.name,
      isGeneric: false,
      brandName: product.brand ?? "",
      brandId: brands.find((b) => b.name.trim().toLowerCase() === (product.brand ?? "").trim().toLowerCase())?._id ?? "",
      genericParentId,
      genericName,
      barcode: product.barcode,
      defaultPortionAmount: product.servingSize,
      defaultPortionUnit: product.servingUnit,
      nutrition: {
        calories: product.calories ?? null,
        protein: product.protein ?? null,
        carbs: product.carbs ?? null,
        fats: product.fats ?? null,
        fiber: product.fiber ?? null,
        sodium: product.sodium ?? null,
      },
      expirySuggestion: null,
      error: undefined,
    });
  }

  async function handleConfirm() {
    const checkedRows = rows.filter((row) => row.checked);
    if (checkedRows.length === 0) {
      Alert.alert("Nothing selected", "Check at least one item to add.");
      return;
    }

    setSubmitting(true);
    try {
      const resolvedStore = await resolveOrCreateOption(
        stores,
        storeId,
        storeDraft,
        handleCreateStore,
      );

      let successCount = 0;
      const failures: string[] = [];

      for (const row of rows) {
        if (!row.checked) continue;

        if (!row.storageLocationId) {
          failures.push(`${row.name}: no storage location selected`);
          updateRow(row.key, { error: "Pick a storage location" });
          continue;
        }

        try {
          let ingredientId = row.matchedIngredientId;

          if (!ingredientId) {
            const resolvedCategory = await resolveOrCreateOption(
              categories,
              row.categoryId,
              row.categoryName,
              createCategory,
            );

            let brandId: string | null = null;
            if (!row.isGeneric) {
              const resolvedBrand = await resolveOrCreateOption(
                brands,
                row.brandId,
                row.brandName,
                createBrand,
              );
              brandId = resolvedBrand?._id ?? null;
            }

            const newIngredient = await createIngredient({
              name: row.name,
              category: resolvedCategory?._id ?? null,
              brand: brandId,
              barcode: row.barcode,
              isGeneric: row.isGeneric,
              genericParent: row.isGeneric ? undefined : row.genericParentId || undefined,
              genericName:
                row.isGeneric || row.genericParentId ? undefined : row.genericName || undefined,
              defaultPortionAmount: row.defaultPortionAmount,
              defaultPortionUnit: row.defaultPortionUnit,
              nutrition: {
                calories: row.nutrition.calories ?? undefined,
                protein: row.nutrition.protein ?? undefined,
                carbs: row.nutrition.carbs ?? undefined,
                fats: row.nutrition.fats ?? undefined,
                fiber: row.nutrition.fiber ?? undefined,
                sodium: row.nutrition.sodium ?? undefined,
              },
            });
            ingredientId = newIngredient._id;
          }

          await addIngredientToPantry({
            ingredient: ingredientId,
            storageLocation: row.storageLocationId,
            quantityAvailable: Number(row.quantity) || 0,
            quantityUnit: row.unit || "item",
            purchasePrice: row.price ? Number(row.price) : undefined,
            store: resolvedStore?._id ?? null,
            purchaseDate: purchaseDate || undefined,
            expiryDate: row.expiryDate || undefined,
          });

          successCount += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to add";
          failures.push(`${row.name}: ${message}`);
          updateRow(row.key, { error: message });
        }
      }

      if (failures.length === 0) {
        router.back();
      } else {
        Alert.alert(
          successCount > 0 ? "Added with some issues" : "Couldn't add items",
          `${successCount} item(s) added.\n\n${failures.join("\n")}`,
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !receipt) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="mt-3 text-slate-500">Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
          <Pressable
            disabled={submitting}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>
          <Text className="ml-2 flex-1 text-xl font-bold text-slate-950">Review Receipt</Text>
          <Pressable
            disabled={submitting}
            className={`rounded-xl px-4 py-2 ${submitting ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}
            onPress={() => void handleConfirm()}
          >
            <Text className="font-semibold text-white">{submitting ? "Adding..." : "Confirm"}</Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, paddingTop: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <FieldLabel text="Store" />
          <SearchableObjectDropdown<SelectOption>
            options={stores}
            selectedId={storeId}
            selectedName={storeName}
            placeholder="Search or type a new store"
            onTextChange={(value) => {
              if (value !== storeName) setStoreId("");
              setStoreDraft(value);
              setStoreName(value);
            }}
            onSelect={(option) => {
              setStoreId(option._id);
              setStoreName(option.name);
              setStoreDraft(option.name);
            }}
          />

          <FieldLabel text="Purchase date" />
          <DateTextInput
            value={purchaseDate}
            onChangeText={setPurchaseDate}
            placeholder="YYYY-MM-DD"
            className="rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
            style={{ height: 56 }}
          />

          <Text className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">
            {rows.length} item{rows.length === 1 ? "" : "s"} · {rows.filter((r) => r.checked).length} selected
          </Text>

          {rows.map((row) => {
            const isNew = !row.matchedIngredientId;
            const isExpanded = expandedKey === row.key;

            return (
              <View
                key={row.key}
                className={`mb-2 rounded-2xl border bg-white ${
                  row.error ? "border-red-300" : "border-slate-200"
                }`}
              >
                <Pressable
                  className="flex-row items-center p-3 active:bg-slate-50"
                  onPress={() => setExpandedKey(isExpanded ? null : row.key)}
                >
                  <Pressable
                    className="mr-3 h-6 w-6 items-center justify-center rounded-md border-2 border-blue-500"
                    onPress={() => updateRow(row.key, { checked: !row.checked, error: undefined })}
                  >
                    {row.checked && <Ionicons name="checkmark" size={16} color="#2563EB" />}
                  </Pressable>

                  <View className="flex-1">
                    <View className="flex-row items-center">
                      <Text className="flex-1 text-base font-semibold text-slate-900" numberOfLines={1}>
                        {row.name}
                      </Text>
                      <View
                        className={`ml-2 rounded-full px-2 py-0.5 ${isNew ? "bg-violet-50" : "bg-emerald-50"}`}
                      >
                        <Text
                          className={`text-xs font-medium ${isNew ? "text-violet-700" : "text-emerald-700"}`}
                        >
                          {isNew ? "New" : "Matched"}
                        </Text>
                      </View>
                    </View>
                    <Text className="mt-0.5 text-xs text-slate-500">
                      {row.quantity} {row.unit}
                      {row.price ? `  ·  $${row.price}` : ""}
                    </Text>
                  </View>

                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={18}
                    color="#94A3B8"
                    style={{ marginLeft: 8 }}
                  />
                </Pressable>

                {isExpanded && (
                  <View className="border-t border-slate-100 p-4 pt-3">
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="flex-1 text-xs text-slate-400">
                        {row.lineItem.rawText}
                        {row.barcode ? ` · ${row.barcode}` : ""}
                      </Text>
                      <Pressable
                        className="flex-row items-center rounded-full bg-slate-100 px-3 py-1.5 active:bg-slate-200"
                        onPress={() => setBarcodeScanRowKey(row.key)}
                      >
                        <Ionicons name="barcode-outline" size={16} color="#334155" />
                        <Text className="ml-1.5 text-xs font-medium text-slate-700">
                          {row.barcode ? "Rescan" : "Scan barcode"}
                        </Text>
                      </Pressable>
                    </View>

                    <FieldLabel text="Name" />
                    <SearchableObjectDropdown<Ingredient>
                      options={ingredients}
                      selectedId={row.matchedIngredientId ?? ""}
                      selectedName={row.name}
                      showAllWhenEmpty={false}
                      placeholder="Ingredient name"
                      onTextChange={(value) => handleNameChange(row.key, value)}
                      onSelect={(option) => applyIngredientMatch(row.key, option)}
                      renderSubtitle={(option) => (
                        <Text className="mt-0.5 text-xs text-slate-500">
                          {option.isGeneric ? "Generic" : referenceName(option.brand) || "Specific"}
                          {referenceName(option.category) ? ` · ${referenceName(option.category)}` : ""}
                        </Text>
                      )}
                    />

                    <View className="mt-3 flex-row gap-2">
                      <View className="w-20">
                        <FieldLabel text="Qty" />
                        <TextInput
                          value={row.quantity}
                          onChangeText={(value) => updateRow(row.key, { quantity: value })}
                          keyboardType="decimal-pad"
                          placeholder="Qty"
                          placeholderTextColor="#94A3B8"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                        />
                      </View>
                      <View className="w-20">
                        <FieldLabel text="Unit" />
                        <TextInput
                          value={row.unit}
                          onChangeText={(value) => updateRow(row.key, { unit: value })}
                          placeholder="Unit"
                          placeholderTextColor="#94A3B8"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                        />
                      </View>
                      <View className="flex-1">
                        <FieldLabel text="Price" />
                        <PriceInput
                          value={row.price}
                          onChangeText={(value) => updateRow(row.key, { price: value })}
                        />
                      </View>
                    </View>

                    {isNew && (
                      <View className="mt-3 border-t border-slate-100 pt-3">
                        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          New ingredient details
                        </Text>

                        <View className="mt-2">
                          <SegmentedToggle<boolean>
                            value={row.isGeneric}
                            options={[
                              { value: false, label: "Specific / Branded" },
                              { value: true, label: "Generic" },
                            ] as const}
                            onChange={(isGeneric) =>
                              updateRow(row.key, {
                                isGeneric,
                                ...(isGeneric
                                  ? {
                                      brandId: "",
                                      brandName: "",
                                      barcode: null,
                                      genericParentId: "",
                                      genericName: "",
                                    }
                                  : {}),
                              })
                            }
                          />
                        </View>

                        <View className="mt-2 flex-row gap-2">
                          <View className="flex-1">
                            <SearchableObjectDropdown<SelectOption>
                              options={categories}
                              selectedId={row.categoryId}
                              selectedName={row.categoryName}
                              placeholder="Category"
                              onTextChange={(value) => {
                                if (value !== row.categoryName) updateRow(row.key, { categoryId: "" });
                                updateRow(row.key, { categoryName: value });
                              }}
                              onSelect={(option) =>
                                updateRow(row.key, { categoryId: option._id, categoryName: option.name })
                              }
                            />
                          </View>
                          {!row.isGeneric && (
                            <View className="flex-1">
                              <SearchableObjectDropdown<SelectOption>
                                options={brands}
                                selectedId={row.brandId}
                                selectedName={row.brandName}
                                placeholder="Brand"
                                onTextChange={(value) => {
                                  if (value !== row.brandName) updateRow(row.key, { brandId: "" });
                                  updateRow(row.key, { brandName: value });
                                }}
                                onSelect={(option) =>
                                  updateRow(row.key, { brandId: option._id, brandName: option.name })
                                }
                              />
                            </View>
                          )}
                        </View>

                        {!row.isGeneric && (
                          <View className="mt-2">
                            <FieldLabel text="Generic ingredient" />
                            <SearchableObjectDropdown<Ingredient>
                              options={genericIngredients}
                              selectedId={row.genericParentId}
                              selectedName={row.genericName}
                              placeholder="Search or new"
                              onTextChange={(value) => {
                                if (value !== row.genericName) updateRow(row.key, { genericParentId: "" });
                                updateRow(row.key, { genericName: value });
                              }}
                              onSelect={(option) =>
                                updateRow(row.key, { genericParentId: option._id, genericName: option.name })
                              }
                            />
                          </View>
                        )}
                      </View>
                    )}

                    <View className="mt-3">
                      <Text className="text-[11px] text-slate-400">
                        Nutrition per {row.defaultPortionAmount} {row.defaultPortionUnit}
                        {row.barcode
                          ? " · from barcode"
                          : isNew
                            ? " · Gemini estimate, editable"
                            : " · editable"}
                      </Text>
                      <View className="mt-1 flex-row flex-wrap gap-1">
                        {(
                          [
                            ["calories", "Cal"],
                            ["protein", "Protein (g)"],
                            ["carbs", "Carbs (g)"],
                            ["fats", "Fat (g)"],
                            ["fiber", "Fiber (g)"],
                            ["sodium", "Sodium (mg)"],
                          ] as [keyof ReceiptNutrition, string][]
                        ).map(([field, label]) => (
                          <View key={field} style={{ width: "31%" }}>
                            <Text className="mb-0.5 text-[9px] text-slate-400">{label}</Text>
                            <TextInput
                              value={row.nutrition[field] != null ? String(row.nutrition[field]) : ""}
                              onChangeText={(value) => {
                                const parsed = value.trim() === "" ? null : Number(value);
                                updateRow(row.key, {
                                  nutrition: {
                                    ...row.nutrition,
                                    [field]: parsed != null && Number.isNaN(parsed) ? row.nutrition[field] : parsed,
                                  },
                                });
                              }}
                              keyboardType="decimal-pad"
                              placeholder="0"
                              placeholderTextColor="#94A3B8"
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-950"
                            />
                          </View>
                        ))}
                      </View>
                    </View>

                    <View className="mt-3">
                      <FieldLabel text="Storage location" />
                      <SearchableObjectDropdown<SelectOption>
                        options={storageLocations}
                        selectedId={row.storageLocationId}
                        selectedName={row.storageLocationName}
                        placeholder="Storage location"
                        onTextChange={(value) => updateRow(row.key, { storageLocationName: value })}
                        onSelect={(option) =>
                          updateRow(row.key, {
                            storageLocationId: option._id,
                            storageLocationName: option.name,
                          })
                        }
                      />
                    </View>

                    <View className="mt-3">
                      <FieldLabel text="Expiry date" />
                      {row.expirySuggestion && !row.expiryTouched ? (
                        <Text className="mb-1 text-[11px] leading-4 text-slate-400">
                          Auto-filled from {isNew ? "recent purchase history" : "this ingredient's default"}.
                        </Text>
                      ) : null}
                      <DateTextInput
                        value={row.expiryDate}
                        onChangeText={(value) =>
                          updateRow(row.key, { expiryDate: value, expiryTouched: true })
                        }
                        placeholder="YYYY-MM-DD"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                        style={{ height: 44 }}
                      />

                      <Text className="mb-1 mt-2 text-[11px] font-medium text-slate-500">
                        Or set expiry from purchase date
                      </Text>
                      <DurationExpiryInput
                        purchaseDate={purchaseDate}
                        initialAmount={row.expirySuggestion ? String(row.expirySuggestion.amount) : undefined}
                        initialUnit={row.expirySuggestion?.unit}
                        onApply={(value) =>
                          updateRow(row.key, { expiryDate: value, expiryTouched: true })
                        }
                      />
                    </View>

                    {row.error && <Text className="mt-2 text-xs text-red-600">{row.error}</Text>}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>

      <BarcodeScannerModal
        visible={!!barcodeScanRowKey}
        onClose={() => setBarcodeScanRowKey(null)}
        onProductFound={handleBarcodeScanned}
      />
    </SafeAreaView>
  );
}
