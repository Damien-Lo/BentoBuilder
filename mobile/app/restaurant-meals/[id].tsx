import { Redirect } from "expo-router";

// (Restaurants are public now, and an old restaurant meal's id isn't a
// restaurant's: to the list of them, app/restaurants.)
export default function OldRestaurantMeal() {
  return <Redirect href="/restaurants" />;
}
