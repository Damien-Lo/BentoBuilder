import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import { GroupHeading, GymPage } from "@/src/components/gym/GymTabPage";
import { exerciseBests, recordTimeline } from "@/src/components/gym/progressStats";
import { dayLabel } from "@/src/components/gym/schedule";
import { trackOf, type Track } from "@/src/components/gym/tracking";
import { useFinishedSessions } from "@/src/components/gym/useFinishedSessions";
import { WebRecords } from "@/src/components/gym/web/WebRecords";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitSection, useOrbitTheme } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// Gym → Progress → Personal records: the records you've set lately (each
// beating your best before — heavier, more reps, less help, longer — and
// by how much), then every exercise you've done with its best (and, for a
// lift, its best estimated one-rep max: 1RM) —
// tap one for all of it, on its own page. (A desktop browser: the bests as
// a table, the recent records beside them — WebRecords.)
export default function RecordsScreen() {
  const router = useRouter();
  const wide = useWideWeb();
  if (wide)
    return (
      <OrbitSection section="gym">
        <WebRecords onBack={() => (router.canGoBack() ? router.back() : router.replace("/gym/progress" as Href))} />
      </OrbitSection>
    );
  return (
    <GymPage title="Personal records" subtitle="Your best lifts, and when you set them" parent="/gym/progress">
      <Records />
    </GymPage>
  );
}

// What each track's best is (under the number).
const BEST_LABEL: Record<Track, string> = { weight: "heaviest", bodyweight: "most reps", assisted: "least help", duration: "longest", cardio: "best" };

// "today", "yesterday", "Tue, Oct 21".
const lastLabel = (iso: string) => {
  const label = dayLabel(iso);
  return label === "Today" || label === "Yesterday" ? label.toLowerCase() : label;
};

function Records() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const { sessions, failed } = useFinishedSessions();
  const [showAll, setShowAll] = useState(false);
  if (!sessions) return failed ? <Text style={{ marginTop: 24, textAlign: "center", fontSize: 14, color: c.muted }}>Couldn&apos;t load your records.</Text> : <ActivityIndicator style={{ marginTop: 24 }} color={c.muted} />;

  const timeline = recordTimeline(sessions);
  const recent = showAll ? timeline : timeline.slice(0, 6);
  const bests = exerciseBests(sessions);
  const open = (id: string) => router.push(`/gym/exercise/${id}` as Href);

  if (!bests.length)
    return (
      <View style={{ marginTop: 20, alignItems: "center", paddingHorizontal: 24, paddingVertical: 32, borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: c.orbit }}>
        <Ionicons name="trophy-outline" size={30} color={c.faint} />
        <Text style={{ marginTop: 10, fontSize: 16, fontWeight: "700", color: c.text }}>No records yet</Text>
        <Text style={{ marginTop: 4, fontSize: 14, textAlign: "center", color: c.muted }}>Finish a workout and your best lifts show here.</Text>
      </View>
    );

  return (
    <>
      {/* Lately */}
      <GroupHeading>Recent records</GroupHeading>
      <View style={{ borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }}>
        {recent.length === 0 ? (
          <Text style={{ padding: 16, fontSize: 14, color: c.muted }}>Lift heavier than before on an exercise and it shows here.</Text>
        ) : (
          recent.map((r, i) => (
            <Tap key={`${r.sessionId}-${r.exercise._id}`} onPress={() => open(r.exercise._id)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }} pressedStyle={{ backgroundColor: c.pill }}>
              <ExerciseIcon name={r.exercise.name} primary={r.exercise.primaryMuscles} secondary={r.exercise.secondaryMuscles} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: c.text }} numberOfLines={1}>
                  {r.exercise.name}
                </Text>
                <Text style={{ marginTop: 1, fontSize: 12.5, color: c.muted }}>
                  {dayLabel(r.finishedAt)} · {r.best.lower ? `was ${r.previous.text.replace("−", "")} of help` : `up from ${r.previous.text}`}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 15, fontWeight: "800", color: c.text }}>{r.best.text}</Text>
                <Text style={{ marginTop: 1, fontSize: 12, fontWeight: "700", color: c.success }}>{r.gain}</Text>
              </View>
            </Tap>
          ))
        )}
      </View>
      {timeline.length > 6 && (
        <Tap onPress={() => setShowAll((v) => !v)} accessibilityRole="button" style={{ alignSelf: "center", marginTop: 10, paddingHorizontal: 14, paddingVertical: 8 }} pressedStyle={{ opacity: 0.6 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }}>{showAll ? "Show fewer" : `Show all ${timeline.length}`}</Text>
        </Tap>
      )}

      {/* Every exercise's bests */}
      <GroupHeading>Best, by exercise</GroupHeading>
      <View style={{ borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }}>
        {bests.map((b, i) => {
          const track = trackOf(b.exercise);
          const oneRm = track === "weight" ? b.records.find((r) => r.label === "Best 1RM")?.value : null;
          return (
            <Tap key={b.exercise._id} onPress={() => open(b.exercise._id)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }} pressedStyle={{ backgroundColor: c.pill }}>
              <ExerciseIcon name={b.exercise.name} primary={b.exercise.primaryMuscles} secondary={b.exercise.secondaryMuscles} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: c.text }} numberOfLines={1}>
                  {b.exercise.name}
                </Text>
                <Text style={{ marginTop: 1, fontSize: 12.5, color: c.muted }} numberOfLines={1}>
                  {b.times} time{b.times === 1 ? "" : "s"} · last {lastLabel(b.lastDone)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 15, fontWeight: "800", color: c.text }}>{b.best?.text ?? "—"}</Text>
                <Text style={{ marginTop: 1, fontSize: 12, color: c.faint }}>{oneRm ? `1RM ${oneRm.replace(/\.\d+/, "")}` : b.best ? BEST_LABEL[track] : ""}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.faint} />
            </Tap>
          );
        })}
      </View>
    </>
  );
}
