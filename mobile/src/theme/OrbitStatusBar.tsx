import { usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { useOrbitTheme } from "@/src/theme/orbit";

// The pages redesigned in Orbit's look, which go dark in dark mode: these
// paths exactly, and everything under the prefixes (a recipe's page is
// "/recipes/<its id>").
const ORBIT_PAGES = new Set(["/", "/plan", "/planner", "/grocery-list", "/menu", "/RecipesMainPage", "/PantryMainPage"]);
const ORBIT_PREFIXES = ["/kitchen/", "/recipes/", "/pantry/", "/ingredients/", "/meals/", "/restaurant-meals", "/receipts"];

// The phone's clock and battery, readable over the page showing: light over
// a redesigned page in dark mode, dark over everything else — the pages not
// redesigned yet stay light whatever the setting. (Follows the Appearance
// setting, not just the phone's.) Add a page here once it's redesigned.
export function OrbitStatusBar() {
  const { dark } = useOrbitTheme();
  const path = usePathname();
  const orbit = ORBIT_PAGES.has(path) || ORBIT_PREFIXES.some((prefix) => path.startsWith(prefix));
  return <StatusBar style={dark && orbit ? "light" : "dark"} />;
}
