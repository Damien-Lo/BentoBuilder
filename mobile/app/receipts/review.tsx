import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BarcodeScannerModal, type ScannedProduct } from "@/src/components/BarcodeScannerModal";
import {
  DateTextInput,
  DurationExpiryInput,
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
  suggestStore,
  type SuggestedExpiryDuration,
} from "@/src/utils/pantryDefaults";
import {
  getGroceryItems,
  updateGroceryItem,
  type GroceryItem,
} from "@/src/services/groceryListApi";
import { resolveOrCreateOption } from "@/src/utils/resolveOrCreateOption";
import { addDurationToDate, todayDateInputString } from "@/src/utils/date";
import {
  convertUnits,
  getIngredientConversions,
  type CustomUnitConversion,
} from "@/src/utils/unitConversion";
import {
  clearReviewDraft,
  loadReviewDraft,
  saveReviewDraft,
  takePendingReceipt,
} from "@/src/utils/receiptReviewStore";

interface ReviewRow {
  key: string;
  lineItem: ReceiptLineItem;
  checked: boolean;
  // Set once this row has actually been added to the pantry — keeps a retry
  // after a partial failure from reprocessing (and duplicating) rows that
  // already succeeded.
  submitted: boolean;
  matchedIngredientId: string | null;
  // A pendingLog grocery-list item this row was matched against at scan
  // time (by ingredient, then by exact name) — confirming this row also
  // marks that grocery item completed. Computed once at row-build time, not
  // re-evaluated on later edits within this review session.
  matchedGroceryItemId: string | null;
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

