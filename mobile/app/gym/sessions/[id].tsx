import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { clock } from "@/src/components/gym/activeSession";
import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import { sessionAchievements, type Achievement } from "@/src/components/gym/progressStats";
import { cleanField, draftOf, FIELDS, fromDraft, setComplete, setText, TIME_HINT, trackOf, type DraftField, type SetDraft } from "@/src/components/gym/tracking";
import { showActions } from "@/src/components/todo/theme";
import { Tap } from "@/src/components/ui/Tap";
import { deleteSession, getSession, getSessions, SET_TYPES, setLabels, setTypeOf, sessionTotals, updateSession, type GymSessionRecord, type SetType } from "@/src/services/gymApi";
import { OrbitSection, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// One finished workout: when, how long, what it came to, and every set of
// every exercise (each exercise opens its own page), and the records it set
// (each exercise's best, or its total weight, beaten). Just finished
// (`finished`), it opens with how it went — and any records it set. It can
// be corrected (Edit: its name, each set's weight, reps and type, sets and
// exercises taken out or added) or deleted.
export default function SessionDetailScreen() {
  return (
    <OrbitSection section="gym">
      <SessionDetail />
    </OrbitSection>
  );
}

// A workout being corrected: its numbers as typed.
type DraftSet = SetDraft & { key: number; type: SetType };
type Draft = { name: string; exercises: { key: number; exercise: NonNullable<GymSessionRecord["exercises"][number]["exercise"]>; note: string; sets: DraftSet[] }[] };
let nextKey = 0;
const sessionDraft = (session: GymSessionRecord): Draft => ({
  name: session.name,
  exercises: session.exercises
    .filter((e) => e.exercise)
    .map((e) => ({ key: nextKey++, exercise: e.exercise!, note: e.note, sets: e.sets.map((s) => ({ key: nextKey++, ...draftOf(s), type: s.type ?? "normal" })) })),
});

function SessionDetail() {
  const router = useRouter();
  const { id, finished } = useLocalSearchParams<{ id: string; finished?: string }>();
  const { colors: c } = useOrbitTheme();
  const [session, setSession] = useState<GymSessionRecord | null>(null);
  const [failed, setFailed] = useState(false);
  // What it achieved: records beaten (null while loading).
  const [records, setRecords] = useState<Achievement[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (id) getSession(id).then(setSession, () => setFailed(true));
  }, [id]);
  // What it achieved, against every workout before it.
  useEffect(() => {
    if (session) getSessions().then((all) => setRecords(sessionAchievements(session, all)), () => setRecords([]));
  }, [session]);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/gym/history" as Href));

  function remove() {
    if (!session) return;
    Alert.alert(`Delete "${session.name}"?`, "Its sets go from your history and progress.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void deleteSession(session._id).then(back, (error) => Alert.alert("Couldn't delete it", error instanceof Error ? error.message : "Something went wrong.")) },
    ]);
  }

  // Editing: every change to the draft, then Save (or Cancel, dropping it).
  const changeExercise = (key: number, change: (e: Draft["exercises"][number]) => Draft["exercises"][number]) => setDraft((d) => d && { ...d, exercises: d.exercises.map((e) => (e.key === key ? change(e) : e)) });
  const changeSet = (key: number, setKey: number, change: (s: DraftSet) => DraftSet) => changeExercise(key, (e) => ({ ...e, sets: e.sets.map((s) => (s.key === setKey ? change(s) : s)) }));
  function setTypeMenu(key: number, set: DraftSet) {
    showActions(
      "Set type",
      SET_TYPES.map((t) => ({ label: t.id === set.type ? `${t.label} ✓` : t.label, onPress: () => changeSet(key, set.key, (s) => ({ ...s, type: t.id })) })),
    );
  }
  async function save() {
    if (!session || !draft || saving) return;
    const exercises = draft.exercises
      .map((e) => {
        const track = trackOf(e.exercise);
        return { exercise: e.exercise._id, note: e.note, sets: e.sets.map((s) => ({ ...fromDraft(s, track), type: s.type })).filter((s) => setComplete(s, track)) };
      })
      .filter((e) => e.sets.length > 0);
    if (!exercises.length) return Alert.alert("Nothing left in it", "A workout needs at least one set filled in — delete it instead.");
    setSaving(true);
    try {
      setSession(await updateSession(session._id, { name: draft.name.trim() || session.name, exercises }));
      setDraft(null);
    } catch (error) {
      Alert.alert("Couldn't save the changes", error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }
  function cancel() {
    Alert.alert("Drop your changes?", undefined, [
      { text: "Keep editing", style: "cancel" },
      { text: "Drop them", style: "destructive", onPress: () => setDraft(null) },
    ]);
  }

  const t = session ? sessionTotals(session) : null;
  const d = session ? new Date(session.finishedAt) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      {/* Back · Edit — or, editing, Cancel · Save */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingTop: 4 }}>
        {draft ? (
          <Tap onPress={cancel} accessibilityRole="button" style={{ borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: c.onPill }}>Cancel</Text>
          </Tap>
        ) : (
          <Tap onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }} pressedStyle={{ backgroundColor: c.pill }}>
            <Ionicons name="chevron-back" size={22} color={c.text} />
          </Tap>
        )}
        {session &&
          (draft ? (
            <Tap onPress={() => void save()} disabled={saving} accessibilityRole="button" style={{ borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9, backgroundColor: c.ink, opacity: saving ? 0.6 : 1 }} pressedStyle={{ opacity: 0.85 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: c.onInk }}>{saving ? "Saving…" : "Save"}</Text>
            </Tap>
          ) : (
            <Tap onPress={() => setDraft(sessionDraft(session))} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
              <Ionicons name="create-outline" size={17} color={c.onPill} />
              <Text style={{ fontSize: 15, fontWeight: "600", color: c.onPill }}>Edit</Text>
            </Tap>
          ))}
      </View>
      {!session || !t || !d ? (
        failed ? <Text style={{ textAlign: "center", marginTop: 40, fontSize: 14, color: c.muted }}>Couldn&apos;t load this workout.</Text> : <ActivityIndicator style={{ marginTop: 40 }} color={c.muted} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Just finished: how it went */}
            {finished && !draft && <Finished records={records ?? []} onDone={() => (router.canGoBack() ? router.back() : router.replace("/gym" as Href))} colors={c} />}

            {draft ? (
              <TextInput
                value={draft.name}
                onChangeText={(name) => setDraft((x) => x && { ...x, name })}
                accessibilityLabel="Workout name"
                style={[{ fontSize: 26, fontWeight: "800", color: c.text, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: c.border }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
              />
            ) : (
              <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>{session.name}</Text>
            )}
            <Text style={{ marginTop: 4, fontSize: 14, color: c.muted }}>
              {d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </Text>

            {!draft && (
              <View style={{ marginTop: 16, flexDirection: "row", gap: 10 }}>
                <Stat label="Time" value={clock(t.seconds)} colors={c} />
                <Stat label="Volume" value={`${Math.round(t.volume).toLocaleString()} lbs`} colors={c} />
                <Stat label="Sets" value={String(t.sets)} colors={c} />
                <Stat label="Records" value={records ? String(records.length) : " "} icon="trophy" colors={c} />
              </View>
            )}

            {draft
              ? draft.exercises.map((e) => (
                  <View key={e.key} style={{ marginTop: 16, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <ExerciseIcon name={e.exercise.name} primary={e.exercise.primaryMuscles} secondary={e.exercise.secondaryMuscles} />
                      <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: c.text }} numberOfLines={2}>
                        {e.exercise.name}
                      </Text>
                      <Tap onPress={() => setDraft((x) => x && { ...x, exercises: x.exercises.filter((y) => y.key !== e.key) })} accessibilityRole="button" accessibilityLabel={`Remove ${e.exercise.name}`} style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }} pressedStyle={{ backgroundColor: c.pill }}>
                        <Ionicons name="trash-outline" size={19} color={c.danger} />
                      </Tap>
                    </View>
                    <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={[head(c), { width: 34, textAlign: "center" }]}>SET</Text>
                      {FIELDS[trackOf(e.exercise)].map((f) => (
                        <Text key={f.key} style={[head(c), { flex: 1, textAlign: "center" }]}>
                          {f.head}
                        </Text>
                      ))}
                      <View style={{ width: 36 }} />
                    </View>
                    {e.sets.map((s, n) => {
                      const kind = setTypeOf(s.type);
                      return (
                        <View key={s.key} style={{ marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Tap onPress={() => setTypeMenu(e.key, s)} accessibilityRole="button" accessibilityLabel={`Set ${n + 1}: ${kind.label}. Change its type`} style={{ width: 34, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
                            <Text style={{ fontSize: 15, fontWeight: "800", color: kind.color ?? c.onPill }}>{setLabels(e.sets)[n]}</Text>
                          </Tap>
                          {FIELDS[trackOf(e.exercise)].map((f) => (
                            <Box
                              key={f.key}
                              value={s[f.key]}
                              kind={f.kind}
                              hint={f.kind === "time" ? TIME_HINT[trackOf(e.exercise)] : "—"}
                              onChange={(v) => changeSet(e.key, s.key, (x) => ({ ...x, [f.key as DraftField]: cleanField(f.kind, v) }))}
                              label={`Set ${n + 1} ${f.head.toLowerCase()}`}
                              colors={c}
                            />
                          ))}
                          <Tap onPress={() => changeExercise(e.key, (x) => ({ ...x, sets: x.sets.filter((y) => y.key !== s.key) }))} accessibilityRole="button" accessibilityLabel={`Delete set ${n + 1}`} style={{ width: 36, height: 40, alignItems: "center", justifyContent: "center" }} pressedStyle={{ opacity: 0.6 }}>
                            <Ionicons name="close-circle" size={20} color={c.faint} />
                          </Tap>
                        </View>
                      );
                    })}
                    <Tap
                      onPress={() =>
                        changeExercise(e.key, (x) => {
                          const last = x.sets[x.sets.length - 1];
                          return { ...x, sets: [...x.sets, { key: nextKey++, ...(last ? { weight: last.weight, reps: last.reps, time: last.time, distance: last.distance } : draftOf(null)), type: "normal" }] };
                        })
                      }
                      accessibilityRole="button"
                      style={{ marginTop: 10, height: 40, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: c.pill }}
                      pressedStyle={{ opacity: 0.7 }}
                    >
                      <Ionicons name="add" size={18} color={c.onPill} />
                      <Text style={{ fontSize: 14, fontWeight: "600", color: c.onPill }}>Add set</Text>
                    </Tap>
                  </View>
                ))
              : session.exercises
                  .filter((e) => e.exercise)
                  .map((e, i) => {
                    const labels = setLabels(e.sets);
                    return (
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
                          <Text style={[head(c), { flex: 1 }]}>DONE</Text>
                        </View>
                        {e.sets.map((s, n) => (
                          <View key={n} style={{ marginTop: 8, flexDirection: "row", alignItems: "center" }}>
                            <Text style={{ width: 44, fontSize: 15, fontWeight: "700", color: setTypeOf(s.type).color ?? c.muted }}>{labels[n]}</Text>
                            <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: c.text }}>
                              {setText(s, trackOf(e.exercise))}
                            </Text>
                          </View>
                        ))}
                      </View>
                    );
                  })}

            {!draft && (
              <Tap onPress={remove} accessibilityRole="button" style={{ marginTop: 28, alignSelf: "center", paddingHorizontal: 16, paddingVertical: 10 }} pressedStyle={{ opacity: 0.6 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: c.danger }}>Delete workout</Text>
              </Tap>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

// Just finished: done, and the records it set — tapped (or Done), it's
// left, back to where the workout was started from.
function Finished({ records, onDone, colors: c }: { records: Achievement[]; onDone: () => void; colors: OrbitColors }) {
  return (
    <Tap onPress={onDone} accessibilityRole="button" accessibilityLabel="Workout done. Close" style={{ marginBottom: 18, padding: 16, borderRadius: 18, backgroundColor: c.success }} pressedStyle={{ opacity: 0.85 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Ionicons name="checkmark-circle" size={26} color="#FFFFFF" />
        <Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: "#FFFFFF" }}>Workout done</Text>
        <View style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.22)" }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>Done</Text>
        </View>
      </View>
      <Text style={{ marginTop: 4, fontSize: 14, color: "#FFFFFF", opacity: 0.9 }}>
        {records.length ? `${records.length} new record${records.length === 1 ? "" : "s"} — nice work.` : "Saved to your history. Nice work."}
      </Text>
      {records.length > 0 && (
        <View style={{ marginTop: 10, gap: 6 }}>
          {records.map((r) => (
            <View key={`${r.exercise._id}-${r.kind}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="trophy" size={15} color="#FFFFFF" />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#FFFFFF" }} numberOfLines={1}>
                {r.exercise.name}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: "800", color: "#FFFFFF" }}>
                {r.text} <Text style={{ fontWeight: "600", opacity: 0.85 }}>({r.gain})</Text>
              </Text>
            </View>
          ))}
        </View>
      )}
    </Tap>
  );
}

const head = (c: OrbitColors) => ({ fontSize: 11, fontWeight: "700" as const, letterSpacing: 1, color: c.faint });

// The records card's trophy: gold, either theme.
const GOLD = "#EAB308";

function Stat({ label, value, icon, colors: c }: { label: string; value: string; icon?: keyof typeof Ionicons.glyphMap; colors: OrbitColors }) {
  return (
    <View style={{ flex: 1, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {icon && <Ionicons name={icon} size={13} color={GOLD} />}
        <Text style={{ fontSize: 12, color: c.muted }} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={{ marginTop: 3, fontSize: 18, fontWeight: "800", color: c.text }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>
    </View>
  );
}

function Box({ value, onChange, kind, hint, label, colors: c }: { value: string; onChange: (v: string) => void; kind: "decimal" | "whole" | "time"; hint: string; label: string; colors: OrbitColors }) {
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
        { flex: 1, minWidth: 0, height: 40, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.canvas, textAlign: "center", fontSize: 16, fontWeight: "700", color: c.text },
        Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
      ]}
    />
  );
}
