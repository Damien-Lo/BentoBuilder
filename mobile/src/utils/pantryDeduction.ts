import type { MealPlanEntry } from "@/src/services/mealPlanApi";
import type { Recipe, IngredientMatchMode } from "@/src/services/recipeApi";
import type { Ingredient } from "@/src/services/ingredientApi";
import type { PantryItem } from "@/src/types/pantry";
import { convertUnits, getIngredientConversions, type CustomUnitConversion } from "./unitConversion";
import { getIngredientStockInUnit, pieceWeightInRange } from "./ingredientStock";

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

// A set of pantry entries identical in every way that matters — "brothers"
// that don't need the user to distinguish between them. For a "quantity"
// requirement that's same ingredient, unit, expiry, location, and purchase
// date (pure interchangeability of *source*, since the amounts just sum).
// For a "wholePiece" requirement it's same ingredient and real weight
// instead (purchase logistics don't matter — two pieces bought on
// different trips that happen to weigh the same are still fully
// interchangeable) — see the wholePiece branch in buildRequirementsFromRows.
export interface PantryGroup {
  key: string;
  members: PantryGroupMember[];
  displayName: string;
  expiryDate: string | null;
  // "quantity" mode: combined amount across every member, converted into
  // the requirement's unit. "wholePiece" mode: count of members whose own
  // weight falls within the requirement's piece range (see
  // qualifyingMembers) - never a sum, since an undersized and an oversized
  // piece don't add up to one usable whole piece even if their sum would
  // land in range.
  totalAvailable: number;
  // Only populated for a "wholePiece" requirement - the subset of `members`
  // whose weight qualifies as one whole piece. `drainWholePieceGroups`
  // takes from this list (always a member's *entire* quantityAvailable,
  // never a fraction); the UI can diff it against `members` to show which
  // candidates were excluded as too small/too large.
  qualifyingMembers?: PantryGroupMember[];
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
  // "quantity" mode: an exact amount in `unit`. "wholePiece" mode: how many
  // whole pieces are needed - `unit` is just a display label in that case.
  neededQuantity: number;
  unit: string;
  matchMode: IngredientMatchMode;
  // Only set when matchMode is "wholePiece".
  pieceMinWeight?: number;
  pieceMaxWeight?: number;
  pieceWeightUnit?: string;
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
  matchMode: IngredientMatchMode;
  pieceMinWeight?: number;
  pieceMaxWeight?: number;
  pieceWeightUnit?: string;
}