  // The serving size nutrition is defined for — Gemini's estimate, the
  // matched ingredient's own record, or a scanned barcode's per-serving
  // values. Independent of `quantity`/`unit` (how much was actually
  // bought, tracked to the pantry) and never touched by editing those -
  // e.g. buying 6 stalks of a brand-new ingredient shouldn't turn "5 cal
  // per 1 stalk" into "30 cal per 6 stalks" as its permanent catalog
  // definition. Both are directly, independently editable.
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

// Scales `base` (nutrition per baseAmount/baseUnit) onto quantity/unit —
// e.g. base "250 cal per 100g" scaled to quantity=250, unit="g" becomes
// "625 cal". Returns null when the two units aren't convertible (different
// unit families, or no matching custom conversion), so the caller can leave
// the row's current nutrition untouched rather than produce nonsense.
function scaleNutritionToQuantity(
  base: ReceiptNutrition,
  baseAmount: number,
  baseUnit: string,
  quantity: number,
  unit: string,
  customConversions: CustomUnitConversion[] = [],
): ReceiptNutrition | null {
  if (!Number.isFinite(quantity) || quantity <= 0 || !(baseAmount > 0)) return null;

  const inBaseUnit = convertUnits(quantity, unit, baseUnit, customConversions);
  if (inBaseUnit == null) return null;

  const factor = inBaseUnit / baseAmount;
  const scale = (value: number | null) => (value == null ? null : Math.round(value * factor * 10) / 10);

  return {
    calories: scale(base.calories),
    protein: scale(base.protein),
    carbs: scale(base.carbs),
    fats: scale(base.fats),
    fiber: scale(base.fiber),
    sodium: scale(base.sodium),
  };
}

// Matches a receipt line against a "pendingLog" grocery-list item (checked
// off during shopping, waiting to be logged to the pantry) — confirming the
// row on this screen will also mark the match completed. Tries an
// ingredient-ID match first (both resolve to the same catalog ingredient —
// high confidence), then falls back to an exact normalized-name match
// (matching this file's existing exact-match convention elsewhere, e.g.
// handleNameChange — not fuzzy). Either tier disambiguates a tie using the
// same live store-history heuristic Shopping Mode groups by; a genuine
// unresolved tie matches nothing rather than guessing. `claimed` is shared
// across the whole row-build pass so two receipt lines can never claim the
// same grocery item.
function matchPendingGroceryItem(
  candidateName: string,
  matchedIngredientId: string | null,
  pendingItems: GroceryItem[],
  pantryItems: PantryItem[],
  receiptStoreId: string,
  receiptStoreName: string,
  claimed: Set<string>,
): string | null {
  function disambiguate(candidates: GroceryItem[]): string | null {
    const unclaimed = candidates.filter((c) => !claimed.has(c._id));
    if (unclaimed.length === 0) return null;
    if (unclaimed.length === 1) return unclaimed[0]._id;

    const byStore = unclaimed.filter((c) => {
      const ingredientId = referenceId(c.ingredient);
      if (!ingredientId) return false;
      const suggested = suggestStore(
        recentPantryEntries(pantryItems.filter((p) => referenceId(p.ingredient) === ingredientId)),
      );
      if (!suggested) return false;
      return receiptStoreId
        ? suggested.id === receiptStoreId
        : suggested.name.trim().toLowerCase() === receiptStoreName.trim().toLowerCase();
    });
    return byStore.length === 1 ? byStore[0]._id : null;
  }

  if (matchedIngredientId) {
    const byIngredient = pendingItems.filter((item) => referenceId(item.ingredient) === matchedIngredientId);
    if (byIngredient.length > 0) return disambiguate(byIngredient);
  }

  const normalized = candidateName.trim().toLowerCase();
  if (!normalized) return null;
  const byName = pendingItems.filter((item) => item.name.trim().toLowerCase() === normalized);
  return byName.length > 0 ? disambiguate(byName) : null;
}

// What handleConfirm actually requires before this row can become a real
// pantry item — mirrors its validation exactly. Kept separate from
// getMissingFields below (which also surfaces non-blocking notes) so
// handleConfirm's gate can never be tripped by something that's only
// worth flagging, not actually required.
function getRequiredMissingFields(row: ReviewRow): string[] {
  const missing: string[] = [];

  if (!row.name.trim()) missing.push("name");

  const parsedQuantity = Number(row.quantity);
  if (row.quantity.trim() === "" || !Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
    missing.push("quantity");
  }

  if (!row.storageLocationId) missing.push("storage location");

  // Optional on the plain add-to-pantry form, but required here — a
  // receipt scan is logging a fresh purchase, so an expiry estimate should
  // always be available (from the ingredient's default, recent history, or
  // a manual entry) and tracking it is the actual point of this flow.
  if (!row.expiryDate.trim()) missing.push("expiry date");

  // Only a brand-new ingredient needs a category — a matched ingredient
  // already has one.
  if (!row.matchedIngredientId && !row.categoryId && !row.categoryName.trim()) {
    missing.push("category");
  }

  return missing;
}

// Everything worth flagging on this row — the required fields above, plus
// non-blocking notes. "Not linked to a grocery-list item" is the one
// non-blocking case: worth a heads-up (maybe the auto-match missed it), but
// never a reason to stop Confirm — the user may well have just bought
// something extra that was never on the list. Only surfaced at all when
// there's an actual shopping list with pendingLog items to check against;
// with none, there's nothing to flag.
function getMissingFields(row: ReviewRow, hasPendingGroceryItems: boolean): string[] {
  const missing = getRequiredMissingFields(row);
  if (hasPendingGroceryItems && !row.matchedGroceryItemId) {
    missing.push("grocery list link");
  }
  return missing;
}

// How much of a neighboring card peeks in from each side of the top pager,
// and the empty gap between cards — both a fixed visual hint that the
// section scrolls horizontally.
const CARD_PEEK = 18;
const CARD_GAP = 12;

// The New/Matched/Added status pill, reused by both the full-detail card and
// the compact summary row so the two stay visually consistent.
function StatusBadge({ row, isNew }: { row: ReviewRow; isNew: boolean }) {
  return (
    <View
      className={`rounded-full px-2 py-0.5 ${
        row.submitted ? "bg-slate-100" : isNew ? "bg-violet-50" : "bg-emerald-50"
      }`}
    >
      <Text
        className={`text-xs font-medium ${
          row.submitted ? "text-slate-500" : isNew ? "text-violet-700" : "text-emerald-700"
        }`}
      >
        {row.submitted ? "Added" : isNew ? "New" : "Matched"}
      </Text>
    </View>
  );
}

interface RowCallbacks {
  ingredients: Ingredient[];
  storageLocations: SelectOption[];
  categories: SelectOption[];
  brands: SelectOption[];
  genericIngredients: Ingredient[];
  pendingGroceryItems: GroceryItem[];
  purchaseDate: string;
  updateRow: (key: string, updates: Partial<ReviewRow>) => void;
  applyIngredientMatch: (rowKey: string, ingredient: Ingredient) => void;
  handleNameChange: (rowKey: string, value: string) => void;
  onScanBarcode: (rowKey: string) => void;
  onDeleteRow: (rowKey: string, rowName: string) => void;
  onOpenGroceryLink: (rowKey: string) => void;
}

// The full editable detail view for one item — shown, always expanded, for
// whichever item is currently focused in the swipeable top section.
function ReceiptRowDetail({ row, callbacks }: { row: ReviewRow; callbacks: RowCallbacks }) {
  const {
    ingredients,
    storageLocations,
    categories,
    brands,
    genericIngredients,
    pendingGroceryItems,
    purchaseDate,
    updateRow,
    applyIngredientMatch,
    handleNameChange,
    onScanBarcode,
    onDeleteRow,
    onOpenGroceryLink,
  } = callbacks;

  const [showDurationPicker, setShowDurationPicker] = useState(false);

  const isNew = !row.matchedIngredientId;
  const hasPendingGroceryItems = pendingGroceryItems.length > 0;
  const linkedGroceryItem = row.matchedGroceryItemId
    ? pendingGroceryItems.find((item) => item._id === row.matchedGroceryItemId)
    : undefined;
  const missingFields = row.submitted ? [] : getMissingFields(row, hasPendingGroceryItems);
  const isRowComplete = missingFields.length === 0;

  // The matched ingredient's own unit conversions (e.g. "1 box = 340g")
  // apply on every quantity/unit edit, not just at match time — otherwise a
  // real conversion the ingredient actually has would be missed and treated
  // as an unrelated unit.
  const matchedIngredient = row.matchedIngredientId
    ? ingredients.find((ing) => ing._id === row.matchedIngredientId)
    : null;
  const customConversions = getIngredientConversions(matchedIngredient, [], ingredients);

  return (
    <View
      className={`flex-1 rounded-2xl border bg-white p-3 ${row.error ? "border-red-300" : "border-slate-200"} ${row.submitted ? "opacity-50" : ""}`}
    >
      <View className="flex-row items-center justify-between gap-2">
        <Pressable
          disabled={row.submitted}
          className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
            row.submitted ? "border-emerald-500 bg-emerald-500" : "border-blue-500"
          }`}
          onPress={() => updateRow(row.key, { checked: !row.checked, error: undefined })}
        >
          {(row.checked || row.submitted) && (
            <Ionicons name="checkmark" size={16} color={row.submitted ? "white" : "#2563EB"} />
          )}
        </Pressable>

        <Text className="flex-1 text-[11px] text-slate-400" numberOfLines={1}>
          {row.lineItem.rawText}
          {row.barcode ? ` · ${row.barcode}` : ""}
        </Text>

        {!row.submitted && (
          <Ionicons
            name={isRowComplete ? "checkmark-circle" : "alert-circle"}
            size={16}
            color={isRowComplete ? "#10B981" : "#F59E0B"}
          />
        )}
        <StatusBadge row={row} isNew={isNew} />
      </View>

      {!row.submitted && !isRowComplete && (
        <Text className="mt-1 text-[11px] font-medium text-amber-600">
          Missing: {missingFields.join(", ")}
        </Text>
      )}

      {!row.submitted && (
        <Pressable
          className="mt-1 flex-row items-center self-start"
          hitSlop={4}
          onPress={() => onOpenGroceryLink(row.key)}
        >
          <Ionicons
            name="cart-outline"
            size={12}
            color={linkedGroceryItem ? "#64748B" : hasPendingGroceryItems ? "#F59E0B" : "#94A3B8"}
          />
          <Text
            className={`ml-1 text-[11px] font-medium ${
              linkedGroceryItem
                ? "text-slate-500"
                : hasPendingGroceryItems
                  ? "text-amber-600"
                  : "text-slate-400"
            }`}
          >
            {linkedGroceryItem
              ? `Grocery list: ${linkedGroceryItem.name}`
              : hasPendingGroceryItems
                ? "Not on grocery list — tap to link"
                : "Link to grocery list"}
          </Text>
        </Pressable>
      )}

      <View className="mt-2 flex-row items-center gap-2">
        <View className="flex-1">
          <SearchableObjectDropdown<Ingredient>
            options={ingredients}
            selectedId={row.matchedIngredientId ?? ""}
            selectedName={row.name}
            showAllWhenEmpty={false}
            compact
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
        </View>
        <Pressable
          className="h-11 w-11 items-center justify-center rounded-xl bg-slate-100 active:bg-slate-200"
          onPress={() => onScanBarcode(row.key)}
        >
          <Ionicons name="barcode-outline" size={18} color="#334155" />
        </Pressable>
        <Pressable
          className="h-11 w-11 items-center justify-center rounded-xl bg-slate-100 active:bg-slate-200"
          onPress={() => onDeleteRow(row.key, row.name)}
        >
          <Ionicons name="trash-outline" size={18} color="#DC2626" />
        </Pressable>
      </View>

      {/* How much was actually bought — feeds the pantry item's stock
          directly, independent of the serving size nutrition is defined
          for below. Editing this never touches nutrition. */}
      <Text className="mt-2 text-xs font-semibold text-slate-600">Quantity bought</Text>
      <View className="mt-1 flex-row gap-2">
        <View className="w-12">
          <TextInput
            value={row.quantity}
            onChangeText={(value) => updateRow(row.key, { quantity: value })}
            keyboardType="decimal-pad"
            placeholder="Qty"
            placeholderTextColor="#94A3B8"
            className="rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-950"
            style={{ height: 40 }}
          />
        </View>
        <View className="w-12">
          <TextInput
            value={row.unit}
            onChangeText={(value) => updateRow(row.key, { unit: value })}
            placeholder="Unit"
            placeholderTextColor="#94A3B8"
            className="rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-950"
            style={{ height: 40 }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <PriceInput compact value={row.price} onChangeText={(value) => updateRow(row.key, { price: value })} />
        </View>
        <View style={{ flex: 1.4 }}>
          <SearchableObjectDropdown<SelectOption>
            options={storageLocations}
            selectedId={row.storageLocationId}
            selectedName={row.storageLocationName}
            compact
            placeholder="Location"
            onTextChange={(value) => updateRow(row.key, { storageLocationName: value })}
            onSelect={(option) =>
              updateRow(row.key, { storageLocationId: option._id, storageLocationName: option.name })
            }
          />
        </View>
      </View>

      {isNew && (
        <View className="mt-2 border-t border-slate-100 pt-2">
          <SegmentedToggle<boolean>
            compact
            value={row.isGeneric}
            options={[
              { value: false, label: "Specific / Branded" },
              { value: true, label: "Generic" },
            ] as const}
            onChange={(isGeneric) =>
              updateRow(row.key, {
                isGeneric,
                ...(isGeneric
                  ? { brandId: "", brandName: "", barcode: null, genericParentId: "", genericName: "" }
                  : {}),
              })
            }
          />

          <View className="mt-1.5 flex-row gap-2">
            <View className="flex-1">
              <SearchableObjectDropdown<SelectOption>
                options={categories}
                selectedId={row.categoryId}
                selectedName={row.categoryName}
                compact
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
                  compact
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
            {!row.isGeneric && (
              <View className="flex-1">
                <SearchableObjectDropdown<Ingredient>
                  options={genericIngredients}
                  selectedId={row.genericParentId}
                  selectedName={row.genericName}
                  compact
                  placeholder="Generic"
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
        </View>
      )}

      {/* Serving size nutrition is defined for — independent of how much was
          bought above. This is what actually gets saved as the ingredient's
          catalog default portion for a brand-new ingredient, so it should
          read like "5 cal per 1 stalk," not "however much I bought today." */}
      <Text className="mt-2 text-xs font-semibold text-slate-600">Serving size (nutrition is per this much)</Text>
      <View className="mt-1 flex-row gap-2">
        <View className="w-12">
          <TextInput
            value={String(row.defaultPortionAmount)}
            onChangeText={(value) => {
              const parsed = Number(value);
              if (value.trim() !== "" && Number.isFinite(parsed) && parsed > 0) {
                updateRow(row.key, { defaultPortionAmount: parsed });
              }
            }}
            keyboardType="decimal-pad"
            placeholder="Amt"
            placeholderTextColor="#94A3B8"
            className="rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-950"
            style={{ height: 40 }}
          />
        </View>
        <View className="w-12">
          <TextInput
            value={row.defaultPortionUnit}
            onChangeText={(value) => updateRow(row.key, { defaultPortionUnit: value })}
            placeholder="Unit"
            placeholderTextColor="#94A3B8"
            className="rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-950"
            style={{ height: 40 }}
          />
        </View>
      </View>
      <View className="mt-1 flex-row gap-1">
        {(
          [
            ["calories", "Cal"],
            ["protein", "Prot"],
            ["carbs", "Carb"],
            ["fats", "Fat"],
            ["fiber", "Fib"],
            ["sodium", "Na"],
          ] as [keyof ReceiptNutrition, string][]
        ).map(([field, label]) => (
          <View key={field} className="flex-1">
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
              className="rounded-lg border border-slate-200 bg-white px-1 py-1 text-center text-[11px] text-slate-950"
            />
          </View>
        ))}
      </View>

      {/* Read-only, derived preview only — never stored. Purely "here's
          roughly how much you're adding to your pantry," computed live from
          quantity-bought x serving-size nutrition; null (shown as "—") when
          the two units aren't convertible rather than a wrong guess. */}
      {(() => {
        const qty = Number(row.quantity);
        const totalNutrition = Number.isFinite(qty) && qty > 0
          ? scaleNutritionToQuantity(
              row.nutrition,
              row.defaultPortionAmount,
              row.defaultPortionUnit,
              qty,
              row.unit,
              customConversions,
            )
          : null;
        return (
          <Text className="mt-1.5 text-[10px] text-slate-400">
            ≈ total for {row.quantity || "?"} {row.unit}: {totalNutrition?.calories ?? "—"} cal,{" "}
            {totalNutrition?.protein ?? "—"} protein, {totalNutrition?.carbs ?? "—"} carbs,{" "}
            {totalNutrition?.fats ?? "—"} fat
          </Text>
        );
      })()}

      <View className="mt-2 flex-row items-end gap-2">
        <View className="flex-1">
          <View className="mb-1 flex-row items-center justify-between">
            <Text className="text-xs font-semibold text-slate-600">Expiry date</Text>
            {row.expirySuggestion && !row.expiryTouched ? (
              <Text className="text-[10px] text-slate-400">auto-filled</Text>
            ) : null}
          </View>
          <DateTextInput
            value={row.expiryDate}
            onChangeText={(value) => updateRow(row.key, { expiryDate: value, expiryTouched: true })}
            placeholder="YYYY-MM-DD"
            className="rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950"
            style={{ height: 40 }}
          />
        </View>
        <Pressable
          className="h-10 items-center justify-center rounded-xl bg-slate-100 px-2.5 active:bg-slate-200"
          onPress={() => setShowDurationPicker((current) => !current)}
        >
          <Text className="text-[11px] font-medium text-slate-600">
            {showDurationPicker ? "Hide duration" : "Use duration"}
          </Text>
        </Pressable>
      </View>

      {showDurationPicker && (
        <View className="mt-1.5">
          <DurationExpiryInput
            purchaseDate={purchaseDate}
            initialAmount={row.expirySuggestion ? String(row.expirySuggestion.amount) : undefined}
            initialUnit={row.expirySuggestion?.unit}
            onApply={(value) => updateRow(row.key, { expiryDate: value, expiryTouched: true })}
          />
        </View>
      )}

      {row.error && <Text className="mt-2 text-xs text-red-600">{row.error}</Text>}
    </View>
  );
}

// The compact bottom-list row — same information as before, minus the
// chevron/expand affordance, since tapping it now jumps the top section to
// this item instead of expanding inline.
function ReceiptRowSummary({
  row,
  isFocused,
  hasPendingGroceryItems,
  onPress,
  onToggleChecked,
}: {
  row: ReviewRow;
  isFocused: boolean;
  hasPendingGroceryItems: boolean;
  onPress: () => void;
  onToggleChecked: () => void;
}) {
  const isNew = !row.matchedIngredientId;
  const missingFields = row.submitted ? [] : getMissingFields(row, hasPendingGroceryItems);
  const isRowComplete = missingFields.length === 0;

  return (
    <Pressable
      onPress={onPress}
      className={`mb-2 flex-row items-center rounded-2xl border p-3 ${
        row.error ? "border-red-300" : isFocused ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"
      } ${row.submitted ? "opacity-50" : ""}`}
    >
      <Pressable
        disabled={row.submitted}
        className={`mr-3 h-6 w-6 items-center justify-center rounded-md border-2 ${
          row.submitted ? "border-emerald-500 bg-emerald-500" : "border-blue-500"
        }`}
        onPress={onToggleChecked}
      >
        {(row.checked || row.submitted) && (
          <Ionicons name="checkmark" size={16} color={row.submitted ? "white" : "#2563EB"} />
        )}
      </Pressable>

      <View className="flex-1">
        <Text className="text-base font-semibold text-slate-900" numberOfLines={1}>
          {row.name}
        </Text>
        <Text className="mt-0.5 text-xs text-slate-500">
          {row.quantity} {row.unit}
          {row.price ? `  ·  $${row.price}` : ""}
        </Text>
        {!row.submitted && !isRowComplete && (
          <Text className="mt-0.5 text-xs font-medium text-amber-600">
            Missing: {missingFields.join(", ")}
          </Text>
        )}
      </View>

      <View className="ml-2 items-end">
        <StatusBadge row={row} isNew={isNew} />
        {!row.submitted && (
          <Ionicons
            name={isRowComplete ? "checkmark-circle" : "alert-circle"}
            size={18}
            color={isRowComplete ? "#10B981" : "#F59E0B"}
            style={{ marginTop: 6 }}
          />
        )}
      </View>
    </Pressable>
  );
}

export default function ReceiptReviewPage() {
  const router = useRouter();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const pagerRef = useRef<FlatList<ReviewRow>>(null);

  // Captured exactly once (lazy initializer, not re-run on re-render) —
  // takePendingReceipt() has read-and-clear semantics, so calling it again
  // inside the retry-able load effect below would find nothing on a second
  // attempt and silently fall through to the dev-fixture fallback instead of
  // actually retrying the real pending scan.
  const [capturedPending] = useState<ReceiptParseResult | null>(() => takePendingReceipt());

  const [receipt, setReceipt] = useState<ReceiptParseResult | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [barcodeScanRowKey, setBarcodeScanRowKey] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

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
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);
  // Which row is currently choosing a grocery-list link, if any — opens the
  // link-picker modal below.
  const [groceryLinkRowKey, setGroceryLinkRowKey] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  // Guards against the debounced auto-save below firing *after* the draft
  // was just intentionally cleared (discard, or a successful confirm) — a
  // save already in flight when that happens would otherwise silently
  // resurrect the draft right after it was wiped.
  const draftClearedRef = useRef(false);

  const genericIngredients = ingredients.filter((ingredient) => ingredient.isGeneric);
  const pendingGroceryItems = groceryItems.filter((item) => item.status === "pendingLog");

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);

    // Shared by a fresh parse and a resumed draft — the dropdown option
    // lists (ingredient catalog, storage locations, etc.) are always loaded
    // fresh from the server either way; only row-building differs.
    async function loadOptionLists() {
      // The phone's network just carried a multi-MB receipt photo upload —
      // a follow-up batch of requests landing in that same brief window has
      // shown up as a transient failure in practice. One silent retry after
      // a short pause clears that up without ever bothering the user; only
      // a second consecutive failure surfaces the retry screen.
      const fetchAll = () =>
        Promise.all([
          getIngredients(),
          getStorageLocations(),
          getStores(),
          getBrands(),
          getCategories(),
          getPantryItems(),
          getGroceryItems(),
        ]);

      const [
        loadedIngredients,
        loadedStorageLocations,
        loadedStores,
        loadedBrands,
        loadedCategories,
        loadedPantryItems,
        loadedGroceryItems,
      ] = await fetchAll().catch(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return fetchAll();
      });

      if (cancelled) return null;

      const ingredientList = Array.isArray(loadedIngredients) ? loadedIngredients : [];
      const locationList = Array.isArray(loadedStorageLocations) ? loadedStorageLocations : [];
      const storeList = Array.isArray(loadedStores) ? loadedStores : [];
      const brandList = Array.isArray(loadedBrands) ? loadedBrands : [];
      const categoryList = Array.isArray(loadedCategories) ? loadedCategories : [];
      const pantryList = Array.isArray(loadedPantryItems) ? loadedPantryItems : [];
      const groceryItemList = Array.isArray(loadedGroceryItems) ? loadedGroceryItems : [];

      setIngredients(ingredientList);
      setStorageLocations(locationList);
      setStores(storeList);
      setBrands(brandList);
      setCategories(categoryList);
      setPantryItems(pantryList);
      setGroceryItems(groceryItemList);

      return { ingredientList, locationList, storeList, brandList, categoryList, pantryList, groceryItemList };
    }

    async function loadReferenceData(pending: ReceiptParseResult) {
      try {
        const lists = await loadOptionLists();
        if (!lists) return;
        const { ingredientList, locationList, storeList, brandList, categoryList, pantryList, groceryItemList } =
          lists;

        const existingStore = pending.storeName
          ? storeList.find(
              (s) => s.name.trim().toLowerCase() === pending.storeName!.trim().toLowerCase(),
            )
          : undefined;
        if (existingStore) setStoreId(existingStore._id);

        const effectivePurchaseDate = pending.purchaseDate || todayDateInputString();

        const pendingItemsForMatching = groceryItemList.filter((item) => item.status === "pendingLog");
        // Shared across every line item so two receipt rows never claim the
        // same grocery item — .map() below runs its callback in order, so
        // mutating this as we go is safe.
        const claimedGroceryItemIds = new Set<string>();

        setRows(
          pending.lineItems.map((lineItem, index) => {
            const matched = lineItem.matchedIngredientId
              ? ingredientList.find((ing) => ing._id === lineItem.matchedIngredientId)
              : null;
            const proposal = lineItem.proposedIngredient;

            const groceryMatch = matchPendingGroceryItem(
              matched?.name ?? proposal?.name ?? lineItem.rawText,
              matched?._id ?? null,
              pendingItemsForMatching,
              pantryList,
              existingStore?._id ?? "",
              pending.storeName ?? "",
              claimedGroceryItemIds,
            );
            if (groceryMatch) claimedGroceryItemIds.add(groceryMatch);

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

            // The serving-size nutrition basis - the matched ingredient's own
            // record, or Gemini's proposal - is independent of the receipt's
            // own quantity/unit (which is often just a generic count like "1
            // item" anyway, and is purely how much was bought).
            const portionNutrition = matched
              ? toReceiptNutrition(matched.nutrition)
              : proposal?.estimatedNutrition ?? {
                  calories: null, protein: null, carbs: null, fats: null, fiber: null, sodium: null,
                };
            const portionAmount = matched?.defaultPortionAmount ?? proposal?.defaultPortionAmount ?? 1;
            const portionUnit = matched?.defaultPortionUnit ?? proposal?.defaultPortionUnit ?? "item";

            return {
              key: `${index}-${lineItem.rawText}`,
              lineItem,
              checked: lineItem.confidence !== "low",
              matchedIngredientId: matched?._id ?? null,
              matchedGroceryItemId: groceryMatch,
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
              nutrition: portionNutrition,
              defaultPortionAmount: portionAmount,
              defaultPortionUnit: portionUnit,
              submitted: false,
            };
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Something went wrong.";
        setLoadError(message);
        Alert.alert("Couldn't load pantry data", message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function init() {
      // A fresh scan (just captured, still in the in-memory hand-off) always
      // wins over a previously-saved draft — otherwise a new scan would be
      // silently ignored in favor of resuming stale, unfinished work. Reuses
      // the value captured once at mount (see capturedPending above) so a
      // retry re-attempts the same pending receipt instead of finding it
      // already consumed.
      const pending = capturedPending;

      if (pending) {
        setReceipt(pending);
        setStoreName(pending.storeName ?? "");
        setStoreDraft(pending.storeName ?? "");
        if (pending.purchaseDate) setPurchaseDate(pending.purchaseDate);
        await loadReferenceData(pending);
        return;
      }

      const draft = await loadReviewDraft();
      if (cancelled) return;

      if (draft && draft.rows.length > 0) {
        try {
          const draftRows = draft.rows as ReviewRow[];
          setRows(draftRows);
          setStoreId(draft.storeId);
          setStoreName(draft.storeName);
          setStoreDraft(draft.storeDraft);
          setPurchaseDate(draft.purchaseDate || todayDateInputString());
          setReceipt({
            storeName: draft.storeName || null,
            purchaseDate: draft.purchaseDate || null,
            lineItems: draftRows.map((row) => row.lineItem),
          });

          await loadOptionLists();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Something went wrong.";
          setLoadError(message);
          Alert.alert("Couldn't load pantry data", message);
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      // Dev convenience — falls back to the last real scan saved
      // server-side, so the review screen can be reworked/reloaded without
      // re-scanning a receipt each time.
      let lastParsed: ReceiptParseResult | null = null;
      try {
        lastParsed = await getLastParsedReceipt();
      } catch {
        // fall through to the "nothing to review" case below
      }

      if (cancelled) return;

      if (!lastParsed) {
        Alert.alert("No receipt to review", "Scan a receipt first.");
        router.back();
        return;
      }

      setReceipt(lastParsed);
      setStoreName(lastParsed.storeName ?? "");
      setStoreDraft(lastParsed.storeName ?? "");
      if (lastParsed.purchaseDate) setPurchaseDate(lastParsed.purchaseDate);

      await loadReferenceData(lastParsed);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [router, retryToken, capturedPending]);

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

  // Persists every edit (debounced) so closing and reopening the app resumes
  // this exact review instead of losing it — only once the initial load (a
  // fresh parse or a resumed draft) has actually populated some rows.
  useEffect(() => {
    if (loading || rows.length === 0) return;

    const timeout = setTimeout(() => {
      if (draftClearedRef.current) return;
      void saveReviewDraft({ rows, storeId, storeName, storeDraft, purchaseDate });
    }, 500);

    return () => clearTimeout(timeout);
  }, [rows, storeId, storeName, storeDraft, purchaseDate, loading]);

  // Keeps focusedIndex in range whenever rows are added/removed (deleting
  // the last item, etc.) so the pager and bottom list never point past the
  // end of the array.
  useEffect(() => {
    if (rows.length === 0) {
      if (focusedIndex !== 0) setFocusedIndex(0);
      return;
    }
    if (focusedIndex > rows.length - 1) {
      setFocusedIndex(rows.length - 1);
    }
  }, [rows.length, focusedIndex]);

  function goToIndex(index: number) {
    setFocusedIndex(index);
    pagerRef.current?.scrollToIndex({ index, animated: true });
  }

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

    // Picking a different match updates the serving-size nutrition basis to
    // *this* ingredient's own record - it never touches quantity/unit
    // (however much was already entered as bought stays exactly as-is;
    // correcting which ingredient this is doesn't change how much of it
    // you bought).
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

      // A barcode match, like a manual match, updates the serving-size
      // nutrition basis only - quantity/unit (how much was bought) is left
      // exactly as the user already has it.
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
        nutrition: toReceiptNutrition(existingMatch.nutrition),
        defaultPortionAmount: existingMatch.defaultPortionAmount ?? 1,
        defaultPortionUnit: existingMatch.defaultPortionUnit ?? "item",
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

    // Serving-size nutrition basis comes from the scanned label's own
    // per-serving values - independent of quantity/unit (how much was
    // bought), which comes from the label's package size when it has one
    // (a real, separate signal - "this package is 500g total" - previously
    // discarded here even though ScannedProduct already carries it),
    // otherwise whatever's already in the row is left untouched.
    updateRow(rowKey, {
      matchedIngredientId: null,
      name: product.name,
      isGeneric: false,
      brandName: product.brand ?? "",
      brandId: brands.find((b) => b.name.trim().toLowerCase() === (product.brand ?? "").trim().toLowerCase())?._id ?? "",
      genericParentId,
      genericName,
      barcode: product.barcode,
      ...(product.packageQuantity != null
        ? { quantity: String(product.packageQuantity), unit: product.packageUnit ?? row.unit }
        : {}),
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

  // A blank starting point for an item Gemini missed entirely — the name
  // field's existing exact-match/search behavior is what lets the user turn
  // this into either a real match or a new-ingredient proposal, same as any
  // parsed row.
  function createBlankRow(): ReviewRow {
    return {
      key: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      lineItem: {
        rawText: "Added manually",
        matchedIngredientId: null,
        proposedIngredient: null,
        quantity: 1,
        unit: "item",
        price: null,
        confidence: "high",
      },
      checked: true,
      submitted: false,
      matchedIngredientId: null,
      matchedGroceryItemId: null,
      name: "",
      quantity: "1",
      unit: "item",
      price: "",
      storageLocationId: "",
      storageLocationName: "",
      expiryDate: "",
      expiryTouched: false,
      expirySuggestion: null,
      isGeneric: true,
      brandId: "",
      brandName: "",
      categoryId: "",
      categoryName: "",
      genericParentId: "",
      genericName: "",
      barcode: null,
      nutrition: { calories: null, protein: null, carbs: null, fats: null, fiber: null, sodium: null },
      defaultPortionAmount: 1,
      defaultPortionUnit: "item",
    };
  }

  function handleAddManualRow() {
    const row = createBlankRow();
    const newIndex = rows.length;
    setRows((prev) => [...prev, row]);
    setFocusedIndex(newIndex);
    requestAnimationFrame(() => {
      pagerRef.current?.scrollToIndex({ index: newIndex, animated: true });
    });
  }

  // Manually (re)links a row to a pendingLog grocery-list item, or clears
  // the link (groceryItemId === null) — corrects/overrides whatever the
  // automatic name/ingredient match found at scan time. A grocery item can
  // only ever be claimed by one row at a time, so linking it here strips it
  // from whichever other row currently holds it.
  function handleLinkGroceryItem(rowKey: string, groceryItemId: string | null) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key === rowKey) return { ...r, matchedGroceryItemId: groceryItemId };
        if (groceryItemId && r.matchedGroceryItemId === groceryItemId) {
          return { ...r, matchedGroceryItemId: null };
        }
        return r;
      }),
    );
  }

  function handleDeleteRow(rowKey: string, rowName: string) {
    Alert.alert(
      rowName ? `Remove "${rowName}"?` : "Remove this item?",
      "It'll be taken off this review. You can add it back manually if needed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            const removedIndex = rows.findIndex((r) => r.key === rowKey);
            const correctedIndex =
              removedIndex >= 0 && removedIndex <= focusedIndex
                ? Math.max(0, focusedIndex - 1)
                : focusedIndex;

            setRows((prev) => prev.filter((r) => r.key !== rowKey));
            setFocusedIndex(correctedIndex);
            // Removing an item shifts every later page's on-screen position
            // by one page-width without the pager's own scroll offset
            // changing on its own — re-sync it to the corrected index once
            // the shorter data array has re-rendered.
            requestAnimationFrame(() => {
              pagerRef.current?.scrollToIndex({ index: correctedIndex, animated: false });
            });
          },
        },
      ],
    );
  }

  function handleDiscardReceipt() {
    Alert.alert(
      "Discard this receipt?",
      "All progress on this review will be lost.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            draftClearedRef.current = true;
            void clearReviewDraft();
            router.back();
          },
        },
      ],
    );
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
        // submitted rows are skipped even if still (or again) checked — a
        // retry after a partial failure must never reprocess a row that
        // already made it into the pantry, or it'll create a duplicate.
        if (!row.checked || row.submitted) continue;

        const missing = getRequiredMissingFields(row);
        if (missing.length > 0) {
          failures.push(`${row.name || "(unnamed item)"}: missing ${missing.join(", ")}`);
          updateRow(row.key, { error: `Missing: ${missing.join(", ")}` });
          continue;
        }

        const parsedQuantity = Number(row.quantity);
        let parsedPrice: number | undefined;
        if (row.price.trim()) {
          parsedPrice = Number(row.price);
          if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
            failures.push(`${row.name}: invalid price`);
            updateRow(row.key, { error: "Enter a valid price" });
            continue;
          }
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

          const newPantryItem = await addIngredientToPantry({
            ingredient: ingredientId,
            storageLocation: row.storageLocationId,
            quantityAvailable: parsedQuantity,
            quantityUnit: row.unit || "item",
            purchasePrice: parsedPrice,
            store: resolvedStore?._id ?? null,
            purchaseDate: purchaseDate || undefined,
            expiryDate: row.expiryDate || undefined,
          });

          successCount += 1;
          // Uncheck + mark done rather than removing the row, so the
          // summary line and a re-expand both still show what happened;
          // matchedIngredientId now points at the real (possibly
          // just-created) ingredient so this can never be re-submitted as
          // a duplicate "new ingredient" proposal either.
          updateRow(row.key, {
            checked: false,
            submitted: true,
            matchedIngredientId: ingredientId,
            error: undefined,
          });

          if (row.matchedGroceryItemId) {
            try {
              await updateGroceryItem(row.matchedGroceryItemId, {
                status: "completed",
                pantryItem: newPantryItem._id,
              });
            } catch (groceryError) {
              // The pantry item itself already exists — never fail or
              // un-submit the row over this (retrying would risk a
              // duplicate pantry item). The grocery item just stays
              // pendingLog, reachable via its own manual log-to-pantry flow.
              failures.push(
                `${row.name}: added to pantry, but couldn't update the grocery list (${
                  groceryError instanceof Error ? groceryError.message : "unknown error"
                })`,
              );
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to add";
          failures.push(`${row.name}: ${message}`);
          updateRow(row.key, { error: message });
        }
      }

      if (failures.length === 0) {
        draftClearedRef.current = true;
        await clearReviewDraft();
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

  if (loadError) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50 px-8">
        <Ionicons name="cloud-offline-outline" size={40} color="#94A3B8" />
        <Text className="mt-3 text-center text-base font-semibold text-slate-700">
          Couldn&apos;t load this receipt
        </Text>
        <Text className="mt-1 text-center text-sm text-slate-500">{loadError}</Text>
        <Pressable
          className="mt-5 rounded-xl bg-blue-600 px-5 py-3 active:bg-blue-700"
          onPress={() => setRetryToken((token) => token + 1)}
        >
          <Text className="font-semibold text-white">Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (loading || !receipt) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="mt-3 text-slate-500">Loading...</Text>
      </SafeAreaView>
    );
  }

  const rowCallbacks: RowCallbacks = {
    ingredients,
    storageLocations,
    categories,
    brands,
    genericIngredients,
    pendingGroceryItems,
    purchaseDate,
    updateRow,
    applyIngredientMatch,
    handleNameChange,
    onScanBarcode: setBarcodeScanRowKey,
    onDeleteRow: handleDeleteRow,
    onOpenGroceryLink: setGroceryLinkRowKey,
  };

  const allSelectableChecked =
    rows.filter((r) => !r.submitted).length > 0 && rows.filter((r) => !r.submitted).every((r) => r.checked);

  // Roughly half the screen, with a floor so the detail card stays usable
  // on smaller phones — the rest goes to the compact list below it.
  const pagerHeight = Math.max(380, Math.round(windowHeight * 0.5));

  // Card width leaves CARD_PEEK px of the neighboring card visible on each
  // side (with CARD_GAP of empty space between cards) — a visual hint that
  // this section scrolls horizontally, not just an isolated single card.
  const cardWidth = windowWidth - 2 * (CARD_GAP + CARD_PEEK);
  const cardStride = cardWidth + CARD_GAP;
  const cardSidePadding = CARD_GAP + CARD_PEEK;

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
            className="mr-1 h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
            onPress={handleDiscardReceipt}
          >
            <Ionicons name="trash-outline" size={20} color="#DC2626" />
          </Pressable>
          <Pressable
            disabled={submitting}
            className={`rounded-xl px-4 py-2 ${submitting ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}
            onPress={() => void handleConfirm()}
          >
            <Text className="font-semibold text-white">{submitting ? "Adding..." : "Confirm"}</Text>
          </Pressable>
        </View>

        <View className="flex-row gap-2 px-4 pt-3">
          <View className="flex-1">
            <Text className="mb-1 text-xs font-semibold text-slate-500">Store</Text>
            <SearchableObjectDropdown<SelectOption>
              compact
              options={stores}
              selectedId={storeId}
              selectedName={storeName}
              placeholder="Search or new"
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
          </View>

          <View className="flex-1">
            <Text className="mb-1 text-xs font-semibold text-slate-500">Purchase date</Text>
            <DateTextInput
              value={purchaseDate}
              onChangeText={setPurchaseDate}
              placeholder="YYYY-MM-DD"
              className="rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950"
              style={{ height: 44 }}
            />
          </View>
        </View>

        {rows.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-center text-slate-500">
              No items left on this receipt — add one below, or discard the receipt.
            </Text>
          </View>
        ) : (
          <View style={{ height: pagerHeight }} className="mt-3">
            <Text className="mb-2 px-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Item {focusedIndex + 1} of {rows.length} · swipe for next
            </Text>
            <FlatList<ReviewRow>
              ref={pagerRef}
              data={rows}
              keyExtractor={(row) => row.key}
              horizontal
              snapToInterval={cardStride}
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: cardSidePadding }}
              ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
              getItemLayout={(_, index) => ({
                length: cardStride,
                offset: cardStride * index,
                index,
              })}
              onScrollToIndexFailed={({ index }) => {
                setTimeout(
                  () => pagerRef.current?.scrollToIndex({ index, animated: false }),
                  50,
                );
              }}
              onMomentumScrollEnd={(event) => {
                const index = Math.round(event.nativeEvent.contentOffset.x / cardStride);
                setFocusedIndex(Math.max(0, Math.min(index, rows.length - 1)));
              }}
              renderItem={({ item: row }) => (
                <View style={{ width: cardWidth }} className="flex-1">
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ flexGrow: 1 }}
                  >
                    <ReceiptRowDetail row={row} callbacks={rowCallbacks} />
                  </ScrollView>
                </View>
              )}
            />
          </View>
        )}

        <View className="mt-2 flex-1 border-t border-slate-200 bg-white">
          <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
            <Text className="text-sm font-bold uppercase tracking-wide text-slate-500">
              {rows.length} item{rows.length === 1 ? "" : "s"} ·{" "}
              {rows.filter((r) => r.checked && !r.submitted).length} selected
              {rows.some((r) => r.submitted)
                ? ` · ${rows.filter((r) => r.submitted).length} added`
                : ""}
              {rows.some((r) => !r.submitted && getMissingFields(r, pendingGroceryItems.length > 0).length > 0)
                ? ` · ${
                    rows.filter((r) => !r.submitted && getMissingFields(r, pendingGroceryItems.length > 0).length > 0)
                      .length
                  } incomplete`
                : ""}
            </Text>
            <Pressable
              onPress={() => {
                setRows((prev) =>
                  prev.map((r) => (r.submitted ? r : { ...r, checked: !allSelectableChecked })),
                );
              }}
            >
              <Text className="text-xs font-semibold text-blue-600">
                {allSelectableChecked ? "Deselect all" : "Select all"}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            {rows.map((row, index) => (
              <ReceiptRowSummary
                key={row.key}
                row={row}
                isFocused={index === focusedIndex}
                hasPendingGroceryItems={pendingGroceryItems.length > 0}
                onPress={() => goToIndex(index)}
                onToggleChecked={() => updateRow(row.key, { checked: !row.checked, error: undefined })}
              />
            ))}

            <Pressable
              className="mt-1 flex-row items-center justify-center rounded-2xl border border-dashed border-slate-300 py-3 active:bg-slate-100"
              onPress={handleAddManualRow}
            >
              <Ionicons name="add-circle-outline" size={18} color="#2563EB" />
              <Text className="ml-1.5 text-sm font-semibold text-blue-600">
                Add an item the receipt missed
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <BarcodeScannerModal
        visible={!!barcodeScanRowKey}
        onClose={() => setBarcodeScanRowKey(null)}
        onProductFound={handleBarcodeScanned}
      />

      <Modal
        visible={!!groceryLinkRowKey}
        transparent
        animationType="fade"
        onRequestClose={() => setGroceryLinkRowKey(null)}
      >
        <Pressable
          className="flex-1 items-center justify-end bg-black/40"
          onPress={() => setGroceryLinkRowKey(null)}
        >
          <Pressable
            className="max-h-[70%] w-full rounded-t-3xl bg-white pb-6 pt-4"
            onPress={(event) => event.stopPropagation()}
          >
            <Text className="px-5 pb-3 text-base font-bold text-slate-950">
              Link to grocery list
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Pressable
                className="flex-row items-center border-t border-slate-100 px-5 py-4 active:bg-slate-50"
                onPress={() => {
                  if (groceryLinkRowKey) handleLinkGroceryItem(groceryLinkRowKey, null);
                  setGroceryLinkRowKey(null);
                }}
              >
                <Ionicons name="close-circle-outline" size={20} color="#64748B" />
                <Text className="ml-2.5 text-sm font-medium text-slate-700">
                  Not on my list (bought extra)
                </Text>
              </Pressable>
              {pendingGroceryItems.length === 0 ? (
                <Text className="px-5 py-4 text-sm text-slate-400">
                  Nothing pending on your grocery list right now.
                </Text>
              ) : (
                pendingGroceryItems.map((item) => {
                  const currentRow = rows.find((r) => r.key === groceryLinkRowKey);
                  const isSelected = currentRow?.matchedGroceryItemId === item._id;
                  const claimedByOtherRow = rows.find(
                    (r) => r.key !== groceryLinkRowKey && r.matchedGroceryItemId === item._id,
                  );
                  return (
                    <Pressable
                      key={item._id}
                      className="flex-row items-center border-t border-slate-100 px-5 py-4 active:bg-slate-50"
                      onPress={() => {
                        if (groceryLinkRowKey) handleLinkGroceryItem(groceryLinkRowKey, item._id);
                        setGroceryLinkRowKey(null);
                      }}
                    >
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-slate-900">{item.name}</Text>
                        <Text className="mt-0.5 text-xs text-slate-400">
                          {item.quantity != null ? `${item.quantity} ${item.unit}`.trim() : "No quantity set"}
                          {claimedByOtherRow ? " · currently linked to another item on this receipt" : ""}
                        </Text>
                      </View>
                      {isSelected && <Ionicons name="checkmark-circle" size={20} color="#2563EB" />}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
