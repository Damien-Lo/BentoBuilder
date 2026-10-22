import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { clock } from "@/src/components/gym/activeSession";
import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import { Tap } from "@/src/components/ui/Tap";
import { deleteSession, getSession, sessionTotals, type GymSessionRecord } from "@/src/services/gymApi";
import { OrbitSection, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// One finished workout: when, how long, what it came to, and every set of
// every exercise (each exercise opens its own page). It can be deleted.
export default function SessionDetailScreen() {
  return (
    <OrbitSection section="gym">
      <SessionDetail />
    </OrbitSection>
  );
}

function SessionDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: c } = useOrbitTheme();
  const [session, setSession] = useState<GymSessionRecord | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (id) getSession(id).then(setSession, () => setFailed(true));
  }, [id]);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/gym/history" as Href));

  function remove() {
    if (!session) return;
    Alert.alert(`Delete "${session.name}"?`, "Its sets go from your history and progress.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void deleteSession(session._id).then(back, (error) => Alert.alert("Couldn't delete it", error instanceof Error ? error.message : "Something went wrong.")) },
    ]);
  }

  const t = session ? sessionTotals(session) : null;
  const d = session ? new Date(session.finishedAt) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: 12, paddingTop: 4 }}>
        <Tap onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }} pressedStyle={{ backgroundColor: c.pill }}>
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </Tap>
      </View>
      {!session || !t || !d ? (
        failed ? <Text style={{ textAlign: "center", marginTop: 40, fontSize: 14, color: c.muted }}>Couldn&apos;t load this workout.</Text> : <ActivityIndicator style={{ marginTop: 40 }} color={c.muted} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>{session.name}</Text>
          <Text style={{ marginTop: 4, fontSize: 14, color: c.muted }}>
            {d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </Text>

          <View style={{ marginTop: 16, flexDirection: "row", gap: 10 }}>
            <Stat label="Time" value={clock(t.seconds)} colors={c} />
            <Stat label="Volume" value={`${Math.round(t.volume).toLocaleString()} lbs`} colors={c} />
            <Stat label="Sets" value={String(t.sets)} colors={c} />
          </View>

          {session.exercises
            .filter((e) => e.exercise)
            .map((e, i) => (
              <View key={i} style={{ marginTop: 16, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
                <Tap onPress={() => router.push(`/gym/exercise/${e.exercise!._id}` as Href)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12 }} pressedStyle={{ opacity: 0.7 }}>
                  <ExerciseIcon name={e.exercise!.name} primary={e.exercise!.primaryMuscles} secondary={e.exercise!.secondaryMuscles} />
                  <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: c.text }} numberOfLines={2}>
                    {e.exercise!.name}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={c.faint} />
                </Tap>
                {!!e.note && <Text style={{ marginTop: 8, fontSize: 14, fontStyle: "italic", color: c.muted }}>{e.note}</Text>}
                <View style={{ marginTop: 12, flexDirection: "row" }}>
                  <Text style={[head(c), { width: 44 }]}>SET</Text>
                  <Text style={[head(c), { flex: 1 }]}>WEIGHT × REPS</Text>
                </View>
                {e.sets.map((s, n) => (
                  <View key={n} style={{ marginTop: 8, flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ width: 44, fontSize: 15, fontWeight: "700", color: c.muted }}>{n + 1}</Text>
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: c.text }}>
                      {s.weight != null ? `${s.weight} lbs` : "Bodyweight"} × {s.reps ?? "—"}
                    </Text>
                  </View>
                ))}
              </View>
            ))}

          <Tap onPress={remove} accessibilityRole="button" style={{ marginTop: 28, alignSelf: "center", paddingHorizontal: 16, paddingVertical: 10 }} pressedStyle={{ opacity: 0.6 }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: c.danger }}>Delete workout</Text>
          </Tap>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const head = (c: OrbitColors) => ({ fontSize: 11, fontWeight: "700" as const, letterSpacing: 1, color: c.faint });

function Stat({ label, value, colors: c }: { label: string; value: string; colors: OrbitColors }) {
  return (
    <View style={{ flex: 1, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
      <Text style={{ fontSize: 12, color: c.muted }}>{label}</Text>
      <Text style={{ marginTop: 3, fontSize: 18, fontWeight: "800", color: c.text }}>{value}</Text>
    </View>
  );
}
