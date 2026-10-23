import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { loadActiveSession, type ActiveSession } from "@/src/components/gym/activeSession";
import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import { useStartWorkout } from "@/src/components/gym/useStartWorkout";
import { ActiveBanner, Grid, type Hover } from "@/src/components/gym/web/parts";
import { Button, hoverable, PageTitle, WebPage } from "@/src/components/web/ui";
import { getWorkouts, type GymWorkout } from "@/src/services/gymApi";
import { useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Gym's Workouts in a desktop browser: the workouts you've built as a grid
// of cards — each with its exercises and their sets, opened for all of it,
// with Edit and Start — a new one built from the corner, and one under way
// at the top, to go back to.

export function WebGymWorkouts() {
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
    <WebPage>
      <PageTitle
        title="Workouts"
        subtitle={workouts?.length ? `The ${workouts.length} workout${workouts.length === 1 ? "" : "s"} you've built` : "The workouts you've built"}
        right={<Button label="New workout" icon="add" kind="primary" onPress={() => build()} />}
      />

      {active && (
        <View style={{ marginBottom: 16 }}>
          <ActiveBanner active={active} onPress={resume} />
        </View>
      )}

      {!workouts ? (
        <Text style={{ fontSize: 14, color: c.muted }}>{failed ? "Couldn't load your workouts." : "Loading…"}</Text>
      ) : workouts.length === 0 ? (
        <View style={{ alignItems: "center", paddingHorizontal: 24, paddingVertical: 48, borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: c.orbit }}>
          <Ionicons name="barbell-outline" size={32} color={c.faint} />
          <Text style={{ marginTop: 10, fontSize: 16, fontWeight: "700", color: c.text }}>No workouts yet</Text>
          <Text style={{ marginTop: 4, maxWidth: 420, fontSize: 14, lineHeight: 20, textAlign: "center", color: c.muted }}>Build one — Push, Legs, Upper A — with its exercises and the sets you aim for.</Text>
          <View style={{ marginTop: 14 }}>
            <Button label="New workout" icon="add" kind="primary" onPress={() => build()} />
          </View>
        </View>
      ) : (
        <Grid min={320}>
          {workouts.map((workout) => (
            <WorkoutCard key={workout._id} workout={workout} onOpen={() => router.push(`/gym/workout/${workout._id}` as Href)} onEdit={() => build(workout._id)} onStart={() => start(workout)} colors={c} />
          ))}
        </Grid>
      )}
    </WebPage>
  );
}

// A workout: its exercises (the first six) with their sets; clicked, all
// of it on its own page. Edit and Start under it.
function WorkoutCard({ workout, onOpen, onEdit, onStart, colors: c }: { workout: GymWorkout; onOpen: () => void; onEdit: () => void; onStart: () => void; colors: OrbitColors }) {
  const exercises = workout.exercises.filter((e) => e.exercise);
  const sets = exercises.reduce((n, e) => n + e.sets.length, 0);
  return (
    <Pressable onPress={onOpen} style={hoverable(({ hovered }: Hover) => ({ flex: 1, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: hovered ? c.faint : c.border, backgroundColor: c.surface }))}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: c.text }} numberOfLines={1}>
          {workout.name}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={c.faint} />
      </View>
      <Text style={{ marginTop: 3, fontSize: 13, color: c.muted }}>
        {exercises.length} exercise{exercises.length === 1 ? "" : "s"} · {sets} set{sets === 1 ? "" : "s"}
      </Text>

      <View style={{ flex: 1, marginTop: 12, gap: 6 }}>
        {exercises.slice(0, 6).map((e, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ExerciseIcon name={e.exercise.name} primary={e.exercise.primaryMuscles} secondary={e.exercise.secondaryMuscles} size={28} />
            <Text style={{ flex: 1, fontSize: 13.5, color: c.icon }} numberOfLines={1}>
              {e.exercise.name}
            </Text>
            <Text style={{ fontSize: 12.5, color: c.faint }}>
              {e.sets.length} set{e.sets.length === 1 ? "" : "s"}
            </Text>
          </View>
        ))}
        {exercises.length > 6 && <Text style={{ fontSize: 12.5, color: c.muted }}>and {exercises.length - 6} more</Text>}
      </View>

      {/* Edit · Start */}
      <View style={{ marginTop: 14, flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        <Button label="Edit" icon="create-outline" onPress={onEdit} />
        <Button label="Start" icon="play" kind="primary" onPress={onStart} />
      </View>
    </Pressable>
  );
}

