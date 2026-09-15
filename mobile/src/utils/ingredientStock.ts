import { convertibleTotal, convertUnits, getIngredientConversions, type CustomUnitConversion } from "./unitConversion";

interface StockLookupIngredient {
  _id: string;
  isGeneric?: boolean;
  isAlwaysAvailable?: boolean;
  genericParent?: string | { _id?: string; unitConversions?: CustomUnitConversion[] } | null;
  unitConversions?: CustomUnitConversion[];
}

interface StockLookupPantryItem {
  ingredient: string | { _id?: string };
  quantityAvailable?: number;
  quantityUnit: string;
}

function extractId(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "_id" in value) {
    return String((value as { _id?: unknown })._id ?? "");
  }
  return "";
}

/**
 * How much of `ingredient` is available, converted into `targetUnit`.
 *
 * Generic ingredients (e.g. "Soy Sauce") are a matching umbrella — a recipe
 * calling for one can be satisfied by any specific/branded variant
 * registered under it — but can also hold pantry stock directly (e.g.
 * buying garlic with no brand in mind). So a generic's availability is its
 * own direct stock plus every variant's (found by scanning `allIngredients`
 * for a matching `genericParent`). Returns `Infinity` for an ingredient
 * marked "always available" (e.g. tap water), so it always reads as
 * sufficient however the caller compares it.
 */
export function getIngredientStockInUnit(
  ingredient: StockLookupIngredient,
  targetUnit: string,
  allIngredients: StockLookupIngredient[],
  pantryItems: StockLookupPantryItem[],
  customConversions: CustomUnitConversion[] = [],
): number {
  if (ingredient.isAlwaysAvailable) return Infinity;

  const relevantIngredientIds = new Set<string>([ingredient._id]);
  if (ingredient.isGeneric) {
    for (const other of allIngredients) {
      if (extractId(other.genericParent) === ingredient._id) {
        relevantIngredientIds.add(other._id);
      }
    }
  }

  const byUnit: Record<string, number> = {};
  for (const item of pantryItems) {
    const itemIngredientId = extractId(item.ingredient);
    if (!relevantIngredientIds.has(itemIngredientId)) continue;
    byUnit[item.quantityUnit] = (byUnit[item.quantityUnit] ?? 0) + (item.quantityAvailable ?? 0);
  }

  // Prefers this ingredient's own density-style conversions (and its
  // generic parent's), falling back to each variant's own — pooled here
  // since byUnit above is already merged across variants by unit, not
  // tracked per source ingredient — and finally the app-wide list.
  const variantConversions = ingredient.isGeneric
    ? allIngredients
        .filter((other) => extractId(other.genericParent) === ingredient._id)
        .flatMap((other) => other.unitConversions ?? [])
    : [];
  const resolvedConversions = [
    ...getIngredientConversions(ingredient, [], allIngredients),
    ...variantConversions,
    ...customConversions,
  ];

  return convertibleTotal(byUnit, targetUnit, resolvedConversions);
}

/**
 * Whether one real amount (e.g. a single pantry item's weight) falls within
 * a "whole piece" ingredient line's acceptable range, once converted into
 * the range's own unit. False (not just "unknown") when the units aren't
 * convertible at all — an unconvertible piece can't be confirmed as a
 * match, so it's excluded rather than guessed at.
 */
export function pieceWeightInRange(
  amount: number,
  fromUnit: string,
  minWeight: number,
  maxWeight: number,
  weightUnit: string,
  customConversions: CustomUnitConversion[] = [],
): boolean {
  const converted = convertUnits(amount, fromUnit, weightUnit, customConversions);
  if (converted == null) return false;
  return converted >= minWeight && converted <= maxWeight;
}

/**
 * How many real, individual pantry items of `ingredient` (or, for a
 * generic, any of its specific/branded variants — same pooling rule as
 * getIngredientStockInUnit) have a weight that qualifies as one whole
 * "piece" for a recipe's wholePiece-mode ingredient line. Unlike
 * getIngredientStockInUnit, this counts qualifying *items*, not a pooled
 * total amount - a 90g and a 400g piece don't add up to satisfy a
 * "150-250g" range even though their sum might land inside it, since
 * neither one is actually usable whole for that line.
 */
export function countQualifyingPantryPieces(
  ingredient: StockLookupIngredient,
  minWeight: number,
  maxWeight: number,
  weightUnit: string,
  allIngredients: StockLookupIngredient[],
  pantryItems: StockLookupPantryItem[],
  customConversions: CustomUnitConversion[] = [],
): number {
  if (ingredient.isAlwaysAvailable) return Infinity;

  const relevantIngredientIds = new Set<string>([ingredient._id]);
  if (ingredient.isGeneric) {
    for (const other of allIngredients) {
      if (extractId(other.genericParent) === ingredient._id) {
        relevantIngredientIds.add(other._id);
      }
    }
  }

  const variantConversions = ingredient.isGeneric
    ? allIngredients
        .filter((other) => extractId(other.genericParent) === ingredient._id)
        .flatMap((other) => other.unitConversions ?? [])
    : [];
  const resolvedConversions = [
    ...getIngredientConversions(ingredient, [], allIngredients),
    ...variantConversions,
    ...customConversions,
  ];

  let count = 0;
  for (const item of pantryItems) {
    const itemIngredientId = extractId(item.ingredient);
    if (!relevantIngredientIds.has(itemIngredientId)) continue;
    if (
      pieceWeightInRange(
        item.quantityAvailable ?? 0,
        item.quantityUnit,
        minWeight,
        maxWeight,
        weightUnit,
        resolvedConversions,
      )
    ) {
      count++;
    }
  }
  return count;
}
