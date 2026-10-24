import { Ionicons } from "@expo/vector-icons";
import { usePaneDimensions } from "@/src/utils/pane";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { photoUri as photoSource } from "@/src/utils/photos";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { BarcodeScannerModal, lookupBarcode, type ScannedProduct } from "@/src/components/BarcodeScannerModal";
import { NoPhoneYet } from "@/src/components/devices/NoPhoneYet";
import { WebcamModal } from "@/src/components/web/WebcamModal";
import { hasPhone, requestCapture, watchCapture } from "@/src/services/deviceApi";
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
  getIngredientById,
  saveIngredient,
  searchIngredients,
  createIngredient,
  parseNutritionLabel,
  parseNutritionLabelImage,
  updateIngredient,
  type Ingredient,
  type IngredientNutrition,
  type NutritionLabelScan,
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
  finishReceiptDraft,
  getLastParsedReceipt,
  getReceiptDraft,
  saveReceiptDraftReview,
  type ReceiptLineItem,
  type ReceiptNutrition,
  type ReceiptParseResult,
} from "@/src/services/receiptApi";
import type { SelectOption } from "@/src/types/options";
import type { PantryItem } from "@/src/types/pantry";
import { findIngredientByBarcode, inMyIngredients, libraryTagColors, useIngredientLibrarySearch } from "@/src/components/ingredients/foodLibrary";
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
import { useWideForm } from "@/src/components/forms/wideForm";
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
import { nutrientColor, type MainNutrient } from "@/src/theme/nutrients";
import { OrbitPage, OrbitSection, SECTION_PALETTE, useOrbitPage, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import { Tap } from "@/src/components/ui/Tap";

// Something to tap. Elsewhere as before: its classes, and their active:
// look while held. On an Orbit page (the phone) it also takes `orbit`, its
// colours there, and `held`, how it looks while held (a light fade if
// none) — an inline colour beats the active: class, and Pressable's style
// function is dropped on the phone (see Tap).
function Press({
  orbit,
  held,
  style,
  ...props
}: Omit<PressableProps, "style" | "children"> & { style?: StyleProp<ViewStyle>; children?: ReactNode; orbit?: StyleProp<ViewStyle> | null | false; held?: StyleProp<ViewStyle> }) {
  if (!orbit) return <Pressable {...props} style={style} />;
  return <Tap {...props} style={[style, orbit]} pressedStyle={held} />;
}

// The tints the page's meaningful colours take on an Orbit page: the
// light ones as the classes have them, soft ones in the dark.
function orbitTones(o: OrbitColors, dark: boolean) {
  return {
    // Something missing, or to check.
    warnBg: dark ? "rgba(251, 191, 36, 0.14)" : "#FFFBEB",
    warnText: dark ? "#FCD34D" : "#92400E",
    warnIcon: dark ? o.warning : "#D97706",
    // A destructive button.
    dangerBg: dark ? "rgba(248, 113, 113, 0.14)" : "#FEF2F2",
    // The selected thing, in the section's colour.
    inkSoft: dark ? "rgba(251, 146, 60, 0.14)" : "#FFF7ED",
    // An empty checkbox.
    boxOff: dark ? o.faint : "#CBD5E1",
  };
}

// What the parse says of a line and the food library (receiptApi's types
// don't name it yet): the line matched to a library food by the server
// (`matchedFrom`), or, unmatched, up to three library foods it suggests.
interface LibrarySuggestion {
  _id: string;
  name: string;
  sourceName?: string | null;
}
type ParsedLine = ReceiptLineItem & { matchedFrom?: "library" | null; librarySuggestions?: LibrarySuggestion[] };

interface ReviewRow {
  key: string;
  lineItem: ReceiptLineItem;
  // The library food the server matched this line to — tagged "Library"
  // while it's still the match — and, while unmatched, the library foods it
  // suggests (chips under the name; gone once one's picked).
  libraryMatchId: string | null;
  librarySuggestions: LibrarySuggestion[];
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
  // A matched ingredient's own serving unit: its catalog serving and
  // nutrition are shown as they are ("100 g"), never restated in what was
  // bought ("1 item"), so editing how much was bought can't change them.
  // Unset for a new ingredient, whose serving is in `unit` as above.
  portionUnit?: string;

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

// A scanned product's serving, for a new line: what its nutrition is per
// (its declared serving, or 100 g when it has none), in the unit bought if
// that converts, or else as it is.
function servingFromProduct(product: ScannedProduct, unitBought: string): Pick<ReviewRow, "defaultPortionAmount" | "portionUnit"> {
  const amount = product.servingIsEstimated ? 100 : product.servingSize;
  const unit = (product.servingIsEstimated ? product.servingUnit || "g" : product.servingUnit) || unitBought;
  const inUnitBought = convertUnits(amount, unit, unitBought, []);
  return inUnitBought != null
    ? { defaultPortionAmount: String(Math.round(inUnitBought * 1000) / 1000), portionUnit: undefined }
    : { defaultPortionAmount: String(amount), portionUnit: unit };
}

// The list with what the lines point at that it doesn't hold — a food
// library one not in one's own list, or one added since the list was
// cached — fetched by id, and a proposed generic parent looked up by name
// in the library: so a line keeps its match (and its parent) rather than
// becoming a proposal that confirming would make a duplicate of. Whatever
// can't be found is left out.
async function withMissingIngredients(
  list: Ingredient[],
  ids: (string | null | undefined)[],
  genericNames: (string | null | undefined)[],
): Promise<Ingredient[]> {
  const known = new Set(list.map((ing) => ing._id));
  const missingIds = [...new Set(ids.filter((id): id is string => !!id && !known.has(id)))];
  const lower = (name: string) => name.trim().toLowerCase();
  const missingNames = [...new Set(genericNames.map((name) => lower(name ?? "")))].filter(
    (name) => name && !list.some((ing) => ing.isGeneric && lower(ing.name) === name),
  );
  if (!missingIds.length && !missingNames.length) return list;

  const [byId, byName] = await Promise.all([
    Promise.all(missingIds.map((id) => getIngredientById(id).catch(() => null))),
    Promise.all(
      missingNames.map((name) =>
        searchIngredients(name)
          .then((found) => found.find((ing) => ing.isGeneric && lower(ing.name) === name) ?? null)
          .catch(() => null),
      ),
    ),
  ]);
  const added = new Map<string, Ingredient>();
  for (const ing of [...byId, ...byName]) if (ing && !known.has(ing._id)) added.set(ing._id, ing);
  return added.size ? [...list, ...added.values()] : list;
}

// A matched, not-yet-added line with its ingredient's serving and nutrition
// from the catalog (see ReviewRow.portionUnit).
function withCatalogServing(row: ReviewRow, ingredients: Ingredient[]): ReviewRow {
  if (!row.matchedIngredientId || row.submitted) return row;
  const ingredient = ingredients.find((ing) => ing._id === row.matchedIngredientId);
  if (!ingredient) return row;
  // Its conversions as the catalog has them now, plus any added in this
  // review — Confirm saves this list to the ingredient, so a stale one
  // would undo the catalog's.
  const key = (c: { unit: string; baseUnit: string }) => `${c.unit.trim().toLowerCase()}|${c.baseUnit.trim().toLowerCase()}`;
  const catalog = ingredient.unitConversions ?? [];
  const added = (row.unitConversions ?? []).filter((c) => !catalog.some((k) => key(k) === key(c)));
  return {
    ...row,
    nutrition: toReceiptNutrition(ingredient.nutrition),
    defaultPortionAmount: String(ingredient.defaultPortionAmount ?? 1),
    portionUnit: ingredient.defaultPortionUnit ?? "item",
    unitConversions: [...catalog, ...added],
  };
}

// How much of a matched ingredient was bought, in its usual unit — the
// one it was last bought in (or its own unit, if never). For every
// ingredient alike:
//   - A bare count on the receipt ("1 item", "2 ea") is a number of packs
//     when the ingredient knows its pack size (a "pack" conversion): 1 pack
//     of fish cakes is 4 pieces. Without one, the count is put in the usual
//     unit as it is, if that's a count too (3 lemons), to be corrected —
//     the line shows what the receipt said. Against a weight or volume it's
//     left as the receipt has it: there's no telling how much it was.
//   - A real weight or volume ("1.2 lb") is converted when it can be.
// "item" itself is never treated as a conversion: it means a lemon on one
// receipt and a pack on the next.
// ("ct" and "pcs" aren't among them: "EGGS 12 CT" is 12 eggs, not 12 packs.)
const BARE_COUNTS = new Set(["", "item", "items", "each", "ea", "unit", "units", "pack", "packs", "pkg", "package", "packages"]);
const PACK_NAMES = ["pack", "package", "pkg"];
const isMeasure = (unit: string) => convertUnits(1, unit, "g", []) != null || convertUnits(1, unit, "ml", []) != null;
function boughtLikeLastTime(
  quantity: number,
  unit: string,
  usualUnit: string | null | undefined,
  conversions: CustomUnitConversion[],
): { quantity: number; unit: string } {
  const round = (n: number) => Math.round(n * 1000) / 1000;
  if (!usualUnit || usualUnit.trim().toLowerCase() === unit.trim().toLowerCase()) return { quantity, unit };
  if (BARE_COUNTS.has(unit.trim().toLowerCase())) {
    for (const pack of PACK_NAMES) {
      const inUsual = convertUnits(quantity, pack, usualUnit, conversions);
      if (inUsual != null) return { quantity: round(inUsual), unit: usualUnit };
    }
    return isMeasure(usualUnit) ? { quantity, unit } : { quantity, unit: usualUnit };
  }
  const converted = convertUnits(quantity, unit, usualUnit, conversions);
  return converted != null ? { quantity: round(converted), unit: usualUnit } : { quantity, unit };
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
    // (A draft from before these: what its line says.)
    libraryMatchId:
      row.libraryMatchId !== undefined
        ? row.libraryMatchId
        : (row.lineItem as ParsedLine | undefined)?.matchedFrom === "library"
          ? (row.lineItem?.matchedIngredientId ?? null)
          : null,
    librarySuggestions: Array.isArray(row.librarySuggestions)
      ? row.librarySuggestions
      : ((row.lineItem as ParsedLine | undefined)?.librarySuggestions ?? []),
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
    portionUnit: row.portionUnit ? text(row.portionUnit) : undefined,
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
  field: MainNutrient;
  label: string;
  unit: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}[] = [
  { field: "calories", label: "Calories", unit: "kcal", icon: "flame", color: nutrientColor("calories") },
  { field: "protein", label: "Protein", unit: "g", icon: "barbell", color: nutrientColor("protein") },
  { field: "carbs", label: "Carbs", unit: "g", icon: "leaf", color: nutrientColor("carbs") },
  { field: "fats", label: "Fat", unit: "g", icon: "water", color: nutrientColor("fats") },
  { field: "fiber", label: "Fiber", unit: "g", icon: "nutrition", color: nutrientColor("fiber") },
  { field: "sodium", label: "Sodium", unit: "mg", icon: "flask", color: nutrientColor("sodium") },
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
  // (On the phone, in Orbit's colours.)
  const o = useOrbitPage();

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
      style={o && { borderColor: o.border, backgroundColor: editable ? o.surface : o.pill }}
    >
      <View className="flex-row items-center">
        {icon && <Ionicons name={icon} size={11} color={editable ? iconColor : o?.faint ?? "#94A3B8"} />}
        <Text numberOfLines={1} className={`flex-1 text-[11px] text-slate-500 ${icon ? "ml-1" : ""}`} style={o && { color: o.muted }}>
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
          placeholderTextColor={o?.faint ?? "#CBD5E1"}
          className={`flex-1 py-0.5 text-[15px] font-medium ${editable ? "text-slate-950" : "text-slate-500"}`}
          // (In a browser an input keeps a default width; let it shrink so
          // the unit stays inside the box.)
          style={[{ minWidth: 0 }, o && { color: editable ? o.text : o.muted }]}
        />
        <Text className="ml-1 text-[11px] text-slate-400" style={[{ flexShrink: 0 }, o && { color: o.faint }]}>{unit}</Text>
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
  // (On the phone in the dark: the same colours, as soft tints.)
  const o = useOrbitPage();
  const { dark } = useOrbitTheme();
  const darkTone = !o || !dark
    ? null
    : row.submitted
      ? { bg: o.pill, color: o.muted }
      : incomplete
        ? { bg: "rgba(251, 191, 36, 0.14)", color: "#FBBF24" }
        : isNew
          ? { bg: "rgba(167, 139, 250, 0.14)", color: "#A78BFA" }
          : { bg: "rgba(52, 211, 153, 0.14)", color: "#34D399" };

  return (
    <View className={`flex-row items-center rounded-full px-2 py-1 ${tone.bg}`} style={darkTone && { backgroundColor: darkTone.bg }}>
      <Ionicons name={tone.icon} size={12} color={darkTone?.color ?? tone.color} />
      <Text className={`ml-1 text-xs font-semibold ${tone.text}`} style={darkTone && { color: darkTone.color }}>{tone.label}</Text>
    </View>
  );
}

// Matched by the server to a food library food, and still matched to it
// (the tag goes once the person changes the match).
const isLibraryMatch = (row: ReviewRow) => !!row.libraryMatchId && row.matchedIngredientId === row.libraryMatchId;

// The small green "Library" tag beside a line the server matched to the
// food library.
function LibraryTag() {
  const { dark } = useOrbitTheme();
  const tone = libraryTagColors(dark);
  return (
    <View style={{ borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: tone.backgroundColor }}>
      <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.4, color: tone.color }}>LIBRARY</Text>
    </View>
  );
}

