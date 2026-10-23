import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import { MuscleMap } from "@/src/components/gym/MuscleMap";
import { muscleLabel } from "@/src/components/gym/progressStats";
import { draftOf, FIELDS, trackOf } from "@/src/components/gym/tracking";
import { BackLink } from "@/src/components/pantry/web/orbitWeb";
import { Button, Card, Empty, hoverable, PageTitle, WebPage } from "@/src/components/web/ui";
import { restLabel, type GymWorkout } from "@/src/services/gymApi";
import { OrbitPage, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// One workout you've built, in a desktop browser: its exercises down the
// left, each with its sets as a table (what's planned for each) and its
// rest and note — each opening the exercise's page; beside them what it
// comes to, Start and Edit, and the muscles it works on the body, front and
// back, with their names.

type Hover = { hovered?: boolean };

export function WebWorkoutDetail({ workout, failed, onBack, onStart, onEdit }: { workout: GymWorkout | null; failed: boolean; onBack: () => void; onStart: () => void; onEdit: () => void }) {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();

  if (!workout) {
    return (
      <OrbitPage>
        <WebPage maxWidth={1280}>
          <BackLink label="Workouts" onPress={onBack} />
          <PageTitle title="Workout" />
          <Text style={{ fontSize: 14, color: c.muted }}>{failed ? "Couldn't load this workout." : "Loading…"}</Text>
        </WebPage>
      </OrbitPage>
    );
  }

  const exercises = workout.exercises.filter((e) => e.exercise);
  const sets = exercises.reduce((n, e) => n + e.sets.length, 0);
  const primary = [...new Set(exercises.flatMap((e) => e.exercise.primaryMuscles ?? []))];
  const secondary = [...new Set(exercises.flatMap((e) => e.exercise.secondaryMuscles ?? []))].filter((m) => !primary.includes(m));
  // (Its rests together, a rough guide to how long it takes.)
  const rest = exercises.reduce((n, e) => n + e.restSeconds * Math.max(0, e.sets.length - 1), 0);

  return (
    <OrbitPage>
      <WebPage maxWidth={1280}>
        <BackLink label="Workouts" onPress={onBack} />
        <PageTitle
          title={workout.name}
          subtitle={`${exercises.length} exercise${exercises.length === 1 ? "" : "s"} · ${sets} set${sets === 1 ? "" : "s"}`}
          right={
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button label="Edit" icon="create-outline" onPress={onEdit} />
              <Button label="Start workout" icon="play" kind="primary" onPress={onStart} />
            </View>
          }
        />

        <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
          {/* Each exercise */}
          <View style={{ flex: 1, minWidth: 0, gap: 16 }}>
            {exercises.map((e, i) => (
              <Card key={i} padded={false}>
                <Pressable onPress={() => router.push(`/gym/exercise/${e.exercise._id}` as Href)} accessibilityRole="button" style={hoverable(({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: hovered ? c.pill : "transparent" }))}>
                  <Text style={{ width: 22, fontSize: 13, fontWeight: "800", color: c.faint }}>{i + 1}</Text>
                  <ExerciseIcon name={e.exercise.name} primary={e.exercise.primaryMuscles ?? []} secondary={e.exercise.secondaryMuscles ?? []} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }} numberOfLines={1}>
                      {e.exercise.name}
                    </Text>
                    <Text style={{ marginTop: 1, fontSize: 12.5, color: c.muted }}>
                      {e.sets.length} set{e.sets.length === 1 ? "" : "s"} · rest {restLabel(e.restSeconds).toLowerCase()}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={c.faint} />
                </Pressable>
                <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
                  {!!e.note && (
                    <View style={{ marginBottom: 10, flexDirection: "row", gap: 6, padding: 10, borderRadius: 12, backgroundColor: c.pill }}>
                      <Ionicons name="document-text-outline" size={15} color={c.muted} />
                      <Text style={{ flex: 1, fontSize: 13.5, color: c.onPill }}>{e.note}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: "row", paddingHorizontal: 8 }}>
                    <Text style={[head(c), { width: 60 }]}>SET</Text>
                    {FIELDS[trackOf(e.exercise)].map((f) => (
                      <Text key={f.key} style={[head(c), { flex: 1 }]}>
                        {f.head}
                      </Text>
                    ))}
                  </View>
                  {e.sets.map((s, n) => (
                    <View key={n} style={{ marginTop: 4, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: n % 2 === 0 ? c.canvas : "transparent" }}>
                      <Text style={{ width: 60, fontSize: 14, fontWeight: "700", color: c.muted }}>{n + 1}</Text>
                      {FIELDS[trackOf(e.exercise)].map((f) => (
                        <Text key={f.key} style={{ flex: 1, fontSize: 14, fontWeight: "600", color: c.text }}>
                          {draftOf(s)[f.key] || "—"}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              </Card>
            ))}
            {!exercises.length && (
              <Card>
                <Empty icon="barbell-outline" text="No exercises in it yet — Edit to add some." />
              </Card>
            )}
          </View>

          {/* What it comes to, and the muscles it works */}
          <View style={{ width: 380, gap: 16 }}>
            <Card title="In it">
              <Line label="Exercises" value={String(exercises.length)} colors={c} />
              <Line label="Sets" value={String(sets)} colors={c} />
              <Line label="Rest between sets" value={rest ? `${Math.round(rest / 60)} min in all` : "None set"} colors={c} />
            </Card>
            {primary.length > 0 && (
              <Card title="Muscles it works">
                <MuscleMap primary={primary} secondary={secondary} size={1.3} />
                <Muscles label="Primary" muscles={primary} colors={c} />
                {secondary.length > 0 && <Muscles label="Secondary" muscles={secondary} colors={c} />}
              </Card>
            )}
          </View>
        </View>
      </WebPage>
    </OrbitPage>
  );
}

function Line({ label, value, colors: c }: { label: string; value: string; colors: OrbitColors }) {
  return (
    <View style={{ flexDirection: "row", paddingVertical: 6 }}>
      <Text style={{ flex: 1, fontSize: 13.5, color: c.muted }}>{label}</Text>
      <Text style={{ fontSize: 13.5, fontWeight: "700", color: c.text }}>{value}</Text>
    </View>
  );
}

function Muscles({ label, muscles, colors: c }: { label: string; muscles: string[]; colors: OrbitColors }) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={head(c)}>{label.toUpperCase()}</Text>
      <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {muscles.map((m) => (
          <View key={m} style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: c.pill }}>
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: c.onPill }}>{muscleLabel(m)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const head = (c: OrbitColors) => ({ fontSize: 11, fontWeight: "700" as const, letterSpacing: 1, color: c.faint });
