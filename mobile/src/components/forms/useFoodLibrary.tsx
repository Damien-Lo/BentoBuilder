import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";

import { saveIngredient, searchIngredients, type Ingredient } from "@/src/services/ingredientApi";
import { useOrbitPage } from "@/src/theme/orbit";

import { useDebouncedSearch } from "./useDebouncedSearch";

// The food library in the ingredient pickers. Their own list (from
// getIngredients) holds only the library foods one has saved or uses; the
// rest are found by searching, and one picked is saved into one's own list
// and added to the screen's ingredients (which it looks the choice up in)
// before it's selected.

// The library foods searchIngredients finds that one's list doesn't have
// (everything else it finds is in getIngredients already).
async function searchLibrary(query: string): Promise<Ingredient[]> {
  const results = await searchIngredients(query);
  return results.filter((ingredient) => ingredient.source === "usda" && !ingredient.saved);
}

// A picked library food saved into one's own list — or, if that fails, said
// so and thrown.
export async function addLibraryFood(ingredient: Ingredient): Promise<Ingredient> {
  try {
    await saveIngredient(ingredient._id);
  } catch (error) {
    Alert.alert("Couldn't add it", error instanceof Error ? error.message : "Try again in a moment.");
    throw error;
  }
  // (The search's copy, which has its category filled in; the save's answer
  // has only its id.)
  return { ...ingredient, saved: true };
}

// A library food's second line: USDA's own description, or its category.
export function libraryFoodDetail(ingredient: Ingredient | undefined): string | null {
  const category = ingredient?.category && typeof ingredient.category === "object" ? ingredient.category.name : null;
  return ingredient?.sourceName || category || null;
}

// For a SearchableObjectDropdown: spread what this returns onto it, and
// typing also finds the library. A food picked there is saved, handed to
// onAdded (to add to the screen's options) and then selected as usual.
// toOption turns an ingredient into the screen's option shape (the identity
// for a screen whose options are plain ingredients).
export function useFoodLibrary<T extends { _id: string; name: string }>(
  toOption: (ingredient: Ingredient) => T,
  onAdded: (option: T, ingredient: Ingredient) => void,
) {
  // The library foods the last searches found, by id — for the subtitle
  // and for handing the whole ingredient on.
  const found = useRef(new Map<string, Ingredient>());
  const latest = useRef({ toOption, onAdded });
  latest.current = { toOption, onAdded };
  const o = useOrbitPage();

  const searchMore = useCallback(async (query: string): Promise<T[]> => {
    const fresh = await searchLibrary(query);
    for (const ingredient of fresh) found.current.set(ingredient._id, ingredient);
    return fresh.map((ingredient) => latest.current.toOption(ingredient));
  }, []);

  const onPickMore = useCallback(async (option: T): Promise<T> => {
    const ingredient = await addLibraryFood(found.current.get(option._id) ?? { _id: option._id, name: option.name });
    const added = latest.current.toOption(ingredient);
    latest.current.onAdded(added, ingredient);
    return added;
  }, []);

  const renderMoreSubtitle = useCallback(
    (option: T): ReactNode => {
      const line = libraryFoodDetail(found.current.get(option._id));
      return line ? (
        <Text className="mt-0.5 text-xs text-slate-500" style={o ? { color: o.muted } : undefined} numberOfLines={1}>
          {line}
        </Text>
      ) : null;
    },
    [o],
  );

  return useMemo(() => ({ searchMore, onPickMore, renderMoreSubtitle }), [searchMore, onPickMore, renderMoreSubtitle]);
}

// For a screen with its own list instead of the dropdown: the library foods
// matching `query` that aren't among `known` (the screen's ingredients),
// searched a moment after typing stops, from two letters.
export function useLibraryMatches(query: string, known: readonly { _id: string }[], enabled = true) {
  const { found, searching } = useDebouncedSearch(searchLibrary, query, enabled);
  const matches = useMemo(() => {
    const ids = new Set(known.map((item) => item._id));
    return found.filter((ingredient) => !ids.has(ingredient._id));
  }, [found, known]);
  return { matches, searching };
}

// The small heading over library matches in such a list (with a spinner
// while searching).
export function FoodLibraryHeading({ searching = false, className = "" }: { searching?: boolean; className?: string }) {
  const o = useOrbitPage();
  return (
    <View className={`flex-row items-center ${className}`}>
      <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500" style={o ? { color: o.muted } : undefined}>
        From the food library
      </Text>
      {searching && <ActivityIndicator size="small" color={o?.muted ?? "#64748B"} style={{ marginLeft: 8, transform: [{ scale: 0.7 }] }} />}
    </View>
  );
}

// The usual onAdded: the new one onto the end of a list, unless it's there
// already — setList(addIngredientTo(option)).
export function addIngredientTo<T extends { _id: string }>(option: T) {
  return (prev: T[]) => (prev.some((item) => item._id === option._id) ? prev : [...prev, option]);
}
