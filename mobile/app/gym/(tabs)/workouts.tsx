import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { clock, loadActiveSession, type ActiveSession } from "@/src/components/gym/activeSession";
import { useStartWorkout } from "@/src/components/gym/useStartWorkout";
import { Tap } from "@/src/components/ui/Tap";
import { getWorkouts, type GymWorkout } from "@/src/services/gymApi";
import { useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Gym → Workouts: the workouts you've built — each a card, with Edit (to
// change it) and Start (to do it: gym/session) under it — and a button to
// build a new one. One under way shows at the top, to go back to.
export default function WorkoutsTab() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const [workouts, setWorkouts] = useState<GymWorkout[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState<ActiveSession | null>(null);

  useFocusEffect(
    useCallback(() => {
      getWorkouts()
        .then((list) => {
          setWorkouts(list);
          setFailed(false);
        })
        .catch(() => setFailed(true));
      loadActiveSession().then(setActive);
    }, []),
  );
  const { start, resume } = useStartWorkout(active);
  const build = (id?: string) => router.push((id ? `/gym/build?id=${id}` : "/gym/build") as Href);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>Workouts</Text>
        <Text style={{ marginTop: 2, fontSize: 14, color: c.muted }}>The workouts you&apos;ve built</Text>

        {/* One under way */}
        {active && (
          <Tap onPress={resume} accessibilityRole="button" style={{ marginTop: 18, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, backgroundColor: c.success }} pressedStyle={{ opacity: 0.85 }}>
            <Ionicons name="barbell" size={22} color="#FFFFFF" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFFFFF", opacity: 0.85 }}>WORKOUT IN PROGRESS · {clock((Date.now() - new Date(active.startedAt).getTime()) / 1000)}</Text>
              <Text style={{ marginTop: 1, fontSize: 16, fontWeight: "700", color: "#FFFFFF" }} numberOfLines={1}>
                {active.name}
              </Text>
            </View>
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFFFFF" }}>Resume</Text>
            <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
          </Tap>
        )}

        <Tap onPress={() => build()} accessibilityRole="button" style={{ marginTop: 18, height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: c.ink }} pressedStyle={{ opacity: 0.85 }}>
          <Ionicons name="add" size={22} color={c.onInk} />
          <Text style={{ fontSize: 16, fontWeight: "700", color: c.onInk }}>New workout</Text>
        </Tap>

        <View style={{ marginTop: 20, gap: 10 }}>
          {!workouts ? (
            failed ? <Text style={{ textAlign: "center", marginTop: 12, fontSize: 14, color: c.muted }}>Couldn&apos;t load your workouts.</Text> : <ActivityIndicator style={{ marginTop: 12 }} color={c.muted} />
          ) : workouts.length === 0 ? (
            <View style={{ alignItems: "center", paddingHorizontal: 24, paddingVertical: 32, borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: c.orbit }}>
              <Ionicons name="barbell-outline" size={32} color={c.faint} />
              <Text style={{ marginTop: 10, fontSize: 16, fontWeight: "700", color: c.text }}>No workouts yet</Text>
              <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, textAlign: "center", color: c.muted }}>Build one — Push, Legs, Upper A — with its exercises and the sets you aim for.</Text>
            </View>
          ) : (
            workouts.map((workout) => (
              <WorkoutCard
                key={workout._id}
                workout={workout}
                onOpen={() => router.push(`/gym/workout/${workout._id}` as Href)}
                onEdit={() => build(workout._id)}
                onStart={() => start(workout)}
                colors={c}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// A workout: tap it for all of it (its own page); Edit and Start under it.
function WorkoutCard({ workout, onOpen, onEdit, onStart, colors: c }: { workout: GymWorkout; onOpen: () => void; onEdit: () => void; onStart: () => void; colors: OrbitColors }) {
  const exercises = workout.exercises.filter((e) => e.exercise);
  const sets = exercises.reduce((n, e) => n + e.sets.length, 0);
  return (
    <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={workout.name} style={{ padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }} pressedStyle={{ backgroundColor: c.pill }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: c.text }} numberOfLines={1}>
          {workout.name}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={c.faint} />
      </View>
      <Text style={{ marginTop: 3, fontSize: 13, color: c.muted }}>
        {exercises.length} exercise{exercises.length === 1 ? "" : "s"} · {sets} set{sets === 1 ? "" : "s"}
      </Text>
      {exercises.length > 0 && (
        <Text style={{ marginTop: 6, fontSize: 14, lineHeight: 20, color: c.icon }} numberOfLines={2}>
          {exercises.map((e) => e.exercise.name).join(", ")}
        </Text>
      )}
      {/* Edit · Start */}
      <View style={{ marginTop: 14, flexDirection: "row", gap: 10 }}>
        <Tap onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit ${workout.name}`} style={{ flex: 1, height: 44, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
          <Ionicons name="create-outline" size={18} color={c.onPill} />
          <Text style={{ fontSize: 15, fontWeight: "600", color: c.onPill }}>Edit</Text>
        </Tap>
        <Tap onPress={onStart} accessibilityRole="button" accessibilityLabel={`Start ${workout.name}`} style={{ flex: 1, height: 44, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: c.ink }} pressedStyle={{ opacity: 0.85 }}>
          <Ionicons name="play" size={16} color={c.onInk} />
          <Text style={{ fontSize: 15, fontWeight: "700", color: c.onInk }}>Start</Text>
        </Tap>
      </View>
    </Tap>
  );
}