function CardLabel({ children, first = false }: { children: string; first?: boolean }) {
  const o = useOrbitPage();
  return (
    <Text className={`mb-1.5 text-[13px] font-semibold text-slate-700 ${first ? "mt-3" : "mt-4"}`} style={o && { color: o.icon }}>{children}</Text>
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
  // A food from the library (one the list doesn't hold), picked for a line;
  // and one of the parse's suggestions for it, tapped.
  pickLibraryFood: (rowKey: string, food: Ingredient) => void;
  pickLibrarySuggestion: (rowKey: string, suggestion: LibrarySuggestion) => Promise<void>;
  handleNameChange: (rowKey: string, value: string) => void;
  onScanBarcode: (rowKey: string) => void;
  // Photograph this row's nutrition label to fill its nutrition + serving.
  onScanLabel: (rowKey: string) => void;
  // The row whose label photo is being read right now, if any.
  readingLabelRowKey: string | null;
  onDeleteRow: (rowKey: string, rowName: string) => void;
  onOpenGroceryLink: (rowKey: string) => void;
}

// Under a new line's name field, once something's typed: what the food
// library (and the rest of the shared catalog) has by that name that this
// page's list doesn't — the dropdown above knows only the list. Picking one
// matches the line to it (see pickLibraryFood).
function LibraryMatches({ query, known, onPick }: { query: string; known: Ingredient[]; onPick: (food: Ingredient) => void }) {
  const o = useOrbitPage();
  const { results } = useIngredientLibrarySearch(query);
  const knownIds = useMemo(() => new Set(known.map((ing) => ing._id)), [known]);
  const foods = (results ?? []).filter((food) => !knownIds.has(food._id)).slice(0, 4);
  if (!foods.length) return null;

  return (
    <View
      className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white"
      style={o && { borderRadius: 14, backgroundColor: o.surface, borderColor: o.border }}
    >
      <Text
        className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-400"
        style={o && { color: o.faint }}
      >
        From the food library
      </Text>
      {foods.map((food) => (
        <Press
          key={food._id}
          onPress={() => onPick(food)}
          className="flex-row items-center border-t border-slate-100 px-3 py-2 active:bg-slate-50"
          orbit={o && { borderTopColor: o.border }}
          held={o && { backgroundColor: o.pill }}
        >
          <View className="flex-1">
            <Text className="text-sm font-medium text-slate-900" numberOfLines={1} style={o && { color: o.text }}>
              {food.name}
            </Text>
            <Text className="mt-0.5 text-xs text-slate-500" numberOfLines={1} style={o && { color: o.muted }}>
              {food.isGeneric ? "Generic" : referenceName(food.brand) || "Specific"}
              {referenceName(food.category) ? ` · ${referenceName(food.category)}` : ""}
            </Text>
          </View>
          <Ionicons name="add-circle-outline" size={20} color={o?.ink ?? "#2563EB"} />
        </Press>
      ))}
    </View>
  );
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
    pickLibraryFood,
    pickLibrarySuggestion,
    handleNameChange,
    onScanBarcode,
    onScanLabel,
    readingLabelRowKey,
    onDeleteRow,
    onOpenGroceryLink,
  } = callbacks;
  // What's been typed in the name field, for the food library's matches
  // under it (cleared once something's picked).
  const [libraryQuery, setLibraryQuery] = useState("");
  // The library suggestion being fetched to match, if any.
  const [pickingSuggestion, setPickingSuggestion] = useState<string | null>(null);

  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [showMoreNutrients, setShowMoreNutrients] = useState(false);
  const [pickingExpiry, setPickingExpiry] = useState(false);
  const layout = useWideForm();
  // On the phone, in Orbit's look (`o`: its colours, null in a desktop
  // browser, which keeps its own).
  const o = useOrbitPage();
  const { dark } = useOrbitTheme();
  const tones = o && orbitTones(o, dark);
  const field = o && { backgroundColor: o.surface, borderColor: o.border, color: o.text };
  // A small secondary button (Use duration, Scan label, More nutrients).
  const softButton = o && { backgroundColor: o.pill };

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
  // (For a matched one, what's been entered here too, so the total shows
  // as soon as a conversion's added — it's saved to the ingredient on
  // Confirm.)
  const customConversions = matchedIngredient
    ? [...row.unitConversions, ...getIngredientConversions(matchedIngredient, [], ingredients)]
    : row.unitConversions;
  // The unit the serving and nutrition are in: the catalog's for a matched
  // ingredient, the unit bought for a new one (see ReviewRow.portionUnit).
  const servingUnit = row.portionUnit ?? row.unit;

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

  // (Expiry: under the nutrition on a phone; in the left column, beside it,
  // in a desktop browser. Unit conversions follow the nutrition either way.)
  const expiryBlock = (
      <View {...expirySection.wrapperProps}>
        <View className="mb-1.5 mt-4 flex-row items-center">
          <Text className="flex-1 text-[13px] font-semibold text-slate-700" style={o && { color: o.icon }}>Expiry date</Text>
          {row.expirySuggestion && !row.expiryTouched && row.expiryDate ? (
            <View className="rounded-full bg-slate-100 px-2 py-0.5" style={o && { backgroundColor: o.pill }}>
              <Text className="text-[10px] font-medium text-slate-500" style={o && { color: o.muted }}>auto-filled</Text>
            </View>
          ) : null}
        </View>
        <View className="flex-row gap-2">
          <Press
            onPress={() => {
              expirySection.trigger();
              setPickingExpiry(true);
            }}
            className="flex-1 flex-row items-center rounded-xl border border-slate-200 bg-white px-3 active:bg-slate-50"
            style={{ height: 44 }}
            orbit={o && { backgroundColor: o.surface, borderColor: o.border }}
            held={o && { backgroundColor: o.pill }}
          >
            <Ionicons name="calendar-outline" size={17} color={o?.muted ?? "#64748B"} />
            <Text className={`ml-2 flex-1 text-sm ${row.expiryDate ? "text-slate-950" : "text-slate-400"}`} style={o && { color: row.expiryDate ? o.text : o.faint }}>
              {formatDateDisplay(row.expiryDate) ?? "Pick a date"}
            </Text>
            <Ionicons name="chevron-down" size={14} color={o?.muted ?? "#64748B"} />
          </Press>
          <Press
            className="flex-row items-center rounded-xl bg-blue-50 px-3 active:bg-blue-100"
            style={{ height: 44 }}
            orbit={softButton}
            onPress={() => setShowDurationPicker((current) => !current)}
          >
            <Ionicons name="time-outline" size={16} color={o?.onPill ?? "#1D4ED8"} />
            <Text className="ml-1.5 text-xs font-semibold text-blue-700" style={o && { color: o.onPill }}>
              {showDurationPicker ? "Hide" : "Use duration"}
            </Text>
          </Press>
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
  );
  const conversionsBlock = (
    <>
        {/* Available for a matched ingredient too, not just a brand-new one —
            a receipt is often the first time an ingredient's real conversion
            (e.g. "1 box = 340g") turns up, and editing it here saves straight
            back to that ingredient's own catalog record on Confirm (see
            handleConfirm) rather than being a one-off, thrown away after this
            review the way it used to be. */}
        <View className="mt-5 border-t border-slate-100 pt-4" style={o && { borderTopColor: o.border }}>
          <View className="mb-2 flex-row items-center">
            <Ionicons name="scale-outline" size={17} color={o?.ink ?? "#2563EB"} />
            <Text className="ml-2 text-[13px] font-semibold text-slate-700" style={o && { color: o.icon }}>Unit conversions</Text>
            <Text className="ml-1.5 text-[11px] text-slate-400" style={o && { color: o.faint }}>{row.unit || "unit"} ↔ other units</Text>
          </View>
          <UnitConversionsEditor
            compact
            conversions={row.unitConversions}
            unitOptions={unitOptions}
            onChange={(conversions) => updateRow(row.key, { unitConversions: conversions })}
          />
        </View>
    </>
  );

  return (
    <View
      className={`flex-1 overflow-hidden rounded-3xl border bg-white ${row.error ? "border-red-300" : "border-slate-200"} ${row.submitted ? "opacity-50" : ""}`}
      style={o && { borderRadius: 20, backgroundColor: o.surface, borderColor: row.error ? o.danger : o.border }}
    >
      {/* Pinned header — the receipt line and the name stay visible no
          matter how far the body below is scrolled, so it's always clear
          which item this card is. Kept to two rows so the body gets the
          room. */}
      <View className="border-b border-slate-100 px-3.5 pb-3 pt-3" style={o && { borderBottomColor: o.border }}>
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
            style={o && tones && (row.submitted
              ? { borderColor: o.success, backgroundColor: o.success }
              : row.checked
                ? { borderColor: o.ink, backgroundColor: o.ink }
                : { borderColor: tones.boxOff })}
            onPress={() => updateRow(row.key, { checked: !row.checked, error: undefined })}
          >
            {(row.checked || row.submitted) && <Ionicons name="checkmark" size={16} color={o?.onInk ?? "white"} />}
          </Pressable>

          <Ionicons name="receipt-outline" size={14} color={o?.faint ?? "#94A3B8"} />
          <Text className="flex-1 text-xs text-slate-400" numberOfLines={1} style={o && { color: o.faint }}>
            “{row.lineItem.rawText}”
            {row.barcode ? ` · ${row.barcode}` : ""}
          </Text>

          {isLibraryMatch(row) && <LibraryTag />}
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
              onTextChange={(value) => {
                setLibraryQuery(value);
                handleNameChange(row.key, value);
              }}
              onSelect={(option) => {
                setLibraryQuery("");
                applyIngredientMatch(row.key, option);
              }}
              renderSubtitle={(option) => (
                <Text className="mt-0.5 text-xs text-slate-500" style={o && { color: o.muted }}>
                  {option.isGeneric ? "Generic" : referenceName(option.brand) || "Specific"}
                  {referenceName(option.category) ? ` · ${referenceName(option.category)}` : ""}
                </Text>
              )}
            />
            {/* The parse's suggestions from the food library, for a line it
                couldn't match outright */}
            {isNew && !row.submitted && row.librarySuggestions.length > 0 && (
              <View className="mt-2">
                <Text className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400" style={o && { color: o.faint }}>
                  From the food library
                </Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {row.librarySuggestions.map((suggestion) => (
                    <Press
                      key={suggestion._id}
                      disabled={!!pickingSuggestion}
                      accessibilityLabel={`Match to ${suggestion.name}`}
                      onPress={() => {
                        setPickingSuggestion(suggestion._id);
                        void pickLibrarySuggestion(row.key, suggestion).finally(() => setPickingSuggestion(null));
                      }}
                      className="flex-row items-center rounded-full bg-emerald-50 px-3 py-1.5 active:bg-emerald-100"
                      style={{ opacity: pickingSuggestion && pickingSuggestion !== suggestion._id ? 0.5 : 1 }}
                      orbit={o && { backgroundColor: libraryTagColors(dark).backgroundColor }}
                      held={o && { opacity: 0.7 }}
                    >
                      {pickingSuggestion === suggestion._id ? (
                        <ActivityIndicator size="small" color={libraryTagColors(dark).color} />
                      ) : (
                        <Ionicons name="add" size={14} color={libraryTagColors(dark).color} />
                      )}
                      <Text className="ml-1 text-xs font-semibold text-emerald-700" numberOfLines={1} style={o && { color: libraryTagColors(dark).color }}>
                        {suggestion.name}
                      </Text>
                    </Press>
                  ))}
                </View>
              </View>
            )}
            {isNew && !row.submitted && (
              <LibraryMatches
                query={libraryQuery}
                known={ingredients}
                onPick={(food) => {
                  setLibraryQuery("");
                  pickLibraryFood(row.key, food);
                }}
              />
            )}
          </View>
          <Press
            accessibilityLabel="Scan barcode"
            className="h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white active:bg-slate-100"
            orbit={o && { borderRadius: 14, backgroundColor: o.surface, borderColor: o.border }}
            held={o && { backgroundColor: o.pill }}
            onPress={() => onScanBarcode(row.key)}
          >
            <Ionicons name="barcode-outline" size={20} color={o?.icon ?? "#334155"} />
          </Press>
          <Press
            accessibilityLabel="Remove item"
            className="h-11 w-11 items-center justify-center rounded-xl bg-red-50 active:bg-red-100"
            orbit={tones && { borderRadius: 14, backgroundColor: tones.dangerBg }}
            onPress={() => onDeleteRow(row.key, row.name)}
          >
            <Ionicons name="trash-outline" size={19} color={o?.danger ?? "#DC2626"} />
          </Press>
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
          // (In a desktop browser the item list sits beside the card, not over it.)
          paddingBottom: layout.wide ? 24 : COLLAPSED_LIST_HEIGHT + LIST_HANDLE_AREA_HEIGHT + 24,
        }}
      >
        {/* Zero-size anchor at the very top of the scrollable content — see
            useScrollToFocusedField, which measures fields against this rather
            than the ScrollView itself. */}
        <View ref={scrollAnchorRef} collapsable={false} />

        {/* In a desktop browser: two columns, so a line fits on screen —
            what was bought and where it goes on the left, its nutrition on
            the right. */}
        <View style={layout.wide ? { flexDirection: "row", gap: 24, alignItems: "flex-start" } : undefined}>
        <View style={layout.wide ? { flex: 1, minWidth: 0 } : undefined}>

        {!row.submitted && !isRowComplete && (
          <View className="mt-3 flex-row items-start rounded-xl bg-amber-50 px-3 py-2.5" style={tones && { backgroundColor: tones.warnBg }}>
            <Ionicons name="alert-circle" size={16} color={tones?.warnIcon ?? "#D97706"} />
            <Text className="ml-2 flex-1 text-xs font-medium leading-4 text-amber-800" style={tones && { color: tones.warnText }}>
              Missing: {missingFields.join(", ")}
            </Text>
          </View>
        )}

        {!row.submitted && (
          <Press
            className="mt-2.5 flex-row items-center self-start"
            hitSlop={6}
            orbit={!!o && {}}
            onPress={() => onOpenGroceryLink(row.key)}
          >
            <Ionicons
              name="cart-outline"
              size={14}
              color={
                o && tones
                  ? linkedGroceryItem ? o.muted : hasPendingGroceryItems ? tones.warnIcon : o.faint
                  : linkedGroceryItem ? "#64748B" : hasPendingGroceryItems ? "#D97706" : "#94A3B8"
              }
            />
            <Text
              className={`ml-1.5 text-xs font-medium ${
                linkedGroceryItem ? "text-slate-600" : hasPendingGroceryItems ? "text-amber-700" : "text-slate-400"
              }`}
              style={o && tones && { color: linkedGroceryItem ? o.muted : hasPendingGroceryItems ? o.warning : o.faint }}
            >
              {linkedGroceryItem
                ? `Grocery list: ${linkedGroceryItem.name}`
                : hasPendingGroceryItems
                  ? "Not on grocery list — tap to link"
                  : "Link to grocery list"}
            </Text>
          </Press>
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
              placeholderTextColor={o?.faint ?? "#94A3B8"}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950"
              style={[{ height: 40 }, field]}
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

        {/* What the receipt itself said, when it's been put another way (a
            pack into pieces) or may need correcting (a bare count). Not on
            a line added by hand. */}
        {(() => {
          const li = row.lineItem;
          if (!li?.rawText || row.submitted) return null;
          const printed = `${li.quantity} ${li.unit || "item"}`.trim();
          const now = `${row.quantity} ${row.unit}`.trim();
          if (printed.toLowerCase() === now.toLowerCase()) return null;
          return (
            <Text className="mt-1.5 text-[11px] text-slate-400" style={o && { color: o.faint }}>
              On the receipt: {printed}
              {li.packageQuantity != null ? ` (${li.packageQuantity} ${li.packageUnit ?? ""} each)` : ""} — check it&apos;s right.
            </Text>
          );
        })()}

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
              <View className="flex-row items-center rounded-full bg-slate-100 px-2.5 py-1" style={o && { backgroundColor: o.pill }}>
                <Text className="mr-1 text-xs">{categoryEmoji(referenceName(matchedIngredient.category))}</Text>
                <Text className="text-xs font-medium text-slate-600" style={o && { color: o.onPill }}>{referenceName(matchedIngredient.category)}</Text>
              </View>
            )}
            <View className="rounded-full bg-slate-100 px-2.5 py-1" style={o && { backgroundColor: o.pill }}>
              <Text className="text-xs font-medium text-slate-600" style={o && { color: o.onPill }}>
                {matchedIngredient.isGeneric ? "Generic" : referenceName(matchedIngredient.brand) || "Branded"}
              </Text>
            </View>
            <Text className="text-[11px] text-slate-400" style={o && { color: o.faint }}>from your catalog</Text>
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

        {layout.wide && expiryBlock}
        </View>

        <View style={layout.wide ? { flex: 1, minWidth: 0 } : undefined}>
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
            <Text className="flex-1 text-[13px] font-semibold text-slate-700" style={o && { color: o.icon }}>Serving size</Text>
            {isNew && (
              <Press
                disabled={readingLabel}
                onPress={() => onScanLabel(row.key)}
                accessibilityLabel="Scan nutrition label"
                className="h-8 flex-row items-center rounded-lg bg-blue-50 px-2.5 active:bg-blue-100"
                orbit={softButton}
              >
                {readingLabel ? (
                  <ActivityIndicator size="small" color={o?.ink ?? "#2563EB"} />
                ) : (
                  <Ionicons name="camera-outline" size={15} color={o?.onPill ?? "#1D4ED8"} />
                )}
                <Text className="ml-1.5 text-xs font-semibold text-blue-700" style={o && { color: o.onPill }}>
                  {readingLabel ? "Reading…" : "Scan label"}
                </Text>
              </Press>
            )}
          </View>
          <View className="mt-1.5 flex-row items-center">
            <View
              className="w-28 flex-row items-center rounded-xl border border-slate-200 bg-white px-3"
              style={[{ height: 40 }, o && { borderColor: o.border, backgroundColor: isNew ? o.surface : o.pill }]}
            >
              <TextInput
                value={row.defaultPortionAmount}
                editable={isNew}
                onChangeText={(value) => updateRow(row.key, { defaultPortionAmount: value })}
                onFocus={servingSizeSection.trigger}
                keyboardType="decimal-pad"
                placeholder="Amt"
                placeholderTextColor={o?.faint ?? "#94A3B8"}
                className={`flex-1 text-sm ${isNew ? "text-slate-950" : "text-slate-500"}`}
                style={[{ minWidth: 0 }, o && { color: isNew ? o.text : o.muted }]}
              />
              <Text className="ml-1 text-sm text-slate-400" style={[{ flexShrink: 0 }, o && { color: o.faint }]}>{servingUnit || "unit"}</Text>
            </View>
            <Text className="ml-2.5 flex-1 text-[11px] leading-4 text-slate-400" style={o && { color: o.faint }}>
              {isNew
                ? servingUnit === row.unit
                  ? "Same unit as quantity bought. Nutrition below is per this amount."
                  : "Nutrition below is per this amount (from the product's barcode)."
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
                  iconColor={o ? nutrientColor(cell.field, dark) : cell.color}
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
          <Press
            className="flex-row items-center rounded-xl bg-blue-50 px-3 py-2.5 active:bg-blue-100"
            orbit={softButton}
            onPress={() => setShowMoreNutrients((current) => !current)}
          >
            <Text className="text-xs font-semibold text-blue-700" style={o && { color: o.onPill }}>More nutrients</Text>
            <Text className="ml-1 flex-1 text-xs text-blue-500" style={o && { color: o.muted }}>
              · {filledExtended} of {EXTENDED_NUTRITION_FIELDS.length} filled
            </Text>
            <Ionicons name={showMoreNutrients ? "chevron-up" : "chevron-down"} size={15} color={o?.onPill ?? "#1D4ED8"} />
          </Press>
          {showMoreNutrients &&
            EXTENDED_NUTRITION_GROUPS.map((group) => (
              <View key={group.title} className="mt-2.5">
                <Text
                  className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
                  style={o && { fontWeight: "700", letterSpacing: 1.2, color: o.faint }}
                >
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
                servingUnit,
                qty,
                row.unit,
                customConversions,
              )
            : null;
          // (Bought in a unit the serving isn't in, with nothing to say how
          // they relate: ask, rather than guess.)
          if (Number.isFinite(qty) && qty > 0 && !totalNutrition && servingUnit && row.unit && servingUnit.trim().toLowerCase() !== row.unit.trim().toLowerCase()) {
            return (
              <View className="mt-2 flex-row items-start rounded-xl bg-amber-50 px-3 py-2" style={tones && { backgroundColor: tones.warnBg }}>
                <Ionicons name="scale-outline" size={14} color={tones?.warnIcon ?? "#D97706"} />
                <Text className="ml-2 flex-1 text-[11px] leading-4 text-amber-800" style={tones && { color: tones.warnText }}>
                  How much is 1 {row.unit.replace(/s$/, "")} in {servingUnit}? Add it under Unit conversions below to see the total for all {row.quantity} {row.unit}. It&apos;s saved to the ingredient.
                </Text>
              </View>
            );
          }
          return (
            <Text className="mt-2 text-[11px] text-slate-400" style={o && { color: o.faint }}>
              ≈ all {row.quantity || "?"} {row.unit}: {totalNutrition?.calories ?? "—"} kcal ·{" "}
              {totalNutrition?.protein ?? "—"} g protein · {totalNutrition?.carbs ?? "—"} g carbs ·{" "}
              {totalNutrition?.fats ?? "—"} g fat
            </Text>
          );
        })()}

        {!layout.wide && expiryBlock}

        {conversionsBlock}

        </View>
        </View>

        {row.error && <Text className="mt-2 text-xs text-red-600" style={o && { color: o.danger }}>{row.error}</Text>}
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
  // (On the phone, in Orbit's colours: the one being looked at in the
  // section's.)
  const o = useOrbitPage();
  const { dark } = useOrbitTheme();
  const tones = o && orbitTones(o, dark);

  return (
    <Press
      onPress={onPress}
      className={`mb-2 flex-row items-center rounded-2xl border px-3 py-2.5 ${
        row.error ? "border-red-300 bg-white" : isFocused ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"
      } ${row.submitted ? "opacity-50" : ""}`}
      orbit={o && tones && {
        borderRadius: 18,
        backgroundColor: !row.error && isFocused ? tones.inkSoft : o.surface,
        borderColor: row.error ? o.danger : isFocused ? o.selectedRing : o.border,
      }}
      held={o && { opacity: row.submitted ? 0.4 : 0.8 }}
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
        style={o && tones && (row.submitted
          ? { borderColor: o.success, backgroundColor: o.success }
          : row.checked
            ? { borderColor: o.ink, backgroundColor: o.ink }
            : { borderColor: tones.boxOff, backgroundColor: o.surface })}
        onPress={onToggleChecked}
      >
        {(row.checked || row.submitted) && <Ionicons name="checkmark" size={16} color={o?.onInk ?? "white"} />}
      </Pressable>

      <View className="ml-3 h-11 w-11 items-center justify-center rounded-xl bg-slate-100" style={o && { borderRadius: 14, backgroundColor: o.pill }}>
        <Text className="text-2xl">{categoryEmoji(categoryName)}</Text>
      </View>

      <View className="ml-3 flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text className="shrink text-[15px] font-semibold text-slate-900" numberOfLines={1} style={o && { color: o.text }}>
            {row.name || "Unnamed item"}
          </Text>
          {isLibraryMatch(row) && <LibraryTag />}
        </View>
        <Text className="mt-0.5 text-xs text-slate-500" style={o && { color: o.muted }}>
          {row.quantity} {row.unit}
          {row.price ? `  ·  $${row.price}` : ""}
        </Text>
        {!isRowComplete && (
          <Text className="mt-0.5 text-[11px] font-medium text-amber-600" numberOfLines={1} style={o && { color: o.warning }}>
            Missing: {missingFields.join(", ")}
          </Text>
        )}
      </View>

      <View className="ml-2">
        <StatusBadge row={row} isNew={isNew} incomplete={!isRowComplete} />
      </View>
      <Ionicons name="chevron-forward" size={16} color={o?.faint ?? "#CBD5E1"} style={{ marginLeft: 6 }} />
    </Press>
  );
}

