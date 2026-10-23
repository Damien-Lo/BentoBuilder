import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Platform, ScrollView, Text, TextInput, View } from "react-native";

import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import { Tap } from "@/src/components/ui/Tap";
import { addToMyList, EXERCISE_GROUPS, groupLabel, inMyList, removeFromMyList, type Exercise } from "@/src/services/exerciseApi";
import { OrbitSection, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Gym → Exercises → New exercise: the whole library — searched, or by
// muscle group — each ticked when it's in your list already. Tap one to put
// it in your list (or, one you added, to take it out: the core is always
// there). First of all, a custom exercise of your own (`onCustom`, with
// what's been typed as its name). `onChanged`: the library as it now is.
export function AddToMyList({ visible, all, onClose, onChanged, onCustom }: { visible: boolean; all: Exercise[]; onClose: () => void; onChanged: (all: Exercise[]) => void; onCustom: (name: string) => void }) {
  const { colors: c } = useOrbitTheme();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (visible) {
      setQuery("");
      setOpen(new Set());
    }
  }, [visible]);

  const key = query.trim().toLowerCase();
  const found = useMemo(() => {
    const words = key.split(/\s+/).filter(Boolean);
    return words.length ? all.filter((e) => words.every((w) => e.name.toLowerCase().includes(w))) : null;
  }, [all, key]);
  const groups = useMemo(() => EXERCISE_GROUPS.map((group) => ({ group, exercises: all.filter((e) => e.group === group) })).filter((g) => g.exercises.length > 0), [all]);
  const mine = all.filter(inMyList).length;

  // In or out of the list, at once — put back if the server says no.
  async function toggle(exercise: Exercise) {
    if (exercise.core || exercise.custom) return;
    const added = !exercise.added;
    const swap = (to: boolean) => onChanged(all.map((e) => (e._id === exercise._id ? { ...e, added: to } : e)));
    swap(added);
    try {
      await (added ? addToMyList(exercise._id) : removeFromMyList(exercise._id));
    } catch (error) {
      swap(!added);
      Alert.alert("Couldn't change your list", error instanceof Error ? error.message : "Something went wrong.");
    }
  }
  const row = (e: Exercise) => <Row key={e._id} exercise={e} onPress={() => void toggle(e)} colors={c} />;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <OrbitSection section="gym">
        <View style={{ flex: 1, backgroundColor: c.canvas }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: Platform.OS === "ios" ? 16 : 12, paddingBottom: 10 }}>
            <View style={{ width: 80 }} />
            <Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: c.text }}>New exercise</Text>
            <Tap onPress={onClose} accessibilityRole="button" style={{ width: 80, alignItems: "flex-end" }} pressedStyle={{ opacity: 0.7 }}>
              <View style={{ borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: c.ink }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: c.onInk }}>Done</Text>
              </View>
            </Tap>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: "row", alignItems: "center", height: 44, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
              <Ionicons name="search" size={17} color={c.faint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={`Search all ${all.length} exercises`}
                placeholderTextColor={c.faint}
                autoFocus
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                style={[{ flex: 1, marginLeft: 8, fontSize: 16, color: c.text }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
              />
              {!!query && (
                <Tap onPress={() => setQuery("")} accessibilityLabel="Clear search" hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={c.faint} />
                </Tap>
              )}
            </View>
            <Text style={{ marginTop: 8, marginLeft: 4, fontSize: 13, color: c.muted }}>{mine} in your list · tap one to add it, or a ticked one you added to take it out</Text>

            {/* Your own */}
            <Tap
              onPress={() => onCustom(query.trim())}
              accessibilityRole="button"
              style={{ marginTop: 14, marginBottom: 6, flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: c.ink, backgroundColor: c.surface }}
              pressedStyle={{ backgroundColor: c.pill }}
            >
              <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.ink }}>
                <Ionicons name="add" size={24} color={c.onInk} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }} numberOfLines={1}>
                  {query.trim() ? `Custom: “${query.trim()}”` : "Custom exercise"}
                </Text>
                <Text style={{ marginTop: 1, fontSize: 13, color: c.muted }}>Your own — its name, muscles, and how it&apos;s logged</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.faint} />
            </Tap>

            <View style={{ marginTop: 14 }}>
              {found ? (
                found.length === 0 ? (
                  <Text style={{ textAlign: "center", marginTop: 16, fontSize: 14, color: c.muted }}>Nothing in the library by that name — make it your own above.</Text>
                ) : (
                  <>
                    {found.slice(0, 80).map(row)}
                    {found.length > 80 && <Text style={{ textAlign: "center", marginTop: 6, fontSize: 13, color: c.faint }}>Keep typing to narrow it down</Text>}
                  </>
                )
              ) : (
                groups.map(({ group, exercises }) => {
                  const shown = open.has(group);
                  const ticked = exercises.filter(inMyList).length;
                  return (
                    <View key={group} style={{ marginBottom: 12 }}>
                      <Tap
                        onPress={() =>
                          setOpen((prev) => {
                            const next = new Set(prev);
                            if (next.has(group)) next.delete(group);
                            else next.add(group);
                            return next;
                          })
                        }
                        accessibilityRole="button"
                        accessibilityState={{ expanded: shown }}
                        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6, marginBottom: shown ? 10 : 0 }}
                        pressedStyle={{ opacity: 0.6 }}
                      >
                        <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: "700", letterSpacing: 1.4, color: c.faint }}>
                          {groupLabel(group).toUpperCase()}
                          <Text style={{ fontWeight: "600", color: c.orbit }}> · {exercises.length}</Text>
                          {ticked > 0 && <Text style={{ color: c.ink }}> · {ticked} IN YOUR LIST</Text>}
                        </Text>
                        <Ionicons name={shown ? "chevron-down" : "chevron-forward"} size={16} color={c.faint} />
                      </Tap>
                      {shown && exercises.map(row)}
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        </View>
      </OrbitSection>
    </Modal>
  );
}

// An exercise: ticked when it's in your list (the core and your own for
// good; one you added, until you take it out).
function Row({ exercise: e, onPress, colors: c }: { exercise: Exercise; onPress: () => void; colors: OrbitColors }) {
  const mine = inMyList(e);
  const fixed = e.core || e.custom;
  return (
    <Tap
      onPress={onPress}
      disabled={fixed}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: mine, disabled: fixed }}
      accessibilityLabel={e.name}
      style={{ marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 10, paddingRight: 14, paddingVertical: 10, borderRadius: 16, borderWidth: mine ? 2 : 1, borderColor: mine ? c.ink : c.border, backgroundColor: c.surface }}
      pressedStyle={{ backgroundColor: c.pill }}
    >
      <ExerciseIcon name={e.name} primary={e.primaryMuscles} secondary={e.secondaryMuscles} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: c.text }} numberOfLines={2}>
          {e.name}
        </Text>
        {fixed && <Text style={{ marginTop: 1, fontSize: 12, color: c.faint }}>{e.custom ? "Your own" : "Always in your list"}</Text>}
      </View>
      <Ionicons name={mine ? "checkmark-circle" : "add-circle-outline"} size={24} color={mine ? c.ink : c.faint} />
    </Tap>
  );
}
