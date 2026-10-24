import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import LibraryDish from "../models/LibraryDish.js";

// The dish library (models/LibraryDish.js): USDA's restaurant-style survey
// dishes, from data/usda-dishes. Run each time the server connects to a
// database: what's missing is added (by USDA id), nothing already there
// changed.

const LIBRARY = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "usda-dishes", "dishes.json");

export async function ensureDishLibrary() {
  const dishes = JSON.parse(fs.readFileSync(LIBRARY, "utf8"));
  const have = new Set(await LibraryDish.distinct("fdcId"));
  const missing = dishes.filter((dish) => !have.has(dish.fdcId));
  if (!missing.length) return { added: 0, total: dishes.length };
  // (Every dish or none: one that doesn't fit the model is an error in the
  // data file, not something to skip quietly.)
  await LibraryDish.insertMany(missing, { ordered: false, throwOnValidationError: true });
  return { added: missing.length, total: dishes.length };
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The library's dishes by name and aliases — each word matching the start of
// a word, plural or not ("pho", "dumplings") — names starting with what was
// typed first (as a whole word first), then shorter names.
export async function searchDishes(query, { limit = 30 } = {}) {
  const q = String(query ?? "").trim().toLowerCase();
  if (q.length < 2) return [];
  const stems = q
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((word) => (word.length < 4 || word.endsWith("ss") ? word : word.endsWith("ies") ? word.slice(0, -3) : word.endsWith("oes") ? word.slice(0, -2) : word.endsWith("s") ? word.slice(0, -1) : word));
  const each = stems.map((stem) => {
    const start = new RegExp(`(^|[^a-z])${escapeRegex(stem)}`, "i");
    return { $or: [{ name: start }, { aliases: start }] };
  });
  const found = await LibraryDish.find({ $and: each }).limit(400).lean();
  const typed = stems.join(" ");
  const whole = new RegExp(`^${escapeRegex(typed)}(e?s)?($|[^a-z])`, "i");
  const rank = (dish) => {
    const name = dish.name.toLowerCase();
    return [whole.test(name) ? 0 : name.startsWith(typed) ? 1 : name.startsWith(stems[0]) ? 2 : 3, name.length];
  };
  return found
    .sort((a, b) => {
      const [x, y] = [rank(a), rank(b)];
      return x[0] - y[0] || x[1] - y[1] || a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

// A library dish's nutrition at a size: `amount` of one of its units (or of
// grams), from its per-100 g figures.
export function dishNutrition(dish, amount, unit) {
  const grams = unit === "g" ? amount : amount * (dish.units.find((u) => u.unit === unit)?.grams ?? NaN);
  if (!Number.isFinite(grams)) return null;
  const nutrition = {};
  for (const [field, per100] of Object.entries(dish.per100g ?? {})) {
    if (per100 == null) continue;
    const value = (per100 * grams) / 100;
    nutrition[field] = Math.round(value * (value >= 10 ? 10 : value >= 1 ? 100 : 1000)) / (value >= 10 ? 10 : value >= 1 ? 100 : 1000);
  }
  return { grams, nutrition };
}
