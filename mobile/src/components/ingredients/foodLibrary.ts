import { useEffect, useState } from "react";

import {
  getIngredientByBarcode,
  saveIngredient,
  searchIngredients,
  unsaveIngredient,
  type Ingredient,
} from "@/src/services/ingredientApi";
import { barcodesMatch } from "@/src/utils/barcode";

// Your ingredients and the food library, the way Gym has your exercises and
// its library: the Kitchen's ingredient lists show only what's in your list
// (`saved`), a search reaches the rest, and ✓ / + takes one out or puts it
// in. getIngredients still brings everything one's recipes, meals and
// pantry point at, so only what's displayed as "your ingredients" filters.

// In your list: your own always; a shared one once saved.
export const inMyIngredients = (ingredient: Ingredient) => ingredient.saved !== false;

// Shared (from the food library or the catalog) rather than your own: it has
// no owner. (The server sends `owner`; the app's type doesn't name it.)
export const isSharedIngredient = (ingredient: Ingredient) =>
  (ingredient as Ingredient & { owner?: unknown }).owner == null;

// In your list for good, so its ✓ can't be taken off: your own, and for the
// admin the shared catalog (theirs; the food library they save like anyone).
export function alwaysInMyIngredients(ingredient: Ingredient, isAdmin: boolean) {
  return !isSharedIngredient(ingredient) || (isAdmin && ingredient.source !== "usda");
}

// Saved from the library rather than made: a food library food, or a shared
// catalog one (for the admin, whose catalog it is, only the library's) —
// tagged "Library" wherever it's listed. An edit makes your own copy, untagged.
export function fromLibrary(ingredient: Ingredient, isAdmin: boolean) {
  return ingredient.source === "usda" || !alwaysInMyIngredients(ingredient, isAdmin);
}

// The Library tag's colours, light / dark.
export const libraryTagColors = (dark: boolean) => ({
  backgroundColor: dark ? "rgba(52,211,153,0.14)" : "#ECFDF5",
  color: dark ? "#6EE7B7" : "#047857",
});

// Into your list or out of it — the ingredient as the server now has it.
export function setIngredientSaved(ingredient: Ingredient, saved: boolean) {
  return saved ? saveIngredient(ingredient._id) : unsaveIngredient(ingredient._id);
}

// A list with this ingredient saved or not: the one already there changed
// (keeping what it had, populated names and all), or this one added.
export function withSaved(list: Ingredient[], ingredient: Ingredient, saved: boolean): Ingredient[] {
  return list.some((i) => i._id === ingredient._id)
    ? list.map((i) => (i._id === ingredient._id ? { ...i, saved } : i))
    : [...list, { ...ingredient, saved }];
}

// The whole library searched as one types (a moment after the last key):
// null until two letters are typed.
export function useIngredientLibrarySearch(query: string, delay = 300) {
  const [results, setResults] = useState<Ingredient[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchIngredients(q)
        .then((found) => {
          if (!cancelled) setResults(found);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, delay]);

  return { results, setResults, loading };
}

// The ingredient with this barcode: from the list when it's there (your own
// first), else from the server, which holds every shared product (the list
// doesn't) and matches the same product number as UPC-A (12 digits) or
// EAN-13 (13). Null when nothing has it, or the server can't be reached.
export async function findIngredientByBarcode(list: Ingredient[], barcode: string): Promise<Ingredient | null> {
  const local = list.filter((i) => barcodesMatch(i.barcode, barcode));
  const mine = local.find((i) => !isSharedIngredient(i)) ?? local[0];
  if (mine) return mine;

  try {
    return await getIngredientByBarcode(barcode);
  } catch (error) {
    console.error("Barcode lookup failed:", error);
    return null;
  }
}
