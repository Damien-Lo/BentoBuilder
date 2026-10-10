import { useSyncExternalStore } from "react";

import { getWebThemeChoice, isDark, subscribeWebTheme, type WebThemeChoice } from "./engine";

export { setWebThemeChoice, themeColor, type WebThemeChoice } from "./engine";

// The browser's theme: what was chosen (light, dark, or whatever the
// system is set to) and whether that comes out dark right now. How the
// dark theme is made is in ./engine.
export function useWebTheme(): { choice: WebThemeChoice; dark: boolean } {
  const choice = useSyncExternalStore(subscribeWebTheme, getWebThemeChoice, getWebThemeChoice);
  const dark = useSyncExternalStore(subscribeWebTheme, isDark, isDark);
  return { choice, dark };
}
