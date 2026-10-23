import { Ionicons } from "@expo/vector-icons";
import { WorkoutActivityType } from "@kingstinct/react-native-healthkit";
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DatePickerField } from "@/src/components/forms/DatePickerField";
import { durationLabel } from "@/src/components/gym/schedule";
import { formatValue, hasMeasures, SECTIONS, shownValue, STORED_UNIT, unitLabel, type MetricDef } from "@/src/components/health/healthSections";
import { toShown, toStored, UnitsToggle, useUnits, type UnitPage } from "@/src/components/health/units";
import { MetricChart } from "@/src/components/health/MetricChart";
import { PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { Tap } from "@/src/components/ui/Tap";
import { getSessions, sessionTotals, type GymSessionRecord } from "@/src/services/gymApi";
import { addHealthReading, getHealthMetrics, type HealthMetric } from "@/src/services/healthSync";
import { OrbitPage, OrbitSection, SECTION_PALETTE, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import { todayDateInputString } from "@/src/utils/date";

// One of Health's sections (healthSections.ts): each of its readings — the
// latest, the average, and a chart over a week, a month, three or a year —
// from Apple Health, or typed in (Add). Sleep (each night, its stages) and
// Workouts (the Watch's and Gym's together) have their own. In Health's
// colour, in imperial or metric (the page's own switch, beside the title,
// where it matters).
// (`id`: activity, body, heart, vitals, mind, drinks, sleep, workouts.)

type Range = "1W" | "1M" | "3M" | "1Y";
const RANGE_DAYS: Record<Range, number> = { "1W": 7, "1M": 30, "3M": 91, "1Y": 365 };

const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n: number) => dayOf(new Date(Date.now() - n * 86_400_000));
function whenLabel(date: string) {
  if (date === dayOf(new Date())) return "Today";
  if (date === daysAgo(1)) return "Yesterday";
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
const hm = (minutes: number) => `${Math.floor(minutes / 60)}h ${pad(Math.round(minutes % 60))}m`;

// A day's reading of a type: one typed in wins over Apple Health's.
function byDay(metrics: HealthMetric[], type: string) {
  const days = new Map<string, HealthMetric>();
  for (const m of metrics) {
    if (m.type !== type) continue;
    const had = days.get(m.date);
    if (!had || (m.source === "manual" && had.source !== "manual")) days.set(m.date, m);
  }
  return days;
}

const TITLES: Record<string, { title: string; subtitle: string }> = {
  sleep: { title: "Sleep", subtitle: "Each night, and how it's been going" },
  workouts: { title: "Workouts", subtitle: "Your Watch's and Gym's, together" },
};

export default function HealthSectionScreen() {
  return (
    <OrbitSection section="health">
      <OrbitPage>
        <SectionPage />
      </OrbitPage>
    </OrbitSection>
  );
}

function SectionPage() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const leave = useGoBack("/health-section");
  const { colors: c } = useOrbitTheme();
  const section = SECTIONS[id];
  const head = section ?? TITLES[id];
  // (A week to start with.)
  const [range, setRange] = useState<Range>("1W");
  const [metrics, setMetrics] = useState<HealthMetric[] | null>(null);
  const [sessions, setSessions] = useState<GymSessionRecord[]>([]);
  const [adding, setAdding] = useState<MetricDef | null>(null);

  const types = useMemo(() => (id === "sleep" ? ["sleep"] : id === "workouts" ? ["workout"] : (section?.metrics ?? []).flatMap((m) => [m.type, ...(m.pairWith ? [m.pairWith] : [])])), [id, section]);
  const load = useCallback(() => {
    getHealthMetrics(types, daysAgo(366)).then(setMetrics, () => setMetrics([]));
    if (id === "workouts") getSessions().then(setSessions, () => {});
  }, [types, id]);
  useFocusEffect(load);

  if (!head) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas, padding: 16 }}>
        <PageHeader title="Health" onBack={leave} />
        <Text style={{ marginTop: 24, color: c.muted }}>There&apos;s no section here.</Text>
      </SafeAreaView>
    );
  }
  const from = daysAgo(RANGE_DAYS[range] - 1);
  const to = dayOf(new Date());

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <PageHeader title={head.title} subtitle={head.subtitle} onBack={leave} action={(section && hasMeasures(section)) || id === "workouts" ? <UnitsToggle page={id as UnitPage} /> : undefined} />

        <View style={{ marginTop: 16, flexDirection: "row", gap: 6 }}>
          {(Object.keys(RANGE_DAYS) as Range[]).map((r) => {
            const on = r === range;
            return (
              <Tap key={r} onPress={() => setRange(r)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 10, backgroundColor: on ? c.ink : c.pill }} pressedStyle={{ opacity: 0.75 }}>
                <Text style={{ fontSize: 13.5, fontWeight: "700", color: on ? c.onInk : c.onPill }}>{r}</Text>
              </Tap>
            );
          })}
        </View>

        {!metrics ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={c.muted} />
        ) : id === "sleep" ? (
          <Sleep metrics={metrics} from={from} to={to} colors={c} />
        ) : id === "workouts" ? (
          <Workouts metrics={metrics} sessions={sessions} from={from} colors={c} />
        ) : (
          section!.metrics.map((def) => <MetricCard key={def.type} def={def} page={id as UnitPage} metrics={metrics} from={from} to={to} onAdd={() => setAdding(def)} colors={c} />)
        )}
      </ScrollView>
      <AddReading
        def={adding}
        page={id as UnitPage}
        onClose={() => setAdding(null)}
        onSaved={() => {
          setAdding(null);
          load();
        }}
        colors={c}
      />
    </SafeAreaView>
  );
}

