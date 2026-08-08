import type { MealPlanEntry } from "@/src/services/mealPlanApi";
import type { Recipe } from "@/src/services/recipeApi";
import type { Ingredient } from "@/src/services/ingredientApi";
import type { PantryItem } from "@/src/types/pantry";
import { convertUnits, getIngredientConversions, type CustomUnitConversion } from "./unitConversion";
import { getIngredientStockInUnit } from "./ingredientStock";

function extractId(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "_id" in value) {
    return String((value as { _id?: unknown })._id ?? "");
  }
  return "";
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export interface PantryGroupMember {
  pantryItemId: string;
  quantityAvailable: number; // in its own unit
  quantityUnit: string;
}

// A set of pantry entries identical in every way that matters (same
// ingredient, unit, expiry, location, purchase date) — "brothers" that
// don't need the user to distinguish between them.
export interface PantryGroup {
  key: string;
  members: PantryGroupMember[];
  displayName: string;
  expiryDate: string | null;
  // Combined amount across members, converted into the requirement's unit.
  totalAvailable: number;
  // This group's own ingredient's resolved conversions (its own entries,
  // then its generic parent's, then the app-wide list) — a group's members
  // all share one specific ingredient by construction (it's part of the
  // grouping key), but that can differ from the requirement's own
  // ingredient when the requirement is a generic aggregating variants.
  conversions: CustomUnitConversion[];
}

export interface IngredientRequirement {
  ingredientId: string;
  ingredientName: string;
  neededQuantity: number;
  unit: string;
  // Sorted soonest-expiry-first, no-expiry last.
  groups: PantryGroup[];
}

export interface DeductionInstruction {
  pantryItemId: string;
  amount: number; // in the pantry item's own unit
}

interface RawRow {
  ingredientId: string;
  quantity: number;
  unit: string;
}

// A recipe's ingredientList is authored for its own `servings` — actually
// consuming a different number of servings scales every line by
// consumed/authored, so e.g. cooking 1 serving of a 2-serving recipe only
// deducts half the ingredients.
function servingsRatio(authoredServings: number | undefined, consumedServings: number | undefined): number {
  const authored = authoredServings ?? 1;
  const consumed = consumedServings ?? authored;
  return authored > 0 ? consumed / authored : 1;
}

function gatherRows(entry: MealPlanEntry, recipeMap: Map<string, Recipe>): RawRow[] {
  const rows: RawRow[] = [];

  if (entry.recipe) {
    const ratio = servingsRatio(entry.recipe.servings, entry.recipeServings);
    for (const line of entry.recipe.ingredientList) {
      const id = extractId(line.ingredient);
      if (id) rows.push({ ingredientId: id, quantity: line.quantity * ratio, unit: line.unit });
    }
    return rows;
  }

  if (entry.ingredient) {
    rows.push({
      ingredientId: entry.ingredient._id,
      quantity: entry.ingredientQuantity ?? 0,
      unit: entry.ingredientUnit ?? "",
    });
    return rows;
  }

  if (entry.meal) {
    for (const course of entry.meal.courses ?? []) {
      const ref = course.recipe;
      if (!ref || typeof ref === "string") continue;
      // A course's own recipe ref is a thin projection with no
      // ingredientList — the real one comes from the full recipe list.
      const fullRecipe = recipeMap.get(ref._id);
      if (!fullRecipe) continue;
      const ratio = servingsRatio(fullRecipe.servings, course.servings);
      for (const line of fullRecipe.ingredientList) {
        const id = extractId(line.ingredient);
        if (id) rows.push({ ingredientId: id, quantity: line.quantity * ratio, unit: line.unit });
      }
    }
  }

  return rows;
}

