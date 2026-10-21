import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, useColorScheme } from "react-native";

// Orbit's look: the colours every redesigned screen takes, in light and
// dark — first worked out on the phone's home screen (components/home), the
// reference for the rest. Which one shows is the person's choice in
// Settings → Account → Appearance: Automatic (as the phone is set), Light
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
  ink: "#0F172A",
  onInk: "#FFFFFF",
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
// The orb's colour: the assistant's blue, or a section's own (its agent's).
export type OrbHue = "blue" | "orange";
const KEY = "orbit.appearance";

interface ThemeValue {
  appearance: Appearance;
  setAppearance: (next: Appearance) => void;
  dark: boolean;
  colors: OrbitColors;
  orbHue: OrbHue;
}
const ThemeContext = createContext<ThemeValue>({ appearance: "system", setAppearance: () => {}, dark: false, colors: LIGHT, orbHue: "blue" });
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
    return { appearance, setAppearance, dark, colors: dark ? DARK : LIGHT, orbHue: "blue" as OrbHue };
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
export type Section = "kitchen";
const SECTIONS: Record<Section, { orb: OrbHue; light: Partial<OrbitColors>; dark: Partial<OrbitColors> }> = {
  kitchen: {
    orb: "orange",
    light: { ink: "#EA580C", onInk: "#FFFFFF", fill: "#F97316", selectedRing: "#FDBA74", orbGlow: "rgba(234, 88, 12, 0.45)" },
    dark: { ink: "#FB923C", onInk: "#0D0F14", fill: "#FB923C", selectedRing: "#F97316", orbGlow: "rgba(251, 146, 60, 0.55)" },
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

// Each section's own colour — its agent's — where it's shown outside the
// section, e.g. its node on the home screen's orbit. (Light / dark shade;
// Kitchen's is the one its pages use. Gym, when it's a section: red.)
const SECTION_HUES: Record<string, { light: string; dark: string }> = {
  kitchen: { light: "#EA580C", dark: "#FB923C" }, // orange
  calendar: { light: "#7C3AED", dark: "#A78BFA" }, // purple
  tasks: { light: "#2563EB", dark: "#60A5FA" }, // blue
  health: { light: "#16A34A", dark: "#4ADE80" }, // green
  nutrition: { light: "#0D9488", dark: "#2DD4BF" }, // teal (for now: not yet decided)
};

export function sectionColor(id: string, dark: boolean): string | null {
  const hue = SECTION_HUES[id];
  return hue ? (dark ? hue.dark : hue.light) : null;
}
