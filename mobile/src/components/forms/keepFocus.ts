import { Platform } from "react-native";

// For a list that opens under a text field and closes when the field loses
// focus. In a browser the field loses focus on mouse-down — before the click
// reaches the option, which by then is gone, so nothing is picked. Spread
// onto the list's container, this stops a press inside it from taking the
// focus away. (A touch on a phone doesn't blur the field first, and needs
// nothing.)
export const keepFocus: object = Platform.OS === "web" ? { onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault() } : {};
