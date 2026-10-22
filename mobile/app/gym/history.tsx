import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { clock } from "@/src/components/gym/activeSession";
import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import { Tap } from "@/src/components/ui/Tap";
import { getSessions, sessionTotals, type GymSessionRecord } from "@/src/services/gymApi";
import { OrbitSection, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Gym → Progress → History: every workout you've finished, the latest
// first, under its month — each with how long it took, the sets and the
// weight moved, and its exercises. Tap one for all its sets.
export default function HistoryScreen() {
  return (
    <OrbitSection section="gym">
      <History />
    </OrbitSection>
  );
}

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
};

function History() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const [sessions, setSessions] = useState<GymSessionRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  useFocusEffect(
    useCallback(() => {
      getSessions().then(setSessions, () => setFailed(true));
    }, []),
  );
  const back = () => (router.canGoBack() ? router.back() : router.replace("/gym/progress" as Href));

  // By month, the latest first.
  const months: { title: string; sessions: GymSessionRecord[] }[] = [];
  for (const s of sessions ?? []) {
    const title = new Date(s.finishedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const last = months[months.length - 1];
    if (last?.title === title) last.sessions.push(s);
    else months.push({ title, sessions: [s] });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6 }}>
        <Tap onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }} pressedStyle={{ backgroundColor: c.pill }}>
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </Tap>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>History</Text>
        <Text style={{ marginTop: 2, fontSize: 14, color: c.muted }}>Every workout you&apos;ve finished</Text>

        {!sessions ? (
          failed ? <Text style={{ textAlign: "center", marginTop: 24, fontSize: 14, color: c.muted }}>Couldn&apos;t load your workouts.</Text> : <ActivityIndicator style={{ marginTop: 24 }} color={c.muted} />
        ) : sessions.length === 0 ? (
          <View style={{ marginTop: 20, alignItems: "center", paddingHorizontal: 24, paddingVertical: 32, borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: c.orbit }}>
            <Ionicons name="time-outline" size={30} color={c.faint} />
            <Text style={{ marginTop: 10, fontSize: 16, fontWeight: "700", color: c.text }}>No workouts yet</Text>
            <Text style={{ marginTop: 4, fontSize: 14, textAlign: "center", color: c.muted }}>Start one from Workouts and finish it — it shows here.</Text>
          </View>
        ) : (
          months.map((month) => (
            <View key={month.title}>
              <Text style={{ marginTop: 22, marginBottom: 8, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>{month.title.toUpperCase()}</Text>
              <View style={{ gap: 10 }}>
                {month.sessions.map((s) => (
                  <SessionCard key={s._id} session={s} onPress={() => router.push(`/gym/sessions/${s._id}` as Href)} colors={c} />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SessionCard({ session, onPress, colors: c }: { session: GymSessionRecord; onPress: () => void; colors: OrbitColors }) {
  const t = sessionTotals(session);
  const exercises = session.exercises.filter((e) => e.exercise);
  return (
    <Tap onPress={onPress} accessibilityRole="button" style={{ padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }} pressedStyle={{ backgroundColor: c.pill }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: c.text }} numberOfLines={1}>
            {session.name}
          </Text>
          <Text style={{ marginTop: 2, fontSize: 13, color: c.muted }}>{when(session.finishedAt)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.faint} />
      </View>
      <View style={{ marginTop: 12, flexDirection: "row", gap: 18 }}>
        <Figure label="Time" value={clock(t.seconds)} colors={c} />
        <Figure label="Volume" value={`${Math.round(t.volume).toLocaleString()} lbs`} colors={c} />
        <Figure label="Sets" value={String(t.sets)} colors={c} />
      </View>
      <View style={{ marginTop: 12, gap: 8 }}>
        {exercises.map((e, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ExerciseIcon name={e.exercise!.name} primary={e.exercise!.primaryMuscles} secondary={e.exercise!.secondaryMuscles} size={30} />
            <Text style={{ flex: 1, fontSize: 14, color: c.icon }} numberOfLines={1}>
              {e.sets.length} × {e.exercise!.name}
            </Text>
          </View>
        ))}
      </View>
    </Tap>
  );
}

function Figure({ label, value, colors: c }: { label: string; value: string; colors: OrbitColors }) {
  return (
    <View>
      <Text style={{ fontSize: 12, color: c.muted }}>{label}</Text>
      <Text style={{ marginTop: 1, fontSize: 15, fontWeight: "700", color: c.text }}>{value}</Text>
    </View>
  );
}
