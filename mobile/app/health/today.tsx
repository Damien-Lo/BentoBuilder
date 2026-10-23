import { Redirect } from "expo-router";

import { NutritionToday } from "@/src/components/health/NutritionToday";
import { useWideWeb } from "@/src/utils/useWideWeb";

// Health → Nutrition today (see NutritionToday). In a desktop browser,
// Nutrition's review page (/health) has it all, so this goes there.
export default function NutritionTodayScreen() {
  const wide = useWideWeb();
  return wide ? <Redirect href="/health" /> : <NutritionToday />;
}
