import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import { lbs, METRICS_FOR, personalRecords, sessionValue, type ExerciseSession, type Metric } from "@/src/components/gym/exerciseStats";
import { MuscleDot, MuscleMap, PRIMARY_COLOR, SECONDARY_COLOR } from "@/src/components/gym/MuscleMap";
import { ProgressChart } from "@/src/components/gym/ProgressChart";
import { setText, timeText, trackOf } from "@/src/components/gym/tracking";
import { BackLink } from "@/src/components/pantry/web/orbitWeb";
import { Card, Empty, hoverable, PageTitle, Segmented, WebPage } from "@/src/components/web/ui";
import { exerciseImage, groupLabel, type Exercise } from "@/src/services/exerciseApi";
import { setLabels, setTypeOf, type ExerciseSessionRecord } from "@/src/services/gymApi";
import { OrbitPage, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// One exercise in a desktop browser, all of it on one page (the phone's
// three tabs side by side): your progress in it over time (by the measure
// and the span you pick) with your bests under it, then how it's done (its
// two photos and the steps); beside them the muscles it works (on the body,
// front and back, with their names) and every session you've done it in,
// the latest first — each opening that workout.

type Hover = { hovered?: boolean };
type Range = "3m" | "year" | "all";
const RANGES: { value: Range; label: string; days: number }[] = [
  { value: "3m", label: "3 months", days: 92 },
  { value: "year", label: "Year", days: 366 },
  { value: "all", label: "All time", days: Infinity },
];
const titled = (text: string | null | undefined) => (text ? text.replace(/\b\w/g, (ch) => ch.toUpperCase()) : "");

export function WebExerciseDetail({
  exercise,
  failed,
  sessions,
  history,
  onBack,
}: {
  exercise: Exercise | null;
  failed: boolean;
  // The sessions it was done in, by day (for the chart and bests)…
  sessions: ExerciseSession[];
  // …and as they came (each workout's id and name, for the history).
  history: ExerciseSessionRecord[];
  onBack: () => void;
}) {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const [metric, setMetric] = useState<Metric | null>(null);
  const [range, setRange] = useState<Range>("year");

  if (!exercise) {
    return (
      <OrbitPage>
        <WebPage maxWidth={1280}>
          <BackLink label="Exercises" onPress={onBack} />
          <PageTitle title="Exercise" />
          <Text style={{ fontSize: 14, color: c.muted }}>{failed ? "Couldn't load this exercise." : "Loading…"}</Text>
        </WebPage>
      </OrbitPage>
    );
  }

  // (What's charted and kept as bests: by how it's logged.)
  const track = trackOf(exercise);
  const metrics = METRICS_FOR[track];
  const chosen = metrics.find((m) => m.id === metric) ?? metrics[0];
  const days = RANGES.find((r) => r.value === range)!.days;
  const since = Number.isFinite(days) ? new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10) : "";
  const points = sessions
    .filter((s) => s.date >= since)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ date: s.date, value: sessionValue(s, chosen.id, track) }))
    .filter((p) => p.value > 0);
  const last = points[points.length - 1];
  const records = personalRecords(sessions, track);
  const done = [...history].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));

  return (
    <OrbitPage>
      <WebPage maxWidth={1280}>
        <BackLink label="Exercises" onPress={onBack} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          {/* (Level with the title, over PageTitle's own space under it.) */}
          <View style={{ marginBottom: 18 }}>
            <ExerciseIcon name={exercise.name} primary={exercise.primaryMuscles} secondary={exercise.secondaryMuscles} size={60} />
          </View>
          <View style={{ flex: 1 }}>
            <PageTitle title={exercise.name} subtitle={[titled(exercise.equipment), titled(exercise.level), titled(exercise.mechanic)].filter(Boolean).join(" · ") || undefined} />
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
          <View style={{ flex: 1, minWidth: 0, gap: 16 }}>
            {/* Progress */}
            <Card title="Progress" subtitle={`${chosen.label}, session by session`} action={<Segmented options={RANGES} value={range} onChange={setRange} />}>
              <Text style={{ fontSize: 26, fontWeight: "800", color: c.text }}>
                {last ? (chosen.unit === "min" ? timeText(last.value * 60) : `${lbs(last.value)} ${chosen.unit}`) : "—"}
                {last && <Text style={{ fontSize: 14, fontWeight: "600", color: c.muted }}>{`  ${new Date(`${last.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}</Text>}
              </Text>
              <View style={{ marginTop: 10 }}>
                <ProgressChart points={points} unit={chosen.unit} empty={`Do ${exercise.name} in a workout and your ${chosen.label.toLowerCase()} shows here, session by session.`} />
              </View>
              <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {metrics.map((m) => {
                  const on = m.id === chosen.id;
                  return (
                    <Pressable key={m.id} onPress={() => setMetric(m.id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={hoverable(({ hovered }: Hover) => ({ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: on ? c.ink : hovered ? c.track : c.pill }))}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: on ? c.onInk : c.onPill }}>{m.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card>

            {/* Your bests */}
            <Card title="Personal records">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {records.map((r) => (
                  <View key={r.label} style={{ flexGrow: 1, flexBasis: 200, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.canvas }}>
                    <Text style={{ fontSize: 12.5, fontWeight: "600", color: c.muted }}>{r.label}</Text>
                    <Text style={{ marginTop: 4, fontSize: 20, fontWeight: "800", color: r.value ? c.text : c.faint }}>{r.value ?? "—"}</Text>
                    {!!r.hint && <Text style={{ marginTop: 2, fontSize: 11.5, color: c.faint }}>{r.hint}</Text>}
                  </View>
                ))}
              </View>
            </Card>

            {/* How it's done */}
            <Card title="How to">
              {exercise.images.length > 0 && (
                <View style={{ marginBottom: 16, flexDirection: "row", gap: 12 }}>
                  {exercise.images.slice(0, 2).map((path, i) => (
                    <View key={path} style={{ flex: 1 }}>
                      <Image source={{ uri: exerciseImage(path) }} style={{ width: "100%", aspectRatio: 850 / 567, borderRadius: 14, backgroundColor: c.pill }} contentFit="cover" transition={150} accessibilityLabel={i === 0 ? "Start position" : "End position"} />
                      <Text style={{ marginTop: 6, textAlign: "center", fontSize: 12, color: c.muted }}>{i === 0 ? "Start" : "End"}</Text>
                    </View>
                  ))}
                </View>
              )}
              {exercise.instructions?.length ? (
                <View style={{ gap: 12 }}>
                  {exercise.instructions.map((step, i) => (
                    <View key={i} style={{ flexDirection: "row", gap: 12 }}>
                      <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.ink }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: c.onInk }}>{i + 1}</Text>
                      </View>
                      <Text style={{ flex: 1, fontSize: 14, lineHeight: 21, color: c.text }}>{step}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ fontSize: 13.5, color: c.muted }}>No steps written for this one yet.</Text>
              )}
              <Text style={{ marginTop: 18, fontSize: 11, color: c.faint }}>Photos and steps from free-exercise-db (public domain).</Text>
            </Card>
          </View>

          <View style={{ width: 400, gap: 16 }}>
            {/* The muscles */}
            <Card title="Muscles it works">
              <MuscleMap primary={exercise.primaryMuscles} secondary={exercise.secondaryMuscles} size={1.3} keyless />
              <View style={{ marginTop: 12, gap: 12 }}>
                <Muscles label="Primary" dot={PRIMARY_COLOR} muscles={exercise.primaryMuscles} colors={c} />
                {exercise.secondaryMuscles.length > 0 && <Muscles label="Secondary" dot={SECONDARY_COLOR} muscles={exercise.secondaryMuscles} colors={c} />}
              </View>
            </Card>

            {/* Every session it was done in */}
            <Card title="History" subtitle={done.length ? `${done.length} session${done.length === 1 ? "" : "s"}, the latest first` : undefined} padded={false}>
              {done.length === 0 ? (
                <View style={{ paddingHorizontal: 18, paddingBottom: 12 }}>
                  <Empty icon="time-outline" text="Each time you do it in a workout, its sets are kept here." />
                </View>
              ) : (
                done.map((s) => (
                  <Pressable key={s._id} onPress={() => router.push(`/gym/sessions/${s._id}` as Href)} accessibilityRole="button" style={hoverable(({ hovered }: Hover) => ({ paddingHorizontal: 18, paddingVertical: 11, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: hovered ? c.pill : "transparent" }))}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: c.text }} numberOfLines={1}>
                        {new Date(s.finishedAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                        <Text style={{ fontWeight: "500", color: c.muted }}> · {s.name}</Text>
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={c.faint} />
                    </View>
                    {s.sets.map((set, n) => (
                      <View key={n} style={{ marginTop: 3, flexDirection: "row" }}>
                        <Text style={{ width: 26, fontSize: 13, fontWeight: "700", color: setTypeOf(set.type).color ?? c.faint }}>{setLabels(s.sets)[n]}</Text>
                        <Text style={{ fontSize: 13, color: c.muted }}>{setText(set, track)}</Text>
                      </View>
                    ))}
                  </Pressable>
                ))
              )}
            </Card>
          </View>
        </View>
      </WebPage>
    </OrbitPage>
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
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: c.onPill }}>{groupLabel(m)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
