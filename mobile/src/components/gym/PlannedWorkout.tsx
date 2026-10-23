import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";

import { durationLabel } from "@/src/components/gym/schedule";
import { Tap } from "@/src/components/ui/Tap";
import { gymStatusOn, setGymDay, setGymStatus, type CalendarEvent } from "@/src/services/calendarApi";
import { getSession, getSessions, getWorkout, getWorkouts, sessionTotals, type GymSessionRecord, type GymWorkout } from "@/src/services/gymApi";
import { SECTION_PALETTE, type OrbitColors } from "@/src/theme/orbit";
import { todayStr } from "@/src/utils/mealPlan";

// A training time (a Gym calendar event), on one of its days: the workout
// planned for it (the series', or this day's own — changed here, like a
// meal's food for a day), and whether it was done (the session that did
// it, opened when tapped), skipped, missed, or not yet — with, as it
// stands, Start (finishing it marks this done), Mark done (with that day's
// session, or none), Skip, or back to not yet.

const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function PlannedWorkout({ event, date, onChange, colors: c }: { event: CalendarEvent; date: string; onChange: (e: CalendarEvent) => void; colors: OrbitColors }) {
  const router = useRouter();
  const [routine, setRoutine] = useState<GymWorkout | null>(null);
  const [session, setSession] = useState<GymSessionRecord | null>(null);
  const today = todayStr();
  const { status, session: sessionId } = gymStatusOn(event, date, today);
  const planned = event.plannedWorkout !== undefined ? event.plannedWorkout : (event.gymWorkout ?? null);
  const ownDay = (event.gymPlanned ?? []).some((p) => p.date === date);

  useEffect(() => {
    if (planned) getWorkout(planned).then(setRoutine, () => setRoutine(null));
    else setRoutine(null);
  }, [planned]);
  useEffect(() => {
    if (sessionId) getSession(sessionId).then(setSession, () => setSession(null));
    else setSession(null);
  }, [sessionId]);

  async function mark(next: "done" | "skipped" | "open", with_?: string | null) {
    try {
      onChange(await setGymStatus(event._id, date, next, with_ ?? null));
    } catch (error) {
      Alert.alert("Couldn't change it", error instanceof Error ? error.message : "Something went wrong.");
    }
  }
  // Done: with one of that day's sessions, or with none.
  async function markDone() {
    const that = (await getSessions().catch(() => [] as GymSessionRecord[])).filter((s) => dayOf(new Date(s.startedAt)) === date);
    Alert.alert("Mark it done", that.length ? "With the session you did that day?" : "No Gym session that day — mark it done anyway?", [
      ...that.map((s) => ({ text: `${s.name} · ${durationLabel(sessionTotals(s).seconds)}`, onPress: () => void mark("done", s._id) })),
      { text: that.length ? "Done, without a session" : "Mark done", onPress: () => void mark("done") },
      { text: "Cancel", style: "cancel" as const },
    ]);
  }
  const start = () => (planned ? router.push(`/gym/session?workout=${planned}&plan=${event._id}&planDate=${date}` as Href) : router.push("/gym/workouts" as Href));
  // This day's workout, changed (the series stays as it is).
  // This day's workout, changed (the series stays as it is): the routines
  // as chips, opened here.
  const [changing, setChanging] = useState<GymWorkout[] | null>(null);
  async function changeDay() {
    if (changing) return setChanging(null);
    setChanging(await getWorkouts().catch(() => [] as GymWorkout[]));
  }
  async function setDay(workout: string | null | "series") {
    try {
      onChange(await setGymDay(event._id, date, workout));
      setChanging(null);
    } catch (error) {
      Alert.alert("Couldn't change it", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  const STATUS = {
    done: { label: "Done", icon: "checkmark-circle" as const, color: c.success },
    skipped: { label: "Skipped", icon: "remove-circle" as const, color: c.muted },
    missed: { label: "Missed", icon: "alert-circle" as const, color: c.warning },
    open: { label: date === today ? "Today" : "Not yet", icon: "ellipse-outline" as const, color: c.faint },
  }[status];
  const exercises = routine?.exercises.filter((e) => e.exercise) ?? [];

  return (
    <View style={{ marginBottom: 12, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: SECTION_PALETTE.gym.base }}>
          <Ionicons name="barbell" size={19} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }}>{routine?.name ?? "Any workout"}</Text>
          <Text style={{ marginTop: 1, fontSize: 12.5, color: c.muted }} numberOfLines={1}>
            {ownDay ? "This day only · " : ""}
            {routine ? `${exercises.length} exercise${exercises.length === 1 ? "" : "s"} · ${exercises.slice(0, 3).map((e) => e.exercise!.name).join(", ")}${exercises.length > 3 ? "…" : ""}` : "Whatever you train then"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: c.pill }}>
          <Ionicons name={STATUS.icon} size={14} color={STATUS.color} />
          <Text style={{ fontSize: 12, fontWeight: "700", color: STATUS.color }}>{STATUS.label}</Text>
        </View>
      </View>

      {/* Done: the session that did it */}
      {status === "done" && session && (
        <Tap onPress={() => router.push(`/gym/sessions/${session._id}` as Href)} accessibilityRole="button" style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, backgroundColor: c.canvas }} pressedStyle={{ opacity: 0.7 }}>
          <Ionicons name="checkmark-circle" size={18} color={c.success} />
          <Text style={{ flex: 1, fontSize: 14, color: c.text }} numberOfLines={1}>
            {session.name} · {durationLabel(sessionTotals(session).seconds)} · {sessionTotals(session).sets} sets
          </Text>
          <Ionicons name="chevron-forward" size={16} color={c.faint} />
        </Tap>
      )}

      {/* What can be done with it */}
      <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(status === "open" || status === "missed") && date <= today && (
          <Action label={date === today ? "Start workout" : "Start it now"} icon="play" primary onPress={start} colors={c} />
        )}
        {(status === "open" || status === "missed") && <Action label="Mark done" icon="checkmark" onPress={() => void markDone()} colors={c} />}
        {(status === "open" || status === "missed") && <Action label="Skip" icon="play-skip-forward" onPress={() => void mark("skipped")} colors={c} />}
        {status !== "done" && <Action label={changing ? "Keep as it is" : "Change for this day"} icon="swap-horizontal" onPress={() => void changeDay()} colors={c} />}
        {(status === "done" || status === "skipped") && <Action label="Not done after all" icon="arrow-undo" onPress={() => void mark("open")} colors={c} />}
      </View>
      {/* This day's workout, picked */}
      {changing && (
        <View style={{ marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: c.canvas }}>
          <Text style={{ fontSize: 11.5, fontWeight: "700", letterSpacing: 0.8, color: c.faint }}>THIS DAY ONLY</Text>
          <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {[{ _id: null as string | null, name: "Any workout" }, ...changing].map((w) => {
              const on = (planned ?? null) === w._id;
              return (
                <Tap key={w._id ?? "any"} onPress={() => !on && void setDay(w._id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, backgroundColor: on ? SECTION_PALETTE.gym.base : c.pill }} pressedStyle={{ opacity: 0.75 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: on ? "#FFFFFF" : c.onPill }}>{w.name}</Text>
                </Tap>
              );
            })}
          </View>
          {ownDay && (
            <Tap onPress={() => void setDay("series")} style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: c.ink }}>Back to the series&apos; plan</Text>
            </Tap>
          )}
        </View>
      )}
      {status === "open" && date === today && <Text style={{ marginTop: 8, fontSize: 12, lineHeight: 17, color: c.faint }}>Finishing it in Gym marks this done.</Text>}
    </View>
  );
}

function Action({ label, icon, primary, onPress, colors: c }: { label: string; icon: keyof typeof Ionicons.glyphMap; primary?: boolean; onPress: () => void; colors: OrbitColors }) {
  return (
    <Tap onPress={onPress} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: primary ? SECTION_PALETTE.gym.base : c.pill }} pressedStyle={{ opacity: 0.8 }}>
      <Ionicons name={icon} size={15} color={primary ? "#FFFFFF" : c.onPill} />
      <Text style={{ fontSize: 14, fontWeight: "700", color: primary ? "#FFFFFF" : c.onPill }}>{label}</Text>
    </Tap>
  );
}
