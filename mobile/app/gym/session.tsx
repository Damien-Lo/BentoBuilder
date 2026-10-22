import { Ionicons } from "@expo/vector-icons";
import { requireOptionalNativeModule } from "expo";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { SafeAreaView } from "react-native-safe-area-context";

import { clearActiveSession, clock, loadActiveSession, newId, storeActiveSession, type ActiveExercise, type ActiveSession, type ActiveSet } from "@/src/components/gym/activeSession";
import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import { PickExercises } from "@/src/components/gym/PickExercises";
import { ReorderExercises } from "@/src/components/gym/ReorderExercises";
import { showActions } from "@/src/components/todo/theme";
import { Tap } from "@/src/components/ui/Tap";
import type { Exercise } from "@/src/services/exerciseApi";
import { getPreviousSets, getWorkout, REST_CHOICES, restLabel, saveSession, SET_TYPES, setLabels, setTypeOf, type DoneSetInput, type SetType } from "@/src/services/gymApi";
import { OrbitSection, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Doing a workout (Gym → Workouts → Start), as Hevy's "Log Workout": how
// long it's been going, the volume and sets so far, then each exercise —
// its sets with what you did last time (Previous), the weight and reps (the
// workout's targets to start with), and a tick for each one done. Ticking
// a set starts its rest timer, at the bottom. A set's number, tapped, makes
// it a warm-up, drop or failure set. An exercise can be swapped for
// another. Finish saves the ticked sets as a session (what each exercise's
// history and progress come from) and shows how it went.
//
// It's kept on this device as it goes (gym/activeSession), so leaving it —
// or the app closing — loses nothing: Workouts offers to resume it.
// (`workout`: the workout to start; without it, the one under way.)

const asText = (n: number | null | undefined) => (n == null ? "" : String(n));
const asNumber = (text: string) => {
  const n = Number(text.replace(",", "."));
  return text.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n;
};

// (A tap felt, where the phone has it: a light one for a tick, a stronger
// one when a rest is up.)
function feel(kind: "tick" | "done") {
  if (Platform.OS === "web" || !requireOptionalNativeModule("ExpoHaptics")) return;
  void import("expo-haptics")
    .then((h) => (kind === "done" ? h.notificationAsync(h.NotificationFeedbackType.Success) : h.impactAsync(h.ImpactFeedbackStyle.Light)))
    .catch(() => {});
}

export default function SessionScreen() {
  return (
    <OrbitSection section="gym">
      <Session />
    </OrbitSection>
  );
}

function Session() {
  const router = useRouter();
  const { workout: workoutId } = useLocalSearchParams<{ workout?: string }>();
  const { colors: c } = useOrbitTheme();
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [previous, setPrevious] = useState<Record<string, DoneSetInput[]>>({});
  const [now, setNow] = useState(Date.now());
  const [picking, setPicking] = useState(false);
  // The exercise being swapped for another (its key).
  const [replacing, setReplacing] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [saving, setSaving] = useState(false);

  // Start: the one under way, or a new one from the workout.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = await loadActiveSession();
      if (existing && (!workoutId || existing.workoutId === workoutId)) {
        if (!cancelled) setSession(existing);
        return;
      }
      if (!workoutId) {
        if (!cancelled) router.back();
        return;
      }
      try {
        const workout = await getWorkout(workoutId);
        const started: ActiveSession = {
          workoutId,
          name: workout.name,
          startedAt: new Date().toISOString(),
          exercises: workout.exercises
            .filter((e) => e.exercise)
            .map((e) => ({
              key: newId(),
              exercise: e.exercise,
              restSeconds: e.restSeconds,
              note: e.note,
              noteOpen: !!e.note,
              sets: (e.sets.length ? e.sets : [{ weight: null, reps: null }]).map((s) => ({ id: newId(), weight: asText(s.weight), reps: asText(s.reps), done: false })),
            })),
        };
        await storeActiveSession(started);
        if (!cancelled) setSession(started);
      } catch (error) {
        Alert.alert("Couldn't start the workout", error instanceof Error ? error.message : "Something went wrong.");
        router.back();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workoutId, router]);

  // What each exercise came to last time.
  const ids = session?.exercises.map((e) => e.exercise._id).join(",") ?? "";
  useEffect(() => {
    if (ids) getPreviousSets(ids.split(",")).then(setPrevious, () => {});
  }, [ids]);

  // The clock: the duration, and the rest counting down.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const restLeft = session?.restEndsAt ? Math.ceil((session.restEndsAt - now) / 1000) : 0;
  const restWasOn = useRef(false);
  useEffect(() => {
    if (restLeft > 0) restWasOn.current = true;
    else if (restWasOn.current) {
      restWasOn.current = false;
      feel("done");
    }
  }, [restLeft]);

  // Every change kept on the device as it's made.
  function update(change: (s: ActiveSession) => ActiveSession) {
    setSession((current) => {
      if (!current) return current;
      const next = change(current);
      void storeActiveSession(next);
      return next;
    });
  }
  const changeExercise = (key: string, change: (e: ActiveExercise) => ActiveExercise) => update((s) => ({ ...s, exercises: s.exercises.map((e) => (e.key === key ? change(e) : e)) }));
  const changeSet = (key: string, id: string, change: (set: ActiveSet) => ActiveSet) => changeExercise(key, (e) => ({ ...e, sets: e.sets.map((set) => (set.id === id ? change(set) : set)) }));

  // A tick: an empty box takes what's hinted (last time's), then the rest
  // starts. Unticking just unticks.
  function tick(item: ActiveExercise, set: ActiveSet, index: number) {
    if (set.done) return changeSet(item.key, set.id, (s) => ({ ...s, done: false }));
    const before = previous[item.exercise._id]?.[index];
    const weight = set.weight || asText(before?.weight);
    const reps = set.reps || asText(before?.reps);
    if (!asNumber(reps)) return Alert.alert("How many reps?", "Put in the reps you did, then tick it.");
    feel("tick");
    update((s) => ({
      ...s,
      exercises: s.exercises.map((e) => (e.key === item.key ? { ...e, sets: e.sets.map((x) => (x.id === set.id ? { ...x, weight, reps, done: true } : x)) } : e)),
      ...(item.restSeconds > 0 ? { restEndsAt: Date.now() + item.restSeconds * 1000, restLength: item.restSeconds } : {}),
    }));
  }
  const addSet = (key: string) =>
    changeExercise(key, (e) => {
      const last = e.sets[e.sets.length - 1];
      return { ...e, sets: [...e.sets, { id: newId(), weight: last?.weight ?? "", reps: last?.reps ?? "", done: false, type: last?.type === "warmup" ? "normal" : last?.type }] };
    });
  function setTypeMenu(item: ActiveExercise, set: ActiveSet) {
    showActions(
      "Set type",
      SET_TYPES.map((t) => ({ label: t.id === (set.type ?? "normal") ? `${t.label} ✓` : t.label, onPress: () => changeSet(item.key, set.id, (x) => ({ ...x, type: t.id as SetType })) })),
    );
  }
  const deleteSet = (key: string, id: string) => changeExercise(key, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== id) }));
  const rest = (seconds: number) => update((s) => ({ ...s, restEndsAt: seconds > 0 ? Date.now() + seconds * 1000 : null, restLength: seconds }));
  const nudgeRest = (by: number) => update((s) => (s.restEndsAt ? { ...s, restEndsAt: s.restEndsAt + by * 1000, restLength: Math.max(1, (s.restLength ?? 0) + by) } : s));

  function exerciseMenu(item: ActiveExercise) {
    showActions(item.exercise.name, [
      { label: "Replace exercise", onPress: () => setReplacing(item.key) },
      ...((session?.exercises.length ?? 0) > 1 ? [{ label: "Reorder exercises", onPress: () => setReordering(true) }] : []),
      { label: "Remove exercise", destructive: true, onPress: () => update((s) => ({ ...s, exercises: s.exercises.filter((e) => e.key !== item.key) })) },
    ]);
  }
  function restMenu(item: ActiveExercise) {
    showActions(
      "Rest between sets",
      REST_CHOICES.map((seconds) => ({ label: seconds === item.restSeconds ? `${restLabel(seconds)} ✓` : restLabel(seconds), onPress: () => changeExercise(item.key, (e) => ({ ...e, restSeconds: seconds })) })),
    );
  }
  function timerMenu() {
    showActions("Rest timer", [
      ...[60, 90, 120, 180].map((seconds) => ({ label: `Rest ${restLabel(seconds)}`, onPress: () => rest(seconds) })),
      ...(session?.restEndsAt ? [{ label: "Stop the timer", onPress: () => rest(0) }] : []),
    ]);
  }
  function addExercises(picked: Exercise[]) {
    update((s) => ({
      ...s,
      exercises: [...s.exercises, ...picked.map((exercise) => ({ key: newId(), exercise, restSeconds: 90, note: "", noteOpen: false, sets: [{ id: newId(), weight: "", reps: "", done: false }] }))],
    }));
    setPicking(false);
  }
  // The swap: the new exercise in its place, with its sets — unticked, and
  // without the old one's weights.
  function replace(picked: Exercise[]) {
    const exercise = picked[0];
    if (exercise && replacing) changeExercise(replacing, (e) => ({ ...e, exercise, sets: e.sets.map((set) => ({ ...set, weight: "", done: false })) }));
    setReplacing(null);
  }
  function reorder(keys: string[]) {
    update((s) => ({ ...s, exercises: keys.map((k) => s.exercises.find((e) => e.key === k)).filter((e): e is ActiveExercise => !!e) }));
    setReordering(false);
  }

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/gym/workouts"));
  function discard() {
    Alert.alert("Discard this workout?", "Nothing from it will be kept.", [
      { text: "Keep going", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => void clearActiveSession().then(leave) },
    ]);
  }
  async function finish() {
    if (!session || saving) return;
    const done = session.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })).filter((e) => e.sets.length > 0);
    const undone = session.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.done).length, 0);
    if (!done.length) {
      return Alert.alert("Nothing ticked yet", "Tick off the sets you've done, or discard the workout.", [
        { text: "Keep going", style: "cancel" },
        { text: "Discard workout", style: "destructive", onPress: () => void clearActiveSession().then(leave) },
      ]);
    }
    const save = async () => {
      setSaving(true);
      try {
        const finishedAt = new Date();
        const saved = await saveSession({
          workout: session.workoutId,
          name: session.name,
          startedAt: session.startedAt,
          finishedAt: finishedAt.toISOString(),
          exercises: done.map((e) => ({ exercise: e.exercise._id, note: e.note.trim(), sets: e.sets.map((s) => ({ weight: asNumber(s.weight), reps: asNumber(s.reps), type: s.type ?? "normal" })) })),
        });
        await clearActiveSession();
        // (How it went: the workout's own page, opened as just finished.)
        router.replace(`/gym/sessions/${saved._id}?finished=1` as Href);
      } catch (error) {
        setSaving(false);
        Alert.alert("Couldn't save the workout", error instanceof Error ? error.message : "Something went wrong.");
      }
    };
    if (undone > 0) {
      Alert.alert("Finish the workout?", `${undone} set${undone === 1 ? " isn't" : "s aren't"} ticked — ${undone === 1 ? "it" : "they"}'ll be left out.`, [
        { text: "Keep going", style: "cancel" },
        { text: "Finish", onPress: () => void save() },
      ]);
    } else void save();
  }

  const reorderRows = useMemo(() => (session?.exercises ?? []).map((e) => ({ key: e.key, name: e.exercise.name, primary: e.exercise.primaryMuscles ?? [], secondary: e.exercise.secondaryMuscles ?? [] })), [session]);

  if (!session) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.muted} />
      </SafeAreaView>
    );
  }

  const elapsed = (now - new Date(session.startedAt).getTime()) / 1000;
  const doneSets = session.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      {/* Discard · the name · the timer · Finish */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
        <Tap onPress={discard} accessibilityRole="button" accessibilityLabel="Discard workout" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
          <Ionicons name="close" size={22} color={c.onPill} />
        </Tap>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: c.text }} numberOfLines={1}>
          {session.name}
        </Text>
        <Tap onPress={timerMenu} accessibilityRole="button" accessibilityLabel="Rest timer" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
          <Ionicons name="timer-outline" size={21} color={c.onPill} />
        </Tap>
        <Tap onPress={() => void finish()} disabled={saving} accessibilityRole="button" style={{ borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: c.success, opacity: saving ? 0.6 : 1 }} pressedStyle={{ opacity: 0.85 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFFFFF" }}>{saving ? "Saving…" : "Finish"}</Text>
        </Tap>
      </View>

      {/* How it's going */}
      <View style={{ flexDirection: "row", paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Stat label="Duration" value={clock(elapsed)} colors={c} />
        <Stat label="Volume" value={`${Math.round(volumeOf(session)).toLocaleString()} lbs`} colors={c} />
        <Stat label="Sets" value={String(doneSets)} colors={c} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: restLeft > 0 ? 150 : 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {session.exercises.map((item) => {
            const before = previous[item.exercise._id] ?? [];
            return (
              <View key={item.key} style={{ marginBottom: 16, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <ExerciseIcon name={item.exercise.name} primary={item.exercise.primaryMuscles ?? []} secondary={item.exercise.secondaryMuscles ?? []} />
                  <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: c.text }} numberOfLines={2}>
                    {item.exercise.name}
                  </Text>
                  <Tap onPress={() => exerciseMenu(item)} accessibilityLabel={`${item.exercise.name} options`} style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }} pressedStyle={{ backgroundColor: c.pill }}>
                    <Ionicons name="ellipsis-vertical" size={18} color={c.muted} />
                  </Tap>
                </View>

                <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
                  <Chip icon="timer-outline" label={`Rest: ${restLabel(item.restSeconds)}`} onPress={() => restMenu(item)} colors={c} />
                  <Chip icon="document-text-outline" label="Note" on={item.noteOpen} onPress={() => changeExercise(item.key, (e) => ({ ...e, noteOpen: !e.noteOpen }))} colors={c} />
                </View>
                {item.noteOpen && (
                  <TextInput
                    value={item.note}
                    onChangeText={(note) => changeExercise(item.key, (e) => ({ ...e, note }))}
                    placeholder="A note for this exercise…"
                    placeholderTextColor={c.faint}
                    multiline
                    style={[{ marginTop: 10, minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.canvas, fontSize: 15, color: c.text }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
                  />
                )}

                {/* SET · PREVIOUS · LBS · REPS · ✓ */}
                <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={[head(c), { width: 34, textAlign: "center" }]}>SET</Text>
                  <Text style={[head(c), { flex: 1.3, textAlign: "center" }]}>PREVIOUS</Text>
                  <Text style={[head(c), { flex: 1, textAlign: "center" }]}>LBS</Text>
                  <Text style={[head(c), { flex: 1, textAlign: "center" }]}>REPS</Text>
                  <View style={{ width: 40, alignItems: "center" }}>
                    <Ionicons name="checkmark" size={16} color={c.faint} />
                  </View>
                </View>
                {item.sets.map((set, s) => {
                  const last = before[s];
                  const done = set.done;
                  const kind = setTypeOf(set.type);
                  const label = setLabels(item.sets)[s];
                  return (
                    <ReanimatedSwipeable
                      key={set.id}
                      friction={2}
                      rightThreshold={40}
                      overshootRight={false}
                      containerStyle={{ marginTop: 6 }}
                      renderRightActions={() => (
                        <Tap onPress={() => deleteSet(item.key, set.id)} accessibilityRole="button" accessibilityLabel={`Delete set ${s + 1}`} style={{ width: 84, marginLeft: 8, height: 44, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: c.danger }} pressedStyle={{ opacity: 0.8 }}>
                          <Ionicons name="trash-outline" size={17} color="#FFFFFF" />
                          <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>Delete</Text>
                        </Tap>
                      )}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: done ? `${c.success}26` : c.surface }}>
                        <Tap onPress={() => setTypeMenu(item, set)} accessibilityRole="button" accessibilityLabel={`Set ${s + 1}: ${kind.label}. Change its type`} style={{ width: 34, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: done ? "transparent" : c.pill }} pressedStyle={{ opacity: 0.7 }}>
                          <Text style={{ fontSize: 15, fontWeight: "800", color: kind.color ?? c.onPill }}>{label}</Text>
                        </Tap>
                        <Text style={{ flex: 1.3, textAlign: "center", fontSize: 13, color: c.faint }} numberOfLines={1}>
                          {last && (last.weight != null || last.reps != null) ? `${last.weight ?? 0} lbs × ${last.reps ?? "—"}` : "—"}
                        </Text>
                        <Box value={set.weight} hint={asText(last?.weight)} decimal done={done} onChange={(v) => changeSet(item.key, set.id, (x) => ({ ...x, weight: v.replace(/[^0-9.,]/g, "") }))} label={`Set ${s + 1} weight`} colors={c} />
                        <Box value={set.reps} hint={asText(last?.reps)} done={done} onChange={(v) => changeSet(item.key, set.id, (x) => ({ ...x, reps: v.replace(/[^0-9]/g, "") }))} label={`Set ${s + 1} reps`} colors={c} />
                        <Tap
                          onPress={() => tick(item, set, s)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: done }}
                          accessibilityLabel={`Set ${s + 1} done`}
                          style={{ width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: done ? c.success : c.pill }}
                          pressedStyle={{ opacity: 0.75 }}
                        >
                          <Ionicons name="checkmark" size={20} color={done ? "#FFFFFF" : c.faint} />
                        </Tap>
                      </View>
                    </ReanimatedSwipeable>
                  );
                })}
                <Tap onPress={() => addSet(item.key)} accessibilityRole="button" style={{ marginTop: 12, height: 44, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
                  <Ionicons name="add" size={20} color={c.onPill} />
                  <Text style={{ fontSize: 15, fontWeight: "600", color: c.onPill }}>Add set</Text>
                </Tap>
              </View>
            );
          })}

          <Tap onPress={() => setPicking(true)} accessibilityRole="button" style={{ height: 50, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: c.ink }} pressedStyle={{ opacity: 0.85 }}>
            <Ionicons name="add" size={22} color={c.onInk} />
            <Text style={{ fontSize: 16, fontWeight: "700", color: c.onInk }}>Add exercise</Text>
          </Tap>
          <Tap onPress={discard} accessibilityRole="button" style={{ marginTop: 22, alignSelf: "center", paddingHorizontal: 16, paddingVertical: 10 }} pressedStyle={{ opacity: 0.6 }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: c.danger }}>Discard workout</Text>
          </Tap>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* The rest, counting down */}
      {restLeft > 0 && (
        <SafeAreaView edges={["bottom"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
          <View style={{ height: 4, backgroundColor: c.track }}>
            <View style={{ height: 4, width: `${Math.min(100, (restLeft / Math.max(1, session.restLength ?? restLeft)) * 100)}%`, backgroundColor: c.ink }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 1, color: c.faint }}>REST</Text>
              <Text style={{ fontSize: 26, fontWeight: "800", color: c.text }}>{clock(restLeft)}</Text>
            </View>
            <RestButton label="−15" onPress={() => nudgeRest(-15)} colors={c} />
            <RestButton label="+15" onPress={() => nudgeRest(15)} colors={c} />
            <Tap onPress={() => rest(0)} accessibilityRole="button" style={{ height: 44, paddingHorizontal: 18, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.ink }} pressedStyle={{ opacity: 0.85 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: c.onInk }}>Skip</Text>
            </Tap>
          </View>
        </SafeAreaView>
      )}

      <PickExercises visible={picking} onClose={() => setPicking(false)} onAdd={addExercises} />
      <PickExercises visible={!!replacing} replacing={session.exercises.find((e) => e.key === replacing)?.exercise.name} onClose={() => setReplacing(null)} onAdd={replace} />
      <ReorderExercises visible={reordering} items={reorderRows} onClose={() => setReordering(false)} onDone={reorder} />
    </SafeAreaView>
  );
}