// --- A reading: the latest, the average, the chart ---

function MetricCard({ def, page, metrics, from, to, onAdd, colors: c }: { def: MetricDef; page: UnitPage; metrics: HealthMetric[]; from: string; to: string; onAdd: () => void; colors: OrbitColors }) {
  const [units] = useUnits(page);
  const unit = unitLabel(def, units);
  const days = byDay(metrics, def.type);
  const pair = def.pairWith ? byDay(metrics, def.pairWith) : null;
  const all = [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
  const latest = all[0] ?? null;
  const inRange = all.filter((m) => m.date >= from && m.date <= to);
  const average = inRange.length ? shownValue(def, inRange.reduce((s, m) => s + m.value, 0) / inRange.length, units) : null;
  const show = (v: number, v2?: number) => (pair && v2 != null ? `${Math.round(v)}/${Math.round(v2)}` : formatValue(def, shownValue(def, v, units)));
  const points = inRange.map((m) => ({ date: m.date, value: shownValue(def, m.value, units), value2: pair?.get(m.date)?.value }));

  return (
    <View style={{ marginTop: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }}>{def.label}</Text>
          {!!def.hint && <Text style={{ marginTop: 1, fontSize: 12, color: c.faint }}>{def.hint}</Text>}
        </View>
        {def.manual && (
          <Tap onPress={onAdd} accessibilityRole="button" accessibilityLabel={`Add ${def.label}`} style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
            <Ionicons name="add" size={15} color={c.onPill} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: c.onPill }}>Add</Text>
          </Tap>
        )}
      </View>
      {latest ? (
        <>
          <View style={{ marginTop: 8, flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Text style={{ fontSize: 26, fontWeight: "800", color: c.text }}>{show(latest.value, pair?.get(latest.date)?.value)}</Text>
            {!!unit && <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted }}>{unit}</Text>}
            <Text style={{ marginLeft: "auto", fontSize: 12.5, color: c.muted }}>{whenLabel(latest.date)}</Text>
          </View>
          {average != null && !def.choices && (
            <Text style={{ marginTop: 1, fontSize: 12.5, color: c.muted }}>
              Average {formatValue({ ...def, places: def.places ?? (def.total ? 0 : 1) }, average)}
              {unit ? ` ${unit}` : ""}
              {def.total ? " a day" : ""}
            </Text>
          )}
          {points.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              <MetricChart points={points} from={from} to={to} bars={def.total} />
            </View>
          ) : (
            <Text style={{ marginTop: 8, fontSize: 13, color: c.faint }}>Nothing in this time.</Text>
          )}
        </>
      ) : (
        <Text style={{ marginTop: 8, fontSize: 13.5, lineHeight: 19, color: c.muted }}>{def.manual ? "Add a reading, or it'll come from Apple Health once it's connected." : "Comes from Apple Health once it's connected."}</Text>
      )}
    </View>
  );
}

