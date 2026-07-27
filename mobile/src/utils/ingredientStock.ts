import { convertibleTotal, type CustomUnitConversion } from "./unitConversion";

interface StockLookupIngredient {
  _id: string;
  isGeneric?: boolean;
  isAlwaysAvailable?: boolean;
  genericParent?: string | { _id?: string } | null;
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
 * Generic ingredients (e.g. "Soy Sauce") never hold pantry stock directly —
 * they're a matching umbrella, not a physical product — so their
 * availability is the combined stock of every specific/branded variant
 * registered under them (found by scanning `allIngredients` for a matching
 * `genericParent`). Returns `Infinity` for an ingredient marked "always
 * available" (e.g. tap water), so it always reads as sufficient however the
 * caller compares it.
 */
export function getIngredientStockInUnit(
  ingredient: StockLookupIngredient,
  targetUnit: string,
  allIngredients: StockLookupIngredient[],
  pantryItems: StockLookupPantryItem[],
  customConversions: CustomUnitConversion[] = [],
): number {
  if (ingredient.isAlwaysAvailable) return Infinity;

  const relevantIngredientIds = new Set<string>();
  if (ingredient.isGeneric) {
    for (const other of allIngredients) {
      if (extractId(other.genericParent) === ingredient._id) {
        relevantIngredientIds.add(other._id);
      }
    }
  } else {
    relevantIngredientIds.add(ingredient._id);
  }

  const byUnit: Record<string, number> = {};
  for (const item of pantryItems) {
    const itemIngredientId = extractId(item.ingredient);
    if (!relevantIngredientIds.has(itemIngredientId)) continue;
    byUnit[item.quantityUnit] = (byUnit[item.quantityUnit] ?? 0) + (item.quantityAvailable ?? 0);
  }

  return convertibleTotal(byUnit, targetUnit, customConversions);
}
