import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, useColorScheme } from "react-native";

// Orbit's look: the colours every redesigned screen takes, in light and
// dark — first worked out on the phone's home screen (components/home), the
// reference for the rest. Which one shows is the person's choice in
// Settings → Appearance: Automatic (as the phone is set), Light
// or Dark; kept on the device.
//
// In a browser it's always the light colours: the web has its own dark mode
// (components/web/theme), which turns every colour on the page dark as it's
// drawn — given dark colours, it would turn them again.
//
// Use: const { colors, dark } = useOrbitTheme();

export interface OrbitColors {
  canvas: string; // the page behind everything
  surface: string; // cards, sheets
  border: string; // hairlines round cards
  text: string;
  muted: string; // secondary text
  faint: string; // tertiary text, placeholders
  icon: string;
  ink: string; // the main button, the selected thing
  onInk: string; // text and icons on ink
  pill: string; // secondary buttons
  onPill: string;
  track: string; // empty part of a bar or ring
  fill: string; // filled part of a ring
  orbit: string; // the dotted path
  node: string; // a section on the orbit
  nodeBorder: string;
  nodeSoon: string; // one not built yet
  selectedRing: string; // round the selected section
  accent: string; // the assistant's blue, links
  accentSoft: string;
  danger: string;
  warning: string;
  success: string;
  scrim: string; // behind a sheet
  orbGlow: string;
}

export const LIGHT: OrbitColors = {
  canvas: "#F4F3F0",
  surface: "#FFFFFF",
  border: "#E2E8F0",
  text: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  icon: "#334155",
  // (A step off black and white, which look the same: the web's dark mode
  // knows them as the main button and its text — components/web/theme.)
  ink: "#0F172B",
  onInk: "#FFFFFE",
  pill: "#EEF0F3",
  onPill: "#334155",
  track: "#EEF0F3",
  fill: "#0F172A",
  orbit: "#CBD5E1",
  node: "#FFFFFF",
  nodeBorder: "#E2E8F0",
  nodeSoon: "#EEF0F3",
  selectedRing: "#93C5FD",
  accent: "#2563EB",
  accentSoft: "#EFF6FF",
  danger: "#DC2626",
  warning: "#B45309",
  success: "#10B981",
  scrim: "rgba(15, 23, 42, 0.30)",
  orbGlow: "rgba(37, 99, 235, 0.45)",
};

export const DARK: OrbitColors = {
  canvas: "#0D0F14",
  surface: "#171A21",
  border: "#262B35",
  text: "#F1F5F9",
  muted: "#94A3B8",
  faint: "#64748B",
  icon: "#CBD5E1",
  ink: "#F1F5F9",
  onInk: "#0D0F14",
  pill: "#232833",
  onPill: "#CBD5E1",
  track: "#262B35",
  fill: "#E2E8F0",
  orbit: "#334155",
  node: "#171A21",
  nodeBorder: "#2A303B",
  nodeSoon: "#12141A",
  selectedRing: "#3B82F6",
  accent: "#60A5FA",
  accentSoft: "rgba(59, 130, 246, 0.16)",
  danger: "#F87171",
  warning: "#FBBF24",
  success: "#34D399",
  scrim: "rgba(0, 0, 0, 0.55)",
  orbGlow: "rgba(59, 130, 246, 0.6)",
};

export type Appearance = "system" | "light" | "dark";
// The orb's colour: the main one — every section's colour together, the
// assistant as a whole (home, and anywhere outside a section) — or a
// section's own (its agent's).
export type OrbHue = "main" | "blue" | "orange" | "yellow" | "violet" | "green" | "pink" | "mono";
const KEY = "orbit.appearance";

interface ThemeValue {
  appearance: Appearance;
  setAppearance: (next: Appearance) => void;
  dark: boolean;
  colors: OrbitColors;
  orbHue: OrbHue;
}
const ThemeContext = createContext<ThemeValue>({ appearance: "system", setAppearance: () => {}, dark: false, colors: LIGHT, orbHue: "main" });
export const useOrbitTheme = () => useContext(ThemeContext);

