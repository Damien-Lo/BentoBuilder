import { Platform, useWindowDimensions } from "react-native";

// At or above this width the browser gets the desktop layout (a sidebar and
// a content pane); below it, and on phones, the app is laid out as on a phone.
export const WIDE_WEB_MIN_WIDTH = 900;

// True in a browser window wide enough for the desktop layout.
export function useWideWeb(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= WIDE_WEB_MIN_WIDTH;
}
