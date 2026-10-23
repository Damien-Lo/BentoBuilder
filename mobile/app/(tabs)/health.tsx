import { Redirect } from "expo-router";

import { WebNutritionScreen } from "@/src/components/health/web/WebNutritionScreen";
import { OrbitSection } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// Nutrition: in a desktop browser, its review page, in Health's colour
// (not the Kitchen's, whose tabs this sits among). On a phone it's a
// page of Health's (/health/today — NutritionToday), so this goes there.
export default function NutritionScreen() {
  const wide = useWideWeb();
  return wide ? (
    <OrbitSection section="health">
      <WebNutritionScreen />
    </OrbitSection>
  ) : (
    <Redirect href="/health/today" />
  );
}
