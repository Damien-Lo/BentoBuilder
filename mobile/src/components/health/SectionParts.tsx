import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";

import { DatePickerField } from "@/src/components/forms/DatePickerField";
import { formatValue, SECTIONS, shownValue, STORED_UNIT, unitLabel, type MetricDef } from "@/src/components/health/healthSections";
import { toStored, useUnits, type UnitPage } from "@/src/components/health/units";
import { Tap } from "@/src/components/ui/Tap";
import { getSessions, type GymSessionRecord } from "@/src/services/gymApi";
import { addHealthReading, getHealthMetrics, type HealthMetric } from "@/src/services/healthSync";
import type { Units } from "@/src/services/settingsService";
import { getWeightEntries, type WeightEntry } from "@/src/services/weightEntryApi";
import type { OrbitColors } from "@/src/theme/orbit";
import { todayDateInputString } from "@/src/utils/date";

// A Health section's pieces, for its phone page and its desktop one: its
// readings over the time chosen (loaded each time it's opened), what each
// reading's card shows (the latest, the average, the points to chart), a
// night's sleep and its stages, and typing a reading in.

export type Range = "1W" | "1M" | "3M" | "1Y";
export const RANGE_DAYS: Record<Range, number> = { "1W": 7, "1M": 30, "3M": 91, "1Y": 365 };