export function OrbitThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [appearance, setAppearanceState] = useState<Appearance>("system");
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((saved) => (saved === "light" || saved === "dark" || saved === "system") && setAppearanceState(saved))
      .catch(() => {});
  }, []);
  const setAppearance = useCallback((next: Appearance) => {
    setAppearanceState(next);
    void AsyncStorage.setItem(KEY, next).catch(() => {});
  }, []);
  const value = useMemo(() => {
    const dark = Platform.OS !== "web" && (appearance === "dark" || (appearance === "system" && system === "dark"));
    return { appearance, setAppearance, dark, colors: dark ? DARK : LIGHT, orbHue: "main" as OrbHue };
  }, [appearance, system, setAppearance]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// A page redesigned in Orbit's look: the shared pieces drawn on it — cards,
// switches, fields, dropdowns — take its colours from here. Anywhere else
// useOrbitPage() is null and they keep the app's older look, until their
// page is redesigned too. (`on`: false leaves the older look, e.g. for a
// page whose desktop layout isn't redesigned yet.)
const PageContext = createContext<OrbitColors | null>(null);
export const useOrbitPage = () => useContext(PageContext);

export function OrbitPage({ on = true, children }: { on?: boolean; children: ReactNode }) {
  const { colors } = useOrbitTheme();
  return <PageContext.Provider value={on ? colors : null}>{children}</PageContext.Provider>;
}

// A section in its own colour — its agent's (see TODO: agents as coloured
// orbs): its pages, tab bar, sheets and orb take it in place of the
// theme's accent (black, or white in the dark). The home screen, the hub
// for every section, keeps the plain accent. Kitchen first (Oct 2026).
export type Section = "kitchen" | "calendar" | "tasks" | "nutrition" | "health" | "gym";
const SECTIONS: Record<Section, { orb: OrbHue; light: Partial<OrbitColors>; dark: Partial<OrbitColors> }> = {
  kitchen: {
    orb: "yellow",
    // (SECTION_PALETTE.kitchen: buttons in its darker shade on the light
    // theme, for white text; the colour itself for rings, and in the dark.)
    light: { ink: "#A06A00", onInk: "#FFFFFE", fill: "#F2C34A", selectedRing: "#F7DA85", orbGlow: "rgba(242, 195, 74, 0.45)" },
    dark: { ink: "#F2C34A", onInk: "#0D0F14", fill: "#F2C34A", selectedRing: "#A06A00", orbGlow: "rgba(242, 195, 74, 0.55)" },
  },
  calendar: {
    orb: "blue",
    // (SECTION_PALETTE.calendar, the same way as the Kitchen's.)
    light: { ink: "#2C5DC9", onInk: "#FFFFFE", fill: "#5FA2F2", selectedRing: "#9CC4F6", orbGlow: "rgba(95, 162, 242, 0.45)" },
    dark: { ink: "#5FA2F2", onInk: "#0D0F14", fill: "#5FA2F2", selectedRing: "#2C5DC9", orbGlow: "rgba(95, 162, 242, 0.55)" },
  },
  tasks: {
    orb: "violet",
    // (SECTION_PALETTE.tasks, the same way as the Kitchen's.)
    light: { ink: "#5A44C9", onInk: "#FFFFFE", fill: "#A08CF7", selectedRing: "#C9BDFB", orbGlow: "rgba(160, 140, 247, 0.45)" },
    dark: { ink: "#A08CF7", onInk: "#0D0F14", fill: "#A08CF7", selectedRing: "#5A44C9", orbGlow: "rgba(160, 140, 247, 0.55)" },
  },
  nutrition: {
    orb: "green",
    // (SECTION_PALETTE.nutrition, the same way as the Kitchen's.)
    light: { ink: "#2E8A4A", onInk: "#FFFFFE", fill: "#7CC86A", selectedRing: "#A9DC97", orbGlow: "rgba(124, 200, 106, 0.45)" },
    dark: { ink: "#7CC86A", onInk: "#0D0F14", fill: "#7CC86A", selectedRing: "#2E8A4A", orbGlow: "rgba(124, 200, 106, 0.55)" },
  },
  health: {
    orb: "pink",
    // (SECTION_PALETTE.health, the same way as the Kitchen's.)
    light: { ink: "#B3264A", onInk: "#FFFFFE", fill: "#F2667A", selectedRing: "#F7A1AD", orbGlow: "rgba(242, 102, 122, 0.45)" },
    dark: { ink: "#F2667A", onInk: "#0D0F14", fill: "#F2667A", selectedRing: "#B3264A", orbGlow: "rgba(242, 102, 122, 0.55)" },
  },
  gym: {
    orb: "orange",
    // (SECTION_PALETTE.gym, the same way as the Kitchen's.)
    light: { ink: "#C2471A", onInk: "#FFFFFE", fill: "#F28A3C", selectedRing: "#F7AE6E", orbGlow: "rgba(242, 138, 60, 0.45)" },
    dark: { ink: "#F28A3C", onInk: "#0D0F14", fill: "#F28A3C", selectedRing: "#C2471A", orbGlow: "rgba(242, 138, 60, 0.55)" },
  },
};

export function OrbitSection({ section, children }: { section: Section; children: ReactNode }) {
  const parent = useOrbitTheme();
  const value = useMemo(() => {
    const own = SECTIONS[section];
    return { ...parent, orbHue: own.orb, colors: { ...parent.colors, ...(parent.dark ? own.dark : own.light) } };
  }, [parent, section]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Every section's colour — its agent's — in four shades, from Claude
// Design's orb sheet (design/Orb reference …pdf, Oct 2026): a pale tint
// (backgrounds), the colour itself (its orb, rings, the dark theme's
// accent), a darker one (buttons with white text on them, in the light
// theme), and the deepest (the orb's shading). The main orb is all eight.
export type SectionId = "kitchen" | "nutrition" | "health" | "calendar" | "tasks" | "home" | "documents" | "gym";
export const SECTION_PALETTE: Record<SectionId, { tint: string; base: string; dark: string; deep: string }> = {
  // (Kitchen yellow and Gym orange, Oct 22, 2026 — Kitchen was orange, Gym
  // black and white. Kitchen's darker shade deepened to carry white text.)
  kitchen: { tint: "#FFF1C7", base: "#F2C34A", dark: "#A06A00", deep: "#B8551E" }, // meals, recipes, pantry, groceries
  nutrition: { tint: "#DDF5C8", base: "#7CC86A", dark: "#2E8A4A", deep: "#1F6E6A" },
  health: { tint: "#FFD6DC", base: "#F2667A", dark: "#B3264A", deep: "#8E2B8A" },
  calendar: { tint: "#CFE5FF", base: "#5FA2F2", dark: "#2C5DC9", deep: "#3A3FB8" },
  tasks: { tint: "#E2DBFF", base: "#A08CF7", dark: "#5A44C9", deep: "#2F4FB8" },
  home: { tint: "#CBF5EE", base: "#3FC1B0", dark: "#137A73", deep: "#1F5FA0" },
  // (Docs teal, now Kitchen's yellow.)
  documents: { tint: "#CBF5EE", base: "#3FC1B0", dark: "#137A73", deep: "#1F5FA0" },
  gym: { tint: "#FFE0C2", base: "#F28A3C", dark: "#C2471A", deep: "#B8325A" },
};

// A section's colour where it's shown outside the section — its node on the
// home screen's orbit: the darker shade on the light theme (to read on
// white), the colour itself on the dark.
export function sectionColor(id: string, dark: boolean): string | null {
  const shades = SECTION_PALETTE[id as SectionId];
  return shades ? (dark ? shades.base : shades.dark) : null;
}
