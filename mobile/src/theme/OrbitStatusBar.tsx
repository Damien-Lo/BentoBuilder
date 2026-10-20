import { usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { useOrbitTheme } from "@/src/theme/orbit";

// The pages redesigned in Orbit's look, which go dark in dark mode.
const ORBIT_PAGES = new Set(["/", "/plan", "/planner", "/grocery-list", "/menu", "/kitchen/needs"]);

// The phone's clock and battery, readable over the page showing: light over
// a redesigned page in dark mode, dark over everything else — the pages not
// redesigned yet stay light whatever the setting. (Follows the Appearance
// setting, not just the phone's.) Add a page here once it's redesigned.
export function OrbitStatusBar() {
  const { dark } = useOrbitTheme();
  const path = usePathname();
  return <StatusBar style={dark && ORBIT_PAGES.has(path) ? "light" : "dark"} />;
}