const pad = (n: number) => String(n).padStart(2, "0");
export const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const daysAgo = (n: number) => dayOf(new Date(Date.now() - n * 86_400_000));
export function whenLabel(date: string) {
  if (date === dayOf(new Date())) return "Today";
  if (date === daysAgo(1)) return "Yesterday";
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
export const hm = (minutes: number) => `${Math.floor(minutes / 60)}h ${pad(Math.round(minutes % 60))}m`;

// A day's reading of a type: one typed in wins over Apple Health's.
export function byDay(metrics: HealthMetric[], type: string) {
  const days = new Map<string, HealthMetric>();
  for (const m of metrics) {
    if (m.type !== type) continue;
    const had = days.get(m.date);
    if (!had || (m.source === "manual" && had.source !== "manual")) days.set(m.date, m);
  }
  return days;
}

// The two that aren't in healthSections.ts.
const TITLES: Record<string, { title: string; subtitle: string }> = {
  sleep: { title: "Sleep", subtitle: "Each night, and how it's been going" },
  workouts: { title: "Workouts", subtitle: "Your Watch's and Gym's, together" },
};

// A section (`id`): its readings over the time chosen (a week to start
// with), and — for Workouts — Gym's sessions and your weigh-ins.
export function useHealthSection(id: string) {
  const section = SECTIONS[id];
  const head = section ?? TITLES[id];
  const [range, setRange] = useState<Range>("1W");
  const [metrics, setMetrics] = useState<HealthMetric[] | null>(null);
  const [sessions, setSessions] = useState<GymSessionRecord[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);

  const types = useMemo(() => (id === "sleep" ? ["sleep"] : id === "workouts" ? ["workout"] : (section?.metrics ?? []).flatMap((m) => [m.type, ...(m.pairWith ? [m.pairWith] : [])])), [id, section]);
  const load = useCallback(() => {
    getHealthMetrics(types, daysAgo(366)).then(setMetrics, () => setMetrics([]));
    if (id === "workouts") {
      getSessions().then(setSessions, () => {});
      getWeightEntries().then(setWeights, () => {});
    }
  }, [types, id]);
  useFocusEffect(load);

  const from = daysAgo(RANGE_DAYS[range] - 1);
  const to = dayOf(new Date());
  return { section, head, range, setRange, metrics, sessions, weights, load, from, to };
}

// A reading's card: the latest, the average over the time chosen, and the
// points to chart (in the page's units).
export function metricSummary(def: MetricDef, metrics: HealthMetric[], from: string, to: string, units: Units) {
  const unit = unitLabel(def, units);
  const days = byDay(metrics, def.type);
  const pair = def.pairWith ? byDay(metrics, def.pairWith) : null;
  const all = [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
  const latest = all[0] ?? null;
  const inRange = all.filter((m) => m.date >= from && m.date <= to);
  const average = inRange.length ? shownValue(def, inRange.reduce((s, m) => s + m.value, 0) / inRange.length, units) : null;
  const show = (v: number, v2?: number) => (pair && v2 != null ? `${Math.round(v)}/${Math.round(v2)}` : formatValue(def, shownValue(def, v, units)));
  const points = inRange.map((m) => ({ date: m.date, value: shownValue(def, m.value, units), value2: pair?.get(m.date)?.value }));
  // "Average 7,840 steps a day"
  const averageText = average != null && !def.choices ? `Average ${formatValue({ ...def, places: def.places ?? (def.total ? 0 : 1) }, average)}${unit ? ` ${unit}` : ""}${def.total ? " a day" : ""}` : null;
  return { unit, pair, latest, inRange, averageText, show, points };
}

// A night's stages, deepest first.
export const STAGES: { key: string; label: string; opacity: number }[] = [
  { key: "deep", label: "Deep", opacity: 1 },
  { key: "core", label: "Core", opacity: 0.7 },
  { key: "rem", label: "REM", opacity: 0.45 },
  { key: "awake", label: "Awake", opacity: 0.18 },
];

// The nights: the latest, those in the time chosen, and their averages.
export function sleepSummary(metrics: HealthMetric[], from: string, to: string) {
  const nights = [...byDay(metrics, "sleep").values()].sort((a, b) => b.date.localeCompare(a.date));
  const last = nights[0] ?? null;
  const inRange = nights.filter((n) => n.date >= from && n.date <= to);
  const avg = inRange.length ? inRange.reduce((s, n) => s + n.value, 0) / inRange.length : null;
  const avgStage = (k: string) => (inRange.length ? inRange.reduce((s, n) => s + (n.detail?.[k] ?? 0), 0) / inRange.length : 0);
  const stagesTotal = last ? STAGES.reduce((s, st) => s + (last.detail?.[st.key] ?? 0), 0) : 0;
  return { last, inRange, avg, avgStage, stagesTotal };
}

// A time of day, "11:42 PM".
export const clock = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "");

// --- Typing one in ---

export function AddReading({ def, page, onClose, onSaved, colors: c }: { def: MetricDef | null; page: UnitPage; onClose: () => void; onSaved: () => void; colors: OrbitColors }) {
  const [units] = useUnits(page);
  const [value, setValue] = useState("");
  const [value2, setValue2] = useState("");
  const [choice, setChoice] = useState<number | null>(null);
  const [date, setDate] = useState(todayDateInputString());
  const [saving, setSaving] = useState(false);
  const reset = () => {
    setValue("");
    setValue2("");
    setChoice(null);
    setDate(todayDateInputString());
  };
  async function save() {
    if (!def || saving) return;
    const n = def.choices ? choice : Number(value.replace(",", "."));
    const n2 = Number(value2);
    if (n == null || !Number.isFinite(n) || n <= 0 || (def.pairWith && (!Number.isFinite(n2) || n2 <= 0))) return Alert.alert("Put in a reading", def.pairWith ? "Both numbers — e.g. 120 over 80." : "A number above zero.");
    setSaving(true);
    try {
      // (Typed in the units shown: kept in metric.)
      await addHealthReading(def.type, def.measure ? toStored(def.measure, n, units) : n, STORED_UNIT[def.type] ?? def.unit, date);
      if (def.pairWith) await addHealthReading(def.pairWith, n2, STORED_UNIT[def.pairWith] ?? def.unit, date);
      reset();
      onSaved();
    } catch (error) {
      Alert.alert("Couldn't save it", error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }
  const box = (v: string, set: (v: string) => void, label: string) => (
    <TextInput
      value={v}
      onChangeText={(t) => set(t.replace(/[^0-9.,]/g, ""))}
      keyboardType="decimal-pad"
      placeholder="—"
      placeholderTextColor={c.faint}
      accessibilityLabel={label}
      autoFocus={label !== "Lower"}
      style={[{ flex: 1, height: 52, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.canvas, fontSize: 20, fontWeight: "700", color: c.text, textAlign: "center" }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
    />
  );
  return (
    <Modal visible={!!def} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable onPress={onClose} style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.5)" }}>
          {def && (
            <Pressable style={{ width: "100%", maxWidth: 420, padding: 18, borderRadius: 22, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: c.text }}>{def.label}</Text>
              <View style={{ marginTop: 14 }}>
                {def.choices ? (
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {def.choices.map((label, i) => {
                      const on = choice === i + 1;
                      return (
                        <Tap key={label} onPress={() => setChoice(i + 1)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 12, backgroundColor: on ? c.ink : c.pill }} pressedStyle={{ opacity: 0.75 }}>
                          <Text style={{ fontSize: 12.5, fontWeight: "700", color: on ? c.onInk : c.onPill }}>{label}</Text>
                        </Tap>
                      );
                    })}
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {box(value, setValue, def.pairWith ? "Upper" : def.label)}
                    {def.pairWith && <Text style={{ fontSize: 20, color: c.muted }}>/</Text>}
                    {def.pairWith && box(value2, setValue2, "Lower")}
                    <Text style={{ fontSize: 14, color: c.muted }}>{unitLabel(def, units)}</Text>
                  </View>
                )}
              </View>
              <View style={{ marginTop: 12 }}>
                <DatePickerField value={date} onChange={(d) => setDate(d || todayDateInputString())} title="When" />
              </View>
              <View style={{ marginTop: 14, flexDirection: "row", gap: 8 }}>
                <Tap onPress={onClose} accessibilityRole="button" style={{ flex: 1, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: c.onPill }}>Cancel</Text>
                </Tap>
                <Tap onPress={() => void save()} disabled={saving} accessibilityRole="button" style={{ flex: 1, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.ink, opacity: saving ? 0.6 : 1 }} pressedStyle={{ opacity: 0.85 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: c.onInk }}>{saving ? "Saving…" : "Save"}</Text>
                </Tap>
              </View>
            </Pressable>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
