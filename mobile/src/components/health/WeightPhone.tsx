import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DatePickerField } from "@/src/components/forms/DatePickerField";
import { PastGoals } from "@/src/components/health/PastGoals";
import { toShown, toStored, UnitsToggle, useUnits } from "@/src/components/health/units";
import { WeightChart } from "@/src/components/health/WeightChart";
import { PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { Tap } from "@/src/components/ui/Tap";
import { loadSettings, type AppSettings } from "@/src/services/settingsService";
import { deleteWeightEntry, getWeightEntries, logWeightEntry, updateWeightEntry, type WeightEntry } from "@/src/services/weightEntryApi";
import { OrbitPage, OrbitSection, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import { todayDateInputString } from "@/src/utils/date";

// Health → Weight, on the phone: your weight now and how far you've come
// toward your goal, a chart of your weigh-ins (the last week to start with,
// or a month, three, or all of them) with the goal on it, your pace lately
// and when it'd have you at your goal, a way to log a weigh-in, and every weigh-in by month —
// each tagged Apple Health (synced) or Manual (logged or corrected here);
// tap one to correct or delete it.
// Reloaded each time it's shown. In Health's colour, in pounds or kilograms
// (the switch, beside the title; kept in kilograms either way).

const round1 = (n: number) => Math.round(n * 10) / 10;
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(round1(n))}`;
const dayMs = 86_400_000;
const dayOf = (d: string) => new Date(`${d}T00:00:00`).getTime() / dayMs;
const dateText = (d: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, opts);

type Range = "1W" | "1M" | "3M" | "All";
const RANGES: Range[] = ["1W", "1M", "3M", "All"];

// Kilograms a week lately: the trend (least squares) through the last four
// weeks' weigh-ins — none with fewer than three, over less than a week.
function weeklyPace(entries: WeightEntry[]) {
  if (!entries.length) return null;
  const end = dayOf(entries[0].date);
  const recent = entries.filter((e) => dayOf(e.date) >= end - 28);
  if (recent.length < 3 || end - dayOf(recent[recent.length - 1].date) < 7) return null;
  const xs = recent.map((e) => dayOf(e.date));
  const ys = recent.map((e) => e.weight);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return slope * 7;
}

export function WeightPhone() {
  return (
    <OrbitSection section="health">
      <OrbitPage>
        <Weight />
      </OrbitPage>
    </OrbitSection>
  );
}

function Weight() {
  const leave = useGoBack("/health-section");
  const { colors: c } = useOrbitTheme();
  const [entries, setEntries] = useState<WeightEntry[] | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  // (A week to start with.)
  const [range, setRange] = useState<Range>("1W");
  const [weightText, setWeightText] = useState("");
  const [date, setDate] = useState(todayDateInputString());
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<WeightEntry | null>(null);
  // Kilograms (as kept) shown in the units chosen, and back.
  const [units] = useUnits("weight");
  const W = (kg: number) => toShown("weight", kg, units);
  const U = units === "metric" ? "kg" : "lbs";

  const refresh = useCallback(() => Promise.all([getWeightEntries(), loadSettings()]).then(([e, s]) => (setEntries(e), setSettings(s))), []);
  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => setEntries((e) => e ?? []));
    }, [refresh]),
  );

  // (Newest first, from the server.)
  const list = useMemo(() => entries ?? [], [entries]);
  const current = list[0] ?? null;
  const goal = settings?.goalWeight ?? null;
  const start = settings?.startingWeight ?? list[list.length - 1]?.weight ?? null;
  const startDate = settings?.startingWeightDate ?? list[list.length - 1]?.date ?? null;
  const pace = useMemo(() => weeklyPace(list), [list]);
  const shown = useMemo(() => {
    if (!list.length) return [];
    const end = dayOf(list[0].date);
    const days = range === "1W" ? 7 : range === "1M" ? 31 : range === "3M" ? 92 : Infinity;
    return list
      .filter((e) => dayOf(e.date) > end - days)
      .slice()
      .reverse()
      .map((e) => ({ date: e.date, weight: e.weight }));
  }, [list, range]);
  // By month, newest first, each with the change from the weigh-in before it.
  const months = useMemo(() => {
    const out: { title: string; rows: { entry: WeightEntry; change: number | null }[] }[] = [];
    list.forEach((entry, i) => {
      const title = dateText(entry.date, { month: "long", year: "numeric" });
      const row = { entry, change: i < list.length - 1 ? round1(entry.weight - list[i + 1].weight) : null };
      if (out[out.length - 1]?.title === title) out[out.length - 1].rows.push(row);
      else out.push({ title, rows: [row] });
    });
    return out;
  }, [list]);

  async function log() {
    const weight = Number(weightText.replace(",", "."));
    if (!weightText.trim() || !Number.isFinite(weight) || weight <= 0 || weight > 1000) return Alert.alert("What did you weigh?", `Put in your weight in ${units === "metric" ? "kilograms" : "pounds"}.`);
    setSaving(true);
    try {
      await logWeightEntry(toStored("weight", weight, units), date);
      setWeightText("");
      setDate(todayDateInputString());
      await refresh();
    } catch (error) {
      Alert.alert("Couldn't log it", error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }
  function remove(entry: WeightEntry) {
    Alert.alert(`Delete ${round1(W(entry.weight))} ${U} on ${dateText(entry.date)}?`, entry.source === "apple" ? "It stays in Apple Health, but won't come back here." : undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          void deleteWeightEntry(entry._id).then(
            () => {
              setEditing(null);
              setEntries((e) => (e ?? []).filter((x) => x._id !== entry._id));
            },
            (error) => Alert.alert("Couldn't delete it", error instanceof Error ? error.message : "Something went wrong."),
          ),
      },
    ]);
  }
  async function correct(entry: WeightEntry, weight: number) {
    try {
      const saved = await updateWeightEntry(entry._id, toStored("weight", weight, units));
      setEntries((e) => (e ?? []).map((x) => (x._id === entry._id ? saved : x)));
      setEditing(null);
    } catch (error) {
      Alert.alert("Couldn't save it", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  if (!entries || !settings) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.muted} />
      </SafeAreaView>
    );
  }

  const lost = current && start != null ? current.weight - start : null;
  // Good is down on a cut, up on a bulk.
  const gaining = settings?.goalDirection === "gain";
  const progress = current && start != null && goal != null && start !== goal ? Math.max(0, Math.min(1, (start - current.weight) / (start - goal))) : null;
  // (Rounded only once shown, in the page's units.)
  const toGo = current && goal != null ? current.weight - goal : null;
  // When the pace would have you at your goal (only heading toward it).
  const eta = current && goal != null && pace && toGo && Math.sign(-pace) === Math.sign(toGo) ? new Date(dayOf(current.date) * dayMs + (Math.abs(toGo) / Math.abs(pace)) * 7 * dayMs) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <PageHeader title="Weight" subtitle={`${list.length} weigh-in${list.length === 1 ? "" : "s"}`} onBack={leave} action={<UnitsToggle page="weight" />} />

          {/* Now, and toward the goal */}
          <View style={{ marginTop: 18, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: c.muted }}>{current ? (current.date === todayDateInputString() ? "Today" : dateText(current.date, { weekday: "short", month: "short", day: "numeric" })) : "No weigh-ins yet"}</Text>
            <Text style={{ marginTop: 2, fontSize: 38, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>
              {current ? round1(W(current.weight)) : "—"}
              <Text style={{ fontSize: 17, fontWeight: "600", color: c.muted }}> {U}</Text>
            </Text>
            {lost != null && startDate && (
              <Text style={{ marginTop: 2, fontSize: 14, color: c.muted }}>
                <Text style={{ fontWeight: "700", color: (gaining ? lost >= 0 : lost <= 0) ? c.success : c.danger }}>{signed(W(lost))} {U}</Text> since {dateText(startDate)}
              </Text>
            )}
            {progress != null && goal != null && (
              <View style={{ marginTop: 14 }}>
                <View style={{ height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: c.track }}>
                  <View style={{ width: `${progress * 100}%`, height: "100%", borderRadius: 4, backgroundColor: c.fill }} />
                </View>
                <View style={{ marginTop: 6, flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 12, color: c.faint }}>{start != null ? round1(W(start)) : ""}</Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: c.text }}>{Math.round(progress * 100)}% there{toGo != null && toGo !== 0 ? ` · ${round1(W(Math.abs(toGo)))} ${U} to go` : ""}</Text>
                  <Text style={{ fontSize: 12, color: c.faint }}>Goal {round1(W(goal))}</Text>
                </View>
              </View>
            )}
          </View>

          {/* The chart */}
          {shown.length > 0 && (
            <View style={{ marginTop: 12, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
              <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
                {RANGES.map((r) => {
                  const on = r === range;
                  return (
                    <Tap key={r} onPress={() => setRange(r)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 10, backgroundColor: on ? c.ink : c.pill }} pressedStyle={{ opacity: 0.75 }}>
                      <Text style={{ fontSize: 13.5, fontWeight: "700", color: on ? c.onInk : c.onPill }}>{r}</Text>
                    </Tap>
                  );
                })}
              </View>
              <WeightChart points={shown.map((p) => ({ ...p, weight: W(p.weight) }))} goal={goal != null ? round1(W(goal)) : null} />
            </View>
          )}

          {/* Pace */}
          {(pace != null || eta) && (
            <View style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
              <Figure label="Lately" value={pace != null ? `${signed(W(pace))}` : "—"} unit={`${U} a week`} colors={c} />
              <Figure label="At this pace" value={eta ? eta.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"} unit={eta && goal != null ? `to ${round1(W(goal))} ${U}` : "not toward your goal"} colors={c} />
            </View>
          )}

          {/* Log one */}
          <Heading colors={c}>LOG A WEIGH-IN</Heading>
          <View style={{ padding: 12, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.canvas }}>
                <TextInput
                  value={weightText}
                  onChangeText={(v) => setWeightText(v.replace(/[^0-9.,]/g, ""))}
                  placeholder={current ? String(round1(W(current.weight))) : units === "metric" ? "e.g. 82.4" : "e.g. 180.4"}
                  placeholderTextColor={c.faint}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={() => void log()}
                  accessibilityLabel="Weight in pounds"
                  style={[{ flex: 1, fontSize: 20, fontWeight: "700", color: c.text }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
                />
                <Text style={{ fontSize: 15, color: c.muted }}>{U}</Text>
              </View>
              <Tap onPress={() => void log()} disabled={saving} accessibilityRole="button" style={{ height: 56, paddingHorizontal: 20, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.ink, opacity: saving ? 0.6 : 1 }} pressedStyle={{ opacity: 0.85 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: c.onInk }}>{saving ? "…" : "Log"}</Text>
              </Tap>
            </View>
            <DatePickerField value={date} onChange={(d) => setDate(d || todayDateInputString())} title="When you weighed" />
          </View>

          <PastGoals goals={settings?.pastGoals ?? []} units={units} colors={c} />

          {/* Every weigh-in */}
          {months.map((m) => (
            <View key={m.title}>
              <Heading colors={c}>{m.title.toUpperCase()}</Heading>
              <View style={{ borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }}>
                {m.rows.map(({ entry, change }, i) => (
                  <Tap key={entry._id} onPress={() => setEditing(entry)} accessibilityRole="button" accessibilityHint="Correct or delete it" style={{ flexDirection: "row", alignItems: "center", paddingLeft: 14, paddingRight: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }} pressedStyle={{ backgroundColor: c.pill }}>
                    <Text style={{ flex: 1, fontSize: 15, color: c.text }}>{dateText(entry.date, { weekday: "short", month: "short", day: "numeric" })}</Text>
                    <SourceTag apple={entry.source === "apple"} colors={c} />
                    {change != null && <Text style={{ width: 56, textAlign: "right", fontSize: 13, fontWeight: "600", color: change < 0 ? c.success : change > 0 ? c.danger : c.faint }}>{change === 0 ? "0" : signed(W(change))}</Text>}
                    <Text style={{ width: 70, textAlign: "right", fontSize: 15, fontWeight: "700", color: c.text }}>{round1(W(entry.weight))}</Text>
                  </Tap>
                ))}
              </View>
            </View>
          ))}
          {list.length === 0 && <Text style={{ marginTop: 16, textAlign: "center", fontSize: 14, color: c.muted }}>Log your first weigh-in above.</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
      <EditWeighIn entry={editing} shownAs={(kg) => String(round1(W(kg)))} unit={U} onClose={() => setEditing(null)} onSave={(entry, weight) => void correct(entry, weight)} onDelete={remove} colors={c} />
    </SafeAreaView>
  );
}

// A weigh-in, to correct (it's yours from then on: a sync leaves it alone)
// or delete.
function EditWeighIn({ entry, shownAs, unit, onClose, onSave, onDelete, colors: c }: { entry: WeightEntry | null; shownAs: (kg: number) => string; unit: string; onClose: () => void; onSave: (entry: WeightEntry, weight: number) => void; onDelete: (entry: WeightEntry) => void; colors: OrbitColors }) {
  // (Untouched: null — the weigh-in's own weight.)
  const [text, setText] = useState<string | null>(null);
  const shown = entry ? (text ?? shownAs(entry.weight)) : "";
  function save() {
    if (!entry) return;
    const weight = Number(shown.replace(",", "."));
    if (!Number.isFinite(weight) || weight <= 0 || weight > 1000) return Alert.alert("What did you weigh?", `Put in your weight in ${unit === "kg" ? "kilograms" : "pounds"}.`);
    setText(null);
    onSave(entry, weight);
  }
  return (
    <Modal
      visible={!!entry}
      transparent
      animationType="fade"
      onRequestClose={() => {
        setText(null);
        onClose();
      }}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable
          onPress={() => {
            setText(null);
            onClose();
          }}
          style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          {entry && (
            <Pressable style={{ width: "100%", maxWidth: 420, padding: 18, borderRadius: 22, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: c.text }}>{dateText(entry.date, { weekday: "long", month: "long", day: "numeric" })}</Text>
              <Text style={{ marginTop: 2, fontSize: 13, color: c.muted }}>{entry.source === "apple" ? "From Apple Health — a change here is yours, and a sync leaves it alone" : "Logged here"}</Text>
              <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.canvas }}>
                <TextInput
                  value={shown}
                  onChangeText={(v) => setText(v.replace(/[^0-9.,]/g, ""))}
                  keyboardType="decimal-pad"
                  autoFocus
                  selectTextOnFocus
                  accessibilityLabel="Weight in pounds"
                  style={[{ flex: 1, fontSize: 22, fontWeight: "700", color: c.text }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
                />
                <Text style={{ fontSize: 15, color: c.muted }}>{unit}</Text>
              </View>
              <View style={{ marginTop: 14, flexDirection: "row", gap: 8 }}>
                <Tap onPress={() => onDelete(entry)} accessibilityRole="button" style={{ height: 48, paddingHorizontal: 16, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
                  <Ionicons name="trash-outline" size={18} color={c.danger} />
                </Tap>
                <Tap
                  onPress={() => {
                    setText(null);
                    onClose();
                  }}
                  accessibilityRole="button"
                  style={{ flex: 1, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.pill }}
                  pressedStyle={{ opacity: 0.7 }}
                >
                  <Text style={{ fontSize: 15, fontWeight: "600", color: c.onPill }}>Cancel</Text>
                </Tap>
                <Tap onPress={save} accessibilityRole="button" style={{ flex: 1, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.ink }} pressedStyle={{ opacity: 0.85 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: c.onInk }}>Save</Text>
                </Tap>
              </View>
            </Pressable>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Where a weigh-in came from: Apple Health (synced) or Manual (logged or
// corrected here — a sync leaves it alone).
function SourceTag({ apple, colors: c }: { apple: boolean; colors: OrbitColors }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginRight: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: c.pill }}>
      <Ionicons name={apple ? "heart" : "create-outline"} size={10} color={apple ? "#FF2D55" : c.muted} />
      <Text style={{ fontSize: 11, fontWeight: "600", color: c.muted }}>{apple ? "Apple Health" : "Manual"}</Text>
    </View>
  );
}

function Heading({ children, colors: c }: { children: string; colors: OrbitColors }) {
  return <Text style={{ marginTop: 24, marginBottom: 8, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>{children}</Text>;
}
function Figure({ label, value, unit, colors: c }: { label: string; value: string; unit: string; colors: OrbitColors }) {
  return (
    <View style={{ flex: 1, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
      <Text style={{ fontSize: 12.5, color: c.muted }}>{label}</Text>
      <Text style={{ marginTop: 3, fontSize: 22, fontWeight: "800", color: c.text }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>
      <Text style={{ marginTop: 1, fontSize: 12, color: c.faint }}>{unit}</Text>
    </View>
  );
}
