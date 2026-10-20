import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

// Orbit's look: the colours every redesigned screen takes, in light and
// dark — first worked out on the phone's home screen (components/home), the
// reference for the rest. Which one shows is the person's choice in
// Settings → Account → Appearance: Automatic (as the phone is set), Light
// or Dark; kept on the device.
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
const KEY = "orbit.appearance";

interface ThemeValue {
  appearance: Appearance;
  setAppearance: (next: Appearance) => void;
  dark: boolean;
  colors: OrbitColors;
}
const ThemeContext = createContext<ThemeValue>({ appearance: "system", setAppearance: () => {}, dark: false, colors: LIGHT });
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
    const dark = appearance === "dark" || (appearance === "system" && system === "dark");
    return { appearance, setAppearance, dark, colors: dark ? DARK : LIGHT };
  }, [appearance, system, setAppearance]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
