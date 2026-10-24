import { Redirect } from "expo-router";

// (Restaurants are public now: their list is app/restaurants.)
export default function OldRestaurantMealsList() {
  return <Redirect href="/restaurants" />;
}
