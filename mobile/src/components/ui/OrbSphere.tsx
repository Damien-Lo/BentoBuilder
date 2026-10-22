import { useEffect } from "react";
import { Platform, Pressable, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { SECTION_PALETTE, useOrbitTheme, type OrbHue, type OrbitColors } from "@/src/theme/orbit";

// Orbit's mascot: the assistant, as a glowing orb — big on the home
// screen, small floating over the sections (FloatingOrb).

// A soft sphere, lit from the top left: in a browser a real gradient; on
// the phone (no gradient drawing in the app) many thin circles, each a
// shade lighter and a little further towards the light, which blend into
// one. It breathes slowly (unless motion is turned down).
// (The same light as the browser's gradient: from the edge, deep blue, to
// the bright spot at 36% across, 30% down.)
// (A section's orb is one hue — the Kitchen's orange, the Calendar's blue, Tasks' violet — and takes it from
// useOrbitTheme(); the main one is all of them: MainOrb, below. Shades from
// Claude Design's orb sheet, Oct 2026.)
const HUES: Record<Exclude<OrbHue, "main">, { stops: [number, string][]; glow: { light: string; dark: string } }> = {
  blue: { stops: [[0, SECTION_PALETTE.calendar.tint], [0.24, "#93C2F6"], [0.52, SECTION_PALETTE.calendar.base], [0.86, SECTION_PALETTE.calendar.dark], [1, SECTION_PALETTE.calendar.deep]], glow: { light: SECTION_PALETTE.calendar.base, dark: SECTION_PALETTE.calendar.base } },
  violet: { stops: [[0, SECTION_PALETTE.tasks.tint], [0.24, "#C3B6FA"], [0.52, SECTION_PALETTE.tasks.base], [0.86, SECTION_PALETTE.tasks.dark], [1, SECTION_PALETTE.tasks.deep]], glow: { light: SECTION_PALETTE.tasks.base, dark: SECTION_PALETTE.tasks.base } },
  green: { stops: [[0, SECTION_PALETTE.nutrition.tint], [0.24, "#A9DC97"], [0.52, SECTION_PALETTE.nutrition.base], [0.86, SECTION_PALETTE.nutrition.dark], [1, SECTION_PALETTE.nutrition.deep]], glow: { light: SECTION_PALETTE.nutrition.base, dark: SECTION_PALETTE.nutrition.base } },
  pink: { stops: [[0, SECTION_PALETTE.health.tint], [0.24, "#F7A1AD"], [0.52, SECTION_PALETTE.health.base], [0.86, SECTION_PALETTE.health.dark], [1, SECTION_PALETTE.health.deep]], glow: { light: SECTION_PALETTE.health.base, dark: SECTION_PALETTE.health.base } },
  // (Black and white: Gym's, until it went orange — kept to go back to.)
  mono: { stops: [[0, "#F8FAFC"], [0.24, "#CBD5E1"], [0.52, "#64748B"], [0.86, "#1E293B"], [1, "#020617"]], glow: { light: "#475569", dark: "#CBD5E1" } },
  // (Gym's orange; Kitchen's yellow.)
  orange: { stops: [[0, SECTION_PALETTE.gym.tint], [0.24, "#F7AE6E"], [0.52, SECTION_PALETTE.gym.base], [0.86, SECTION_PALETTE.gym.dark], [1, SECTION_PALETTE.gym.deep]], glow: { light: SECTION_PALETTE.gym.base, dark: SECTION_PALETTE.gym.base } },
  yellow: { stops: [[0, SECTION_PALETTE.kitchen.tint], [0.24, "#F7DA85"], [0.52, SECTION_PALETTE.kitchen.base], [0.86, SECTION_PALETTE.kitchen.dark], [1, SECTION_PALETTE.kitchen.deep]], glow: { light: SECTION_PALETTE.kitchen.base, dark: SECTION_PALETTE.kitchen.base } },
};

// The main orb's colours: every section's hue in turn round it (from 210°,
// as in the design), and three soft patches over them.
const P = SECTION_PALETTE;
// (Home's old slice the orb sheet's magenta, so that Docs' teal isn't there
// twice.)
const SWEEP = [P.calendar.base, P.tasks.base, P.gym.base, P.health.base, P.kitchen.base, P.documents.base, P.nutrition.base, "#E36BD6"];
const PATCHES: { color: string; x: number; y: number; d: number }[] = [
  { color: P.home.base, x: 0.3, y: 0.3, d: 0.62 }, // teal
  { color: P.gym.base, x: 0.72, y: 0.28, d: 0.56 }, // tangerine
  { color: P.tasks.base, x: 0.36, y: 0.74, d: 0.66 }, // violet
];
const rgba = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${a})`;
// (A browser's gradient reaches to the far corner, so the near edge stays
// light: the same here.)
const REACH = 0.78;
function shade(r: number, STOPS: [number, string][]) {
  const i = Math.max(1, STOPS.findIndex(([at]) => at >= r));
  const [a, from] = STOPS[i - 1];
  const [b, to] = STOPS[i];
  const local = Math.max(0, Math.min(1, (r - a) / (b - a)));
  const mix = (j: number) => Math.round(parseInt(from.slice(j, j + 2), 16) * (1 - local) + parseInt(to.slice(j, j + 2), 16) * local);
  return `rgb(${mix(1)}, ${mix(3)}, ${mix(5)})`;
}
export function OrbSphere({ size, onPress, onLongPress, label = "Ask or add something", colors, dark }: { size: number; onPress?: () => void; onLongPress?: () => void; label?: string; colors: OrbitColors; dark: boolean }) {
  const { orbHue } = useOrbitTheme();
  if (orbHue === "main") return <MainOrb size={size} onPress={onPress} onLongPress={onLongPress} label={label} dark={dark} />;
  return <HueOrb hue={HUES[orbHue]} size={size} onPress={onPress} onLongPress={onLongPress} label={label} colors={colors} dark={dark} />;
}

// A section's orb: one hue, lit from the top left.
function HueOrb({ hue, size, onPress, onLongPress, label, colors, dark }: { hue: (typeof HUES)["blue"]; size: number; onPress?: () => void; onLongPress?: () => void; label: string; colors: OrbitColors; dark: boolean }) {
  const still = useReducedMotion();
  const stops = hue.stops;
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
          { width: size, height: size, borderRadius: size / 2, backgroundColor: shade(REACH, stops), overflow: "hidden" },
          Platform.OS === "web"
            ? ({ boxShadow: `0 18px ${dark ? 70 : 50}px ${colors.orbGlow}`, backgroundImage: `radial-gradient(circle at 36% 30%, ${stops.map(([at, c]) => `${c} ${Math.round(at * 100)}%`).join(", ")})` } as object)
            : { shadowColor: dark ? hue.glow.dark : hue.glow.light, shadowOpacity: dark ? 0.75 : 0.5, shadowRadius: dark ? 34 : 26, shadowOffset: { width: 0, height: 12 } },
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
            return <View key={k} style={{ position: "absolute", width: d, height: d, borderRadius: d / 2, left: cx - d / 2, top: cy - d / 2, backgroundColor: shade(r * REACH, stops) }} />;
          })}
      </Animated.View>
    </Pressable>
  );
}


// The main orb: every section's colour at once, turning slowly underneath a
// fixed light, so it stays a sphere while the colour moves (once round every
// 24 s; still when motion is turned down). Three layers, as in the design:
// the colours round it, three soft patches over them (these two turn), and
// a white highlight with a darker edge on top. On the phone, with no
// gradients to draw with, each soft patch is a stack of faint circles.
function MainOrb({ size, onPress, onLongPress, label, dark }: { size: number; onPress?: () => void; onLongPress?: () => void; label: string; dark: boolean }) {
  const still = useReducedMotion();
  const breath = useSharedValue(1);
  const spin = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    breath.value = withRepeat(withTiming(1.035, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    spin.value = withRepeat(withTiming(360, { duration: 24000, easing: Easing.linear }), -1, false);
  }, [still, breath, spin]);
  const breathing = useAnimatedStyle(() => ({ transform: [{ scale: breath.value }] }));
  const turning = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const web = Platform.OS === "web";
  const fill = { position: "absolute" as const, left: 0, top: 0, width: size, height: size };

  // A soft round patch of colour: faint circles, each smaller, piling up to
  // the colour at its middle.
  // (Many, each very faint, so no ring shows where one ends.)
  const layers = 18;
  const patch = (key: string, color: string, cx: number, cy: number, d: number, strength: number) =>
    Array.from({ length: layers }, (_, k) => {
      const di = d * (1 - k / layers);
      return <View key={`${key}-${k}`} style={{ position: "absolute", width: di, height: di, borderRadius: di / 2, left: cx - di / 2, top: cy - di / 2, backgroundColor: rgba(color, strength) }} />;
    });

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={label}>
      <Animated.View
        style={[
          { width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: "#B9A6EC" },
          web
            ? ({ boxShadow: `0 18px ${dark ? 70 : 50}px rgba(160, 140, 247, ${dark ? 0.55 : 0.45})` } as object)
            : { shadowColor: "#A08CF7", shadowOpacity: dark ? 0.75 : 0.5, shadowRadius: dark ? 34 : 26, shadowOffset: { width: 0, height: 12 } },
          breathing,
        ]}
      >
        {/* The colours, turning */}
        <Animated.View
          style={[
            fill,
            web
              ? ({
                  backgroundImage: [
                    ...PATCHES.map((p) => `radial-gradient(circle at ${p.x * 100}% ${p.y * 100}%, ${rgba(p.color, 0.85)}, ${rgba(p.color, 0)} ${p.d * 70}%)`),
                    `conic-gradient(from 210deg, ${[...SWEEP, SWEEP[0]].join(", ")})`,
                  ].join(", "),
                } as object)
              : undefined,
            turning,
          ]}
        >
          {!web && (
            <>
              {SWEEP.map((color, i) => {
                const a = ((210 + i * 45) * Math.PI) / 180;
                return patch(`s${i}`, color, size / 2 + Math.sin(a) * size * 0.4, size / 2 - Math.cos(a) * size * 0.4, size * 0.8, 0.12);
              })}
              {PATCHES.map((p, i) => patch(`p${i}`, p.color, p.x * size, p.y * size, p.d * size, 0.09))}
            </>
          )}
        </Animated.View>

        {/* The light, still: a highlight at the top left, a darker edge */}
        {web ? (
          <View style={[fill, { backgroundImage: `radial-gradient(circle at 36% 30%, rgba(255,255,255,0.75), rgba(255,255,255,0) 42%), radial-gradient(circle at 50% 50%, rgba(30,20,60,0) 62%, rgba(30,20,60,0.24) 100%)` } as object]} />
        ) : (
          <>
            {patch("light", "#FFFFFF", size * 0.36, size * 0.3, size * 0.6, 0.055)}
            {/* (The edge darkens gradually: rings, each thinner, adding up towards the rim.) */}
            {Array.from({ length: 10 }, (_, j) => (
              <View key={`edge-${j}`} style={[fill, { borderRadius: size / 2, borderWidth: size * (0.16 - j * 0.015), borderColor: "rgba(40, 24, 80, 0.028)" }]} />
            ))}
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}
