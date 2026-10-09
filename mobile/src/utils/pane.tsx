import { createContext, useContext } from "react";
import { useWindowDimensions } from "react-native";

// The size of the area a screen is actually drawn in. On a phone that's the
// window. In the browser's desktop layout the screens sit in a pane beside
// the sidebar, so anything that sizes itself by width (the calendar's day
// columns, the planner's swipeable cards) must use this, not the window.
export const PaneContext = createContext<{ width: number; height: number } | null>(null);

export function usePaneDimensions(): { width: number; height: number } {
  const window = useWindowDimensions();
  const pane = useContext(PaneContext);
  return pane ?? { width: window.width, height: window.height };
}