// A Kitchen page: in the Kitchen's own colour.
export default function ReceiptReviewPage() {
  return (
    <OrbitSection section="kitchen">
      <ReceiptReview />
    </OrbitSection>
  );
}

function ReceiptReview() {
  const router = useRouter();
  // A receipt saved on the server to review (see services/receiptApi.ts
  // drafts) — scanned on a phone, reviewed here, or the other way round. Its
  // edits are saved to it, not to this device. Without one, the review is
  // of a scan just taken on this device, as before.
  const { draft: draftParam } = useLocalSearchParams<{ draft?: string }>();
  const draftId = typeof draftParam === "string" && draftParam ? draftParam : null;
  const [draftPhoto, setDraftPhoto] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);

  // In a browser: whether barcodes and labels are taken with this computer
  // or with the phone it's paired with (Settings → Devices), chosen once and
  // remembered here, so it isn't asked each time.
  const [cameraMode, setCameraModeState] = useState<"computer" | "phone">(() => {
    try {
      return Platform.OS === "web" && globalThis.localStorage?.getItem("receipts.camera") === "phone" ? "phone" : "computer";
    } catch {
      return "computer";
    }
  });
  const usePhone = Platform.OS === "web" && cameraMode === "phone";
  const [noPhone, setNoPhone] = useState(false);
  function setCameraMode(mode: "computer" | "phone") {
    setCameraModeState(mode);
    try {
      globalThis.localStorage?.setItem("receipts.camera", mode);
    } catch {
      // (Not remembered, but used.)
    }
    // (No phone on the account yet: how to get one.)
    if (mode === "phone") void hasPhone().then((found) => !found && setNoPhone(true), () => {});
  }
  // A barcode or label being taken with this computer's webcam (in a
  // browser, with "This computer" chosen), for which line.
  const [webcam, setWebcam] = useState<{ kind: "barcode" | "label"; rowKey: string } | null>(null);
  // A barcode or label being taken on the phone, and how it's going.
  const [phoneJob, setPhoneJob] = useState<{ id: string; kind: "barcode" | "label"; rowName: string; status: string; message?: string; stop?: () => void } | null>(null);
  const { width: windowWidth, height: windowHeight } = usePaneDimensions();
  const pagerRef = useRef<FlatList<ReviewRow>>(null);
  const layout = useWideForm();
  // In Orbit's look, light or dark (`o`: its colours) — in a desktop
  // browser too, the item list and the item side by side. The fields and
  // dropdowns in it follow by themselves (OrbitPage).
  const { colors: o, dark } = useOrbitTheme();
  const card = { backgroundColor: o.surface, borderColor: o.border };
  // A round button in the header, and on either side of "Item 2 of 5".
  const roundButton = { alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: o.surface, borderWidth: 1, borderColor: o.border };

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
        const { locationList, storeList, brandList, categoryList, pantryList, groceryItemList } = lists;
        // (With what the parse matched that the list doesn't hold.)
        const ingredientList = await withMissingIngredients(
          lists.ingredientList,
          pending.lineItems.map((lineItem) => lineItem.matchedIngredientId),
          pending.lineItems.map((lineItem) => lineItem.proposedIngredient?.genericName),
        );
        if (cancelled) return;
        if (ingredientList !== lists.ingredientList) setIngredients(ingredientList);

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
            const printedUnit = lineItem.packageQuantity != null
              ? lineItem.packageUnit ?? lineItem.unit
              : lineItem.unit;
            const printedQuantity = lineItem.packageQuantity != null
              ? lineItem.quantity * lineItem.packageQuantity
              : lineItem.quantity;
            // How much, in the ingredient's usual unit (see
            // boughtLikeLastTime).
            const bought = matched
              ? boughtLikeLastTime(printedQuantity, printedUnit, history[0]?.quantityUnit || matched.defaultPortionUnit, getIngredientConversions(matched, [], ingredientList))
              : { quantity: printedQuantity, unit: printedUnit };
            const resultingUnit = bought.unit;
            const resultingQuantity = bought.quantity;

            // A matched ingredient's serving is its catalog's, as it is; a
            // proposal's is put in the unit bought.
            const portionAmount = matched
              ? matched.defaultPortionAmount ?? 1
              : convertPortionAmount(proposal?.defaultPortionAmount ?? 1, proposal?.defaultPortionUnit ?? "item", resultingUnit, []);

            return {
              key: `${index}-${lineItem.rawText}`,
              lineItem,
              checked: lineItem.confidence !== "low",
              matchedIngredientId: matched?._id ?? null,
              matchedGroceryItemId: groceryMatch,
              libraryMatchId: matched && (lineItem as ParsedLine).matchedFrom === "library" ? matched._id : null,
              librarySuggestions: matched ? [] : ((lineItem as ParsedLine).librarySuggestions ?? []),
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
              portionUnit: matched ? matched.defaultPortionUnit ?? "item" : undefined,
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

      let draft: Awaited<ReturnType<typeof loadReviewDraft>> = null;
      if (draftId) {
        let saved: Awaited<ReturnType<typeof getReceiptDraft>>;
        try {
          saved = await getReceiptDraft(draftId);
        } catch (error) {
          if (cancelled) return;
          setLoadError(error instanceof Error ? error.message : "Couldn't load this receipt.");
          setLoading(false);
          return;
        }
        if (cancelled) return;
        setDraftPhoto(saved.photoUrl);
        const savedRows = Array.isArray(saved.review?.rows) ? saved.review!.rows : [];
        if (savedRows.length) {
          draft = saved.review;
        } else if (saved.status === "ready" && saved.result) {
          setReceipt(saved.result);
          setStoreName(saved.result.storeName ?? "");
          setStoreDraft(saved.result.storeName ?? "");
          if (saved.result.purchaseDate) setPurchaseDate(saved.result.purchaseDate);
          await loadReferenceData(saved.result);
          return;
        } else {
          setLoadError(saved.status === "failed" ? saved.error || "Couldn't read this receipt." : saved.status === "parsing" ? "Still reading this receipt: try again in a moment." : "This receipt has already been dealt with.");
          setLoading(false);
          return;
        }
      } else if (pending) {
        setReceipt(pending);
        setStoreName(pending.storeName ?? "");
        setStoreDraft(pending.storeName ?? "");
        if (pending.purchaseDate) setPurchaseDate(pending.purchaseDate);
        await loadReferenceData(pending);
        return;
      }

      if (!draftId) draft = await loadReviewDraft();
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

          // A matched line's serving and nutrition are the catalog's as it
          // is now — not as they were when the review was saved (the
          // ingredient may have been corrected since, or the review saved
          // by an older version of this page).
          const lists = await loadOptionLists();
          if (lists && !cancelled) {
            // (With what the lines point at that the list doesn't hold.)
            const ingredientList = await withMissingIngredients(
              lists.ingredientList,
              draftRows.flatMap((row) => [row.matchedIngredientId, row.genericParentId]),
              [],
            );
            if (cancelled) return;
            if (ingredientList !== lists.ingredientList) setIngredients(ingredientList);
            setRows((prev) => prev.map((row) => withCatalogServing(row, ingredientList)));
          }
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
  }, [router, retryToken, capturedPending, draftId]);

  // A line's barcode or label, taken on the paired phone: the request goes
  // to the phone (whose "computer's camera" screen opens the camera), and
  // what comes back is filled in here as if taken on this computer.
  async function viaPhone(kind: "barcode" | "label", rowKey: string) {
    const rowName = rows.find((r) => r.key === rowKey)?.name ?? "";
    let request: Awaited<ReturnType<typeof requestCapture>>;
    try {
      request = await requestCapture(kind, rowName);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      if ((error as { code?: string }).code === "no-phone") setNoPhone(true);
      else setPhoneJob({ id: "", kind, rowName, status: "failed", message });
      return;
    }
    const watch = watchCapture(request._id, (update) => setPhoneJob((job) => (job && job.id === update._id ? { ...job, status: update.status } : job)));
    setPhoneJob({ id: request._id, kind, rowName, status: request.status, stop: watch.stop });
    const final = await watch.done.catch(() => null);
    if (!final) return;
    const settle = (status: string, message: string) => setPhoneJob((job) => (job && job.id === final._id ? { ...job, status, message } : job));
    if (final.status !== "done") {
      settle(final.status, final.status === "cancelled" ? "Cancelled on the phone." : final.error || "That didn't work.");
      return;
    }
    if (kind === "barcode" && final.result?.barcode) {
      settle("looking", "");
      const outcome = await barcodeInto(rowKey, final.result.barcode);
      settle(outcome.ok ? "filled" : "failed", outcome.message);
    } else if (kind === "label" && final.result?.scan) {
      const scan = final.result.scan;
      const outcome = await readLabelInto(rowKey, async () => scan, false);
      settle(outcome.ok ? "filled" : "failed", outcome.message);
    } else {
      settle("failed", "Nothing came back from the phone.");
    }
  }

  // A barcode (from the phone, the webcam or typed) looked up and put on a
  // line; says what happened.
  async function barcodeInto(rowKey: string, code: string): Promise<{ ok: boolean; message: string }> {
    const { product, problem } = await lookupBarcode(code);
    await handleBarcodeScanned(product, rowKey);
    if (!problem) return { ok: true, message: `Found ${product.name}${product.brand ? ` (${product.brand})` : ""}. Check the values.` };
    return {
      ok: false,
      message:
        problem === "notFound"
          ? `Barcode ${code} isn't in the product database: it's saved on the line so it's recognised next time.`
          : problem === "noName"
            ? `Barcode ${code} was found without a name: it's saved on the line.`
            : "Couldn't reach the product database: the barcode is saved on the line.",
    };
  }

  // What the webcam took, for the line it was taken for (shown in the same
  // panel as the phone's).
  async function fromWebcam(kind: "barcode" | "label", rowKey: string, take: () => Promise<{ ok: boolean; message: string }>) {
    setWebcam(null);
    const rowName = rows.find((r) => r.key === rowKey)?.name ?? "";
    setPhoneJob({ id: "webcam", kind, rowName, status: "looking" });
    const outcome = await take().catch((error) => ({ ok: false, message: error instanceof Error ? error.message : "Something went wrong." }));
    setPhoneJob((job) => (job && job.id === "webcam" ? { ...job, status: outcome.ok ? "filled" : "failed", message: outcome.message } : job));
  }

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
      const review = { rows, storeId, storeName, storeDraft, purchaseDate };
      // (A saved receipt keeps its edits on the server, for any device.)
      if (draftId) void saveReceiptDraftReview(draftId, review).catch(() => {});
      else void saveReviewDraft(review);
    }, draftId ? 1200 : 500);

    return () => clearTimeout(timeout);
  }, [rows, storeId, storeName, storeDraft, purchaseDate, loading, draftId]);

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
      // Its catalog serving, as it is (see ReviewRow.portionUnit).
      defaultPortionAmount: String(ingredient.defaultPortionAmount ?? 1),
      portionUnit: ingredient.defaultPortionUnit ?? "item",
      unitConversions: ingredient.unitConversions ?? [],
      error: undefined,
    });
  }

  // A food from the library picked for a line: into the list here, matched
  // like any other, and into one's own ingredients in the background (if
  // that fails, Confirm saves it — see handleConfirm). A search result's
  // record has fewer details filled in: the full one replaces it when it
  // comes (`complete`: it's the full one already).
  function pickLibraryFood(rowKey: string, food: Ingredient, complete = false) {
    const markSaved = () => setIngredients((prev) => prev.map((ing) => (ing._id === food._id ? { ...ing, saved: true } : ing)));
    setIngredients((prev) => (prev.some((ing) => ing._id === food._id) ? prev : [...prev, food]));
    applyIngredientMatch(rowKey, food);
    if (!inMyIngredients(food)) {
      saveIngredient(food._id)
        .then(markSaved)
        .catch((error: unknown) => console.error("Couldn't save the library food:", error));
    }
    if (!complete) {
      getIngredientById(food._id)
        .then((full) =>
          setIngredients((prev) => prev.map((ing) => (ing._id === full._id ? { ...full, saved: ing.saved === true || full.saved === true } : ing))),
        )
        .catch(() => undefined);
    }
  }

  // One of the parse's library suggestions for a line, tapped: its full
  // record (from the list, or fetched), then picked as above — and the
  // suggestions go.
  async function pickLibrarySuggestion(rowKey: string, suggestion: LibrarySuggestion) {
    try {
      const food = ingredients.find((ing) => ing._id === suggestion._id) ?? (await getIngredientById(suggestion._id));
      pickLibraryFood(rowKey, food, true);
      updateRow(rowKey, { librarySuggestions: [] });
    } catch (error) {
      Alert.alert("Couldn't use that food", error instanceof Error ? error.message : "Something went wrong.");
    }
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
            portionUnit: undefined,
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
  function handleLabelPhoto(photoUri: string) {
    const rowKey = labelScanRowKey;
    setLabelScanRowKey(null);
    if (rowKey) void readLabelInto(rowKey, () => parseNutritionLabel(photoUri));
  }

  // A label (photographed here, with the webcam, or on the paired phone and
  // read on the server) into a line's nutrition and serving. Says what it
  // did — alerting it too, unless the caller shows it (the camera panel).
  async function readLabelInto(rowKey: string, getScan: () => Promise<NutritionLabelScan>, alert = true): Promise<{ ok: boolean; message: string }> {
    const say = (title: string, message: string) => alert && Alert.alert(title, message);
    const row = rows.find((r) => r.key === rowKey);
    if (!row) return { ok: false, message: "That line is gone." };

    setReadingLabelRowKey(rowKey);
    try {
      const scan = await getScan();
      if (!scan.isNutritionLabel) {
        const message = "Couldn't read a nutrition or supplement facts label in that photo. Try again with the whole panel in frame and in focus.";
        say("No label found", message);
        return { ok: false, message };
      }

      const serving = row.unit.trim() ? labelServing(scan, row.unit, row.unitConversions) : null;
      setRows((prev) =>
        prev.map((r) =>
          r.key === rowKey
            ? {
                ...r,
                nutrition: { ...r.nutrition, ...labelNutrition(scan) },
                defaultPortionAmount: serving ? String(serving.amount) : r.defaultPortionAmount,
                ...(serving ? { portionUnit: undefined } : {}),
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
      say("Label read — check the values", lines.join("\n\n"));
      return { ok: true, message: lines.join(" ") };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      say("Couldn't read label", message);
      return { ok: false, message };
    } finally {
      setReadingLabelRowKey(null);
    }
  }

  async function handleBarcodeScanned(product: ScannedProduct, forRow?: string) {
    const rowKey = forRow ?? barcodeScanRowKey;
    setBarcodeScanRowKey(null);
    if (!rowKey) return;

    const row = rows.find((r) => r.key === rowKey);
    if (!row) return;

    // A barcode is authoritative — always re-check against the real catalog
    // regardless of the row's current state. This is what lets a wrong
    // existing match get corrected, and lets a generic match upgrade
    // straight to an already-tracked specific variant instead of proposing
    // a duplicate. (Asked of the server when the list doesn't have it: the
    // list doesn't hold every shared product. One it brings joins the list.)
    const existingMatch = await findIngredientByBarcode(ingredients, product.barcode);
    if (existingMatch && !ingredients.some((ing) => ing._id === existingMatch._id)) {
      setIngredients((prev) => (prev.some((ing) => ing._id === existingMatch._id) ? prev : [...prev, existingMatch]));
    }

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
        // Its catalog serving, as it is (see ReviewRow.portionUnit).
        defaultPortionAmount: String(existingMatch.defaultPortionAmount ?? 1),
        portionUnit: existingMatch.defaultPortionUnit ?? "item",
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
      // The nutrition is per the label's serving — or, with none declared,
      // per 100 g (the database's own reference), so that's the serving.
      // In the unit bought when it converts; otherwise kept as it is, in its
      // own unit (see ReviewRow.portionUnit), never re-labelled.
      ...servingFromProduct(product, resultingUnit),
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
      libraryMatchId: null,
      librarySuggestions: [],
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
            if (draftId) void finishReceiptDraft(draftId, "discarded").catch(() => {});
            else void clearReviewDraft();
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
              defaultPortionUnit: row.portionUnit || row.unit || "item",
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
          // A shared ingredient bought joins one's own ingredients (matched
          // by the parse or a barcode, not picked from the library list,
          // which saves at once). In the background: the pantry entry is
          // made either way.
          const boughtIngredient = row.matchedIngredientId ? ingredients.find((ing) => ing._id === ingredientId) : undefined;
          if (boughtIngredient?.saved === false) {
            const boughtId = boughtIngredient._id;
            saveIngredient(boughtId)
              .then(() => setIngredients((prev) => prev.map((ing) => (ing._id === boughtId ? { ...ing, saved: true } : ing))))
              .catch((saveError: unknown) => console.error("Couldn't save the bought ingredient:", saveError));
          }
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
        if (draftId) await finishReceiptDraft(draftId, "done").catch(() => {});
        else await clearReviewDraft();
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
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50 px-8" style={{ backgroundColor: o.canvas }}>
        <Ionicons name="cloud-offline-outline" size={40} color={o.faint} />
        <Text className="mt-3 text-center text-base font-semibold text-slate-700" style={{ color: o.text }}>
          Couldn&apos;t load this receipt
        </Text>
        <Text className="mt-1 text-center text-sm text-slate-500" style={{ color: o.muted }}>{loadError}</Text>
        <Press
          className="mt-5 rounded-xl bg-blue-600 px-5 py-3 active:bg-blue-700"
          orbit={{ height: 52, justifyContent: "center", paddingHorizontal: 24, borderRadius: 16, backgroundColor: o.ink }}
          held={{ opacity: 0.85 }}
          onPress={() => setRetryToken((token) => token + 1)}
        >
          <Text className="font-semibold text-white" style={{ fontSize: 16, color: o.onInk }}>Try again</Text>
        </Press>
      </SafeAreaView>
    );
  }

  if (loading || !receipt) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50" style={{ backgroundColor: o.canvas }}>
        <ActivityIndicator size="large" color={o.ink} />
        <Text className="mt-3 text-slate-500" style={{ color: o.muted }}>Loading...</Text>
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
    pickLibraryFood: (rowKey: string, food: Ingredient) => pickLibraryFood(rowKey, food),
    pickLibrarySuggestion,
    handleNameChange,
    // (On the phone: its own camera. In a browser: the paired phone, or
    // this computer's webcam.)
    onScanBarcode: (rowKey: string) => (usePhone ? void viaPhone("barcode", rowKey) : Platform.OS === "web" ? setWebcam({ kind: "barcode", rowKey }) : setBarcodeScanRowKey(rowKey)),
    onScanLabel: (rowKey: string) => (usePhone ? void viaPhone("label", rowKey) : Platform.OS === "web" ? setWebcam({ kind: "label", rowKey }) : setLabelScanRowKey(rowKey)),
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

  // The list of every item on the receipt: in the draggable panel on a
  // phone, in a column of its own beside the card in a desktop browser.
  const itemList = (
    <>
      <View className="flex-row items-center justify-between px-4 pb-2">
        <Text className="flex-1 text-sm text-slate-500" numberOfLines={1} style={{ color: o.muted }}>
          <Text className="font-bold text-slate-900" style={{ color: o.text }}>
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
          <Text className="text-sm font-semibold text-blue-600" style={{ color: o.accent }}>
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

        <Press
          className="mt-1 flex-row items-center justify-center rounded-2xl border border-dashed border-slate-300 py-3 active:bg-slate-100"
          orbit={{ borderRadius: 18, borderColor: o.faint, backgroundColor: "transparent" }}
          held={{ backgroundColor: o.pill }}
          onPress={handleAddManualRow}
        >
          <Ionicons name="add-circle-outline" size={18} color={o.ink} />
          <Text className="ml-1.5 text-sm font-semibold text-blue-600" style={{ color: o.ink }}>
            Add an item the receipt missed
          </Text>
        </Press>
      </ScrollView>
    </>
  );

  const focusedRow = rows[Math.min(focusedIndex, rows.length - 1)];

  // (In a browser: which camera barcodes and labels use.)
  const cameraSwitch = (
    <View className="mr-3 flex-row items-center" style={{ marginRight: 0 }}>
      <Text className="mr-2 text-xs font-medium text-slate-500" style={{ color: o.muted }}>Camera</Text>
      <View className="flex-row rounded-xl bg-slate-100 p-1" style={{ backgroundColor: o.pill }}>
        {(
          [
            ["computer", "desktop-outline", "This computer"],
            ["phone", "phone-portrait-outline", "My phone"],
          ] as const
        ).map(([mode, icon, text]) => (
          <Pressable
            key={mode}
            onPress={() => setCameraMode(mode)}
            accessibilityLabel={`Use ${text.toLowerCase()} for photos`}
            className={`flex-row items-center rounded-lg px-3 py-1.5 ${cameraMode === mode ? "bg-white" : ""}`}
            style={cameraMode === mode ? { backgroundColor: o.ink } : undefined}
          >
            <Ionicons name={icon} size={14} color={cameraMode === mode ? o.onInk : o.muted} />
            <Text
              className={`ml-1.5 text-xs font-semibold ${cameraMode === mode ? "text-blue-700" : "text-slate-500"}`}
              style={{ color: cameraMode === mode ? o.onInk : o.muted }}
            >
              {text}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <OrbitPage>
    <SafeAreaView
      className="flex-1 bg-slate-50"
      style={{ backgroundColor: o.canvas }}
      edges={["top", "left", "right"]}
    >
      {/* (In a desktop browser, held to a width down the middle of the canvas.) */}
      <KeyboardAvoidingView className="flex-1" style={layout.wide ? { width: "100%", maxWidth: 1600, alignSelf: "center" } : undefined} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header: the way back and the receipt's actions on the page itself
            — over a large title on a phone; in a desktop browser all on one
            line, the camera choice among them. */}
        {layout.wide ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 16 }}>
            <Tap
              disabled={submitting}
              onPress={() => router.back()}
              accessibilityLabel="Back"
              style={[roundButton, { width: 40, height: 40, borderRadius: 20 }]}
              pressedStyle={{ backgroundColor: o.pill }}
            >
              <Ionicons name="chevron-back" size={22} color={o.text} />
            </Tap>
            <Text style={{ marginLeft: 6, flex: 1, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: o.text }} numberOfLines={1}>Review Receipt</Text>
            <View style={{ marginRight: 4 }}>{cameraSwitch}</View>
            {/* The receipt itself, to check the lines against. */}
            {!!draftPhoto && (
              <Tap
                accessibilityLabel="Show the receipt"
                onPress={() => setShowPhoto(true)}
                style={[roundButton, { height: 40, borderRadius: 20, flexDirection: "row", paddingHorizontal: 14 }]}
                pressedStyle={{ backgroundColor: o.pill }}
              >
                <Ionicons name="receipt-outline" size={18} color={o.icon} />
                <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: "600", color: o.text }}>Receipt</Text>
              </Tap>
            )}
            <Tap
              disabled={submitting}
              accessibilityLabel="Discard receipt"
              onPress={handleDiscardReceipt}
              style={[roundButton, { width: 40, height: 40, borderRadius: 20 }]}
              pressedStyle={{ backgroundColor: o.pill }}
            >
              <Ionicons name="trash-outline" size={18} color={o.icon} />
            </Tap>
            <Tap
              disabled={submitting}
              onPress={() => void handleConfirm()}
              style={{ height: 40, justifyContent: "center", paddingHorizontal: 18, borderRadius: 20, backgroundColor: o.ink, opacity: submitting ? 0.5 : 1 }}
              pressedStyle={{ opacity: 0.8 }}
            >
              <Text style={{ fontSize: 15, fontWeight: "700", color: o.onInk }}>{submitting ? "Adding..." : "Confirm"}</Text>
            </Tap>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginLeft: -4, minHeight: 40 }}>
              <Tap
                disabled={submitting}
                onPress={() => router.back()}
                accessibilityLabel="Back"
                style={[roundButton, { width: 40, height: 40, borderRadius: 20 }]}
                pressedStyle={{ backgroundColor: o.pill }}
              >
                <Ionicons name="chevron-back" size={22} color={o.text} />
              </Tap>
              <View style={{ flex: 1 }} />
              {/* The receipt itself, to check the lines against. */}
              {!!draftPhoto && (
                <Tap
                  accessibilityLabel="Show the receipt"
                  onPress={() => setShowPhoto(true)}
                  style={[roundButton, { width: 40, height: 40, borderRadius: 20 }]}
                  pressedStyle={{ backgroundColor: o.pill }}
                >
                  <Ionicons name="receipt-outline" size={18} color={o.icon} />
                </Tap>
              )}
              <Tap
                disabled={submitting}
                accessibilityLabel="Discard receipt"
                onPress={handleDiscardReceipt}
                style={[roundButton, { width: 40, height: 40, borderRadius: 20 }]}
                pressedStyle={{ backgroundColor: o.pill }}
              >
                <Ionicons name="trash-outline" size={18} color={o.icon} />
              </Tap>
              <Tap
                disabled={submitting}
                onPress={() => void handleConfirm()}
                style={{ height: 40, justifyContent: "center", paddingHorizontal: 18, borderRadius: 20, backgroundColor: o.ink, opacity: submitting ? 0.5 : 1 }}
                pressedStyle={{ opacity: 0.8 }}
              >
                <Text style={{ fontSize: 15, fontWeight: "700", color: o.onInk }}>{submitting ? "Adding..." : "Confirm"}</Text>
              </Tap>
            </View>
            <Text style={{ marginTop: 10, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: o.text }}>Review Receipt</Text>
            {Platform.OS === "web" && <View style={{ marginTop: 8, alignSelf: "flex-start" }}>{cameraSwitch}</View>}
          </View>
        )}

        {/* Raised above the card pager below, so the store's options list
            draws over it. */}
        <View className="flex-row gap-2 px-4 pt-3" style={{ zIndex: 10 }}>
          <View className="flex-1 flex-row items-center rounded-2xl border border-slate-200 bg-white px-3 py-2" style={{ ...card, borderRadius: 18 }}>
            <View className="h-9 w-9 items-center justify-center rounded-xl bg-slate-100" style={{ backgroundColor: o.pill }}>
              <Ionicons name="cart-outline" size={18} color={o.icon} />
            </View>
            <View className="ml-2.5 flex-1">
              <Text className="text-[11px] font-medium text-slate-500" style={{ color: o.muted }}>Store</Text>
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

          <Press
            onPress={() => setPickingPurchaseDate(true)}
            className="flex-1 flex-row items-center rounded-2xl border border-slate-200 bg-white px-3 py-2 active:bg-slate-50"
            orbit={{ ...card, borderRadius: 18 }}
            held={{ backgroundColor: o.pill }}
          >
            <View className="h-9 w-9 items-center justify-center rounded-xl bg-slate-100" style={{ backgroundColor: o.pill }}>
              <Ionicons name="calendar-outline" size={18} color={o.icon} />
            </View>
            <View className="ml-2.5 flex-1">
              <Text className="text-[11px] font-medium text-slate-500" style={{ color: o.muted }}>Purchase date</Text>
              <Text className="text-base text-slate-950" style={[{ lineHeight: 26 }, { color: o.text }]} numberOfLines={1}>
                {formatDateDisplay(purchaseDate) ?? "Pick a date"}
              </Text>
            </View>
          </Press>
        </View>

        {/* (In a desktop browser: the item list on the left, and the one
            item being looked at on the right — no pager, no panel.) */}
        <View className="flex-1" style={layout.wide ? { flexDirection: "row", gap: 16, padding: 16, paddingTop: 12 } : undefined}>
        {layout.wide ? (
          <View className="overflow-hidden rounded-3xl border border-slate-200 bg-white pt-4" style={{ width: 440, borderRadius: 20, backgroundColor: o.surface, borderColor: o.border }}>
            {itemList}
          </View>
        ) : null}
        {rows.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-center text-slate-500" style={{ color: o.muted }}>
              No items left on this receipt — add one below, or discard the receipt.
            </Text>
          </View>
        ) : layout.wide ? (
          <View style={{ flex: 1, minWidth: 0 }}>
            <View className="mb-2 flex-row items-center justify-between">
              <Press
                disabled={focusedIndex === 0}
                accessibilityLabel="Previous item"
                onPress={() => goToIndex(focusedIndex - 1)}
                className="h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white active:bg-slate-100"
                style={{ opacity: focusedIndex === 0 ? 0.35 : 1 }}
                orbit={roundButton}
                held={{ backgroundColor: o.pill }}
              >
                <Ionicons name="chevron-back" size={16} color={o.icon} />
              </Press>
              <Text className="text-xs font-medium text-slate-500" style={{ color: o.muted }}>
                Item {focusedIndex + 1} of {rows.length}
              </Text>
              <Press
                disabled={focusedIndex >= rows.length - 1}
                accessibilityLabel="Next item"
                onPress={() => goToIndex(focusedIndex + 1)}
                className="h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white active:bg-slate-100"
                style={{ opacity: focusedIndex >= rows.length - 1 ? 0.35 : 1 }}
                orbit={roundButton}
                held={{ backgroundColor: o.pill }}
              >
                <Ionicons name="chevron-forward" size={16} color={o.icon} />
              </Press>
            </View>
            {focusedRow ? <ReceiptRowDetail key={focusedRow.key} row={focusedRow} callbacks={rowCallbacks} /> : null}
          </View>
        ) : (
          <View className="flex-1 mt-3">
            <View className="mb-2 flex-row items-center justify-between px-4">
              <Press
                disabled={focusedIndex === 0}
                accessibilityLabel="Previous item"
                onPress={() => goToIndex(focusedIndex - 1)}
                className="h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white active:bg-slate-100"
                style={{ opacity: focusedIndex === 0 ? 0.35 : 1 }}
                orbit={roundButton}
                held={{ backgroundColor: o.pill }}
              >
                <Ionicons name="chevron-back" size={16} color={o.icon} />
              </Press>
              <Text className="text-xs font-medium text-slate-500" style={{ color: o.muted }}>
                Item {focusedIndex + 1} of {rows.length} · swipe for next
              </Text>
              <Press
                disabled={focusedIndex >= rows.length - 1}
                accessibilityLabel="Next item"
                onPress={() => goToIndex(focusedIndex + 1)}
                className="h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white active:bg-slate-100"
                style={{ opacity: focusedIndex >= rows.length - 1 ? 0.35 : 1 }}
                orbit={roundButton}
                held={{ backgroundColor: o.pill }}
              >
                <Ionicons name="chevron-forward" size={16} color={o.icon} />
              </Press>
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

      {layout.wide ? null : (
      <Animated.View
          style={[listPanelStyle, { borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: o.canvas, borderColor: o.border }]}
          className="absolute bottom-0 left-0 right-0 overflow-hidden rounded-t-3xl border border-slate-200 bg-white"
        >
          <GestureDetector gesture={listPanGesture}>
            <View className="items-center justify-center" style={{ height: LIST_HANDLE_AREA_HEIGHT }}>
              <View className="h-1.5 w-10 rounded-full bg-slate-300" style={{ height: 4, backgroundColor: dark ? o.faint : o.orbit }} />
            </View>
          </GestureDetector>

          {itemList}
      </Animated.View>
      )}

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
        onProductFound={(product) => void handleBarcodeScanned(product)}
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
          style={{ backgroundColor: o.scrim }}
          onPress={() => setGroceryLinkRowKey(null)}
        >
          <Pressable
            className="max-h-[70%] w-full rounded-t-3xl bg-white pb-6 pt-4"
            style={{ borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: o.canvas, paddingTop: 10, paddingBottom: 32 }}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={{ alignItems: "center", paddingBottom: 14 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: o.track }} />
            </View>
            <Text className="px-5 pb-3 text-base font-bold text-slate-950" style={{ fontSize: 20, fontWeight: "800", letterSpacing: -0.3, color: o.text, paddingBottom: 14 }}>
              Link to grocery list
            </Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              // (On the phone: the choices as one card.)
              style={{ marginHorizontal: 16, overflow: "hidden", borderRadius: 18, borderWidth: 1, borderColor: o.border, backgroundColor: o.surface }}
            >
              <Press
                className="flex-row items-center border-t border-slate-100 px-5 py-4 active:bg-slate-50"
                orbit={{ borderTopWidth: 0, paddingHorizontal: 16, backgroundColor: o.surface }}
                held={{ backgroundColor: o.pill }}
                onPress={() => {
                  if (groceryLinkRowKey) handleLinkGroceryItem(groceryLinkRowKey, null);
                  setGroceryLinkRowKey(null);
                }}
              >
                <Ionicons name="close-circle-outline" size={20} color={o.muted} />
                <Text className="ml-2.5 text-sm font-medium text-slate-700" style={{ color: o.text }}>
                  Not on my list (bought extra)
                </Text>
              </Press>
              {pendingGroceryItems.length === 0 ? (
                <Text
                  className="px-5 py-4 text-sm text-slate-400"
                  style={{ paddingHorizontal: 16, color: o.faint, borderTopWidth: 1, borderTopColor: o.border }}
                >
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
                    <Press
                      key={item._id}
                      className="flex-row items-center border-t border-slate-100 px-5 py-4 active:bg-slate-50"
                      orbit={{ paddingHorizontal: 16, borderTopColor: o.border, backgroundColor: o.surface }}
                      held={{ backgroundColor: o.pill }}
                      onPress={() => {
                        if (groceryLinkRowKey) handleLinkGroceryItem(groceryLinkRowKey, item._id);
                        setGroceryLinkRowKey(null);
                      }}
                    >
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-slate-900" style={{ color: o.text }}>{item.name}</Text>
                        <Text className="mt-0.5 text-xs text-slate-400" style={{ color: o.faint }}>
                          {item.quantity != null ? `${item.quantity} ${item.unit}`.trim() : "No quantity set"}
                          {claimedByOtherRow ? " · currently linked to another item on this receipt" : ""}
                        </Text>
                      </View>
                      {isSelected && <Ionicons name="checkmark-circle" size={20} color={o.ink} />}
                    </Press>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* A barcode or label being taken on the paired phone. */}
      <Modal visible={!!phoneJob} transparent animationType="fade" onRequestClose={() => (phoneJob?.stop?.(), setPhoneJob(null))}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6" style={{ backgroundColor: o.scrim }}>
          <View className="w-full items-center rounded-3xl bg-white px-6 py-7" style={{ maxWidth: 440, borderRadius: 24, backgroundColor: o.surface, borderWidth: 1, borderColor: o.border }}>
            {phoneJob && (() => {
              const what = phoneJob.kind === "barcode" ? "barcode" : "nutrition label";
              const open = ["waiting", "capturing", "looking"].includes(phoneJob.status);
              const title =
                phoneJob.status === "waiting"
                  ? "Waiting for your phone…"
                  : phoneJob.status === "capturing"
                    ? `Camera open on your phone`
                    : phoneJob.status === "looking"
                      ? phoneJob.kind === "barcode"
                        ? "Looking it up…"
                        : "Reading the label…"
                      : phoneJob.status === "filled"
                        ? `${phoneJob.kind === "barcode" ? "Barcode" : "Label"} filled in`
                        : phoneJob.status === "cancelled"
                          ? "Cancelled"
                          : "That didn't work";
              return (
                <>
                  {/* (Under way: in the Kitchen's pale wash.) */}
                  <View className="h-14 w-14 items-center justify-center rounded-full bg-slate-100" style={{ backgroundColor: phoneJob.status === "filled" ? "#ECFDF5" : open ? SECTION_PALETTE.kitchen.tint : o.pill }}>
                    {open ? (
                      <ActivityIndicator color={o.ink} />
                    ) : (
                      <Ionicons name={phoneJob.status === "filled" ? "checkmark" : "close"} size={26} color={phoneJob.status === "filled" ? o.success : o.muted} />
                    )}
                  </View>
                  <Text className="mt-4 text-center text-lg font-bold text-slate-900" style={{ color: o.text }}>{title}</Text>
                  <Text className="mt-1 text-center text-sm text-slate-500" style={{ color: o.muted }}>
                    {phoneJob.status === "waiting"
                      ? `Scan the ${what}${phoneJob.rowName ? ` for ${phoneJob.rowName}` : ""} on your phone. On it, keep Orbit open at Settings → Devices → Be my computer's camera: the camera opens by itself.`
                      : phoneJob.status === "capturing"
                        ? `Take the ${what}${phoneJob.rowName ? ` for ${phoneJob.rowName}` : ""}. It's filled in here as soon as it arrives.`
                        : phoneJob.message ?? ""}
                  </Text>
                  <Pressable
                    onPress={() => {
                      if (open) phoneJob.stop?.();
                      setPhoneJob(null);
                    }}
                    className="mt-5 rounded-xl px-5 py-2.5"
                    style={({ pressed }) => ({ borderRadius: 14, backgroundColor: open ? o.pill : o.ink, opacity: pressed ? 0.8 : 1 })}
                  >
                    <Text className="font-semibold" style={{ color: open ? o.onPill : o.onInk }}>{open ? "Cancel" : "Done"}</Text>
                  </Pressable>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* This computer's webcam (in a browser, with "This computer" chosen). */}
      <WebcamModal
        visible={!!webcam}
        mode={webcam?.kind === "barcode" ? "barcode" : "photo"}
        title={webcam ? `${webcam.kind === "barcode" ? "Barcode" : "Nutrition label"}${rows.find((r) => r.key === webcam.rowKey)?.name ? ` for ${rows.find((r) => r.key === webcam.rowKey)!.name}` : ""}` : ""}
        onClose={() => setWebcam(null)}
        onBarcode={(code) => webcam && void fromWebcam("barcode", webcam.rowKey, () => barcodeInto(webcam.rowKey, code))}
        onPhoto={(photo) => webcam && void fromWebcam("label", webcam.rowKey, () => readLabelInto(webcam.rowKey, () => parseNutritionLabelImage(photo.base64), false))}
      />

      {/* No phone on the account yet, when "My phone" is chosen. */}
      <Modal visible={noPhone} transparent animationType="fade" onRequestClose={() => setNoPhone(false)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6" style={{ backgroundColor: o.scrim }}>
          <View className="w-full rounded-3xl bg-white p-6" style={{ maxWidth: 680, borderRadius: 24, backgroundColor: o.surface, borderWidth: 1, borderColor: o.border }}>
            <View className="mb-4 flex-row items-center">
              <Text className="flex-1 text-lg font-bold text-slate-900" style={{ color: o.text }}>Use your phone&apos;s camera</Text>
              <Pressable onPress={() => setNoPhone(false)} hitSlop={10} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={o.muted} />
              </Pressable>
            </View>
            {noPhone && <NoPhoneYet onFound={() => setNoPhone(false)} />}
          </View>
        </View>
      </Modal>

      {/* The receipt photo, full size, to check the lines against. */}
      <Modal visible={showPhoto && !!draftPhoto} transparent animationType="fade" onRequestClose={() => setShowPhoto(false)}>
        <Pressable className="flex-1 items-center justify-center bg-black/80 p-4" onPress={() => setShowPhoto(false)}>
          {!!draftPhoto && (
            <Image source={{ uri: photoSource(draftPhoto)! }} style={{ width: "100%", height: "100%", maxWidth: 900 }} contentFit="contain" />
          )}
          <View className="absolute right-5 top-5 h-10 w-10 items-center justify-center rounded-full bg-white/90">
            <Ionicons name="close" size={22} color="#0F172A" />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
    </OrbitPage>
  );
}
