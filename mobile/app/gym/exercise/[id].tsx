import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import { lbs, METRICS, personalRecords, sessionValue, type ExerciseSession, type Metric } from "@/src/components/gym/exerciseStats";
import { MuscleDot, MuscleMap, PRIMARY_COLOR, SECONDARY_COLOR } from "@/src/components/gym/MuscleMap";
import { ProgressChart } from "@/src/components/gym/ProgressChart";
import { showActions } from "@/src/components/todo/theme";
import { Tap } from "@/src/components/ui/Tap";
import { exerciseImage, getExercise, groupLabel, type Exercise } from "@/src/services/exerciseApi";
import { OrbitSection, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// One exercise: the muscles it works (on the body, front and back), then
// three tabs, as Hevy has them —
//   Summary   how it's done (its two photos), your progress in it over time
//             (by the measure you pick) and your bests;
//   History   every session you've done it in;
//   How to    the steps.
// (Your progress and history come from the workouts you log — the next
// thing to build — so for now they're there, empty.)

type Tab = "summary" | "history" | "howto";
const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "history", label: "History" },
  { id: "howto", label: "How to" },
];
const RANGES = [
  { id: "3m", label: "Last 3 months", days: 92 },
  { id: "year", label: "Year", days: 366 },
  { id: "all", label: "All time", days: Infinity },
] as const;

export default function ExerciseScreen() {
  return (
    <OrbitSection section="gym">
      <ExercisePage />
    </OrbitSection>
  );
}

const titled = (text: string | null | undefined) => (text ? text.replace(/\b\w/g, (ch) => ch.toUpperCase()) : "");

