import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ExerciseBrowser } from "@/src/components/gym/ExerciseBrowser";
import { getExercises, type Exercise } from "@/src/services/exerciseApi";
import { useOrbitTheme } from "@/src/theme/orbit";

// Gym → Exercises: the library — the core (~130) by muscle group, each
// folded until opened as the Kitchen's ingredients are, and a search that
// reaches all of it.
export default function ExercisesTab() {
  const { colors: c } = useOrbitTheme();
  const [all, setAll] = useState<Exercise[] | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getExercises()
        .then((list) => {
          setAll(list);
          setFailed(false);
        })
        .catch(() => setFailed(true));
    }, []),
  );
  const core = all?.filter((e) => e.core).length ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>Exercises</Text>
        <Text style={{ marginTop: 2, marginBottom: 16, fontSize: 14, color: c.muted }}>{all ? `${core} to start with — search all ${all.length}` : "The exercise library"}</Text>
        {all ? (
          <ExerciseBrowser all={all} />
        ) : failed ? (
          <Text style={{ textAlign: "center", marginTop: 24, fontSize: 14, color: c.muted }}>Couldn&apos;t load the exercises.</Text>
        ) : (
          <ActivityIndicator style={{ marginTop: 24 }} color={c.muted} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
