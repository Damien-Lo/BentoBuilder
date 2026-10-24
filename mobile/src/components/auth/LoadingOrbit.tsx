import { useEffect, useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Ellipse, Path } from "react-native-svg";

import { OrbSphere } from "@/src/components/ui/OrbSphere";
import { SECTION_PALETTE, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// The cover while the app gets the day ready (AuthGate): Orbit's orb in the
// middle, its colours turning fast, inside a tilted orbit with satellites
// going round — the app icon, alive. Just signed in, the orb comes down from
// where it sat on the sign-in page (`from`, in window coordinates); opened
// already signed in, it's there from the start, where the launch screen's
// icon was. `leaving`: the orbit and the words fade, then the orb goes up
// into the home screen's orb (where home has said it is — registerHomeOrb)
// as the canvas dissolves, and it says so (onGone).

export type OrbStart = { x: number; y: number; size: number };

// Where the home screen's orb is, for the orb to land on: home registers how
// to measure it while it's shown (OrbitHome).
let homeOrb: (() => Promise<OrbStart | null>) | null = null;
export function registerHomeOrb(measure: () => Promise<OrbStart | null>) {
  homeOrb = measure;
  return () => {
    if (homeOrb === measure) homeOrb = null;
  };
}
// And home's orb kept out of sight while this one is up, so there's only
// ever one: shown again the moment this one lands on it.
let homeOrbHidden = false;
const hiddenListeners = new Set<(hidden: boolean) => void>();
function hideHomeOrb(hidden: boolean) {
  homeOrbHidden = hidden;
  hiddenListeners.forEach((listen) => listen(hidden));
}
export function useHomeOrbHidden() {
  const [hidden, setHidden] = useState(homeOrbHidden);
  useEffect(() => {
    hiddenListeners.add(setHidden);
    setHidden(homeOrbHidden);
    return () => void hiddenListeners.delete(setHidden);
  }, []);
  return hidden;
}

const ORB = 96;
const RX = 92; // the orbit, across
const RY = 26; // and deep (it's seen from a little above)
const TILT = -16; // degrees
const BOX = 2 * RX + 24;
const LAP_MS = 3200; // a satellite's way round
const FLY_MS = 700;
const FAST_TURN_MS = 2200; // the orb's colours, once round
const OUT_FIRST_MS = 380; // going: the orbit and the words
const OUT_MS = 750; // then the rest
const SATELLITES = [SECTION_PALETTE.calendar.base, SECTION_PALETTE.kitchen.base, SECTION_PALETTE.gym.base];

export function LoadingOrbit({ from, name, progress, leaving, onGone }: { from: OrbStart | null; name: string; progress: number; leaving: boolean; onGone: () => void }) {
  const { colors, dark } = useOrbitTheme();
  const still = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const cx = width / 2;
  const cy = height * 0.42;

  // Coming down from the sign-in page's orb, growing to size.
  const start = from && !still ? { dx: from.x + from.size / 2 - cx, dy: from.y + from.size / 2 - cy, scale: from.size / ORB } : { dx: 0, dy: 0, scale: 1 };
  const fly = useSharedValue(0);
  // The orbit and the words, once it's there.
  const shown = useSharedValue(0);
  const lap = useSharedValue(0);
  const gone = useSharedValue(1);
  // Landing on home's orb (0 → 1), where it is (dx, dy, scale), and the orb
  // itself fading once there (or with the rest, with nowhere to land).
  const land = useSharedValue(0);
  const landX = useSharedValue(0);
  const landY = useSharedValue(0);
  const landScale = useSharedValue(1);
  const orbGone = useSharedValue(1);
  useEffect(() => {
    const easing = Easing.inOut(Easing.cubic);
    fly.value = withTiming(1, { duration: from && !still ? FLY_MS : 0, easing });
    shown.value = withDelay(from && !still ? FLY_MS * 0.6 : 0, withTiming(1, { duration: 420 }));
    if (!still) lap.value = withRepeat(withTiming(Math.PI * 2, { duration: LAP_MS, easing: Easing.linear }), -1, false);
    hideHomeOrb(true);
    return () => hideHomeOrb(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Going: the orbit and the words first, then the orb and its canvas
  // dissolve into the home screen beneath.
  useEffect(() => {
    if (!leaving) return;
    let cancelled = false;
    (async () => {
      const target = still || !homeOrb ? null : await homeOrb().catch(() => null);
      if (cancelled) return;
      const ease = Easing.inOut(Easing.cubic);
      const after = still ? 0 : OUT_FIRST_MS * 0.7;
      shown.value = withTiming(0, { duration: still ? 0 : OUT_FIRST_MS });
      gone.value = withDelay(after, withTiming(0, { duration: still ? 0 : OUT_MS, easing: Easing.inOut(Easing.quad) }));
      if (target) {
        landX.value = target.x + target.size / 2 - cx;
        landY.value = target.y + target.size / 2 - cy;
        landScale.value = target.size / ORB;
        // (Home's own orb is just beneath, shown again: a quick swap.)
        land.value = withDelay(after, withTiming(1, { duration: OUT_MS, easing: ease }, (done) => done && runOnJS(hideHomeOrb)(false)));
        orbGone.value = withDelay(after + OUT_MS + 40, withTiming(0, { duration: 160 }, (done) => done && runOnJS(onGone)()));
      } else {
        hideHomeOrb(false);
        orbGone.value = withDelay(after, withTiming(0, { duration: still ? 0 : OUT_MS, easing: Easing.inOut(Easing.quad) }, (done) => done && runOnJS(onGone)()));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leaving, still, cx, cy, shown, gone, land, landX, landY, landScale, orbGone, onGone]);

  const orbStyle = useAnimatedStyle(() => ({
    opacity: orbGone.value,
    transform: [
      { translateX: start.dx * (1 - fly.value) + landX.value * land.value },
      { translateY: start.dy * (1 - fly.value) + landY.value * land.value },
      { scale: (start.scale + (1 - start.scale) * fly.value) * (1 + (landScale.value - 1) * land.value) },
    ],
  }));
  const shownStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
  const goneStyle = useAnimatedStyle(() => ({ opacity: gone.value }));

  // (Spinning fast only once it's down: on the way, as it was.)
  const [turnMs, setTurnMs] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (still) return;
    const t = setTimeout(() => setTurnMs(FAST_TURN_MS), from ? FLY_MS * 0.5 : 0);
    return () => clearTimeout(t);
  }, [still, from]);
  // (Back to its usual slow turn as it lands.)
  useEffect(() => {
    if (leaving) setTurnMs(undefined);
  }, [leaving]);

  const ringAt = { position: "absolute" as const, left: cx - BOX / 2, top: cy - BOX / 2, width: BOX, height: BOX };
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}>
      <Animated.View style={[{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.canvas }, goneStyle]} />
      {/* The orbit's far side, and the satellites behind the orb */}
      <Animated.View style={[ringAt, shownStyle]}>
        <Ring half="back" colors={colors} />
        {SATELLITES.map((color, i) => <Satellite key={`b${i}`} lap={lap} offset={(i * Math.PI * 2) / SATELLITES.length} color={color} side="back" />)}
      </Animated.View>

      <Animated.View style={[{ position: "absolute", left: cx - ORB / 2, top: cy - ORB / 2 }, orbStyle]}>
        <OrbSphere size={ORB} label="Orbit" colors={colors} dark={dark} turnMs={turnMs} />
      </Animated.View>

      {/* Its near side, and the satellites in front */}
      <Animated.View style={[ringAt, shownStyle]}>
        <Ring half="front" colors={colors} />
        {SATELLITES.map((color, i) => <Satellite key={`f${i}`} lap={lap} offset={(i * Math.PI * 2) / SATELLITES.length} color={color} side="front" />)}
      </Animated.View>

      <Animated.View style={[{ position: "absolute", left: 0, right: 0, top: cy + BOX / 2 - 8, alignItems: "center", paddingHorizontal: 40 }, shownStyle]}>
        <Text style={{ fontSize: 24, fontWeight: "800", letterSpacing: -0.4, color: colors.text }}>{name ? `Hi, ${name}` : "Welcome back"}</Text>
        <Text style={{ marginTop: 6, textAlign: "center", fontSize: 14, color: colors.muted }}>Getting your day ready…</Text>
        <View style={{ marginTop: 20, height: 4, width: 160, overflow: "hidden", borderRadius: 2, backgroundColor: colors.track }}>
          <View style={{ height: "100%", borderRadius: 2, backgroundColor: colors.ink, width: `${Math.max(8, Math.round(progress * 100))}%` }} />
        </View>
      </Animated.View>
    </View>
  );
}

// The orbit: a thin tilted ellipse — the back half behind the orb, the
// front half over it.
function Ring({ half, colors }: { half: "back" | "front"; colors: OrbitColors }) {
  const c = BOX / 2;
  const stroke = colors.faint;
  return (
    <Svg width={BOX} height={BOX} style={{ position: "absolute", left: 0, top: 0 }}>
      {half === "back" ? (
        <Ellipse cx={c} cy={c} rx={RX} ry={RY} stroke={stroke} strokeOpacity={0.45} strokeWidth={1.5} fill="none" transform={`rotate(${TILT} ${c} ${c})`} />
      ) : (
        <Path d={`M ${c - RX} ${c} A ${RX} ${RY} 0 0 0 ${c + RX} ${c}`} stroke={stroke} strokeOpacity={0.7} strokeWidth={1.5} fill="none" transform={`rotate(${TILT} ${c} ${c})`} />
      )}
    </Svg>
  );
}

// A satellite going round the orbit: drawn on the side of the orb it's on
// (each is drawn twice, once behind the orb and once in front, and shows
// on its side), a little bigger nearer.
function Satellite({ lap, offset, color, side }: { lap: SharedValue<number>; offset: number; color: string; side: "back" | "front" }) {
  const size = 10;
  const style = useAnimatedStyle(() => {
    const a = lap.value + offset;
    const x = RX * Math.cos(a);
    const y = RY * Math.sin(a);
    const t = (TILT * Math.PI) / 180;
    const near = Math.sin(a) > 0;
    return {
      opacity: near === (side === "front") ? 1 : 0,
      transform: [{ translateX: BOX / 2 + x * Math.cos(t) - y * Math.sin(t) - size / 2 }, { translateY: BOX / 2 + x * Math.sin(t) + y * Math.cos(t) - size / 2 }, { scale: 0.85 + 0.25 * Math.sin(a) }],
    };
  });
  return <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}
