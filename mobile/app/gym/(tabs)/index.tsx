import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { clock, loadActiveSession, type ActiveSession } from "@/src/components/gym/activeSession";
import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import { lbs } from "@/src/components/gym/exerciseStats";
import { dayLabel, durationLabel, sessionRecords, thisWeek, upNext, weekStreak, type WeekDay } from "@/src/components/gym/schedule";
import { useStartWorkout } from "@/src/components/gym/useStartWorkout";
import { Tap } from "@/src/components/ui/Tap";
import { getSessions, getWorkouts, sessionTotals, type GymSessionRecord, type GymWorkout } from "@/src/services/gymApi";
import { useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Gym → Overview: how training's going at a glance — what's up next (to
// start it), this week day by day against the plan, the weeks in a row
// you've trained, and how the last workout went.
export default function GymOverviewTab() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const [workouts, setWorkouts] = useState<GymWorkout[] | null>(null);
  const [sessions, setSessions] = useState<GymSessionRecord[] | null>(null);
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [failed, setFailed] = useState(false);
  useFocusEffect(
    useCallback(() => {
      Promise.all([getWorkouts(), getSessions()]).then(
        ([w, s]) => {
          setWorkouts(w);
          setSessions(s);
          setFailed(false);
        },
        () => setFailed(true),
      );
      loadActiveSession().then(setActive);
    }, []),
  );
  const { start, resume } = useStartWorkout(active);

  const loaded = workouts && sessions;
  const next = loaded ? upNext(workouts, sessions) : null;
  const week = loaded ? thisWeek(workouts, sessions) : null;
  const streak = sessions ? weekStreak(sessions) : 0;
  const last = sessions?.[0] ?? null;
  const today = new Date().toLocaleDateString(undefined, { weekday: "long" });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>Gym</Text>
        <Text style={{ marginTop: 2, fontSize: 14, color: c.muted }}>
          {week ? `${today} · ${week.sessions.length}${week.target ? ` of ${week.target}` : ""} workout${(week.target ?? week.sessions.length) === 1 ? "" : "s"} this week` : "Your training at a glance"}
        </Text>

        {!loaded ? (
          failed ? <Text style={{ marginTop: 32, textAlign: "center", fontSize: 14, color: c.muted }}>Couldn&apos;t load your training.</Text> : <ActivityIndicator style={{ marginTop: 32 }} color={c.muted} />
        ) : (
          <>
            {/* Up next — or the one under way */}
            <Heading colors={c}>{active ? "IN PROGRESS" : "UP NEXT"}</Heading>
            {active ? (
              <Tap onPress={resume} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 18, backgroundColor: c.success }} pressedStyle={{ opacity: 0.85 }}>
                <Ionicons name="barbell" size={24} color="#FFFFFF" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: "700", color: "#FFFFFF" }} numberOfLines={1}>
                    {active.name}
                  </Text>
                  <Text style={{ marginTop: 2, fontSize: 13, fontWeight: "600", color: "#FFFFFF", opacity: 0.85 }}>Started {clock((Date.now() - new Date(active.startedAt).getTime()) / 1000)} ago</Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFFFFF" }}>Resume</Text>
                <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
              </Tap>
            ) : next ? (
              <NextCard workout={next.workout} when={next.when} sessions={sessions} onOpen={() => router.push(`/gym/workout/${next.workout._id}` as Href)} onStart={() => start(next.workout)} colors={c} />
            ) : (
              <Tap onPress={() => router.push("/gym/build" as Href)} accessibilityRole="button" style={{ alignItems: "center", paddingHorizontal: 24, paddingVertical: 28, borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: c.orbit }} pressedStyle={{ opacity: 0.7 }}>
                <Ionicons name="add-circle-outline" size={30} color={c.faint} />
                <Text style={{ marginTop: 8, fontSize: 16, fontWeight: "700", color: c.text }}>Build your first workout</Text>
                <Text style={{ marginTop: 4, fontSize: 14, textAlign: "center", color: c.muted }}>Put a day in its name — &ldquo;Legs (Monday)&rdquo; — and it&apos;ll be up next that day.</Text>
              </Tap>
            )}

            {/* This week */}
            {week && (
              <>
                <Heading colors={c}>THIS WEEK</Heading>
                <View style={{ padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    {week.days.map((day) => (
                      <Day key={day.date.toISOString()} day={day} colors={c} />
                    ))}
                  </View>
                  <View style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="flame" size={18} color={streak ? c.text : c.faint} />
                    <Text style={{ flex: 1, fontSize: 14, color: c.muted }}>
                      {streak ? (
                        <>
                          <Text style={{ fontWeight: "700", color: c.text }}>
                            {streak} week{streak === 1 ? "" : "s"}
                          </Text>{" "}
                          in a row
                        </>
                      ) : (
                        "Train this week to start a streak"
                      )}
                    </Text>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }}>
                      {week.sessions.length}
                      {week.target ? ` / ${week.target}` : ""}
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* The last workout */}
            {last && sessions && (
              <>
                <Heading colors={c}>LAST WORKOUT</Heading>
                <LastCard session={last} sessions={sessions} onOpen={() => router.push(`/gym/sessions/${last._id}` as Href)} colors={c} />
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Heading({ children, colors: c }: { children: string; colors: OrbitColors }) {
  return <Text style={{ marginTop: 22, marginBottom: 8, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>{children}</Text>;
}

// What's up next: when, its exercises (their icons), about how long it
// takes (from the times it's been done), and Start.
function NextCard({ workout, when, sessions, onOpen, onStart, colors: c }: { workout: GymWorkout; when: string; sessions: GymSessionRecord[]; onOpen: () => void; onStart: () => void; colors: OrbitColors }) {
  const exercises = workout.exercises.filter((e) => e.exercise);
  const sets = exercises.reduce((n, e) => n + e.sets.length, 0);
  const times = sessions.filter((s) => s.workout === workout._id).slice(0, 5).map((s) => sessionTotals(s).seconds);
  const usual = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
  const shown = exercises.slice(0, 6);
  return (
    <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={workout.name} style={{ padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }} pressedStyle={{ backgroundColor: c.pill }}>
      <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.6, color: c.muted }}>{when.toUpperCase()}</Text>
      <View style={{ marginTop: 2, flexDirection: "row", alignItems: "center" }}>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "800", color: c.text }} numberOfLines={1}>
          {workout.name}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={c.faint} />
      </View>
      <Text style={{ marginTop: 3, fontSize: 13, color: c.muted }}>
        {exercises.length} exercise{exercises.length === 1 ? "" : "s"} · {sets} set{sets === 1 ? "" : "s"}
        {usual ? ` · about ${durationLabel(usual)}` : ""}
      </Text>
      <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6 }}>
        {shown.map((e, i) => (
          <ExerciseIcon key={`${e.exercise._id}-${i}`} name={e.exercise.name} primary={e.exercise.primaryMuscles} secondary={e.exercise.secondaryMuscles} size={36} />
        ))}
        {exercises.length > shown.length && <Text style={{ marginLeft: 2, fontSize: 13, fontWeight: "600", color: c.muted }}>+{exercises.length - shown.length}</Text>}
      </View>
      <Tap onPress={onStart} accessibilityRole="button" accessibilityLabel={`Start ${workout.name}`} style={{ marginTop: 14, height: 48, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: c.ink }} pressedStyle={{ opacity: 0.85 }}>
        <Ionicons name="play" size={17} color={c.onInk} />
        <Text style={{ fontSize: 16, fontWeight: "700", color: c.onInk }}>Start workout</Text>
      </Tap>
    </Tap>
  );
}

