// Hand-off for "I just created a brand-new restaurant from the planner's
// add-to-plan flow, now open its dish-picker so logging today's visit is
// one continuous action instead of two separate trips." Same reasoning
// and "take" (read-and-clear) semantics as receiptReviewStore's
// pendingReceipt — restaurant-meals/add.tsx and the planner are separate
// routes, and a module-level holder is simpler than wiring up
// context/global state for this one-shot hand-off. The planner's own
// add-to-plan state (slot/date/status) is untouched by the round trip -
// only the newly-created restaurant itself needs to cross the gap.
import type { RestaurantMeal } from "@/src/services/restaurantMealApi";

let pendingNewRestaurant: RestaurantMeal | null = null;

export function setPendingNewRestaurant(restaurant: RestaurantMeal): void {
  pendingNewRestaurant = restaurant;
}

export function takePendingNewRestaurant(): RestaurantMeal | null {
  const result = pendingNewRestaurant;
  pendingNewRestaurant = null;
  return result;
}
