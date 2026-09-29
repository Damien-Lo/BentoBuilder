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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { BarcodeScannerModal, type ScannedProduct } from "@/src/components/BarcodeScannerModal";
import { PhotoCaptureModal } from "@/src/components/PhotoCaptureModal";
import { countReadNutrients, labelNutrition, labelServing } from "@/src/utils/nutritionLabel";
import {
  CreatableStringDropdown,
  DatePickerModal,
  DurationExpiryInput,
  PriceInput,
  SearchableObjectDropdown,
  SegmentedToggle,
  UnitConversionsEditor,
} from "@/src/components/forms";
import {
  getIngredients,
  createIngredient,
  parseNutritionLabel,
  updateIngredient,
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
  unitSuggestionsFrom,
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
import { useScrollFocusSection } from "@/src/hooks/useScrollFocusSection";
import { addDurationToDate, formatDateDisplay, todayDateInputString } from "@/src/utils/date";
import {
  convertUnits,
  getIngredientConversions,
  type CustomUnitConversion,
} from "@/src/utils/unitConversion";
import { scaleNutrition, toNutritionInput, unknownNutrition } from "@/src/utils/nutrition";
import {
  EXTENDED_NUTRITION_FIELDS,
  EXTENDED_NUTRITION_GROUPS,
  NUTRITION_FIELD_META,
  type ExtendedNutritionField,
} from "@/src/types/nutrition";
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

  // The serving size nutrition is defined for, in the *same* unit as
  // `unit` above (how much was bought) - there's only ever one unit in
  // play for a given row, so there's nothing to keep in sync. Independent
  // of `quantity` itself (the total bought) and never touched by editing
  // that - e.g. buying 6 (of whatever unit) of a brand-new ingredient
  // shouldn't turn "5 cal per 1" into "30 cal per 6" as its permanent
  // catalog definition. Both quantity and this are directly, independently
  // editable.
  nutrition: ReceiptNutrition;
  // A string, like `quantity` above, and for the same reason - a
  // controlled TextInput whose value is derived from a `number` can't
  // represent "the field is momentarily empty, about to be retyped"
  // without snapping back to the old value and mangling the next
  // keystroke (typing "5" over a snapped-back "1" becomes "15"). Parsed
  // with Number(...) wherever it's actually used for math.
  defaultPortionAmount: string;

  // Only meaningful while matchedIngredientId is null, like the proposal
  // fields above - a real, reusable unit conversion (e.g. "1 stalk = 15
  // g") to save on the new ingredient, for when its natural unit differs
  // from whatever unit this particular purchase happened to be in.
  unitConversions: CustomUnitConversion[];
}

// Ingredient.nutrition uses optional numbers; ReviewRow.nutrition uses
// nullable numbers (so an empty editable field has a clear "unset" value) —
// this just bridges the two.
function toReceiptNutrition(nutrition?: IngredientNutrition): ReceiptNutrition {
  return scaleNutrition(nutrition, 1);
}