// A day this week: filled when you trained, ringed when a workout's
// planned (faintly, once it's gone by undone), today dotted.
function Day({ day, colors: c }: { day: WeekDay; colors: OrbitColors }) {
  const missed = day.planned && day.past && !day.done;
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: day.today ? "800" : "600", color: day.today ? c.text : c.faint }}>{day.label}</Text>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: day.done ? c.ink : "transparent",
          borderWidth: !day.done && day.planned ? 2 : 0,
          borderColor: missed ? c.border : c.text,
        }}
      >
        {day.done ? <Ionicons name="checkmark" size={18} color={c.onInk} /> : <Text style={{ fontSize: 13, fontWeight: "600", color: missed ? c.faint : day.planned ? c.text : c.faint }}>{day.date.getDate()}</Text>}
      </View>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: day.today ? c.text : "transparent" }} />
    </View>
  );
}

// The last workout: when, how long, how much, and any records it set.
function LastCard({ session, sessions, onOpen, colors: c }: { session: GymSessionRecord; sessions: GymSessionRecord[]; onOpen: () => void; colors: OrbitColors }) {
  const totals = sessionTotals(session);
  const records = sessionRecords(session, sessions);
  return (
    <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={session.name} style={{ padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }} pressedStyle={{ backgroundColor: c.pill }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: c.text }} numberOfLines={1}>
            {session.name}
          </Text>
          <Text style={{ marginTop: 2, fontSize: 13, color: c.muted }}>{dayLabel(session.finishedAt)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.faint} />
      </View>
      <View style={{ marginTop: 14, flexDirection: "row" }}>
        <Figure label="Duration" value={durationLabel(totals.seconds)} colors={c} />
        <Figure label="Volume" value={`${lbs(Math.round(totals.volume))} lbs`} colors={c} />
        <Figure label="Sets" value={String(totals.sets)} colors={c} />
      </View>
      {records.length > 0 && (
        <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border, gap: 6 }}>
          {records.slice(0, 3).map((r) => (
            <View key={r.name} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="trophy" size={15} color={c.warning} />
              <Text style={{ flex: 1, fontSize: 14, color: c.text }} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }}>{lbs(r.weight)} lbs</Text>
            </View>
          ))}
          {records.length > 3 && <Text style={{ fontSize: 13, color: c.muted }}>and {records.length - 3} more record{records.length - 3 === 1 ? "" : "s"}</Text>}
        </View>
      )}
    </Tap>
  );
}

function Figure({ label, value, colors: c }: { label: string; value: string; colors: OrbitColors }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 12, color: c.muted }}>{label}</Text>
      <Text style={{ marginTop: 2, fontSize: 16, fontWeight: "700", color: c.text }}>{value}</Text>
    </View>
  );
}