// For any row whose ingredient is produced by a recipe (Ingredient.
// productionRecipe) and short on pantry stock, splits it into a row for
// whatever stock *does* cover it (unchanged — still deducted from that
// ingredient's own pantry entries, per the "stock first" rule) plus
// recursively-expanded raw-ingredient rows for the shortfall only, scaled
// by how many multiples of the production recipe's own (whole-batch) yield
// the shortfall represents: shortfall ÷ (recipe.servings ×
// ingredient.defaultPortionAmount), since "1 serving cooked" ==
// "defaultPortionAmount defaultPortionUnit produced" is user-chosen yield
// data set when linking (see Ingredient.js's productionRecipe comment),
// not assumed to be 1 — the recipe's own ingredientList quantities make
// the *whole* batch (every serving), not just one serving's worth.
//
// visitedRecipeIds is a runtime cycle guard — defense in depth on top of
// the save-time checks in productionCycle.js (RecipeRoutes.js /
// IngredientRoutes.js), which should make a cycle unreachable here. If one
// slips through anyway, this stops expanding rather than recursing
// forever, and the shortfall is just left as an ordinary (likely
// unfulfillable) requirement.
function expandProducedIngredientRows(
  rows: RawRow[],
  ingredientMap: Map<string, Ingredient>,
  allIngredients: Ingredient[],
  pantryItems: PantryItem[],
  recipeMap: Map<string, Recipe>,
  globalConversions: CustomUnitConversion[],
  visitedRecipeIds: Set<string> = new Set(),
): RawRow[] {
  const result: RawRow[] = [];

  for (const row of rows) {
    const ing = ingredientMap.get(row.ingredientId);
    const productionRecipeId = ing ? extractId(ing.productionRecipe) : "";

    if (!ing || !productionRecipeId) {
      result.push(row);
      continue;
    }

    const nativeUnit = ing.defaultPortionUnit || row.unit;
    const conversions = getIngredientConversions(ing, globalConversions, allIngredients);
    const neededInNative = convertUnits(row.quantity, row.unit, nativeUnit, conversions);
    if (neededInNative == null) {
      result.push(row);
      continue;
    }

    const availableInNative = getIngredientStockInUnit(
      ing,
      nativeUnit,
      allIngredients,
      pantryItems,
      globalConversions,
    );
    const covered = Math.min(neededInNative, availableInNative);
    const shortfall = round(neededInNative - covered);

    if (covered > 0) {
      result.push({ ingredientId: row.ingredientId, quantity: covered, unit: nativeUnit });
    }

    if (shortfall <= 0) continue;

    const productionRecipe = recipeMap.get(productionRecipeId);
    if (!productionRecipe || visitedRecipeIds.has(productionRecipeId)) {
      result.push({ ingredientId: row.ingredientId, quantity: shortfall, unit: nativeUnit });
      continue;
    }

    const totalYield = (productionRecipe.servings || 1) * (ing.defaultPortionAmount || 1);
    const scale = shortfall / totalYield;
    const subRows: RawRow[] = productionRecipe.ingredientList.map((line) => ({
      ingredientId: extractId(line.ingredient),
      quantity: line.quantity * scale,
      unit: line.unit,
    }));

    const nextVisited = new Set(visitedRecipeIds);
    nextVisited.add(productionRecipeId);
    result.push(
      ...expandProducedIngredientRows(
        subRows,
        ingredientMap,
        allIngredients,
        pantryItems,
        recipeMap,
        globalConversions,
        nextVisited,
      ),
    );
  }

  return result;
}