// A row has one single unit throughout (quantity bought and serving size
// always share it) - converts a portion amount that came from a different
// unit (a matched ingredient's own catalog portion, a barcode's serving
// size, Gemini's proposal) into the row's unit when possible: same unit
// (case-insensitive), or a real conversion exists via customConversions.
// Otherwise falls back to 1 rather than pairing the wrong amount with the
// wrong unit - a safe, honest default the user can correct (or fix for
// good by adding a real conversion in the unit-conversions section).
function convertPortionAmount(
  amount: number,
  fromUnit: string,
  targetUnit: string,
  customConversions: CustomUnitConversion[] = [],
): number {
  if (fromUnit.trim().toLowerCase() === targetUnit.trim().toLowerCase()) return amount;
  const converted = convertUnits(amount, fromUnit, targetUnit, customConversions);
  // Rounded to 3 decimals, so 100 g in lb reads 0.22, not 0.220462.
  return converted == null ? 1 : Math.round(converted * 1000) / 1000;
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

// A draft saved by an older version of this page can be missing fields
// added since (e.g. defaultPortionAmount, unitConversions, the extended
// nutrients) — fill them with the same defaults a fresh row gets, so
// resuming it can't crash the page.
function normalizeDraftRow(row: Partial<ReviewRow>): ReviewRow {
  const text = (value: unknown) => (typeof value === "string" ? value : value == null ? "" : String(value));
  return {
    ...(row as ReviewRow),
    checked: row.checked ?? true,
    submitted: row.submitted ?? false,
    matchedIngredientId: row.matchedIngredientId ?? null,
    matchedGroceryItemId: row.matchedGroceryItemId ?? null,
    name: text(row.name),
    quantity: text(row.quantity),
    unit: text(row.unit),
    price: text(row.price),
    storageLocationId: text(row.storageLocationId),
    storageLocationName: text(row.storageLocationName),
    expiryDate: text(row.expiryDate),
    expiryTouched: row.expiryTouched ?? false,
    expirySuggestion: row.expirySuggestion ?? null,
    isGeneric: row.isGeneric ?? true,
    brandId: text(row.brandId),
    brandName: text(row.brandName),
    categoryId: text(row.categoryId),
    categoryName: text(row.categoryName),
    genericParentId: text(row.genericParentId),
    genericName: text(row.genericName),
    barcode: row.barcode ?? null,
    nutrition: { ...unknownNutrition(), ...(row.nutrition ?? {}) },
    defaultPortionAmount: text(row.defaultPortionAmount),
    unitConversions: Array.isArray(row.unitConversions) ? row.unitConversions : [],
  };
}

// The option whose name is exactly `name` (ignoring case/whitespace), if any.
function exactOption<T extends { _id: string; name: string }>(options: T[], name: string): T | undefined {
  const normalized = name.trim().toLowerCase();
  return normalized ? options.find((option) => option.name.trim().toLowerCase() === normalized) : undefined;
}

// Links a row's typed-but-never-picked names (storage location, category,
// brand, generic parent) to the option they exactly match, so typing
// "Fridge" in full counts the same as picking it. Returns the same row when
// there's nothing to link.
function linkTypedOptions(
  row: ReviewRow,
  storageLocations: SelectOption[],
  categories: SelectOption[],
  brands: SelectOption[],
  genericIngredients: Ingredient[],
): ReviewRow {
  if (row.submitted) return row;
  const updates: Partial<ReviewRow> = {};
  const location = !row.storageLocationId ? exactOption(storageLocations, row.storageLocationName) : undefined;
  if (location) updates.storageLocationId = location._id;
  const category = !row.categoryId ? exactOption(categories, row.categoryName) : undefined;
  if (category) updates.categoryId = category._id;
  const brand = !row.brandId && !row.isGeneric ? exactOption(brands, row.brandName) : undefined;
  if (brand) updates.brandId = brand._id;
  const generic = !row.genericParentId && !row.isGeneric ? exactOption(genericIngredients, row.genericName) : undefined;
  if (generic) updates.genericParentId = generic._id;
  return Object.keys(updates).length > 0 ? { ...row, ...updates } : row;
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

  const parsedPortionAmount = Number(row.defaultPortionAmount);
  if (
    row.defaultPortionAmount.trim() === "" ||
    !Number.isFinite(parsedPortionAmount) ||
    parsedPortionAmount <= 0
  ) {
    missing.push("serving size");
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

// Labels for the card's "More nutrients" grid — the full names don't fit
// three to a row.
const EXTENDED_SHORT_LABELS: Record<ExtendedNutritionField, string> = {
  sugar: "Sugar",
  addedSugar: "Added sugar",
  saturatedFat: "Saturated fat",
  polyunsaturatedFat: "Polyunsat. fat",
  monounsaturatedFat: "Monounsat. fat",
  transFat: "Trans fat",
  omega3: "Omega-3",
  cholesterol: "Cholesterol",
  potassium: "Potassium",
  vitaminA: "Vitamin A",
  vitaminC: "Vitamin C",
  vitaminD: "Vitamin D",
  vitaminE: "Vitamin E",
  vitaminK: "Vitamin K",
  thiamin: "B1 Thiamin",
  riboflavin: "B2 Riboflavin",
  niacin: "B3 Niacin",
  vitaminB6: "Vitamin B6",
  folate: "Folate",
  vitaminB12: "Vitamin B12",
  choline: "Choline",
  calcium: "Calcium",
  iron: "Iron",
  magnesium: "Magnesium",
  phosphorus: "Phosphorus",
  zinc: "Zinc",
  selenium: "Selenium",
  iodine: "Iodine",
  copper: "Copper",
  manganese: "Manganese",
  caffeine: "Caffeine",
};

// The six main nutrients, with the icon and colour each cell shows.
const MAIN_NUTRIENT_CELLS: {
  field: keyof ReceiptNutrition;
  label: string;
  unit: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}[] = [
  { field: "calories", label: "Calories", unit: "kcal", icon: "flame", color: "#F97316" },
  { field: "protein", label: "Protein", unit: "g", icon: "barbell", color: "#8B5CF6" },
  { field: "carbs", label: "Carbs", unit: "g", icon: "leaf", color: "#22C55E" },
  { field: "fats", label: "Fat", unit: "g", icon: "water", color: "#F59E0B" },
  { field: "fiber", label: "Fiber", unit: "g", icon: "nutrition", color: "#16A34A" },
  { field: "sodium", label: "Sodium", unit: "mg", icon: "flask", color: "#64748B" },
];

// A picture for an item in the bottom list, from its category name — the
// receipt has no product photos, and a category always exists.
const CATEGORY_EMOJI: [RegExp, string][] = [
  [/fruit/i, "🍎"],
  [/veg|produce|green|herb|salad/i, "🥬"],
  [/egg/i, "🥚"],
  [/dairy|milk|cheese|yogurt|yoghurt/i, "🧀"],
  [/seafood|fish/i, "🐟"],
  [/meat|poultry|beef|pork|chicken|deli/i, "🥩"],
  [/bak|bread/i, "🍞"],
  [/frozen/i, "🧊"],
  [/snack|confection|candy|sweet|dessert/i, "🍬"],
  [/drink|beverage|juice|coffee|tea|soda/i, "🥤"],
  [/spice|season|condiment|sauce|dressing/i, "🧂"],
  [/grain|pasta|rice|noodle|cereal|flour/i, "🍚"],
  [/oil/i, "🫒"],
  [/supplement|vitamin/i, "💊"],
  [/can|jar|pantry|staple/i, "🥫"],
];

function categoryEmoji(categoryName: string): string {
  return CATEGORY_EMOJI.find(([pattern]) => pattern.test(categoryName))?.[1] ?? "🛒";
}

// How much of a neighboring card peeks in from each side of the top pager,
// and the empty gap between cards — both a fixed visual hint that the
// section scrolls horizontally.
const CARD_PEEK = 14;
const CARD_GAP = 10;

// The item-list panel overlays the card area from the bottom, like a
// bottom sheet — collapsed by default to roughly one row's height (still
// scrollable within that, just showing less at once) so the detail card
// above gets most of the screen; dragging the handle up expands it toward
// EXPANDED_LIST_HEIGHT, overlaying the cards for easier browsing through
// many items at once.
const COLLAPSED_LIST_HEIGHT = 168;
const LIST_HANDLE_AREA_HEIGHT = 28;

// One nutrition value. Keeps its own text while typing — the row stores a
// number, and echoing that straight back would turn "0." into "0" and make
// decimals impossible to type. Blank = unknown (null); anything that isn't a
// number is ignored rather than stored. Read-only (greyed) for a matched
// ingredient, whose nutrition comes from the catalog.
function NutritionCell({
  label,
  unit,
  icon,
  iconColor,
  value,
  onChange,
  onFocus,
  editable,
}: {
  label: string;
  unit: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  onFocus: () => void;
  editable: boolean;
}) {
  const [text, setText] = useState(value != null ? String(value) : "");

  useEffect(() => {
    setText((prev) => {
      const parsed = prev.trim() === "" ? null : Number(prev);
      return parsed === (value ?? null) ? prev : value != null ? String(value) : "";
    });
  }, [value]);

  return (
    <View
      className={`rounded-xl border px-2 pb-1 pt-1.5 ${
        editable ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50"
      }`}
    >
      <View className="flex-row items-center">
        {icon && <Ionicons name={icon} size={11} color={editable ? iconColor : "#94A3B8"} />}
        <Text numberOfLines={1} className={`flex-1 text-[11px] text-slate-500 ${icon ? "ml-1" : ""}`}>
          {label}
        </Text>
      </View>
      <View className="flex-row items-center">
        <TextInput
          value={text}
          onChangeText={(raw) => {
            setText(raw);
            const parsed = raw.trim() === "" ? null : Number(raw);
            if (parsed === null || Number.isFinite(parsed)) onChange(parsed);
          }}
          onFocus={onFocus}
          editable={editable}
          keyboardType="decimal-pad"
          placeholder="—"
          placeholderTextColor="#CBD5E1"
          className={`flex-1 py-0.5 text-[15px] font-medium ${editable ? "text-slate-950" : "text-slate-500"}`}
        />
        <Text className="text-[11px] text-slate-400">{unit}</Text>
      </View>
    </View>
  );
}

// The New / Matched / Added pill — or "Incomplete" when asked to show that
// instead (the bottom list, where there's no room for a separate warning).
function StatusBadge({ row, isNew, incomplete = false }: { row: ReviewRow; isNew: boolean; incomplete?: boolean }) {
  const tone = row.submitted
    ? { bg: "bg-slate-100", text: "text-slate-500", icon: "checkmark-done" as const, color: "#64748B", label: "Added" }
    : incomplete
      ? { bg: "bg-amber-50", text: "text-amber-700", icon: "alert-circle" as const, color: "#D97706", label: "Incomplete" }
      : isNew
        ? { bg: "bg-violet-50", text: "text-violet-700", icon: "sparkles" as const, color: "#7C3AED", label: "New" }
        : { bg: "bg-emerald-50", text: "text-emerald-700", icon: "checkmark-circle" as const, color: "#059669", label: "Matched" };

  return (
    <View className={`flex-row items-center rounded-full px-2 py-1 ${tone.bg}`}>
      <Ionicons name={tone.icon} size={12} color={tone.color} />
      <Text className={`ml-1 text-xs font-semibold ${tone.text}`}>{tone.label}</Text>
    </View>
  );
}

function CardLabel({ children, first = false }: { children: string; first?: boolean }) {
  return (
    <Text className={`mb-1.5 text-[13px] font-semibold text-slate-700 ${first ? "mt-3" : "mt-4"}`}>{children}</Text>
  );
}

interface RowCallbacks {
  ingredients: Ingredient[];
  storageLocations: SelectOption[];
  categories: SelectOption[];
  brands: SelectOption[];
  genericIngredients: Ingredient[];
  pendingGroceryItems: GroceryItem[];
  // Units to offer in the unit pickers (common units + ones already used).
  unitOptions: string[];
  purchaseDate: string;
  updateRow: (key: string, updates: Partial<ReviewRow>) => void;
  applyIngredientMatch: (rowKey: string, ingredient: Ingredient) => void;
  handleNameChange: (rowKey: string, value: string) => void;
  onScanBarcode: (rowKey: string) => void;
  // Photograph this row's nutrition label to fill its nutrition + serving.
  onScanLabel: (rowKey: string) => void;
  // The row whose label photo is being read right now, if any.
  readingLabelRowKey: string | null;
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
    unitOptions,
    purchaseDate,
    updateRow,
    applyIngredientMatch,
    handleNameChange,
    onScanBarcode,
    onScanLabel,
    readingLabelRowKey,
    onDeleteRow,
    onOpenGroceryLink,
  } = callbacks;

  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [showMoreNutrients, setShowMoreNutrients] = useState(false);
  const [pickingExpiry, setPickingExpiry] = useState(false);

  // Scrolls whichever field was just focused/opened into view within this
  // card's own ScrollView — nested inside the horizontal pager the way this
  // card is, RN doesn't do that automatically, so a lower field can end up
  // hidden behind the keyboard or the draggable item-list panel with no way
  // to see what's being typed. zIndex descends in on-screen order — see
  // useScrollFocusSection for why that matters for the dropdown sections.
  const scrollRef = useRef<ScrollView>(null);
  const scrollAnchorRef = useRef<View>(null);
  const quantitySection = useScrollFocusSection(scrollRef, scrollAnchorRef, 60);
  const storageLocationSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 50);
  const classificationSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 40);
  const genericParentSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 30);
  const servingSizeSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 20);
  const expirySection = useScrollFocusSection(scrollRef, scrollAnchorRef, 10);

  const isNew = !row.matchedIngredientId;
  const hasPendingGroceryItems = pendingGroceryItems.length > 0;
  const linkedGroceryItem = row.matchedGroceryItemId
    ? pendingGroceryItems.find((item) => item._id === row.matchedGroceryItemId)
    : undefined;
  const missingFields = row.submitted ? [] : getMissingFields(row, hasPendingGroceryItems);
  const isRowComplete = missingFields.length === 0;
  const readingLabel = readingLabelRowKey === row.key;

  // The matched ingredient's own unit conversions (e.g. "1 box = 340g")
  // apply on every quantity/unit edit, not just at match time — otherwise a
  // real conversion the ingredient actually has would be missed and treated
  // as an unrelated unit.
  const matchedIngredient = row.matchedIngredientId
    ? ingredients.find((ing) => ing._id === row.matchedIngredientId)
    : null;
  // A matched ingredient's own conversions come straight from the catalog;
  // a brand-new one has no catalog entry yet, so its only source is
  // whatever's been entered in this row's own Unit conversions section below.
  const customConversions = matchedIngredient
    ? getIngredientConversions(matchedIngredient, [], ingredients)
    : row.unitConversions;

  const filledExtended = EXTENDED_NUTRITION_FIELDS.filter((f) => row.nutrition[f] != null).length;
  const updateNutrient = (field: keyof ReceiptNutrition, value: number | null) =>
    updateRow(row.key, { nutrition: { ...row.nutrition, [field]: value } });

  const categoryDropdown = (
    <SearchableObjectDropdown<SelectOption>
      options={categories}
      selectedId={row.categoryId}
      selectedName={row.categoryName}
      compact
      inline
      placeholder="Category"
      onOpen={classificationSection.trigger}
      onTextChange={(value) =>
        updateRow(row.key, { categoryName: value, categoryId: exactOption(categories, value)?._id ?? "" })
      }
      onSelect={(option) => updateRow(row.key, { categoryId: option._id, categoryName: option.name })}
    />
  );

  const storageDropdown = (
    <SearchableObjectDropdown<SelectOption>
      options={storageLocations}
      selectedId={row.storageLocationId}
      selectedName={row.storageLocationName}
      compact
      inline
      placeholder="Location"
      onOpen={storageLocationSection.trigger}
      onTextChange={(value) =>
        updateRow(row.key, {
          storageLocationName: value,
          storageLocationId: exactOption(storageLocations, value)?._id ?? "",
        })
      }
      onSelect={(option) =>
        updateRow(row.key, { storageLocationId: option._id, storageLocationName: option.name })
      }
    />
  );

  return (
    <View
      className={`flex-1 overflow-hidden rounded-3xl border bg-white ${row.error ? "border-red-300" : "border-slate-200"} ${row.submitted ? "opacity-50" : ""}`}
    >
      {/* Pinned header — the receipt line and the name stay visible no
          matter how far the body below is scrolled, so it's always clear
          which item this card is. Kept to two rows so the body gets the
          room. */}
      <View className="border-b border-slate-100 px-3.5 pb-3 pt-3">
        <View className="flex-row items-center gap-2">
          <Pressable
            disabled={row.submitted}
            hitSlop={6}
            className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
              row.submitted
                ? "border-emerald-500 bg-emerald-500"
                : row.checked
                  ? "border-blue-600 bg-blue-600"
                  : "border-slate-300"
            }`}
            onPress={() => updateRow(row.key, { checked: !row.checked, error: undefined })}
          >
            {(row.checked || row.submitted) && <Ionicons name="checkmark" size={16} color="white" />}
          </Pressable>

          <Ionicons name="receipt-outline" size={14} color="#94A3B8" />
          <Text className="flex-1 text-xs text-slate-400" numberOfLines={1}>
            “{row.lineItem.rawText}”
            {row.barcode ? ` · ${row.barcode}` : ""}
          </Text>

          <StatusBadge row={row} isNew={isNew} />
        </View>

        <View className="mt-2.5 flex-row items-center gap-2">
          <View className="flex-1">
            <SearchableObjectDropdown<Ingredient>
              options={ingredients}
              selectedId={row.matchedIngredientId ?? ""}
              selectedName={row.name}
              showAllWhenEmpty={false}
              compact
              inline
              inlineLimit={6}
              placeholder="Item name"
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
            accessibilityLabel="Scan barcode"
            className="h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white active:bg-slate-100"
            onPress={() => onScanBarcode(row.key)}
          >
            <Ionicons name="barcode-outline" size={20} color="#334155" />
          </Pressable>
          <Pressable
            accessibilityLabel="Remove item"
            className="h-11 w-11 items-center justify-center rounded-xl bg-red-50 active:bg-red-100"
            onPress={() => onDeleteRow(row.key, row.name)}
          >
            <Ionicons name="trash-outline" size={19} color="#DC2626" />
          </Pressable>
        </View>
      </View>

      {/* Everything below the name row scrolls independently, inside the
          card's own fixed height — the bottom padding reserves space for
          the draggable item-list panel that overlays the bottom of the
          screen, so the last field can still be scrolled clear of it. */}
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 14,
          paddingBottom: COLLAPSED_LIST_HEIGHT + LIST_HANDLE_AREA_HEIGHT + 24,
        }}
      >
        {/* Zero-size anchor at the very top of the scrollable content — see
            useScrollToFocusedField, which measures fields against this rather
            than the ScrollView itself. */}
        <View ref={scrollAnchorRef} collapsable={false} />

        {!row.submitted && !isRowComplete && (
          <View className="mt-3 flex-row items-start rounded-xl bg-amber-50 px-3 py-2.5">
            <Ionicons name="alert-circle" size={16} color="#D97706" />
            <Text className="ml-2 flex-1 text-xs font-medium leading-4 text-amber-800">
              Missing: {missingFields.join(", ")}
            </Text>
          </View>
        )}

        {!row.submitted && (
          <Pressable
            className="mt-2.5 flex-row items-center self-start"
            hitSlop={6}
            onPress={() => onOpenGroceryLink(row.key)}
          >
            <Ionicons
              name="cart-outline"
              size={14}
              color={linkedGroceryItem ? "#64748B" : hasPendingGroceryItems ? "#D97706" : "#94A3B8"}
            />
            <Text
              className={`ml-1.5 text-xs font-medium ${
                linkedGroceryItem ? "text-slate-600" : hasPendingGroceryItems ? "text-amber-700" : "text-slate-400"
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

        {/* How much was actually bought — feeds the pantry item's stock
            directly, independent of the serving size nutrition is defined
            for below. Editing this never touches nutrition. */}
        <View {...quantitySection.wrapperProps}>
          <CardLabel first={row.submitted}>Quantity bought</CardLabel>
          <View className="flex-row gap-2">
            <TextInput
              value={row.quantity}
              onChangeText={(value) => updateRow(row.key, { quantity: value })}
              onFocus={quantitySection.trigger}
              keyboardType="decimal-pad"
              placeholder="Qty"
              placeholderTextColor="#94A3B8"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950"
              style={{ height: 40 }}
            />
            <View className="flex-1">
              <CreatableStringDropdown
                compact
                height={40}
                options={unitOptions}
                selectedValue={row.unit}
                placeholder="Unit"
                onSelect={(value) => updateRow(row.key, { unit: value })}
              />
            </View>
            <View className="flex-1">
              <PriceInput
                compact
                value={row.price}
                onChangeText={(value) => updateRow(row.key, { price: value })}
                onFocus={quantitySection.trigger}
              />
            </View>
          </View>
        </View>

        {/* A new ingredient pairs the storage location with Branded /
            Generic; a matched one only needs the location. */}
        <View {...storageLocationSection.wrapperProps}>
          {isNew ? (
            <View className="flex-row gap-3">
              <View className="flex-1">
                <CardLabel>Storage location</CardLabel>
                {storageDropdown}
              </View>
              <View className="flex-1">
                <CardLabel>Item type</CardLabel>
                <SegmentedToggle<boolean>
                  compact
                  height={44}
                  value={row.isGeneric}
                  options={[
                    { value: false, label: "Branded" },
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
              </View>
            </View>
          ) : (
            <>
              <CardLabel>Storage location</CardLabel>
              {storageDropdown}
            </>
          )}
        </View>

        {/* A matched ingredient's classification comes from the catalog
            and isn't saved from here — shown, not editable. */}
        {!isNew && matchedIngredient && (
          <View className="mt-3 flex-row flex-wrap items-center gap-1.5">
            {!!referenceName(matchedIngredient.category) && (
              <View className="flex-row items-center rounded-full bg-slate-100 px-2.5 py-1">
                <Text className="mr-1 text-xs">{categoryEmoji(referenceName(matchedIngredient.category))}</Text>
                <Text className="text-xs font-medium text-slate-600">{referenceName(matchedIngredient.category)}</Text>
              </View>
            )}
            <View className="rounded-full bg-slate-100 px-2.5 py-1">
              <Text className="text-xs font-medium text-slate-600">
                {matchedIngredient.isGeneric ? "Generic" : referenceName(matchedIngredient.brand) || "Branded"}
              </Text>
            </View>
            <Text className="text-[11px] text-slate-400">from your catalog</Text>
          </View>
        )}

        {isNew && (
          <View {...classificationSection.wrapperProps}>
            {row.isGeneric ? (
              <>
                <CardLabel>Category</CardLabel>
                {categoryDropdown}
              </>
            ) : (
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <CardLabel>Category</CardLabel>
                  {categoryDropdown}
                </View>
                <View className="flex-1">
                  <CardLabel>Brand</CardLabel>
                  <SearchableObjectDropdown<SelectOption>
                    options={brands}
                    selectedId={row.brandId}
                    selectedName={row.brandName}
                    compact
                    inline
                    placeholder="Brand"
                    onOpen={classificationSection.trigger}
                    onTextChange={(value) =>
                      updateRow(row.key, { brandName: value, brandId: exactOption(brands, value)?._id ?? "" })
                    }
                    onSelect={(option) => updateRow(row.key, { brandId: option._id, brandName: option.name })}
                  />
                </View>
              </View>
            )}
          </View>
        )}

        {isNew && !row.isGeneric && (
          <View {...genericParentSection.wrapperProps}>
            <CardLabel>Generic parent (for matching)</CardLabel>
            <SearchableObjectDropdown<Ingredient>
              options={genericIngredients}
              selectedId={row.genericParentId}
              selectedName={row.genericName}
              compact
              inline
              placeholder="e.g. Greek Yogurt"
              onOpen={genericParentSection.trigger}
              onTextChange={(value) =>
                updateRow(row.key, {
                  genericName: value,
                  genericParentId: exactOption(genericIngredients, value)?._id ?? "",
                })
              }
              onSelect={(option) => updateRow(row.key, { genericParentId: option._id, genericName: option.name })}
            />
          </View>
        )}

        {/* Serving size nutrition is defined for — independent of how much was
            bought above, but always the *same unit* as that (there's only
            ever one unit in play for a row - if the ingredient's natural
            serving unit is genuinely different, e.g. "1 stalk" for something
            bought in grams, that's what the unit conversion section further
            down is for). This is what actually gets saved as the
            ingredient's catalog default portion for a brand-new ingredient,
            so it should read like "5 cal per 1 <unit>," not "however much I
            bought today." */}
        <View {...servingSizeSection.wrapperProps}>
          <View className="mt-4 flex-row items-center">
            <Text className="flex-1 text-[13px] font-semibold text-slate-700">Serving size</Text>
            {isNew && (
              <Pressable
                disabled={readingLabel}
                onPress={() => onScanLabel(row.key)}
                accessibilityLabel="Scan nutrition label"
                className="h-8 flex-row items-center rounded-lg bg-blue-50 px-2.5 active:bg-blue-100"
              >
                {readingLabel ? (
                  <ActivityIndicator size="small" color="#2563EB" />
                ) : (
                  <Ionicons name="camera-outline" size={15} color="#1D4ED8" />
                )}
                <Text className="ml-1.5 text-xs font-semibold text-blue-700">
                  {readingLabel ? "Reading…" : "Scan label"}
                </Text>
              </Pressable>
            )}
          </View>
          <View className="mt-1.5 flex-row items-center">
            <View className="w-28 flex-row items-center rounded-xl border border-slate-200 bg-white px-3" style={{ height: 40 }}>
              <TextInput
                value={row.defaultPortionAmount}
                onChangeText={(value) => updateRow(row.key, { defaultPortionAmount: value })}
                onFocus={servingSizeSection.trigger}
                keyboardType="decimal-pad"
                placeholder="Amt"
                placeholderTextColor="#94A3B8"
                className="flex-1 text-sm text-slate-950"
              />
              <Text className="ml-1 text-sm text-slate-400">{row.unit || "unit"}</Text>
            </View>
            <Text className="ml-2.5 flex-1 text-[11px] leading-4 text-slate-400">
              {isNew
                ? "Same unit as quantity bought. Nutrition below is per this amount."
                : "Nutrition below is per this amount, from your catalog — edit it on the ingredient's page."}
            </Text>
          </View>

          <View className="-mx-1 mt-2 flex-row flex-wrap">
            {MAIN_NUTRIENT_CELLS.map((cell) => (
              <View key={cell.field} className="mb-2 px-1" style={{ width: "33.333%" }}>
                <NutritionCell
                  label={cell.label}
                  unit={cell.unit}
                  icon={cell.icon}
                  iconColor={cell.color}
                  value={row.nutrition[cell.field]}
                  onChange={(value) => updateNutrient(cell.field, value)}
                  onFocus={servingSizeSection.trigger}
                  editable={isNew}
                />
              </View>
            ))}
          </View>

          {/* The extended nutrients, collapsed by default — usually already
              filled from a barcode scan, label photo or the AI estimate, so
              this is mostly for checking/correcting them. Same editability
              rule as the grid above. */}
          <Pressable
            className="flex-row items-center rounded-xl bg-blue-50 px-3 py-2.5 active:bg-blue-100"
            onPress={() => setShowMoreNutrients((current) => !current)}
          >
            <Text className="text-xs font-semibold text-blue-700">More nutrients</Text>
            <Text className="ml-1 flex-1 text-xs text-blue-500">
              · {filledExtended} of {EXTENDED_NUTRITION_FIELDS.length} filled
            </Text>
            <Ionicons name={showMoreNutrients ? "chevron-up" : "chevron-down"} size={15} color="#1D4ED8" />
          </Pressable>
          {showMoreNutrients &&
            EXTENDED_NUTRITION_GROUPS.map((group) => (
              <View key={group.title} className="mt-2.5">
                <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {group.title}
                </Text>
                <View className="-mx-1 flex-row flex-wrap">
                  {group.fields.map((field) => (
                    <View key={field} className="mb-2 px-1" style={{ width: "33.333%" }}>
                      <NutritionCell
                        label={EXTENDED_SHORT_LABELS[field]}
                        unit={NUTRITION_FIELD_META[field].unit}
                        value={row.nutrition[field]}
                        onChange={(value) => updateNutrient(field, value)}
                        onFocus={servingSizeSection.trigger}
                        editable={isNew}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ))}
        </View>

        {/* Read-only, derived preview only — never stored. Purely "here's
            roughly how much you're adding to your pantry," computed live from
            quantity-bought x serving-size nutrition. Serving size and
            quantity share the same unit by design now, so this is always a
            plain ratio - no cross-unit conversion involved. */}
        {(() => {
          const qty = Number(row.quantity);
          const totalNutrition = Number.isFinite(qty) && qty > 0
            ? scaleNutritionToQuantity(
                row.nutrition,
                Number(row.defaultPortionAmount),
                row.unit,
                qty,
                row.unit,
                customConversions,
              )
            : null;
          return (
            <Text className="mt-2 text-[11px] text-slate-400">
              ≈ all {row.quantity || "?"} {row.unit}: {totalNutrition?.calories ?? "—"} kcal ·{" "}
              {totalNutrition?.protein ?? "—"} g protein · {totalNutrition?.carbs ?? "—"} g carbs ·{" "}
              {totalNutrition?.fats ?? "—"} g fat
            </Text>
          );
        })()}

        <View {...expirySection.wrapperProps}>
          <View className="mb-1.5 mt-4 flex-row items-center">
            <Text className="flex-1 text-[13px] font-semibold text-slate-700">Expiry date</Text>
            {row.expirySuggestion && !row.expiryTouched && row.expiryDate ? (
              <View className="rounded-full bg-slate-100 px-2 py-0.5">
                <Text className="text-[10px] font-medium text-slate-500">auto-filled</Text>
              </View>
            ) : null}
          </View>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => {
                expirySection.trigger();
                setPickingExpiry(true);
              }}
              className="flex-1 flex-row items-center rounded-xl border border-slate-200 bg-white px-3 active:bg-slate-50"
              style={{ height: 44 }}
            >
              <Ionicons name="calendar-outline" size={17} color="#64748B" />
              <Text className={`ml-2 flex-1 text-sm ${row.expiryDate ? "text-slate-950" : "text-slate-400"}`}>
                {formatDateDisplay(row.expiryDate) ?? "Pick a date"}
              </Text>
              <Ionicons name="chevron-down" size={14} color="#64748B" />
            </Pressable>
            <Pressable
              className="flex-row items-center rounded-xl bg-blue-50 px-3 active:bg-blue-100"
              style={{ height: 44 }}
              onPress={() => setShowDurationPicker((current) => !current)}
            >
              <Ionicons name="time-outline" size={16} color="#1D4ED8" />
              <Text className="ml-1.5 text-xs font-semibold text-blue-700">
                {showDurationPicker ? "Hide" : "Use duration"}
              </Text>
            </Pressable>
          </View>

          {showDurationPicker && (
            <View className="mt-2">
              <DurationExpiryInput
                purchaseDate={purchaseDate}
                initialAmount={row.expirySuggestion ? String(row.expirySuggestion.amount) : undefined}
                initialUnit={row.expirySuggestion?.unit}
                onApply={(value) => updateRow(row.key, { expiryDate: value, expiryTouched: true })}
              />
            </View>
          )}
        </View>

        {/* Available for a matched ingredient too, not just a brand-new one —
            a receipt is often the first time an ingredient's real conversion
            (e.g. "1 box = 340g") turns up, and editing it here saves straight
            back to that ingredient's own catalog record on Confirm (see
            handleConfirm) rather than being a one-off, thrown away after this
            review the way it used to be. */}
        <View className="mt-5 border-t border-slate-100 pt-4">
          <View className="mb-2 flex-row items-center">
            <Ionicons name="scale-outline" size={17} color="#2563EB" />
            <Text className="ml-2 text-[13px] font-semibold text-slate-700">Unit conversions</Text>
            <Text className="ml-1.5 text-[11px] text-slate-400">{row.unit || "unit"} ↔ other units</Text>
          </View>
          <UnitConversionsEditor
            compact
            conversions={row.unitConversions}
            unitOptions={unitOptions}
            onChange={(conversions) => updateRow(row.key, { unitConversions: conversions })}
          />
        </View>

        {row.error && <Text className="mt-2 text-xs text-red-600">{row.error}</Text>}
      </ScrollView>

      <DatePickerModal
        visible={pickingExpiry}
        title="Expiry date"
        value={row.expiryDate}
        onCancel={() => setPickingExpiry(false)}
        onConfirm={(value) => {
          setPickingExpiry(false);
          updateRow(row.key, { expiryDate: value, expiryTouched: true });
        }}
      />
    </View>
  );
}

// One item in the bottom list — tapping it jumps the card pager to it.
function ReceiptRowSummary({
  row,
  categoryName,
  isFocused,
  hasPendingGroceryItems,
  onPress,
  onToggleChecked,
}: {
  row: ReviewRow;
  categoryName: string;
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
      className={`mb-2 flex-row items-center rounded-2xl border px-3 py-2.5 ${
        row.error ? "border-red-300 bg-white" : isFocused ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"
      } ${row.submitted ? "opacity-50" : ""}`}
    >
      <Pressable
        disabled={row.submitted}
        hitSlop={8}
        className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
          row.submitted
            ? "border-emerald-500 bg-emerald-500"
            : row.checked
              ? "border-blue-600 bg-blue-600"
              : "border-slate-300 bg-white"
        }`}
        onPress={onToggleChecked}
      >
        {(row.checked || row.submitted) && <Ionicons name="checkmark" size={16} color="white" />}
      </Pressable>

      <View className="ml-3 h-11 w-11 items-center justify-center rounded-xl bg-slate-100">
        <Text className="text-2xl">{categoryEmoji(categoryName)}</Text>
      </View>

      <View className="ml-3 flex-1">
        <Text className="text-[15px] font-semibold text-slate-900" numberOfLines={1}>
          {row.name || "Unnamed item"}
        </Text>
        <Text className="mt-0.5 text-xs text-slate-500">
          {row.quantity} {row.unit}
          {row.price ? `  ·  $${row.price}` : ""}
        </Text>
        {!isRowComplete && (
          <Text className="mt-0.5 text-[11px] font-medium text-amber-600" numberOfLines={1}>
            Missing: {missingFields.join(", ")}
          </Text>
        )}
      </View>

      <View className="ml-2">
        <StatusBadge row={row} isNew={isNew} incomplete={!isRowComplete} />
      </View>
      <Ionicons name="chevron-forward" size={16} color="#CBD5E1" style={{ marginLeft: 6 }} />
    </Pressable>
  );
}

export default function ReceiptReviewPage() {
  const router = useRouter();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const pagerRef = useRef<FlatList<ReviewRow>>(null);

  // The item-list panel's draggable height (see the gesture + JSX further
  // down) — declared here, unconditionally, alongside the other hooks and
  // before any of this component's early returns (loading/error states
  // below), since these are genuine Reanimated hooks and must run on every
  // render regardless of which branch the rest of the component takes.
  const listHeight = useSharedValue(COLLAPSED_LIST_HEIGHT);
  const dragStartHeight = useSharedValue(COLLAPSED_LIST_HEIGHT);
  const listPanelStyle = useAnimatedStyle(() => ({ height: listHeight.value }));

  // Captured exactly once (lazy initializer, not re-run on re-render) —
  // takePendingReceipt() has read-and-clear semantics, so calling it again
  // inside the retry-able load effect below would find nothing on a second
  // attempt and silently fall through to the dev-fixture fallback instead of
  // actually retrying the real pending scan.
  const [capturedPending] = useState<ReceiptParseResult | null>(() => takePendingReceipt());

  const [receipt, setReceipt] = useState<ReceiptParseResult | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [barcodeScanRowKey, setBarcodeScanRowKey] = useState<string | null>(null);
  const [labelScanRowKey, setLabelScanRowKey] = useState<string | null>(null);
  const [readingLabelRowKey, setReadingLabelRowKey] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [pickingPurchaseDate, setPickingPurchaseDate] = useState(false);

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
              : proposal?.estimatedNutrition ?? unknownNutrition();

            // Gemini reports the real net weight/volume of ONE unit of this
            // product separately from the printed count (e.g. "1 item" that's
            // really "500 g") - prefer logging that when it found one, scaled
            // by however many of that product were printed (2 boxes @ 500g
            // each = 1000g total), since a mass/volume unit is far more
            // useful to have on file than a bare discrete count.
            const resultingUnit = lineItem.packageQuantity != null
              ? lineItem.packageUnit ?? lineItem.unit
              : lineItem.unit;
            const resultingQuantity = lineItem.packageQuantity != null
              ? lineItem.quantity * lineItem.packageQuantity
              : lineItem.quantity;

            const portionAmount = convertPortionAmount(
              matched?.defaultPortionAmount ?? proposal?.defaultPortionAmount ?? 1,
              matched?.defaultPortionUnit ?? proposal?.defaultPortionUnit ?? "item",
              resultingUnit,
              matched ? getIngredientConversions(matched, [], ingredientList) : [],
            );

            return {
              key: `${index}-${lineItem.rawText}`,
              lineItem,
              checked: lineItem.confidence !== "low",
              matchedIngredientId: matched?._id ?? null,
              matchedGroceryItemId: groceryMatch,
              name: matched?.name ?? proposal?.name ?? lineItem.rawText,
              quantity: String(resultingQuantity),
              unit: resultingUnit,
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
              defaultPortionAmount: String(portionAmount),
              unitConversions: matched?.unitConversions ?? [],
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
          const draftRows = (draft.rows as Partial<ReviewRow>[]).map(normalizeDraftRow);
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

  // Rows can hold names that were typed in full but never picked (or came
  // from a saved draft) — link them to their exact-match options once the
  // option lists are loaded, so they don't show as missing.
  useEffect(() => {
    const generics = ingredients.filter((ingredient) => ingredient.isGeneric);
    setRows((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        const linked = linkTypedOptions(row, storageLocations, categories, brands, generics);
        if (linked !== row) changed = true;
        return linked;
      });
      return changed ? next : prev;
    });
  }, [storageLocations, categories, brands, ingredients]);

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
    const row = rows.find((r) => r.key === rowKey);
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
      // Same one-unit-per-row rule as initial parsing - convert the
      // matched ingredient's own portion into the row's existing unit
      // when possible, otherwise fall back to 1 rather than pair a wrong
      // amount with the wrong unit.
      defaultPortionAmount: String(
        convertPortionAmount(
          ingredient.defaultPortionAmount ?? 1,
          ingredient.defaultPortionUnit ?? "item",
          row?.unit ?? "item",
          getIngredientConversions(ingredient, [], ingredients),
        ),
      ),
      unitConversions: ingredient.unitConversions ?? [],
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
            nutrition: unknownNutrition(),
            defaultPortionAmount: "1",
            unitConversions: [],
            expirySuggestion: null,
          }
        : {}),
    });
  }

  // A photographed Nutrition Facts / Supplement Facts panel -> this row's
  // nutrition (a supplement's unlisted nutrients become 0) and its serving,
  // expressed in the row's own unit — the same helpers the add-ingredient
  // page's "Scan label" uses. A serving that can't be put in the row's unit
  // is flagged rather than guessed.
  async function handleLabelPhoto(photoUri: string) {
    const rowKey = labelScanRowKey;
    setLabelScanRowKey(null);
    const row = rows.find((r) => r.key === rowKey);
    if (!rowKey || !row) return;

    setReadingLabelRowKey(rowKey);
    try {
      const scan = await parseNutritionLabel(photoUri);
      if (!scan.isNutritionLabel) {
        Alert.alert(
          "No label found",
          "Couldn't read a nutrition or supplement facts label in that photo. Try again with the whole panel in frame and in focus.",
        );
        return;
      }

      const serving = row.unit.trim() ? labelServing(scan, row.unit, row.unitConversions) : null;
      setRows((prev) =>
        prev.map((r) =>
          r.key === rowKey
            ? {
                ...r,
                nutrition: { ...r.nutrition, ...labelNutrition(scan) },
                defaultPortionAmount: serving ? String(serving.amount) : r.defaultPortionAmount,
              }
            : r,
        ),
      );

      const printedServing = [
        scan.servingAmount != null && scan.servingUnit ? `${scan.servingAmount} ${scan.servingUnit}` : null,
        scan.servingMetricAmount != null && scan.servingMetricUnit
          ? `${scan.servingMetricAmount} ${scan.servingMetricUnit}`
          : null,
      ].filter(Boolean).join(" / ");
      const lines = [
        `Filled ${countReadNutrients(scan)} nutrients` + (serving ? ` per ${serving.amount} ${serving.unit}.` : "."),
      ];
      if (!serving && printedServing) {
        lines.push(
          `The label's serving (${printedServing}) doesn't convert to ${row.unit || "this item's unit"} — set the serving size to match it, since the nutrition is per that serving.`,
        );
      }
      if (scan.labelType === "supplement_facts") lines.push("Anything not on the supplement label was set to 0.");
      if (scan.notes.trim()) lines.push(`Note: ${scan.notes.trim()}`);
      Alert.alert("Label read — check the values", lines.join("\n\n"));
    } catch (error) {
      Alert.alert("Couldn't read label", error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setReadingLabelRowKey(null);
    }
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
      // nutrition basis - but unlike a plain name match, a barcode scan
      // also carries the label's own real package size (product.
      // packageQuantity/packageUnit), which is far more reliable than
      // whatever Gemini's OCR guessed the printed quantity/unit to be.
      // Same one-unit-per-row rule as the new-product path below: prefer
      // the scanned package unit when the scan has one, and convert the
      // matched ingredient's own serving size into *that* resulting unit.
      const matchedResultingUnit = product.packageQuantity != null
        ? product.packageUnit ?? row.unit
        : row.unit;
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
        ...(product.packageQuantity != null
          ? { quantity: String(product.packageQuantity), unit: matchedResultingUnit }
          : {}),
        defaultPortionAmount: String(
          convertPortionAmount(
            existingMatch.defaultPortionAmount ?? 1,
            existingMatch.defaultPortionUnit ?? "item",
            matchedResultingUnit,
            getIngredientConversions(existingMatch, [], ingredients),
          ),
        ),
        unitConversions: existingMatch.unitConversions ?? [],
        error: undefined,
      });
      return;
    }

    // The barcode isn't in our own catalog, and the scan itself came up
    // empty too (not found in the lookup database, no name on file, or the
    // lookup failed outright — see BarcodeScannerModal, which reports all
    // three the same way: an empty name). There's nothing usable to apply in
    // that case, just a barcode worth remembering for next time — attach it
    // and stop, rather than overwriting whatever name/nutrition/etc. the
    // receipt's own AI parse already prefilled with a blank proposal.
    if (!product.name) {
      updateRow(rowKey, { barcode: product.barcode, error: undefined });
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
    // otherwise whatever's already in the row is left untouched. Same
    // one-unit-per-row rule applies - the resulting unit (package unit if
    // the scan has one, else whatever the row already had) is what the
    // serving size gets converted into.
    const resultingUnit = product.packageQuantity != null ? product.packageUnit ?? row.unit : row.unit;
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
        ? { quantity: String(product.packageQuantity), unit: resultingUnit }
        : {}),
      // Only a real declared serving is meaningful to convert/apply here —
      // an estimated 100g/100ml reference isn't a genuine per-use amount,
      // so leave the row's existing defaultPortionAmount untouched instead.
      ...(product.servingIsEstimated
        ? {}
        : { defaultPortionAmount: String(convertPortionAmount(product.servingSize, product.servingUnit, resultingUnit)) }),
      nutrition: product.nutrition ?? unknownNutrition(),
      unitConversions: [],
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
        packageQuantity: null,
        packageUnit: null,
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
      nutrition: unknownNutrition(),
      defaultPortionAmount: "1",
      unitConversions: [],
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
              defaultPortionAmount: Number(row.defaultPortionAmount) || 1,
              defaultPortionUnit: row.unit || "item",
              nutrition: toNutritionInput(row.nutrition),
              unitConversions: row.unitConversions,
            });
            ingredientId = newIngredient._id;
          } else {
            // A matched ingredient's unit-conversions editor above edits its
            // real catalog record, not a one-off proposal — only worth a
            // write when it's actually changed from what was already there,
            // so confirming a row nobody touched the editor on doesn't fire
            // an update for nothing.
            const matchedIngredient = ingredients.find((ing) => ing._id === ingredientId);
            const storedConversions = matchedIngredient?.unitConversions ?? [];
            if (JSON.stringify(row.unitConversions) !== JSON.stringify(storedConversions)) {
              await updateIngredient(ingredientId, { unitConversions: row.unitConversions });
              setIngredients((prev) =>
                prev.map((ing) =>
                  ing._id === ingredientId ? { ...ing, unitConversions: row.unitConversions } : ing,
                ),
              );
            }
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
    unitOptions: unitSuggestionsFrom(pantryItems),
    purchaseDate,
    updateRow,
    applyIngredientMatch,
    handleNameChange,
    onScanBarcode: setBarcodeScanRowKey,
    onScanLabel: setLabelScanRowKey,
    readingLabelRowKey,
    onDeleteRow: handleDeleteRow,
    onOpenGroceryLink: setGroceryLinkRowKey,
  };

  const incompleteCount = rows.filter(
    (r) => !r.submitted && getMissingFields(r, pendingGroceryItems.length > 0).length > 0,
  ).length;

  const allSelectableChecked =
    rows.filter((r) => !r.submitted).length > 0 && rows.filter((r) => !r.submitted).every((r) => r.checked);

  // Card width leaves CARD_PEEK px of the neighboring card visible on each
  // side (with CARD_GAP of empty space between cards) — a visual hint that
  // this section scrolls horizontally, not just an isolated single card.
  const cardWidth = windowWidth - 2 * (CARD_GAP + CARD_PEEK);
  const cardStride = cardWidth + CARD_GAP;
  const cardSidePadding = CARD_GAP + CARD_PEEK;

  // The list panel's draggable height — starts collapsed (one row visible,
  // still scrollable within that), drag the handle up to expand it toward
  // covering most of the screen (leaving just the top nav/store/date
  // visible), overlaying the card carousel underneath. Free-form while
  // dragging, snaps to whichever end is closer on release.
  const expandedListHeight = Math.round(windowHeight * 0.78);
  const listPanGesture = Gesture.Pan()
    .onStart(() => {
      dragStartHeight.value = listHeight.value;
    })
    .onUpdate((event) => {
      const next = dragStartHeight.value - event.translationY;
      listHeight.value = Math.min(expandedListHeight, Math.max(COLLAPSED_LIST_HEIGHT, next));
    })
    .onEnd(() => {
      const midpoint = (COLLAPSED_LIST_HEIGHT + expandedListHeight) / 2;
      listHeight.value = withSpring(
        listHeight.value > midpoint ? expandedListHeight : COLLAPSED_LIST_HEIGHT,
        { damping: 20, stiffness: 200 },
      );
    });

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
            accessibilityLabel="Discard receipt"
            className="mr-2 h-10 w-10 items-center justify-center rounded-xl bg-slate-100 active:bg-slate-200"
            onPress={handleDiscardReceipt}
          >
            <Ionicons name="trash-outline" size={19} color="#475569" />
          </Pressable>
          <Pressable
            disabled={submitting}
            className={`h-10 justify-center rounded-xl px-4 ${submitting ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}
            onPress={() => void handleConfirm()}
          >
            <Text className="font-semibold text-white">{submitting ? "Adding..." : "Confirm"}</Text>
          </Pressable>
        </View>

        {/* Raised above the card pager below, so the store's options list
            draws over it. */}
        <View className="flex-row gap-2 px-4 pt-3" style={{ zIndex: 10 }}>
          <View className="flex-1 flex-row items-center rounded-2xl border border-slate-200 bg-white px-3 py-2">
            <View className="h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
              <Ionicons name="cart-outline" size={18} color="#475569" />
            </View>
            <View className="ml-2.5 flex-1">
              <Text className="text-[11px] font-medium text-slate-500">Store</Text>
              <SearchableObjectDropdown<SelectOption>
                bare
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
          </View>

          <Pressable
            onPress={() => setPickingPurchaseDate(true)}
            className="flex-1 flex-row items-center rounded-2xl border border-slate-200 bg-white px-3 py-2 active:bg-slate-50"
          >
            <View className="h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
              <Ionicons name="calendar-outline" size={18} color="#475569" />
            </View>
            <View className="ml-2.5 flex-1">
              <Text className="text-[11px] font-medium text-slate-500">Purchase date</Text>
              <Text className="text-base text-slate-950" style={{ lineHeight: 26 }} numberOfLines={1}>
                {formatDateDisplay(purchaseDate) ?? "Pick a date"}
              </Text>
            </View>
          </Pressable>
        </View>

        <View className="flex-1">
        {rows.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-center text-slate-500">
              No items left on this receipt — add one below, or discard the receipt.
            </Text>
          </View>
        ) : (
          <View className="flex-1 mt-3">
            <View className="mb-2 flex-row items-center justify-between px-4">
              <Pressable
                disabled={focusedIndex === 0}
                accessibilityLabel="Previous item"
                onPress={() => goToIndex(focusedIndex - 1)}
                className="h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white active:bg-slate-100"
                style={{ opacity: focusedIndex === 0 ? 0.35 : 1 }}
              >
                <Ionicons name="chevron-back" size={16} color="#334155" />
              </Pressable>
              <Text className="text-xs font-medium text-slate-500">
                Item {focusedIndex + 1} of {rows.length} · swipe for next
              </Text>
              <Pressable
                disabled={focusedIndex >= rows.length - 1}
                accessibilityLabel="Next item"
                onPress={() => goToIndex(focusedIndex + 1)}
                className="h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white active:bg-slate-100"
                style={{ opacity: focusedIndex >= rows.length - 1 ? 0.35 : 1 }}
              >
                <Ionicons name="chevron-forward" size={16} color="#334155" />
              </Pressable>
            </View>
            <FlatList<ReviewRow>
              ref={pagerRef}
              data={rows}
              keyExtractor={(row) => row.key}
              horizontal
              // A tap while the keyboard is up must reach the card (e.g. an
              // open dropdown's option) — the default ("never") makes the
              // pager take that tap just to dismiss the keyboard.
              keyboardShouldPersistTaps="handled"
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
                  <ReceiptRowDetail row={row} callbacks={rowCallbacks} />
                </View>
              )}
            />
          </View>
        )}
        </View>
      </KeyboardAvoidingView>

      <Animated.View
          style={listPanelStyle}
          className="absolute bottom-0 left-0 right-0 overflow-hidden rounded-t-3xl border border-slate-200 bg-white"
        >
          <GestureDetector gesture={listPanGesture}>
            <View className="items-center justify-center" style={{ height: LIST_HANDLE_AREA_HEIGHT }}>
              <View className="h-1.5 w-10 rounded-full bg-slate-300" />
            </View>
          </GestureDetector>

          <View className="flex-row items-center justify-between px-4 pb-2">
            <Text className="flex-1 text-sm text-slate-500" numberOfLines={1}>
              <Text className="font-bold text-slate-900">
                {rows.length} item{rows.length === 1 ? "" : "s"}
              </Text>
              {" · "}
              {rows.filter((r) => r.checked && !r.submitted).length} selected
              {rows.some((r) => r.submitted) ? ` · ${rows.filter((r) => r.submitted).length} added` : ""}
              {incompleteCount > 0 ? ` · ${incompleteCount} incomplete` : ""}
            </Text>
            <Pressable
              onPress={() => {
                setRows((prev) =>
                  prev.map((r) => (r.submitted ? r : { ...r, checked: !allSelectableChecked })),
                );
              }}
            >
              <Text className="text-sm font-semibold text-blue-600">
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
                categoryName={
                  row.matchedIngredientId
                    ? referenceName(ingredients.find((ing) => ing._id === row.matchedIngredientId)?.category)
                    : row.categoryName
                }
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
      </Animated.View>

      <DatePickerModal
        visible={pickingPurchaseDate}
        title="Purchase date"
        value={purchaseDate}
        onCancel={() => setPickingPurchaseDate(false)}
        onConfirm={(value) => {
          setPickingPurchaseDate(false);
          setPurchaseDate(value);
        }}
      />

      <BarcodeScannerModal
        visible={!!barcodeScanRowKey}
        onClose={() => setBarcodeScanRowKey(null)}
        onProductFound={handleBarcodeScanned}
      />

      <PhotoCaptureModal
        visible={!!labelScanRowKey}
        onClose={() => setLabelScanRowKey(null)}
        onCaptured={(photoUri) => void handleLabelPhoto(photoUri)}
        subject="nutrition label"
        instructions="Fit the whole Nutrition Facts or Supplement Facts panel in frame, flat and in focus."
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
