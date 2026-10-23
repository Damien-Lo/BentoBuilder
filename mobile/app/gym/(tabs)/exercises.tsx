import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";

import { AddToMyList } from "@/src/components/gym/AddToMyList";
import { ExerciseBrowser } from "@/src/components/gym/ExerciseBrowser";
import { Tap } from "@/src/components/ui/Tap";
import { getExercises, inMyList, type Exercise } from "@/src/services/exerciseApi";
import { useOrbitTheme } from "@/src/theme/orbit";

// Gym → Exercises: your list — the core (~140), what you've added from the
// library, and your own — by muscle group, each folded until opened as the
// Kitchen's ingredients are, and a search that reaches all of it. New
// exercise: the whole library to add from, or one of your own.
export default function ExercisesTab() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const [all, setAll] = useState<Exercise[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);

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
  const mine = all?.filter(inMyList).length ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>Exercises</Text>
        <Text style={{ marginTop: 2, fontSize: 14, color: c.muted }}>{all ? `${mine} in your list — search all ${all.length}` : "The exercise library"}</Text>
        <Tap onPress={() => setAdding(true)} disabled={!all} accessibilityRole="button" style={{ marginTop: 16, marginBottom: 16, height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: c.ink, opacity: all ? 1 : 0.5 }} pressedStyle={{ opacity: 0.85 }}>
          <Ionicons name="add" size={22} color={c.onInk} />
          <Text style={{ fontSize: 16, fontWeight: "700", color: c.onInk }}>New exercise</Text>
        </Tap>
        {all ? (
          <ExerciseBrowser all={all} onOpen={(exercise) => router.push(`/gym/exercise/${exercise._id}` as Href)} />
        ) : failed ? (
          <Text style={{ textAlign: "center", marginTop: 24, fontSize: 14, color: c.muted }}>Couldn&apos;t load the exercises.</Text>
        ) : (
          <ActivityIndicator style={{ marginTop: 24 }} color={c.muted} />
        )}
      </ScrollView>
      {all && (
        <AddToMyList
          visible={adding}
          all={all}
          onClose={() => setAdding(false)}
          onChanged={setAll}
          onCustom={(name) => {
            setAdding(false);
            router.push(`/gym/exercise/new${name ? `?name=${encodeURIComponent(name)}` : ""}` as Href);
          }}
        />
      )}
    </SafeAreaView>
  );
}