// The weight moved in the ticked sets. (An assisted exercise's weight is
// help, not load: it isn't counted.)
function volumeOf(session: ActiveSession) {
  return session.exercises.filter((e) => !/assisted/i.test(e.exercise.name)).reduce((sum, e) => sum + e.sets.filter((s) => s.done).reduce((n, s) => n + (asNumber(s.weight) ?? 0) * (asNumber(s.reps) ?? 0), 0), 0);
}

const head = (c: OrbitColors) => ({ fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.8, color: c.faint });

function Stat({ label, value, colors: c }: { label: string; value: string; colors: OrbitColors }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 12, color: c.muted }}>{label}</Text>
      <Text style={{ marginTop: 2, fontSize: 18, fontWeight: "700", color: c.text }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>
    </View>
  );
}

function Chip({ icon, label, on, onPress, colors: c }: { icon: keyof typeof Ionicons.glyphMap; label: string; on?: boolean; onPress: () => void; colors: OrbitColors }) {
  return (
    <Tap onPress={onPress} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 12, backgroundColor: on ? c.ink : c.pill }} pressedStyle={{ opacity: 0.7 }}>
      <Ionicons name={icon} size={16} color={on ? c.onInk : c.onPill} />
      <Text style={{ fontSize: 14, fontWeight: "600", color: on ? c.onInk : c.onPill }}>{label}</Text>
    </Tap>
  );
}

// A weight or reps box: last time's number as a faint hint when it's empty.
function Box({ value, hint, onChange, decimal, done, label, colors: c }: { value: string; hint: string; onChange: (v: string) => void; decimal?: boolean; done: boolean; label: string; colors: OrbitColors }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      keyboardType={decimal ? "decimal-pad" : "number-pad"}
      placeholder={hint || "—"}
      placeholderTextColor={c.faint}
      accessibilityLabel={label}
      selectTextOnFocus
      style={[
        // (minWidth 0: a browser's input won't shrink below its own width otherwise.)
        { flex: 1, minWidth: 0, height: 40, borderRadius: 10, borderWidth: done ? 0 : 1, borderColor: c.border, backgroundColor: done ? "transparent" : c.canvas, textAlign: "center", fontSize: 16, fontWeight: "700", color: c.text },
        Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
      ]}
    />
  );
}

function RestButton({ label, onPress, colors: c }: { label: string; onPress: () => void; colors: OrbitColors }) {
  return (
    <Tap onPress={onPress} accessibilityRole="button" style={{ height: 44, minWidth: 52, paddingHorizontal: 10, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
      <Text style={{ fontSize: 15, fontWeight: "700", color: c.onPill }}>{label}</Text>
    </Tap>
  );
}
