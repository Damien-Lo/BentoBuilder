// Hand-off for "I just added a restaurant from the planner's add-to-plan
// flow, now open its dish-picker so logging today's visit is one continuous
// action instead of two separate trips." Same reasoning and "take"
// (read-and-clear) semantics as receiptReviewStore's pendingReceipt —
// restaurants/add.tsx and the planner are separate routes, and a
// module-level holder is simpler than wiring up context/global state for
// this one-shot hand-off. The planner's own add-to-plan state
// (slot/date/status) is untouched by the round trip - only the restaurant
// itself needs to cross the gap. (It's the public restaurant now: a new one,
// or the one already in Orbit that was picked instead of adding it twice.
// Its menu is fetched with getRestaurant.)
import type { Restaurant } from "@/src/services/restaurantApi";

let pendingNewRestaurant: Restaurant | null = null;

export function setPendingNewRestaurant(restaurant: Restaurant): void {
  pendingNewRestaurant = restaurant;
}

export function takePendingNewRestaurant(): Restaurant | null {
  const result = pendingNewRestaurant;
  pendingNewRestaurant = null;
  return result;
}
