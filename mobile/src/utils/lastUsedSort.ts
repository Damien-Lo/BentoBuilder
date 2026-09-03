// Shared sort helpers for the four plannable types (Meal, Recipe,
// Ingredient, RestaurantMeal) — browse views sort by most-recently-used-
// in-the-planner first, while active-search views stay alphabetical (see
// getLastUsedMap in mealPlanApi.ts for where the "last used" dates come
// from). Generic over the item shape since each type's id/name fields live
// in different places.

export function sortByLastUsed<T>(
  items: T[],
  lastUsed: Record<string, string>,
  getId: (item: T) => string,
  getName: (item: T) => string,
): T[] {
  return [...items].sort((a, b) => {
    const dateA = lastUsed[getId(a)];
    const dateB = lastUsed[getId(b)];
    if (dateA && dateB) return dateB.localeCompare(dateA); // both used — most recent first
    if (dateA) return -1; // only a has been used — a comes first
    if (dateB) return 1; // only b has been used — b comes first
    return getName(a).localeCompare(getName(b)); // neither used — alphabetical
  });
}

export function sortAlphabetically<T>(items: T[], getName: (item: T) => string): T[] {
  return [...items].sort((a, b) => getName(a).localeCompare(getName(b)));
}
