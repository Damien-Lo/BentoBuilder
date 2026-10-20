import { useEffect } from "react";
import { Platform, Pressable, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import type { OrbitColors } from "@/src/theme/orbit";

// Orbit's mascot: the assistant, as a glowing orb — big on the home
// screen, small floating over the sections (FloatingOrb).

// A soft sphere, lit from the top left: in a browser a real gradient; on
// the phone (no gradient drawing in the app) many thin circles, each a
// shade lighter and a little further towards the light, which blend into
// one. It breathes slowly (unless motion is turned down).
// (The same light as the browser's gradient: from the edge, deep blue, to
// the bright spot at 36% across, 30% down.)
const STOPS: [number, string][] = [
  [0, "#EFF6FF"],
  [0.2, "#93C5FD"],
  [0.52, "#3B82F6"],
  [1, "#1E3A8A"],
];
// (A browser's gradient reaches to the far corner, so the near edge stays
// light: the same here.)
const REACH = 0.78;
function shade(r: number) {
  const i = Math.max(1, STOPS.findIndex(([at]) => at >= r));
  const [a, from] = STOPS[i - 1];
  const [b, to] = STOPS[i];
  const local = Math.max(0, Math.min(1, (r - a) / (b - a)));
  const mix = (j: number) => Math.round(parseInt(from.slice(j, j + 2), 16) * (1 - local) + parseInt(to.slice(j, j + 2), 16) * local);
  return `rgb(${mix(1)}, ${mix(3)}, ${mix(5)})`;
}
export function OrbSphere({ size, onPress, onLongPress, label = "Ask or add something", colors, dark }: { size: number; onPress?: () => void; onLongPress?: () => void; label?: string; colors: OrbitColors; dark: boolean }) {
  const still = useReducedMotion();
  const breath = useSharedValue(1);
  useEffect(() => {
    if (!still) breath.value = withRepeat(withTiming(1.035, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [still, breath]);
  const breathing = useAnimatedStyle(() => ({ transform: [{ scale: breath.value }] }));
  const layers = 40;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={label}>
      <Animated.View
        style={[
          { width: size, height: size, borderRadius: size / 2, backgroundColor: shade(REACH), overflow: "hidden" },
          Platform.OS === "web"
            ? ({ boxShadow: `0 18px ${dark ? 70 : 50}px ${colors.orbGlow}`, backgroundImage: "radial-gradient(circle at 36% 30%, #EFF6FF 0%, #93C5FD 20%, #3B82F6 52%, #1E3A8A 100%)" } as object)
            : { shadowColor: dark ? "#3B82F6" : "#2563EB", shadowOpacity: dark ? 0.75 : 0.5, shadowRadius: dark ? 34 : 26, shadowOffset: { width: 0, height: 12 } },
          breathing,
        ]}
      >
        {Platform.OS !== "web" &&
          Array.from({ length: layers }, (_, k) => {
            // From the outside in: each circle smaller, its centre nearer
            // the bright spot, its colour the gradient's at that distance.
            const r = 1 - k / layers;
            const d = size * r;
            const cx = size * (0.5 + (0.36 - 0.5) * (1 - r));
            const cy = size * (0.5 + (0.3 - 0.5) * (1 - r));
            return <View key={k} style={{ position: "absolute", width: d, height: d, borderRadius: d / 2, left: cx - d / 2, top: cy - d / 2, backgroundColor: shade(r * REACH) }} />;
          })}
      </Animated.View>
    </Pressable>
  );
}

