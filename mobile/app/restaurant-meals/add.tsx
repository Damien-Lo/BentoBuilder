import { Redirect, useLocalSearchParams } from "expo-router";

// (Restaurants are public now: adding one is app/restaurants/add — the
// planner's ?from=planner hand-off kept.)
export default function OldAddRestaurantMeal() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  return <Redirect href={from === "planner" ? { pathname: "/restaurants/add", params: { from: "planner" } } : "/restaurants/add"} />;
}
