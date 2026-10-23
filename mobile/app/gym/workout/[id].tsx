import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { clearActiveSession, loadActiveSession } from "@/src/components/gym/activeSession";
import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import { MuscleMap } from "@/src/components/gym/MuscleMap";
import { draftOf, FIELDS, trackOf } from "@/src/components/gym/tracking";
import { WebWorkoutDetail } from "@/src/components/gym/web/WebWorkoutDetail";
import { Tap } from "@/src/components/ui/Tap";
import { getWorkout, restLabel, type GymWorkout } from "@/src/services/gymApi";
import { OrbitSection, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// One workout you've built (Gym → Workouts → a card): what it is — its
// exercises and sets, the muscles it works — with Start and Edit. Each
// exercise opens its own page. (A desktop browser: the exercises down the
// left, the rest beside them — WebWorkoutDetail.)
export default function WorkoutScreen() {
  return (
    <OrbitSection section="gym">
      <WorkoutPage />
    </OrbitSection>
  );
}

function WorkoutPage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: c } = useOrbitTheme();
  const wide = useWideWeb();
  const [workout, setWorkout] = useState<GymWorkout | null>(null);
  const [failed, setFailed] = useState(false);
  // (Again on coming back from Edit.)
  useFocusEffect(
    useCallback(() => {
      if (id) getWorkout(id).then(setWorkout, () => setFailed(true));
    }, [id]),
  );
  const back = () => (router.canGoBack() ? router.back() : router.replace("/gym/workouts" as Href));

  // Start it — unless another's under way: carry on with that, or drop it.
  async function start() {
    if (!workout) return;
    const go = () => router.push(`/gym/session?workout=${workout._id}` as Href);
    const active = await loadActiveSession();
    if (!active) return go();
    if (active.workoutId === workout._id) return router.push("/gym/session" as Href);
    Alert.alert("A workout's under way", `${active.name} isn't finished. Carry on with it, or discard it and start ${workout.name}?`, [
      { text: "Cancel", style: "cancel" },
      { text: `Resume ${active.name}`, onPress: () => router.push("/gym/session" as Href) },
      { text: "Discard it", style: "destructive", onPress: () => void clearActiveSession().then(go) },
    ]);
  }

  const edit = () => workout && router.push(`/gym/build?id=${workout._id}` as Href);

  // (A desktop browser: its own layout.)
  if (wide) return <WebWorkoutDetail workout={workout} failed={failed} onBack={back} onStart={() => void start()} onEdit={edit} />;

  const exercises = workout?.exercises.filter((e) => e.exercise) ?? [];
  const sets = exercises.reduce((n, e) => n + e.sets.length, 0);
  const primary = [...new Set(exercises.flatMap((e) => e.exercise.primaryMuscles ?? []))];
  const secondary = [...new Set(exercises.flatMap((e) => e.exercise.secondaryMuscles ?? []))].filter((m) => !primary.includes(m));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: 12, paddingTop: 4 }}>
        <Tap onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }} pressedStyle={{ backgroundColor: c.pill }}>
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </Tap>
      </View>
      {!workout ? (
        failed ? <Text style={{ textAlign: "center", marginTop: 40, fontSize: 14, color: c.muted }}>Couldn&apos;t load this workout.</Text> : <ActivityIndicator style={{ marginTop: 40 }} color={c.muted} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>{workout.name}</Text>
          <Text style={{ marginTop: 4, fontSize: 14, color: c.muted }}>
            {exercises.length} exercise{exercises.length === 1 ? "" : "s"} · {sets} set{sets === 1 ? "" : "s"}
          </Text>

          {/* Start · Edit */}
          <View style={{ marginTop: 16, flexDirection: "row", gap: 10 }}>
            <Tap onPress={() => void start()} accessibilityRole="button" style={{ flex: 2, height: 50, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: c.ink }} pressedStyle={{ opacity: 0.85 }}>
              <Ionicons name="play" size={18} color={c.onInk} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: c.onInk }}>Start workout</Text>
            </Tap>
            <Tap onPress={edit} accessibilityRole="button" style={{ flex: 1, height: 50, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
              <Ionicons name="create-outline" size={18} color={c.onPill} />
              <Text style={{ fontSize: 16, fontWeight: "600", color: c.onPill }}>Edit</Text>
            </Tap>
          </View>

          {/* The muscles it works */}
          {primary.length > 0 && (
            <View style={{ marginTop: 16, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
              <Text style={{ marginBottom: 6, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>MUSCLES IT WORKS</Text>
              <MuscleMap primary={primary} secondary={secondary} size={0.75} />
            </View>
          )}

          {/* Each exercise */}
          {exercises.map((e, i) => (
            <View key={i} style={{ marginTop: 16, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
              <Tap onPress={() => router.push(`/gym/exercise/${e.exercise._id}` as Href)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12 }} pressedStyle={{ opacity: 0.7 }}>
                <ExerciseIcon name={e.exercise.name} primary={e.exercise.primaryMuscles ?? []} secondary={e.exercise.secondaryMuscles ?? []} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: "700", color: c.text }} numberOfLines={2}>
                    {e.exercise.name}
                  </Text>
                  <Text style={{ marginTop: 2, fontSize: 13, color: c.muted }}>
                    {e.sets.length} set{e.sets.length === 1 ? "" : "s"} · rest {restLabel(e.restSeconds).toLowerCase()}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.faint} />
              </Tap>
              {!!e.note && (
                <View style={{ marginTop: 10, flexDirection: "row", gap: 6, padding: 10, borderRadius: 12, backgroundColor: c.pill }}>
                  <Ionicons name="document-text-outline" size={15} color={c.muted} />
                  <Text style={{ flex: 1, fontSize: 14, color: c.onPill }}>{e.note}</Text>
                </View>
              )}
              <View style={{ marginTop: 12, flexDirection: "row" }}>
                <Text style={[head(c), { width: 44 }]}>SET</Text>
                {FIELDS[trackOf(e.exercise)].map((f) => (
                  <Text key={f.key} style={[head(c), { flex: 1 }]}>
                    {f.head}
                  </Text>
                ))}
              </View>
              {e.sets.map((s, n) => (
                <View key={n} style={{ marginTop: 6, flexDirection: "row", alignItems: "center", paddingVertical: 4, borderRadius: 8, backgroundColor: n % 2 === 0 ? c.canvas : "transparent" }}>
                  <Text style={{ width: 44, paddingLeft: 6, fontSize: 15, fontWeight: "700", color: c.muted }}>{n + 1}</Text>
                  {FIELDS[trackOf(e.exercise)].map((f) => (
                    <Text key={f.key} style={{ flex: 1, fontSize: 15, fontWeight: "600", color: c.text }}>
                      {draftOf(s)[f.key] || "—"}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const head = (c: OrbitColors) => ({ fontSize: 11, fontWeight: "700" as const, letterSpacing: 1, color: c.faint });