function ExercisePage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: c } = useOrbitTheme();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("summary");
  useEffect(() => {
    if (id) getExercise(id).then(setExercise, () => setFailed(true));
  }, [id]);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/gym/exercises"));
  // (The sessions it was done in: from logged workouts, once there are.)
  const sessions: ExerciseSession[] = useMemo(() => [], []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      {/* The top: the way back and the name, then the three tabs across */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6 }}>
        <Tap onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }} pressedStyle={{ backgroundColor: c.pill }}>
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </Tap>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: c.text }} numberOfLines={1}>
          {exercise?.name ?? ""}
        </Text>
      </View>
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.border }}>
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <View key={t.id} style={{ flex: 1 }}>
              <Tap onPress={() => setTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ alignItems: "center", paddingVertical: 12 }} pressedStyle={{ opacity: 0.6 }}>
                <Text style={{ fontSize: 15, fontWeight: on ? "700" : "500", color: on ? c.text : c.muted }}>{t.label}</Text>
              </Tap>
              <View style={{ height: 2.5, marginBottom: -1, backgroundColor: on ? c.ink : "transparent" }} />
            </View>
          );
        })}
      </View>

      {!exercise ? (
        failed ? <Text style={{ textAlign: "center", marginTop: 40, fontSize: 14, color: c.muted }}>Couldn&apos;t load this exercise.</Text> : <ActivityIndicator style={{ marginTop: 40 }} color={c.muted} />
      ) : (
        <ScrollView key={tab} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          {tab === "summary" ? <Summary exercise={exercise} sessions={sessions} colors={c} /> : tab === "history" ? <History sessions={sessions} colors={c} /> : <HowTo exercise={exercise} colors={c} />}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// Summary: the movement, then your progress and your bests.
function Summary({ exercise, sessions, colors: c }: { exercise: Exercise; sessions: ExerciseSession[]; colors: OrbitColors }) {
  const [metric, setMetric] = useState<Metric>("heaviest");
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("year");
  const chosen = METRICS.find((m) => m.id === metric)!;
  const days = RANGES.find((r) => r.id === range)!.days;
  const since = Number.isFinite(days) ? new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10) : "";
  const points = sessions
    .filter((s) => s.date >= since)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ date: s.date, value: sessionValue(s, metric) }))
    .filter((p) => p.value > 0);
  const last = points[points.length - 1];
  const records = personalRecords(sessions);

  return (
    <View>
      {/* The exercise: its icon, its whole name and what it takes */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <ExerciseIcon name={exercise.name} primary={exercise.primaryMuscles} secondary={exercise.secondaryMuscles} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", letterSpacing: -0.3, color: c.text }}>{exercise.name}</Text>
          <Text style={{ marginTop: 2, fontSize: 13, color: c.muted }}>{[titled(exercise.equipment), titled(exercise.level), titled(exercise.mechanic)].filter(Boolean).join(" · ")}</Text>
        </View>
      </View>

      {/* The muscles — the body small, beside their names */}
      <View style={{ marginTop: 14, marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
        <MuscleMap primary={exercise.primaryMuscles} secondary={exercise.secondaryMuscles} size={0.5} keyless />
        <View style={{ flex: 1, gap: 10 }}>
          <Muscles label="Primary" dot={PRIMARY_COLOR} muscles={exercise.primaryMuscles} colors={c} />
          {exercise.secondaryMuscles.length > 0 && <Muscles label="Secondary" dot={SECONDARY_COLOR} muscles={exercise.secondaryMuscles} colors={c} />}
        </View>
      </View>

      {exercise.images.length > 0 && (
        <View style={{ flexDirection: "row", gap: 10 }}>
          {exercise.images.slice(0, 2).map((path, i) => (
            <View key={path} style={{ flex: 1 }}>
              <Image source={{ uri: exerciseImage(path) }} style={{ width: "100%", aspectRatio: 850 / 567, borderRadius: 14, backgroundColor: c.pill }} contentFit="cover" transition={150} accessibilityLabel={i === 0 ? "Start position" : "End position"} />
              <Text style={{ marginTop: 6, textAlign: "center", fontSize: 12, color: c.muted }}>{i === 0 ? "Start" : "End"}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Progress */}
      <View style={{ marginTop: 22, flexDirection: "row", alignItems: "baseline" }}>
        <Text style={{ flex: 1, fontSize: 22, fontWeight: "800", color: c.text }}>
          {last ? `${lbs(last.value)} ${chosen.unit}` : "—"}
          {last && <Text style={{ fontSize: 15, fontWeight: "600", color: c.muted }}>{`  ${new Date(`${last.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}</Text>}
        </Text>
        <Tap onPress={() => showActions("Show", RANGES.map((r) => ({ label: r.id === range ? `${r.label} ✓` : r.label, onPress: () => setRange(r.id) })))} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 }} pressedStyle={{ opacity: 0.6 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: c.text }}>{RANGES.find((r) => r.id === range)!.label}</Text>
          <Ionicons name="chevron-down" size={16} color={c.text} />
        </Tap>
      </View>
      <View style={{ marginTop: 10 }}>
        <ProgressChart points={points} unit={chosen.unit} empty={`Do ${exercise.name} in a workout and your ${chosen.label.toLowerCase()} shows here, session by session.`} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {METRICS.map((m) => {
          const on = m.id === metric;
          return (
            <Tap key={m.id} onPress={() => setMetric(m.id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: on ? c.ink : c.pill }} pressedStyle={{ opacity: 0.75 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: on ? c.onInk : c.onPill }}>{m.label}</Text>
            </Tap>
          );
        })}
      </ScrollView>

      {/* Your bests */}
      <View style={{ marginTop: 26, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="trophy-outline" size={18} color={c.muted} />
        <Text style={{ fontSize: 17, fontWeight: "700", color: c.text }}>Personal records</Text>
      </View>
      <View style={{ marginTop: 10, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }}>
        <Record label="Heaviest weight" value={records.heaviest != null ? `${lbs(records.heaviest)} lbs` : "—"} colors={c} />
        <Record label="Best 1RM" value={records.oneRepMax != null ? `${lbs(records.oneRepMax)} lbs` : "—"} hint="Estimated, from your sets" colors={c} />
        <Record label="Best set volume" value={records.bestSet ? `${lbs(records.bestSet.weight ?? 0)} lbs × ${records.bestSet.reps}` : "—"} colors={c} />
        <Record label="Best session volume" value={records.sessionVolume != null ? `${lbs(records.sessionVolume)} lbs` : "—"} last colors={c} />
      </View>
    </View>
  );
}

function Record({ label, value, hint, last, colors: c }: { label: string; value: string; hint?: string; last?: boolean; colors: OrbitColors }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, color: c.text }}>{label}</Text>
        {!!hint && <Text style={{ marginTop: 1, fontSize: 12, color: c.faint }}>{hint}</Text>}
      </View>
      <Text style={{ fontSize: 16, fontWeight: "700", color: value === "—" ? c.faint : c.text }}>{value}</Text>
    </View>
  );
}

// History: every session it was done in, the latest first (once workouts
// are logged).
function History({ sessions, colors: c }: { sessions: ExerciseSession[]; colors: OrbitColors }) {
  if (!sessions.length) {
    return (
      <View style={{ alignItems: "center", paddingHorizontal: 24, paddingVertical: 36, borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: c.orbit }}>
        <Ionicons name="time-outline" size={30} color={c.faint} />
        <Text style={{ marginTop: 10, fontSize: 16, fontWeight: "700", color: c.text }}>No sessions yet</Text>
        <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, textAlign: "center", color: c.muted }}>Each time you do it in a workout, its sets — weight and reps — are kept here.</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {[...sessions]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((s, i) => (
          <View key={s.date + i} style={{ padding: 14, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: c.text }}>{new Date(`${s.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</Text>
            {s.sets.map((set, n) => (
              <Text key={n} style={{ marginTop: 4, fontSize: 14, color: c.muted }}>{`${n + 1}   ${set.weight ?? "—"} lbs × ${set.reps ?? "—"}`}</Text>
            ))}
          </View>
        ))}
    </View>
  );
}

// How to: the steps.
function HowTo({ exercise, colors: c }: { exercise: Exercise; colors: OrbitColors }) {
  return (
    <View>
      {exercise.instructions?.length ? (
        <View style={{ gap: 12 }}>
          {exercise.instructions.map((step, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: c.ink }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: c.onInk }}>{i + 1}</Text>
              </View>
              <Text style={{ flex: 1, fontSize: 15, lineHeight: 22, color: c.text }}>{step}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ fontSize: 14, color: c.muted }}>No steps written for this one yet.</Text>
      )}
      <Text style={{ marginTop: 28, fontSize: 11, color: c.faint }}>Photos and steps from free-exercise-db (public domain).</Text>
    </View>
  );
}

function Muscles({ label, dot, muscles, colors: c }: { label: string; dot: string; muscles: string[]; colors: OrbitColors }) {
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <MuscleDot color={dot} size={8} />
        <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.6, color: c.muted }}>{label.toUpperCase()}</Text>
      </View>
      <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {muscles.map((m) => (
          <View key={m} style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: c.pill }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: c.onPill }}>{groupLabel(m)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
