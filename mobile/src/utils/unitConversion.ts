// Built-in conversions, grouped by family. Each unit maps to how many of the
// family's base unit it equals (mass -> grams, volume -> millilitres).
// Keys are matched case-insensitively.
const MASS_BASE_G: Record<string, number> = {
  mg: 0.001,
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
};

const VOLUME_BASE_ML: Record<string, number> = {
  ml: 1,
  mL: 1,
  milliliter: 1,
  milliliters: 1,
  millilitre: 1,
  millilitres: 1,
  l: 1000,
  L: 1000,
  liter: 1000,
  liters: 1000,
  litre: 1000,
  litres: 1000,
  tsp: 4.92892,
  teaspoon: 4.92892,
  teaspoons: 4.92892,
  tbsp: 14.7868,
  tablespoon: 14.7868,
  tablespoons: 14.7868,
  cup: 236.588,
  cups: 236.588,
  "fl oz": 29.5735,
  "fluid ounce": 29.5735,
  "fluid ounces": 29.5735,
  pint: 473.176,
  pints: 473.176,
  quart: 946.353,
  quarts: 946.353,
  gallon: 3785.41,
  gallons: 3785.41,
};

const BUILT_IN_FAMILIES: Record<string, number>[] = [MASS_BASE_G, VOLUME_BASE_ML];

// Curated display lists for unit pickers — the alias maps above have several
// spellings per unit (gram/grams/g) which would look redundant in a dropdown.
export const MASS_UNIT_FAMILY = ["mg", "g", "kg", "oz", "lb"];
export const VOLUME_UNIT_FAMILY = ["mL", "L", "tsp", "tbsp", "cup", "fl oz", "pint", "quart", "gallon"];

export interface CustomUnitConversion {
  unit: string;
  baseUnit: string;
  factor: number;
}

function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase();
}

function builtInFactorToBase(unit: string): { family: Record<string, number>; factor: number } | null {
  const normalized = normalizeUnit(unit);
  for (const family of BUILT_IN_FAMILIES) {
    const match = Object.keys(family).find((k) => k.toLowerCase() === normalized);
    if (match) {
      return { family, factor: family[match] };
    }
  }
  return null;
}

/**
 * Converts an amount from one unit to another. Returns null when the units
 * aren't convertible (different families, or no known/custom conversion).
 * Custom conversions are one level deep: `unit` -> `factor` of `baseUnit`.
 */
export function convertUnits(
  amount: number,
  fromUnit: string,
  toUnit: string,
  customConversions: CustomUnitConversion[] = [],
  // Internal — normalized "from" units already tried in this chain. A custom
  // conversion can bridge back to a unit already visited (e.g. a "g <-> cup"
  // density entry: g -> cup -> g -> cup -> ...) once neither side reaches
  // `toUnit` directly, which without this guard recurses forever instead of
  // correctly reporting "not convertible".
  visited: Set<string> = new Set(),
): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);

  if (!from || !to) return null;
  if (from === to) return amount;
  if (visited.has(from)) return null;

  // Built-in: same family (mass or volume) converts via each unit's factor
  // to the family's base unit.
  const fromBuiltIn = builtInFactorToBase(fromUnit);
  const toBuiltIn = builtInFactorToBase(toUnit);
  if (fromBuiltIn && toBuiltIn && fromBuiltIn.family === toBuiltIn.family) {
    return (amount * fromBuiltIn.factor) / toBuiltIn.factor;
  }

  const nextVisited = new Set(visited);
  nextVisited.add(from);

  // Custom: user-defined "1 unit = factor baseUnit" entries. Try direct and
  // reverse direction, and chain through a built-in base if needed.
  for (const custom of customConversions) {
    const customUnit = normalizeUnit(custom.unit);
    const customBase = normalizeUnit(custom.baseUnit);

    if (customUnit === from && customBase === to) {
      return amount * custom.factor;
    }
    if (customUnit === to && customBase === from) {
      return amount / custom.factor;
    }

    // e.g. custom "packet -> g", converting packet -> kg: go via g.
    if (customUnit === from) {
      const viaBase = convertUnits(amount * custom.factor, custom.baseUnit, toUnit, customConversions, nextVisited);
      if (viaBase != null) return viaBase;
    }
    if (customBase === from) {
      const inCustomUnit = amount / custom.factor;
      const viaBase = convertUnits(inCustomUnit, custom.unit, toUnit, customConversions, nextVisited);
      if (viaBase != null) return viaBase;
    }
  }

  return null;
}

