import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";
import { Text, View } from "react-native";

import { Tap } from "@/src/components/ui/Tap";
import { loadSettings, saveSettings, type Units } from "@/src/services/settingsService";
import { useOrbitTheme } from "@/src/theme/orbit";

// Imperial or metric — how each Health page shows its measurements, chosen
// page by page (Weight in kilograms, Activity in miles…). Everything's kept
// in metric — kilograms, cm, km, mL, °C, as Apple Health keeps it (since
// Oct 23, 2026; it was imperial) — shown in the page's units, and typed-in
// imperial turned back before it's saved. The choices are
// the account's (the profile's `unitPrefs`), remembered on this device too
// so they're right from the first moment.

export type Measure = "weight" | "distance" | "length" | "volume" | "temp";
// The pages with a choice, and what their switch says.
export type UnitPage = "weight" | "about" | "activity" | "workouts" | "body" | "vitals" | "drinks";
const PAGE_LABELS: Record<UnitPage, [string, string]> = {
  weight: ["lb", "kg"],
  about: ["lb · ft", "kg · cm"],
  activity: ["mi", "km"],
  workouts: ["mi", "km"],
  body: ["lb · in", "kg · cm"],
  vitals: ["°F", "°C"],
  drinks: ["fl oz", "mL"],
};

const KEY = "health.unitPrefs";
type Prefs = Partial<Record<string, Units>>;
let current: Prefs = {};
const listeners = new Set<() => void>();
let loaded = false;
function set(prefs: Prefs) {
  current = prefs;
  listeners.forEach((l) => l());
}
function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((raw) => (raw ? set(JSON.parse(raw) as Prefs) : undefined))
    .catch(() => {});
  loadSettings().then((s) => {
    set(s.unitPrefs);
    AsyncStorage.setItem(KEY, JSON.stringify(s.unitPrefs)).catch(() => {});
  }, () => {});
}

// A page's units, and a way to change them.
export function useUnits(page: UnitPage): [Units, (u: Units) => void] {
  useEffect(ensureLoaded, []);
  const prefs = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
  const change = (u: Units) => {
    const next = { ...current, [page]: u };
    set(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
    saveSettings({ unitPrefs: next }).catch(() => {});
  };
  return [prefs[page] ?? "imperial", change];
}

// Kept (metric) → imperial, and back.
const TO_IMPERIAL: Record<Measure, (v: number) => number> = {
  weight: (kg) => kg / 0.45359237,
  distance: (km) => km / 1.609344,
  length: (cm) => cm / 2.54,
  volume: (ml) => ml / 29.5735,
  temp: (c) => (c * 9) / 5 + 32,
};
const FROM_IMPERIAL: Record<Measure, (v: number) => number> = {
  weight: (lb) => lb * 0.45359237,
  distance: (mi) => mi * 1.609344,
  length: (inch) => inch * 2.54,
  volume: (floz) => floz * 29.5735,
  temp: (f) => ((f - 32) * 5) / 9,
};
export const UNIT_LABEL: Record<Units, Record<Measure, string>> = {
  imperial: { weight: "lbs", distance: "mi", length: "in", volume: "fl oz", temp: "°F" },
  metric: { weight: "kg", distance: "km", length: "cm", volume: "mL", temp: "°C" },
};
// A kept (metric) value in the chosen units.
export const toShown = (measure: Measure, value: number, units: Units) => (units === "imperial" ? TO_IMPERIAL[measure](value) : value);
// A typed-in value (in the chosen units) as kept — to two places.
export const toStored = (measure: Measure, value: number, units: Units) => Math.round((units === "imperial" ? FROM_IMPERIAL[measure](value) : value) * 100) / 100;
// "88.2 kg", "199 lbs" — to a place (none for mL).
export function showMeasure(measure: Measure, value: number, units: Units, places = 1) {
  const v = toShown(measure, value, units);
  const p = measure === "volume" && units === "metric" ? 0 : places;
  return `${(Math.round(v * 10 ** p) / 10 ** p).toLocaleString(undefined, { maximumFractionDigits: p })} ${UNIT_LABEL[units][measure]}`;
}

// A page's switch — just its own units ("lb | kg") — for the top right.
export function UnitsToggle({ page }: { page: UnitPage }) {
  const { colors: c } = useOrbitTheme();
  const [units, setUnits] = useUnits(page);
  const labels = PAGE_LABELS[page];
  return (
    <View style={{ flexDirection: "row", padding: 3, borderRadius: 999, backgroundColor: c.pill }}>
      {(["imperial", "metric"] as Units[]).map((u, i) => {
        const on = u === units;
        return (
          <Tap key={u} onPress={() => setUnits(u)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={u === "imperial" ? "Imperial" : "Metric"} style={{ paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, backgroundColor: on ? c.surface : "transparent" }} pressedStyle={{ opacity: 0.7 }}>
            <Text style={{ fontSize: 12.5, fontWeight: on ? "700" : "600", color: on ? c.text : c.muted }}>{labels[i]}</Text>
          </Tap>
        );
      })}
    </View>
  );
}
