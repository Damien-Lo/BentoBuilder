import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Tap } from "@/src/components/ui/Tap";
import { getWorkouts, type GymWorkout } from "@/src/services/gymApi";
import { useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Gym → Workouts: the workouts you've built — each a card to open and
// change — and a button to build a new one. (Starting one comes later.)
export default function WorkoutsTab() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const [workouts, setWorkouts] = useState<GymWorkout[] | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getWorkouts()
        .then((list) => {
          setWorkouts(list);
          setFailed(false);
        })
        .catch(() => setFailed(true));
    }, []),
  );
  const build = (id?: string) => router.push((id ? `/gym/build?id=${id}` : "/gym/build") as Href);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>Workouts</Text>
        <Text style={{ marginTop: 2, fontSize: 14, color: c.muted }}>The workouts you&apos;ve built</Text>

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
            workouts.map((workout) => <WorkoutCard key={workout._id} workout={workout} onPress={() => build(workout._id)} colors={c} />)
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function WorkoutCard({ workout, onPress, colors: c }: { workout: GymWorkout; onPress: () => void; colors: OrbitColors }) {
  const exercises = workout.exercises.filter((e) => e.exercise);
  const sets = exercises.reduce((n, e) => n + e.sets.length, 0);
  return (
    <Tap onPress={onPress} accessibilityRole="button" style={{ padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }} pressedStyle={{ backgroundColor: c.pill }}>
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
    </Tap>
  );
}