/**
 * The single rule for "the unit on this field just changed — should the
 * number change too?" used everywhere a quantity+unit pair is edited in
 * place (pantry entries, ingredient serving sizes, recipe ingredient rows):
 * rescale to the equivalent value when the new unit is a convertible match,
 * otherwise return null and leave the typed number untouched.
 */
export function convertAmountForUnitChange(
  amount: number,
  oldUnit: string,
  newUnit: string,
  customConversions: CustomUnitConversion[] = [],
): number | null {
  if (!oldUnit || newUnit === oldUnit || !Number.isFinite(amount)) return null;
  const converted = convertUnits(amount, oldUnit, newUnit, customConversions);
  return converted != null ? Math.round(converted * 1000) / 1000 : null;
}

export function isConvertible(
  fromUnit: string,
  toUnit: string,
  customConversions: CustomUnitConversion[] = [],
): boolean {
  return convertUnits(1, fromUnit, toUnit, customConversions) != null;
}

/**
 * Sums amounts recorded in different units into one target unit, skipping
 * whatever isn't convertible. Used to compare stock recorded in mixed units
 * (e.g. some soy sauce in mL, some in cups) against a single requested unit.
 */
export function convertibleTotal(
  amountsByUnit: Record<string, number>,
  targetUnit: string,
  customConversions: CustomUnitConversion[] = [],
): number {
  let total = 0;
  for (const [unit, amount] of Object.entries(amountsByUnit)) {
    const converted = convertUnits(amount, unit, targetUnit, customConversions);
    if (converted != null) total += converted;
  }
  return total;
}

/**
 * Every unit a given unit can be entered as instead — its built-in family
 * (mass or volume) plus any custom conversion directly linked to it. Always
 * includes the unit itself. Returns just `[unit]` when nothing else applies.
 */
export function getRelatedUnits(
  unit: string,
  customConversions: CustomUnitConversion[] = [],
): string[] {
  const trimmed = unit.trim();
  if (!trimmed) return [];

  const normalized = normalizeUnit(trimmed);
  const related = new Set<string>([trimmed]);

  const builtIn = builtInFactorToBase(trimmed);
  if (builtIn) {
    const family = builtIn.family === MASS_BASE_G ? MASS_UNIT_FAMILY : VOLUME_UNIT_FAMILY;
    family.forEach((u) => related.add(u));
  }

  for (const custom of customConversions) {
    if (normalizeUnit(custom.unit) === normalized) related.add(custom.baseUnit);
    if (normalizeUnit(custom.baseUnit) === normalized) related.add(custom.unit);
  }

  return Array.from(related);
}

// Structural rather than the concrete Ingredient type — this app has more
// than one Ingredient shape floating around (recipeApi's PopulatedIngredient,
// types/pantry's Ingredient, etc.), and every one of them at least has these.
export interface ConversionSource {
  _id?: string;
  unitConversions?: CustomUnitConversion[];
  genericParent?: string | (ConversionSource & { _id?: string }) | null;
}

/**
 * The conversion list to actually use for one ingredient — its own entries
 * first (most specific, e.g. "this particular peanut butter is denser"),
 * then its genericParent's (e.g. "peanut butter is generally ~16g/tbsp"),
 * then the app-wide list as a last-resort fallback for anything that isn't
 * really density-dependent. `convertUnits` doesn't need to know about this
 * layering — it just searches whatever array it's handed in order, so a
 * match on the ingredient's own entry is found before a same-pair global
 * entry would ever be tried.
 *
 * `allIngredients` is only needed when `genericParent` is an unpopulated id
 * string rather than the populated object — pass the already-loaded
 * ingredient list so the parent's own conversions can be looked up.
 */
export function getIngredientConversions(
  ingredient: ConversionSource | null | undefined,
  globalConversions: CustomUnitConversion[] = [],
  allIngredients: ConversionSource[] = [],
): CustomUnitConversion[] {
  if (!ingredient) return globalConversions;

  const own = ingredient.unitConversions ?? [];

  let generic: CustomUnitConversion[] = [];
  const parentRef = ingredient.genericParent;
  if (parentRef) {
    if (typeof parentRef === "object" && parentRef.unitConversions) {
      generic = parentRef.unitConversions;
    } else {
      const parentId = typeof parentRef === "string" ? parentRef : parentRef._id;
      const found = allIngredients.find((i) => i._id === parentId);
      generic = found?.unitConversions ?? [];
    }
  }

  return [...own, ...generic, ...globalConversions];
}