// --- Typing one in ---

function AddReading({ def, page, onClose, onSaved, colors: c }: { def: MetricDef | null; page: UnitPage; onClose: () => void; onSaved: () => void; colors: OrbitColors }) {
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

// --- Sleep: last night, its stages, the nights over time ---

const STAGES: { key: string; label: string; opacity: number }[] = [
  { key: "deep", label: "Deep", opacity: 1 },
  { key: "core", label: "Core", opacity: 0.7 },
  { key: "rem", label: "REM", opacity: 0.45 },
  { key: "awake", label: "Awake", opacity: 0.18 },
];

function Sleep({ metrics, from, to, colors: c }: { metrics: HealthMetric[]; from: string; to: string; colors: OrbitColors }) {
  const nights = [...byDay(metrics, "sleep").values()].sort((a, b) => b.date.localeCompare(a.date));
  const last = nights[0] ?? null;
  const inRange = nights.filter((n) => n.date >= from && n.date <= to);
  const avg = inRange.length ? inRange.reduce((s, n) => s + n.value, 0) / inRange.length : null;
  const avgStage = (k: string) => (inRange.length ? inRange.reduce((s, n) => s + (n.detail?.[k] ?? 0), 0) / inRange.length : 0);
  const time = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "");

  if (!last) return <Text style={{ marginTop: 20, fontSize: 14, lineHeight: 20, color: c.muted }}>Your nights come from Apple Health once it&apos;s connected — sleep with your Watch on, or set up Sleep on your iPhone.</Text>;
  const stagesTotal = STAGES.reduce((s, st) => s + (last.detail?.[st.key] ?? 0), 0);

  return (
    <>
      <View style={{ marginTop: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
        <Text style={{ fontSize: 12.5, fontWeight: "600", color: c.muted }}>{last.date === dayOf(new Date()) ? "Last night" : whenLabel(last.date)}</Text>
        <Text style={{ marginTop: 2, fontSize: 30, fontWeight: "800", color: c.text }}>{hm(last.value)}</Text>
        <Text style={{ fontSize: 13, color: c.muted }}>
          asleep · {time(last.start)} – {time(last.end)}
        </Text>
        {stagesTotal > 0 && (
          <>
            <View style={{ marginTop: 12, flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", backgroundColor: c.track }}>
              {STAGES.map((st) => {
                const v = last.detail?.[st.key] ?? 0;
                return v ? <View key={st.key} style={{ flex: v, backgroundColor: c.fill, opacity: st.opacity }} /> : null;
              })}
            </View>
            <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {STAGES.map((st) => (
                <View key={st.key} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: c.fill, opacity: st.opacity }} />
                  <Text style={{ fontSize: 12.5, color: c.muted }}>
                    {st.label} <Text style={{ fontWeight: "700", color: c.text }}>{hm(last.detail?.[st.key] ?? 0)}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      <View style={{ marginTop: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }}>Hours asleep</Text>
        {avg != null && (
          <Text style={{ marginTop: 2, fontSize: 12.5, color: c.muted }}>
            Average {hm(avg)} a night{avgStage("deep") ? ` · deep ${hm(avgStage("deep"))}, REM ${hm(avgStage("rem"))}` : ""}
          </Text>
        )}
        <View style={{ marginTop: 10 }}>
          <MetricChart points={inRange.map((n) => ({ date: n.date, value: Math.round((n.value / 60) * 10) / 10 }))} from={from} to={to} bars />
        </View>
      </View>
    </>
  );
}

// --- Workouts: the Watch's and Gym's, by day ---

// Strength workouts (traditional and functional): the kind a Gym session is.
const STRENGTH = new Set([Number(WorkoutActivityType.traditionalStrengthTraining), Number(WorkoutActivityType.functionalStrengthTraining)]);

// "traditionalStrengthTraining" → "Traditional strength training".
function activityName(n: number) {
  const name = (WorkoutActivityType as unknown as Record<number, string>)[n] ?? "workout";
  const words = name.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  return words[0].toUpperCase() + words.slice(1);
}

function Workouts({ metrics, sessions, from, colors: c }: { metrics: HealthMetric[]; sessions: GymSessionRecord[]; from: string; colors: OrbitColors }) {
  const router = useRouter();
  const [units] = useUnits("workouts");
  type Item = { key: string; date: string; name: string; minutes: number; kcal?: number; km?: number; gym?: string; time: string };
  // A Gym session and the strength workout another app (Hevy, the Watch)
  // saved to Apple Health for it are the same workout: one, Gym's, with
  // the Watch's calories.
  const apple = metrics.filter((m) => m.type === "workout");
  const used = new Set<string>();
  const gymItems: Item[] = sessions.map((s) => {
    const start = new Date(s.startedAt).getTime();
    const twin = apple.find((m) => !used.has(m._id) && STRENGTH.has(m.detail?.activity ?? -1) && m.start && Math.abs(new Date(m.start).getTime() - start) <= 45 * 60_000);
    if (twin) used.add(twin._id);
    return { key: s._id, date: dayOf(new Date(s.startedAt)), name: s.name, minutes: sessionTotals(s).seconds / 60, kcal: twin?.detail?.kcal || undefined, gym: s._id, time: s.startedAt };
  });
  const items: Item[] = [
    ...apple
      .filter((m) => !used.has(m._id))
      .map((m) => ({ key: m._id, date: m.date, name: activityName(m.detail?.activity ?? 0), minutes: m.value, kcal: m.detail?.kcal || undefined, km: m.detail?.km || undefined, time: m.start ?? `${m.date}T00:00:00` })),
    ...gymItems,
  ]
    .filter((w) => w.date >= from)
    .sort((a, b) => b.time.localeCompare(a.time));
  const minutes = items.reduce((s, w) => s + w.minutes, 0);
  const kcal = items.reduce((s, w) => s + (w.kcal ?? 0), 0);

  return (
    <>
      <View style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
        {[
          { label: "Workouts", value: String(items.length) },
          { label: "Time", value: durationLabel(minutes * 60) },
          { label: "Active", value: kcal ? `${Math.round(kcal).toLocaleString()} kcal` : "—" },
        ].map((f) => (
          <View key={f.label} style={{ flex: 1, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
            <Text style={{ fontSize: 12, color: c.muted }}>{f.label}</Text>
            <Text style={{ marginTop: 2, fontSize: 17, fontWeight: "800", color: c.text }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {f.value}
            </Text>
          </View>
        ))}
      </View>
      {items.length === 0 ? (
        <Text style={{ marginTop: 20, fontSize: 14, lineHeight: 20, color: c.muted }}>Your Watch&apos;s workouts come from Apple Health once it&apos;s connected; Gym&apos;s show here as you finish them.</Text>
      ) : (
        <View style={{ marginTop: 12, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }}>
          {items.map((w, i) => (
            <Tap key={w.key} onPress={w.gym ? () => router.push(`/gym/sessions/${w.gym}` as Href) : undefined} disabled={!w.gym} accessibilityRole={w.gym ? "button" : undefined} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }} pressedStyle={{ backgroundColor: c.pill }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: w.gym ? SECTION_PALETTE.gym.base : c.fill }}>
                <Ionicons name={w.gym ? "barbell" : "fitness"} size={18} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: c.text }} numberOfLines={1}>
                  {w.name}
                </Text>
                <Text style={{ marginTop: 1, fontSize: 12.5, color: c.muted }}>
                  {whenLabel(w.date)} · {durationLabel(w.minutes * 60)}
                  {w.kcal ? ` · ${w.kcal} kcal` : ""}
                  {w.km ? ` · ${Math.round(toShown("distance", w.km, units) * 100) / 100} ${units === "metric" ? "km" : "mi"}` : ""}
                  {w.gym ? " · Gym" : ""}
                </Text>
              </View>
              {w.gym && <Ionicons name="chevron-forward" size={16} color={c.faint} />}
            </Tap>
          ))}
        </View>
      )}
    </>
  );
}
