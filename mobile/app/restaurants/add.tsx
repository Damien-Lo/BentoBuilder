import { useLocalSearchParams } from "expo-router";

import { RestaurantForm } from "@/src/components/restaurants/RestaurantForm";
import { OrbitSection } from "@/src/theme/orbit";

// Adding a restaurant to Orbit (Kitchen → Restaurants, or the planner's
// add-to-plan flow with ?from=planner, which gets it handed back for its
// dish-picker). In the Kitchen's colours; in a desktop browser, two columns.
export default function AddRestaurantPage() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  return (
    <OrbitSection section="kitchen">
      <RestaurantForm fromPlanner={from === "planner"} />
    </OrbitSection>
  );
}
