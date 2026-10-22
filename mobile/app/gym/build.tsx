import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { SafeAreaView } from "react-native-safe-area-context";

import { PickExercises } from "@/src/components/gym/PickExercises";
import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import { ReorderExercises } from "@/src/components/gym/ReorderExercises";
import { cleanField, draftOf, FIELDS, fromDraft, TIME_HINT, trackOf, type DraftField, type SetDraft as TypedSet } from "@/src/components/gym/tracking";
import { showActions } from "@/src/components/todo/theme";
import { Tap } from "@/src/components/ui/Tap";
import { type Exercise } from "@/src/services/exerciseApi";
import { createWorkout, deleteWorkout, getWorkout, REST_CHOICES, restLabel, updateWorkout, type WorkoutExercise, type WorkoutInput } from "@/src/services/gymApi";
import { OrbitSection, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Gym → Workouts → building a workout (new, or one you've saved: `id`) —
// as Hevy's routine editor: its name, then each exercise with how long to
// rest between sets, a note, and its sets (the weight and reps you aim
// for — or the time, or distance and time, by how it's logged:
// tracking.ts); "Add set" under each, "Add exercise" at the end (picked from the
// library). Doing it — ticking sets off as you go — comes later.
//
// (Weights are in pounds, like the rest of the app.)

// (`id`: so a row keeps its own swipe when one above it is deleted.)
type SetDraft = TypedSet & { id: string };
type ExerciseDraft = { key: string; exercise: WorkoutExercise["exercise"]; restSeconds: number; note: string; noteOpen: boolean; sets: SetDraft[] };

let nextKey = 0;
const newKey = () => `x${nextKey++}`;

export default function BuildWorkoutScreen() {
  return (
    <OrbitSection section="gym">
      <BuildWorkout />
    </OrbitSection>
  );
}

function BuildWorkout() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors: c } = useOrbitTheme();
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState("");
  const [items, setItems] = useState<ExerciseDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [reordering, setReordering] = useState(false);
  // What it was when opened, to tell whether leaving loses anything.
  const start = useRef("");
  const snapshot = (n: string, list: ExerciseDraft[]) => JSON.stringify([n.trim(), list.map((i) => [i.exercise._id, i.restSeconds, i.note.trim(), i.sets.map((s) => [s.weight, s.reps, s.time, s.distance])])]);

  useEffect(() => {
    if (!id) {
      start.current = snapshot("", []);
      return;
    }
    getWorkout(id)
      .then((workout) => {
        const list = workout.exercises
          .filter((e) => e.exercise)
          .map((e) => ({ key: newKey(), exercise: e.exercise, restSeconds: e.restSeconds, note: e.note, noteOpen: !!e.note, sets: e.sets.map((s) => ({ id: newKey(), ...draftOf(s) })) }));
        setName(workout.name);
        setItems(list);
        start.current = snapshot(workout.name, list);
        setLoaded(true);
      })
      .catch((error) => {
        Alert.alert("Couldn't open the workout", error instanceof Error ? error.message : "Something went wrong.");
        router.back();
      });
  }, [id, router]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/gym/workouts"));
  function cancel() {
    if (snapshot(name, items) === start.current) return leave();
    Alert.alert("Discard your changes?", "What you've changed in this workout won't be kept.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: leave },
    ]);
  }

  async function save() {
    if (saving) return;
    if (!name.trim()) return Alert.alert("Name your workout", "Give it a name first — Push, Legs, Upper A…");
    const workout: WorkoutInput = {
      name: name.trim(),
      exercises: items.map((i) => ({ exercise: i.exercise._id, restSeconds: i.restSeconds, note: i.note.trim(), sets: i.sets.map((s) => fromDraft(s, trackOf(i.exercise))) })),
    };
    setSaving(true);
    try {
      if (id) await updateWorkout(id, workout);
      else await createWorkout(workout);
      leave();
    } catch (error) {
      setSaving(false);
      Alert.alert("Couldn't save the workout", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  function remove() {
    if (!id) return;
    Alert.alert(`Delete "${name.trim() || "this workout"}"?`, "The workout goes; the exercises stay in the library.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => void deleteWorkout(id).then(leave, (error) => Alert.alert("Couldn't delete it", error instanceof Error ? error.message : "Something went wrong.")),
      },
    ]);
  }

  const change = (key: string, update: (item: ExerciseDraft) => ExerciseDraft) => setItems((list) => list.map((item) => (item.key === key ? update(item) : item)));
  const setField = (key: string, index: number, field: DraftField, value: string) => change(key, (item) => ({ ...item, sets: item.sets.map((s, i) => (i === index ? { ...s, [field]: value } : s)) }));
  // A new set as the one before it (Hevy's way: the same again, then adjust).
  const addSet = (key: string) => change(key, (item) => {
    const last = item.sets[item.sets.length - 1];
    return { ...item, sets: [...item.sets, { id: newKey(), ...(last ? { weight: last.weight, reps: last.reps, time: last.time, distance: last.distance } : draftOf(null)) }] };
  });
  const deleteSet = (key: string, id: string) => change(key, (item) => ({ ...item, sets: item.sets.filter((s) => s.id !== id) }));
  function exerciseMenu(item: ExerciseDraft) {
    showActions(item.exercise.name, [
      ...(items.length > 1 ? [{ label: "Reorder exercises", onPress: () => setReordering(true) }] : []),
      { label: "Remove exercise", destructive: true, onPress: () => setItems((list) => list.filter((i) => i.key !== item.key)) },
    ]);
  }
  // The exercises in the order chosen in Reorder (by their keys).
  function reorder(keys: string[]) {
    setItems((list) => keys.map((key) => list.find((i) => i.key === key)).filter((i): i is ExerciseDraft => !!i));
    setReordering(false);
  }
  function setMenu(item: ExerciseDraft, index: number) {
    showActions(`Set ${index + 1}`, [{ label: "Delete set", destructive: true, onPress: () => deleteSet(item.key, item.sets[index].id) }]);
  }
  function restMenu(item: ExerciseDraft) {
    showActions(
      "Rest between sets",
      REST_CHOICES.map((seconds) => ({ label: seconds === item.restSeconds ? `${restLabel(seconds)} ✓` : restLabel(seconds), onPress: () => change(item.key, (it) => ({ ...it, restSeconds: seconds })) })),
    );
  }
  function addExercises(picked: Exercise[]) {
    setItems((list) => [...list, ...picked.map((exercise) => ({ key: newKey(), exercise, restSeconds: 90, note: "", noteOpen: false, sets: [{ id: newKey(), ...draftOf(null) }] }))]);
    setPicking(false);
  }

  const reorderRows = useMemo(() => items.map((i) => ({ key: i.key, name: i.exercise.name, primary: i.exercise.primaryMuscles ?? [], secondary: i.exercise.secondaryMuscles ?? [] })), [items]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      {/* Cancel · the title · Save */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Tap onPress={cancel} accessibilityRole="button" style={{ borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: c.onPill }}>Cancel</Text>
        </Tap>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: c.text }}>{id ? "Edit workout" : "New workout"}</Text>
        <Tap onPress={() => void save()} disabled={saving || !loaded} accessibilityRole="button" style={{ borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9, backgroundColor: c.ink, opacity: saving || !loaded ? 0.5 : 1 }} pressedStyle={{ opacity: 0.8 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: c.onInk }}>{saving ? "Saving…" : "Save"}</Text>
        </Tap>
      </View>

      {!loaded ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={c.muted} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Workout name"
              placeholderTextColor={c.faint}
              style={[{ fontSize: 26, fontWeight: "800", letterSpacing: -0.4, color: c.text, paddingVertical: 6 }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
            />

            {items.length === 0 && (
              <Text style={{ marginTop: 12, fontSize: 14, lineHeight: 20, color: c.muted }}>Add the exercises it&apos;s made of, then the sets for each — the weight and reps you&apos;re aiming for.</Text>
            )}

            {/* Each exercise in a card of its own */}
            {items.map((item) => (
              <View key={item.key} style={{ marginTop: 16, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
                {/* The exercise: its photo, name, and ⋯ */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <ExerciseIcon name={item.exercise.name} primary={item.exercise.primaryMuscles ?? []} secondary={item.exercise.secondaryMuscles ?? []} />
                  <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: c.text }} numberOfLines={2}>
                    {item.exercise.name}
                  </Text>
                  <Tap onPress={() => exerciseMenu(item)} accessibilityLabel={`${item.exercise.name} options`} style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }} pressedStyle={{ backgroundColor: c.pill }}>
                    <Ionicons name="ellipsis-vertical" size={18} color={c.muted} />
                  </Tap>
                </View>

                {/* Rest, and a note */}
                <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
                  <Chip icon="timer-outline" label={`Rest: ${restLabel(item.restSeconds)}`} onPress={() => restMenu(item)} colors={c} />
                  <Chip icon="document-text-outline" label="Note" on={item.noteOpen} onPress={() => change(item.key, (it) => ({ ...it, noteOpen: !it.noteOpen }))} colors={c} />
                </View>
                {item.noteOpen && (
                  <TextInput
                    value={item.note}
                    onChangeText={(note) => change(item.key, (it) => ({ ...it, note }))}
                    placeholder="A note — form cues, the machine's setting…"
                    placeholderTextColor={c.faint}
                    multiline
                    style={[{ marginTop: 10, minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.canvas, fontSize: 15, color: c.text }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
                  />
                )}

                {/* The sets */}
                <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text style={[head(c), { width: 38, textAlign: "center" }]}>SET</Text>
                  {FIELDS[trackOf(item.exercise)].map((f) => (
                    <Text key={f.key} style={[head(c), { flex: 1, textAlign: "center" }]}>
                      {f.head}
                    </Text>
                  ))}
                </View>
                {/* Each set: drag it left for Delete (or tap its number) */}
                {item.sets.map((set, s) => (
                  <ReanimatedSwipeable
                    key={set.id}
                    friction={2}
                    rightThreshold={40}
                    overshootRight={false}
                    containerStyle={{ marginTop: 8 }}
                    renderRightActions={() => (
                      <Tap
                        onPress={() => deleteSet(item.key, set.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete set ${s + 1}`}
                        style={{ width: 84, marginLeft: 10, height: 44, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: c.danger }}
                        pressedStyle={{ opacity: 0.8 }}
                      >
                        <Ionicons name="trash-outline" size={17} color="#FFFFFF" />
                        <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>Delete</Text>
                      </Tap>
                    )}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.surface }}>
                      <Tap onPress={() => setMenu(item, s)} accessibilityLabel={`Set ${s + 1} options`} style={{ width: 38, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
                        <Text style={{ fontSize: 16, fontWeight: "700", color: c.onPill }}>{s + 1}</Text>
                      </Tap>
                      {FIELDS[trackOf(item.exercise)].map((f) => (
                        <NumberBox key={f.key} value={set[f.key]} onChange={(v) => setField(item.key, s, f.key, cleanField(f.kind, v))} kind={f.kind} hint={f.kind === "time" ? TIME_HINT[trackOf(item.exercise)] : "—"} label={`Set ${s + 1} ${f.head.toLowerCase()}`} colors={c} />
                      ))}
                    </View>
                  </ReanimatedSwipeable>
                ))}
                <Tap onPress={() => addSet(item.key)} accessibilityRole="button" style={{ marginTop: 12, height: 44, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
                  <Ionicons name="add" size={20} color={c.onPill} />
                  <Text style={{ fontSize: 15, fontWeight: "600", color: c.onPill }}>Add set</Text>
                </Tap>
              </View>
            ))}

            <Tap onPress={() => setPicking(true)} accessibilityRole="button" style={{ marginTop: 20, height: 50, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: c.ink }} pressedStyle={{ opacity: 0.85 }}>
              <Ionicons name="add" size={22} color={c.onInk} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: c.onInk }}>Add exercise</Text>
            </Tap>

            {!!id && (
              <Tap onPress={remove} accessibilityRole="button" style={{ marginTop: 28, alignSelf: "center", paddingHorizontal: 16, paddingVertical: 10 }} pressedStyle={{ opacity: 0.6 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: c.danger }}>Delete workout</Text>
              </Tap>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <PickExercises visible={picking} onClose={() => setPicking(false)} onAdd={addExercises} />
      <ReorderExercises visible={reordering} items={reorderRows} onClose={() => setReordering(false)} onDone={reorder} />
    </SafeAreaView>
  );
}

const head = (c: OrbitColors) => ({ fontSize: 12, fontWeight: "700" as const, letterSpacing: 1, color: c.faint });

function Chip({ icon, label, on, onPress, colors: c }: { icon: keyof typeof Ionicons.glyphMap; label: string; on?: boolean; onPress: () => void; colors: OrbitColors }) {
  return (
    <Tap onPress={onPress} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 12, backgroundColor: on ? c.ink : c.pill }} pressedStyle={{ opacity: 0.7 }}>
      <Ionicons name={icon} size={17} color={on ? c.onInk : c.onPill} />
      <Text style={{ fontSize: 14, fontWeight: "600", color: on ? c.onInk : c.onPill }}>{label}</Text>
    </Tap>
  );
}

function NumberBox({ value, onChange, kind, hint, label, colors: c }: { value: string; onChange: (value: string) => void; kind: "decimal" | "whole" | "time"; hint: string; label: string; colors: OrbitColors }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      keyboardType={kind === "decimal" ? "decimal-pad" : kind === "time" ? "numbers-and-punctuation" : "number-pad"}
      placeholder={hint}
      placeholderTextColor={c.faint}
      accessibilityLabel={label}
      selectTextOnFocus
      style={[
        // (minWidth 0: a browser's input won't shrink below its own width otherwise.)
        { flex: 1, minWidth: 0, height: 44, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.canvas, textAlign: "center", fontSize: 17, fontWeight: "600", color: c.text },
        Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
      ]}
    />
  );
}