// The row-consuming core of buildIngredientRequirements — separated so
// substitution (above) can run on the row list first.
function buildRequirementsFromRows(
  rows: RawRow[],
  ingredientMap: Map<string, Ingredient>,
  allIngredients: Ingredient[],
  pantryItems: PantryItem[],
  globalConversions: CustomUnitConversion[],
): IngredientRequirement[] {
  // Aggregate needed quantity per distinct ingredient (in that ingredient's
  // own unit) — a recipe/meal can reference the same ingredient more than
  // once, and the candidate pool must be considered once per ingredient,
  // not once per row (otherwise the same stock could be double-counted).
  const neededByIngredient = new Map<string, number>();
  for (const row of rows) {
    const ing = ingredientMap.get(row.ingredientId);
    if (!ing || ing.isAlwaysAvailable) continue;
    const nativeUnit = ing.defaultPortionUnit || row.unit;
    const converted = convertUnits(
      row.quantity,
      row.unit,
      nativeUnit,
      getIngredientConversions(ing, globalConversions, allIngredients),
    );
    if (converted == null) continue;
    neededByIngredient.set(row.ingredientId, (neededByIngredient.get(row.ingredientId) ?? 0) + converted);
  }

  const requirements: IngredientRequirement[] = [];

  for (const [ingredientId, rawNeeded] of neededByIngredient) {
    const neededQuantity = round(rawNeeded);
    if (neededQuantity <= 0) continue;
    const ing = ingredientMap.get(ingredientId);
    if (!ing) continue;
    const unit = ing.defaultPortionUnit || "";

    // Generic ingredients are satisfied by their own direct stock plus
    // every specific/branded variant's stock (same pool the availability
    // check and pantry-list aggregation already use).
    const relevantIds = new Set<string>([ingredientId]);
    if (ing.isGeneric) {
      for (const other of allIngredients) {
        if (extractId(other.genericParent) === ingredientId) relevantIds.add(other._id);
      }
    }

    const groupMap = new Map<
      string,
      { members: PantryGroupMember[]; displayName: string; expiryDate: string | null; ingredientId: string }
    >();

    for (const item of pantryItems) {
      if (item.isFinished) continue;
      const itemIngredientId = extractId(item.ingredient);
      if (!relevantIds.has(itemIngredientId)) continue;

      const expiryKey = item.expiryDate ? new Date(item.expiryDate).toISOString().slice(0, 10) : "none";
      const locationKey = extractId(item.storageLocation) || "none";
      const purchaseKey = item.purchaseDate ? new Date(item.purchaseDate).toISOString().slice(0, 10) : "none";
      const groupKey = `${itemIngredientId}|${item.quantityUnit}|${expiryKey}|${locationKey}|${purchaseKey}`;

      let group = groupMap.get(groupKey);
      if (!group) {
        const itemIngredient = typeof item.ingredient === "object" ? item.ingredient : null;
        group = {
          members: [],
          displayName: itemIngredient?.name ?? ing.name,
          expiryDate: item.expiryDate ?? null,
          ingredientId: itemIngredientId,
        };
        groupMap.set(groupKey, group);
      }
      group.members.push({
        pantryItemId: item._id,
        quantityAvailable: item.quantityAvailable ?? 0,
        quantityUnit: item.quantityUnit,
      });
    }

    // Each group's members all share one specific ingredient by
    // construction (part of the grouping key) — resolve conversions from
    // *that* ingredient, which can differ from the requirement's own when
    // the requirement is a generic aggregating variants.
    const groups: PantryGroup[] = Array.from(groupMap.entries()).map(([key, g]) => {
      const groupIngredient = ingredientMap.get(g.ingredientId) ?? ing;
      const conversions = getIngredientConversions(groupIngredient, globalConversions, allIngredients);
      const totalAvailable = g.members.reduce((sum, m) => {
        const converted = convertUnits(m.quantityAvailable, m.quantityUnit, unit, conversions);
        return sum + (converted ?? 0);
      }, 0);
      return {
        key,
        members: g.members,
        displayName: g.displayName,
        expiryDate: g.expiryDate,
        totalAvailable: round(totalAvailable),
        conversions,
      };
    });

    groups.sort((a, b) => {
      if (!a.expiryDate && !b.expiryDate) return 0;
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
    });

    requirements.push({ ingredientId, ingredientName: ing.name, neededQuantity, unit, groups });
  }

  return requirements;
}

