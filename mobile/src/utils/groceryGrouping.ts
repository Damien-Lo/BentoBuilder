// Groups grocery items by a live-derived "likely store" for Shopping Mode —
// no persisted per-ingredient store field exists anywhere in this app, so
// this reuses the same purchase-history heuristic already used to prefill
// the log-to-pantry modal's store field (suggestStore, in pantryDefaults.ts)
// rather than inventing a second one.

import type { GroceryItem } from "@/src/services/groceryListApi";
import type { PantryItem } from "@/src/types/pantry";
import { recentPantryEntries, referenceId, suggestStore } from "@/src/utils/pantryDefaults";

export interface StoreGroup {
  storeId: string; // "" for the fallback group
  storeName: string;
  items: GroceryItem[];
}

const UNKNOWN_STORE_NAME = "Unknown store";

export function groupGroceryItemsByStore(
  items: GroceryItem[],
  pantryItems: PantryItem[],
): StoreGroup[] {
  const groups = new Map<string, StoreGroup>();

  for (const item of items) {
    const ingredientId = referenceId(item.ingredient);
    const history = ingredientId
      ? recentPantryEntries(pantryItems.filter((p) => referenceId(p.ingredient) === ingredientId))
      : [];
    const suggested = ingredientId ? suggestStore(history) : null;

    const key = suggested?.id ?? "";
    const name = suggested?.name ?? UNKNOWN_STORE_NAME;

    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, { storeId: key, storeName: name, items: [item] });
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (!a.storeId) return 1;
    if (!b.storeId) return -1;
    return a.storeName.localeCompare(b.storeName);
  });
}