// A quantity-mode row not tied to any particular recipe line - the default
// for bare-ingredient meal-plan entries and anywhere else a row is built
// without its own match-mode fields to carry through.
function quantityRow(ingredientId: string, quantity: number, unit: string): RawRow {
  return { ingredientId, quantity, unit, matchMode: "quantity" };
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

// One recipe ingredientList line, scaled by however much of the recipe is
// actually being consumed, into a RawRow — shared by the direct-recipe and
// meal-course branches below. For a "wholePiece" line, `quantity` is a
// piece *count*, which the ratio can turn fractional (e.g. cooking half a
// 2-fillet recipe) — rounded to the nearest whole piece since there's no
// such thing as half a discrete piece; an approximation for a genuinely
// uncommon case (recipes are almost always cooked at a whole multiple of
// their authored servings).
function recipeLineToRow(line: Recipe["ingredientList"][number], ratio: number): RawRow {
  const ingredientId = extractId(line.ingredient);
  const matchMode = line.matchMode ?? "quantity";
  const quantity = matchMode === "wholePiece"
    ? Math.max(0, Math.round(line.quantity * ratio))
    : line.quantity * ratio;
  return {
    ingredientId,
    quantity,
    unit: line.unit,
    matchMode,
    pieceMinWeight: line.pieceMinWeight ?? undefined,
    pieceMaxWeight: line.pieceMaxWeight ?? undefined,
    pieceWeightUnit: line.pieceWeightUnit,
  };
}

function gatherRows(entry: MealPlanEntry, recipeMap: Map<string, Recipe>): RawRow[] {
  const rows: RawRow[] = [];

  if (entry.recipe) {
    const ratio = servingsRatio(entry.recipe.servings, entry.recipeServings);
    for (const line of entry.recipe.ingredientList) {
      if (extractId(line.ingredient)) rows.push(recipeLineToRow(line, ratio));
    }
    return rows;
  }

  if (entry.ingredient) {
    rows.push(quantityRow(entry.ingredient._id, entry.ingredientQuantity ?? 0, entry.ingredientUnit ?? ""));
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
        if (extractId(line.ingredient)) rows.push(recipeLineToRow(line, ratio));
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

    // Production substitution is a continuous-quantity concept (fractional
    // batch yields covering a fractional shortfall) that doesn't apply to a
    // "how many whole pieces" row - and nothing produced via a sub-recipe
    // (stocks, minced/prepped ingredients) is naturally a discrete piece
    // anyway, so this is a pass-through rather than a real limitation.
    if (row.matchMode === "wholePiece" || !ing || !productionRecipeId) {
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
      result.push(quantityRow(row.ingredientId, covered, nativeUnit));
    }

    if (shortfall <= 0) continue;

    const productionRecipe = recipeMap.get(productionRecipeId);
    if (!productionRecipe || visitedRecipeIds.has(productionRecipeId)) {
      result.push(quantityRow(row.ingredientId, shortfall, nativeUnit));
      continue;
    }

    const totalYield = (productionRecipe.servings || 1) * (ing.defaultPortionAmount || 1);
    const scale = shortfall / totalYield;
    const subRows: RawRow[] = productionRecipe.ingredientList.map((line) => recipeLineToRow(line, scale));

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

// Accumulated per-ingredient need, aggregated across every row referencing
// it — a recipe/meal can reference the same ingredient more than once, and
// the candidate pool must be considered once per ingredient, not once per
// row (otherwise the same stock could be double-counted). "wholePiece"
// rows contribute a raw piece count (no unit conversion — `quantity` isn't
// an amount); "quantity" rows convert into the ingredient's own native
// unit, same as before. A mix of both modes for the same ingredient within
// one entry isn't expected (one recipe line = one mode) and isn't
// specially handled - whichever mode is seen last simply wins.
interface NeededAccumulator {
  quantity: number;
  matchMode: IngredientMatchMode;
  pieceMinWeight?: number;
  pieceMaxWeight?: number;
  pieceWeightUnit?: string;
  // The recipe line's own descriptive label (e.g. "fillet") - display only,
  // distinct from pieceWeightUnit (e.g. "g"), which is what the range is
  // actually expressed in and what matching converts pantry weights into.
  pieceDisplayUnit?: string;
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
  const neededByIngredient = new Map<string, NeededAccumulator>();
  for (const row of rows) {
    const ing = ingredientMap.get(row.ingredientId);
    if (!ing || ing.isAlwaysAvailable) continue;

    const current = neededByIngredient.get(row.ingredientId);

    if (row.matchMode === "wholePiece") {
      neededByIngredient.set(row.ingredientId, {
        quantity: (current?.quantity ?? 0) + row.quantity,
        matchMode: "wholePiece",
        pieceMinWeight: row.pieceMinWeight,
        pieceMaxWeight: row.pieceMaxWeight,
        pieceWeightUnit: row.pieceWeightUnit,
        pieceDisplayUnit: row.unit || undefined,
      });
      continue;
    }

    const nativeUnit = ing.defaultPortionUnit || row.unit;
    const converted = convertUnits(
      row.quantity,
      row.unit,
      nativeUnit,
      getIngredientConversions(ing, globalConversions, allIngredients),
    );
    if (converted == null) continue;
    neededByIngredient.set(row.ingredientId, {
      quantity: (current?.quantity ?? 0) + converted,
      matchMode: "quantity",
    });
  }

  const requirements: IngredientRequirement[] = [];

  for (const [ingredientId, needed] of neededByIngredient) {
    const neededQuantity = round(needed.quantity);
    if (neededQuantity <= 0) continue;
    const ing = ingredientMap.get(ingredientId);
    if (!ing) continue;
    const isWholePiece = needed.matchMode === "wholePiece";
    const unit = isWholePiece ? (needed.pieceDisplayUnit || "piece") : (ing.defaultPortionUnit || "");

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

      const itemIngredient = typeof item.ingredient === "object" ? item.ingredient : null;

      let groupKey: string;
      let displayName: string;

      if (isWholePiece) {
        // Real weight is what actually distinguishes one piece from
        // another here — purchase date/location/expiry don't, so two
        // steaks logged in the same pantry-add batch (same date/location)
        // still land in separate groups if they weigh differently, and the
        // resolve-sources picker can tell them apart. Converted into the
        // requirement's own weight unit first so e.g. "227g" and "0.227kg"
        // collapse into the same group rather than looking distinct.
        const weightUnit = needed.pieceWeightUnit || "g";
        const itemConversions = getIngredientConversions(
          ingredientMap.get(itemIngredientId) ?? ing,
          globalConversions,
          allIngredients,
        );
        const convertedWeight = convertUnits(
          item.quantityAvailable ?? 0,
          item.quantityUnit,
          weightUnit,
          itemConversions,
        );
        const weightLabel = convertedWeight != null
          ? `${Math.round(convertedWeight)} ${weightUnit}`
          : `${item.quantityAvailable} ${item.quantityUnit}`;
        groupKey = convertedWeight != null
          ? `${itemIngredientId}|${Math.round(convertedWeight)}${weightUnit}`
          : `${itemIngredientId}|raw:${item.quantityAvailable}${item.quantityUnit}`;
        displayName = `${itemIngredient?.name ?? ing.name} — ${weightLabel}`;
      } else {
        const expiryKey = item.expiryDate ? new Date(item.expiryDate).toISOString().slice(0, 10) : "none";
        const locationKey = extractId(item.storageLocation) || "none";
        const purchaseKey = item.purchaseDate ? new Date(item.purchaseDate).toISOString().slice(0, 10) : "none";
        groupKey = `${itemIngredientId}|${item.quantityUnit}|${expiryKey}|${locationKey}|${purchaseKey}`;
        displayName = itemIngredient?.name ?? ing.name;
      }

      let group = groupMap.get(groupKey);
      if (!group) {
        group = {
          members: [],
          displayName,
          expiryDate: item.expiryDate ?? null,
          ingredientId: itemIngredientId,
        };
        groupMap.set(groupKey, group);
      } else if (item.expiryDate && (!group.expiryDate || new Date(item.expiryDate) < new Date(group.expiryDate))) {
        // A wholePiece group can now span several purchase dates, so its
        // members' expiry dates can genuinely differ — keep the soonest
        // one so the group still sorts (and gets auto-drained) as if that
        // more time-sensitive stock existed, even though it truly doesn't
        // matter *which* particular member ends up consumed.
        group.expiryDate = item.expiryDate;
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

      if (isWholePiece) {
        // Count of members - never a weight sum - since an undersized and
        // an oversized piece don't add up to one usable whole piece even
        // if their combined weight would land in range.
        const qualifyingMembers = g.members.filter((m) =>
          pieceWeightInRange(
            m.quantityAvailable,
            m.quantityUnit,
            needed.pieceMinWeight ?? 0,
            needed.pieceMaxWeight ?? Infinity,
            needed.pieceWeightUnit || "g",
            conversions,
          ),
        );
        return {
          key,
          members: g.members,
          displayName: g.displayName,
          expiryDate: g.expiryDate,
          totalAvailable: qualifyingMembers.length,
          qualifyingMembers,
          conversions,
        };
      }

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

    requirements.push({
      ingredientId,
      ingredientName: ing.name,
      neededQuantity,
      unit,
      matchMode: needed.matchMode,
      pieceMinWeight: needed.pieceMinWeight,
      pieceMaxWeight: needed.pieceMaxWeight,
      pieceWeightUnit: needed.pieceWeightUnit,
      groups,
    });
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

// How many whole pieces a requirement still needs beyond what real pantry
// stock can cover — 0 for a quantity-mode requirement (a partial quantity
// shortfall there just silently deducts what's available, same as always;
// only wholePiece has a per-unit "which one" identity worth asking about).
export function wholePieceShortfall(req: IngredientRequirement): number {
  if (req.matchMode !== "wholePiece") return 0;
  const available = req.groups.reduce((sum, g) => sum + g.totalAvailable, 0);
  return Math.max(0, round(req.neededQuantity - available));
}

// Whether a requirement needs the user's input before confirming: either
// real ambiguity (more than one real pantry source to choose between), or
// — wholePiece only — an outright shortfall, where some or all of the
// needed pieces have nothing in pantry to auto-pick at all. The latter is
// what unlocks the resolve-sources modal's "not in my pantry, type the
// weight" fallback rather than silently leaving the gap unfulfilled.
export function requirementNeedsResolution(req: IngredientRequirement): boolean {
  return req.groups.length > 1 || wholePieceShortfall(req) > 0;
}

export function hasAmbiguity(requirements: IngredientRequirement[]): boolean {
  return requirements.some(requirementNeedsResolution);
}

// A wholePiece ingredient the user says they used but has no pantry item
// to back it — see manualPieceEntrySchema on the server. Kept separate
// from DeductionInstruction (which always refers to a real PantryItem)
// rather than folding it in as an optional field, since the two are never
// interchangeable — one subtracts from real stock, the other doesn't.
export interface ManualPieceInput {
  ingredientId: string;
  weight: number;
  unit: string;
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

// The "wholePiece" counterpart to drainGroups above - takes whole
// qualifying members (their *entire* quantityAvailable, never a fraction)
// in expiry order until neededQuantity (a piece count) is satisfied. A
// group's non-qualifying members (too small/too large for this line's
// range) are never touched, even if the group is otherwise drained -
// that's the whole point of this mode over drainGroups' numeric split.
function drainWholePieceGroups(
  groups: PantryGroup[],
  neededQuantity: number,
): DeductionInstruction[] {
  const instructions: DeductionInstruction[] = [];
  let remaining = neededQuantity;

  for (const group of groups) {
    if (remaining <= 0) break;
    for (const member of group.qualifyingMembers ?? []) {
      if (remaining <= 0) break;
      instructions.push({ pantryItemId: member.pantryItemId, amount: round(member.quantityAvailable) });
      remaining -= 1;
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

// One requirement's own drain, whichever mode it's in - shared by both the
// fully-automatic plan and the manual-selection path below.
function drainRequirement(req: IngredientRequirement, groups: PantryGroup[]): DeductionInstruction[] {
  return req.matchMode === "wholePiece"
    ? drainWholePieceGroups(groups, req.neededQuantity)
    : drainGroups(groups, req.neededQuantity, req.unit);
}

// The fully-automatic plan — every requirement drained in expiry order, no
// user choice involved. Used directly when nothing is ambiguous.
export function getDefaultDeductionInstructions(
  requirements: IngredientRequirement[],
): DeductionInstruction[] {
  const all: DeductionInstruction[] = [];
  for (const req of requirements) {
    all.push(...drainRequirement(req, req.groups));
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
      all.push(...drainRequirement(req, req.groups));
      continue;
    }

    const orderedGroups = pickedKeys
      .map((key) => req.groups.find((g) => g.key === key))
      .filter((g): g is PantryGroup => !!g);
    all.push(...drainRequirement(req, orderedGroups));
  }

  return mergeInstructions(all);
}
