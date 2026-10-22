import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useMemo, useState } from "react";
import { Platform, Text, TextInput, View } from "react-native";

import { Tap } from "@/src/components/ui/Tap";
import { EXERCISE_GROUPS, exerciseImage, groupLabel, type Exercise } from "@/src/services/exerciseApi";
import { useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// The exercise library as a list: a search over all of it (the core first,
// then the rest), or — not searching — the core in a folded section for
// each muscle group. Used by Gym → Exercises (`onPick` absent: just
// browsing) and by the workout builder's "Add exercise" (each card picks or
// unpicks; `picked` are ticked).
export function ExerciseBrowser({ all, picked, onPick }: { all: Exercise[]; picked?: Set<string>; onPick?: (exercise: Exercise) => void }) {
  const { colors: c } = useOrbitTheme();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const core = useMemo(() => all.filter((e) => e.core), [all]);
  const groups = useMemo(
    () => EXERCISE_GROUPS.map((group) => ({ group, exercises: core.filter((e) => e.group === group).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.exercises.length > 0),
    [core],
  );
  // Every word, anywhere in the name.
  const key = query.trim().toLowerCase();
  const found = useMemo(() => {
    const words = key.split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    const hits = all.filter((e) => words.every((w) => e.name.toLowerCase().includes(w)));
    const more = hits.filter((e) => !e.core);
    return { core: hits.filter((e) => e.core), more: more.slice(0, 60), moreCount: more.length };
  }, [all, key]);

  const toggle = (group: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  const card = (exercise: Exercise) => <ExerciseCard key={exercise._id} exercise={exercise} picked={picked?.has(exercise._id)} onPress={onPick && (() => onPick(exercise))} colors={c} />;

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", height: 44, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
        <Ionicons name="search" size={17} color={c.faint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search every exercise"
          placeholderTextColor={c.faint}
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

      <View style={{ marginTop: 20 }}>
        {found ? (
          <>
            {found.core.length === 0 && found.moreCount === 0 && <Text style={{ textAlign: "center", marginTop: 24, fontSize: 14, color: c.muted }}>No exercise by that name.</Text>}
            {found.core.map(card)}
            {found.moreCount > 0 && (
              <>
                <Label text={`More from the library · ${found.moreCount}`} top={found.core.length ? 12 : 0} colors={c} />
                {found.more.map(card)}
                {found.moreCount > found.more.length && <Text style={{ textAlign: "center", marginTop: 6, fontSize: 13, color: c.faint }}>Keep typing to narrow it down</Text>}
              </>
            )}
          </>
        ) : (
          groups.map(({ group, exercises }) => {
            const shown = open.has(group);
            const ticked = picked ? exercises.filter((e) => picked.has(e._id)).length : 0;
            return (
              <View key={group} style={{ marginBottom: 12 }}>
                <Tap
                  onPress={() => toggle(group)}
                  accessibilityRole="button"
                  accessibilityLabel={`${groupLabel(group)}, ${exercises.length} exercises`}
                  accessibilityState={{ expanded: shown }}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6, marginBottom: shown ? 10 : 0 }}
                  pressedStyle={{ opacity: 0.6 }}
                >
                  <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: "700", letterSpacing: 1.4, color: c.faint }}>
                    {groupLabel(group).toUpperCase()}
                    <Text style={{ fontWeight: "600", color: c.orbit }}> · {exercises.length}</Text>
                    {ticked > 0 && <Text style={{ color: c.ink }}> · {ticked} PICKED</Text>}
                  </Text>
                  <Ionicons name={shown ? "chevron-down" : "chevron-forward"} size={16} color={c.faint} />
                </Tap>
                {shown && exercises.map(card)}
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

function Label({ text, top, colors: c }: { text: string; top: number; colors: OrbitColors }) {
  return <Text style={{ marginTop: top, marginBottom: 10, marginLeft: 4, fontSize: 12, fontWeight: "700", letterSpacing: 1.4, color: c.faint }}>{text.toUpperCase()}</Text>;
}

// A card: the exercise's name — and, when picking, a tick.
function ExerciseCard({ exercise, picked, onPress, colors: c }: { exercise: Exercise; picked?: boolean; onPress?: () => void; colors: OrbitColors }) {
  return (
    <Tap
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "checkbox" : undefined}
      accessibilityState={onPress ? { checked: !!picked } : undefined}
      style={{ marginBottom: 8, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, borderWidth: picked ? 2 : 1, borderColor: picked ? c.ink : c.border, backgroundColor: c.surface }}
      pressedStyle={{ backgroundColor: c.pill }}
    >
      <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: c.text }} numberOfLines={2}>
        {exercise.name}
      </Text>
      {onPress && <Ionicons name={picked ? "checkmark-circle" : "ellipse-outline"} size={22} color={picked ? c.ink : c.faint} />}
    </Tap>
  );
}

// An exercise's photo, in a circle (or its muscle's icon, without one).
export function ExerciseThumb({ images, size = 44 }: { images?: string[]; size?: number }) {
  const { colors: c } = useOrbitTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: c.border }}>
      {images?.[0] ? (
        <Image source={{ uri: exerciseImage(images[0]) }} style={{ width: size * 1.5, height: size }} contentFit="cover" transition={120} accessibilityIgnoresInvertColors />
      ) : (
        <Ionicons name="barbell" size={size * 0.45} color={c.faint} />
      )}
    </View>
  );
}
