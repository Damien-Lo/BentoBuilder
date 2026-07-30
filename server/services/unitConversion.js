// Mirrors mobile/src/utils/unitConversion.ts — kept in sync manually since
// the mobile app and server don't share a package.
const MASS_BASE_G = {
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

const VOLUME_BASE_ML = {
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  millilitre: 1,
  millilitres: 1,
  l: 1000,
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

const BUILT_IN_FAMILIES = [MASS_BASE_G, VOLUME_BASE_ML];

function normalizeUnit(unit) {
  return String(unit || "").trim().toLowerCase();
}

function builtInFactorToBase(unit) {
  const normalized = normalizeUnit(unit);
  for (const family of BUILT_IN_FAMILIES) {
    if (normalized in family) {
      return { family, factor: family[normalized] };
    }
  }
  return null;
}

/**
 * Converts an amount from one unit to another. Returns null when the units
 * aren't convertible. `customConversions` is an array of
 * { unit, baseUnit, factor } meaning "1 unit = factor baseUnit".
 */
export function convertUnits(amount, fromUnit, toUnit, customConversions = []) {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);

  if (!from || !to) return null;
  if (from === to) return amount;

  const fromBuiltIn = builtInFactorToBase(fromUnit);
  const toBuiltIn = builtInFactorToBase(toUnit);
  if (fromBuiltIn && toBuiltIn && fromBuiltIn.family === toBuiltIn.family) {
    return (amount * fromBuiltIn.factor) / toBuiltIn.factor;
  }

  for (const custom of customConversions) {
    const customUnit = normalizeUnit(custom.unit);
    const customBase = normalizeUnit(custom.baseUnit);

    if (customUnit === from && customBase === to) {
      return amount * custom.factor;
    }
    if (customUnit === to && customBase === from) {
      return amount / custom.factor;
    }
    if (customUnit === from) {
      const viaBase = convertUnits(amount * custom.factor, custom.baseUnit, toUnit, customConversions);
      if (viaBase != null) return viaBase;
    }
    if (customBase === from) {
      const inCustomUnit = amount / custom.factor;
      const viaBase = convertUnits(inCustomUnit, custom.unit, toUnit, customConversions);
      if (viaBase != null) return viaBase;
    }
  }

  return null;
}

/**
 * Sums amounts recorded in different units into one target unit, skipping
 * whatever isn't convertible.
 */
export function convertibleTotal(amountsByUnit, targetUnit, customConversions = []) {
  let total = 0;
  for (const [unit, amount] of Object.entries(amountsByUnit)) {
    const converted = convertUnits(amount, unit, targetUnit, customConversions);
    if (converted != null) total += converted;
  }
  return total;
}

/**
 * The conversion list to actually use for one ingredient — its own entries
 * first (most specific), then its genericParent's (if it has one and
 * `genericParent` is populated with its own unitConversions), then the
 * global UserProfile list as a last-resort fallback. `convertUnits` doesn't
 * need to know about this layering at all — it just gets handed the merged
 * array and searches it in order, so a match on the ingredient's own entry
 * is found (and returned) before a same-pair global entry ever gets tried.
 */
export function getIngredientConversions(ingredient, globalConversions = []) {
  if (!ingredient) return globalConversions;

  const own = ingredient.unitConversions ?? [];
  const parent =
    ingredient.genericParent && typeof ingredient.genericParent === "object"
      ? ingredient.genericParent
      : null;
  const generic = parent?.unitConversions ?? [];

  return [...own, ...generic, ...globalConversions];
}
