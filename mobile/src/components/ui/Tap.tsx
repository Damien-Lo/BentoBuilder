import { useState, type ReactNode } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

// A pressable with its look given as a plain style, and how it looks while
// held as another (`pressedStyle`, a light fade if none). Use it rather than
// Pressable's style function — style={({ pressed }) => …} — which the app's
// styling layer (NativeWind) drops on the phone, leaving the thing unstyled
// there though it looks right in a browser.
export function Tap({ style, pressedStyle, children, onPressIn, onPressOut, ...props }: Omit<PressableProps, "style" | "children"> & { style?: StyleProp<ViewStyle>; pressedStyle?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      {...props}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      style={[style, pressed && (pressedStyle ?? { opacity: 0.7 })]}
    >
      {children}
    </Pressable>
  );
}