// What a recipe/ingredient/meal-course entry actually needs from the
// pantry to confirm, plus the candidate pantry entries (grouped into
// "brothers") available to cover each one — the basis for both the fully
// automatic deduction and the resolve-sources UI for genuine ambiguity.
// Rows are substitution-expanded first (see expandProducedIngredientRows)
// so a shortfall of a recipe-produced ingredient is covered by its own raw
// ingredients rather than left as an unfulfillable requirement.
export function buildIngredientRequirements(
  entry: MealPlanEntry,
  recipeMap: Map<string, Recipe>,
  ingredientMap: Map<string, Ingredient>,
  allIngredients: Ingredient[],
  pantryItems: PantryItem[],
  globalConversions: CustomUnitConversion[],
): IngredientRequirement[] {
  const rows = gatherRows(entry, recipeMap);
  const expandedRows = expandProducedIngredientRows(
    rows,
    ingredientMap,
    allIngredients,
    pantryItems,
    recipeMap,
    globalConversions,
  );
  return buildRequirementsFromRows(expandedRows, ingredientMap, allIngredients, pantryItems, globalConversions);
}

export function hasAmbiguity(requirements: IngredientRequirement[]): boolean {
  return requirements.some((r) => r.groups.length > 1);
}

// Drains `groups` in the given order, up to `neededQuantity` (in `unit`),
// splitting each group's contribution across its member documents in
// member order — siblings are interchangeable, so the order among them
// doesn't matter, only the order between groups does. Each group already
// carries its own resolved conversions (built in buildIngredientRequirements
// from that group's specific ingredient), so no conversions list needs to
// be passed in here.
function drainGroups(
  groups: PantryGroup[],
  neededQuantity: number,
  unit: string,
): DeductionInstruction[] {
  const instructions: DeductionInstruction[] = [];
  let remaining = neededQuantity;

  for (const group of groups) {
    if (remaining <= 0) break;
    for (const member of group.members) {
      if (remaining <= 0) break;
      const availableInUnit = convertUnits(member.quantityAvailable, member.quantityUnit, unit, group.conversions);
      if (availableInUnit == null || availableInUnit <= 0) continue;

      const takeInUnit = Math.min(remaining, availableInUnit);
      const takeInMemberUnit = convertUnits(takeInUnit, unit, member.quantityUnit, group.conversions);
      if (takeInMemberUnit == null || takeInMemberUnit <= 0) continue;

      instructions.push({ pantryItemId: member.pantryItemId, amount: round(takeInMemberUnit) });
      remaining -= takeInUnit;
    }
  }

  return instructions;
}

function mergeInstructions(instructions: DeductionInstruction[]): DeductionInstruction[] {
  const byId = new Map<string, number>();
  for (const { pantryItemId, amount } of instructions) {
    byId.set(pantryItemId, round((byId.get(pantryItemId) ?? 0) + amount));
  }
  return Array.from(byId.entries()).map(([pantryItemId, amount]) => ({ pantryItemId, amount }));
}

// The fully-automatic plan — every requirement drained in expiry order, no
// user choice involved. Used directly when nothing is ambiguous.
export function getDefaultDeductionInstructions(
  requirements: IngredientRequirement[],
): DeductionInstruction[] {
  const all: DeductionInstruction[] = [];
  for (const req of requirements) {
    all.push(...drainGroups(req.groups, req.neededQuantity, req.unit));
  }
  return mergeInstructions(all);
}

// Builds instructions honoring manual picks where provided — `selections`
// maps a requirement's ingredientId to the group keys the user tapped, in
// tap order (first tapped drains first). A requirement absent from
// `selections` (or with an empty pick list) falls back to the full
// expiry-order default — an ambiguous choice is never a hard requirement
// to interact with before confirming.
export function getResolvedDeductionInstructions(
  requirements: IngredientRequirement[],
  selections: Record<string, string[]>,
): DeductionInstruction[] {
  const all: DeductionInstruction[] = [];

  for (const req of requirements) {
    const pickedKeys = selections[req.ingredientId];
    if (!pickedKeys || pickedKeys.length === 0) {
      all.push(...drainGroups(req.groups, req.neededQuantity, req.unit));
      continue;
    }

    const orderedGroups = pickedKeys
      .map((key) => req.groups.find((g) => g.key === key))
      .filter((g): g is PantryGroup => !!g);
    all.push(...drainGroups(orderedGroups, req.neededQuantity, req.unit));
  }

  return mergeInstructions(all);
}
