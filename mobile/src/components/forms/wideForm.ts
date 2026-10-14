import type { ViewStyle } from "react-native";

import { useWideWeb } from "@/src/utils/useWideWeb";

// A form page in a desktop browser: the same cards as on the phone, set out
// in two columns at a page's width with the buttons at a button's size.
// On a phone, or in a narrow window, every style here is undefined and the
// page is laid out as it always was.
export function useWideForm(): { wide: boolean; page?: ViewStyle; columns?: ViewStyle; column?: ViewStyle; actions?: ViewStyle } {
  const wide = useWideWeb();
  if (!wide) return { wide };
  return {
    wide,
    page: { width: "100%", maxWidth: 1080, alignSelf: "center" },
    columns: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
    column: { flex: 1, minWidth: 0 },
    actions: { width: 320, alignSelf: "flex-end" },
  };
}
