import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { AddToMyList } from "@/src/components/gym/AddToMyList";
import { myListByGroup, searchExercises } from "@/src/components/gym/ExerciseBrowser";
import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import { Grid, type Hover } from "@/src/components/gym/web/parts";
import { Button, hoverable, PageTitle, WebPage } from "@/src/components/web/ui";
import { getExercises, groupLabel, inMyList, type Exercise } from "@/src/services/exerciseApi";
import { useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Gym's Exercises in a desktop browser: your list — the core, what you've
// added from the library, and your own — as a grid of cards under each
// muscle group, or one group picked from the chips; and a search that
// reaches the whole library (your list first, then the rest). New
// exercise: the library to add from, or one of your own.

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

export function WebGymExercises() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const [all, setAll] = useState<Exercise[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getExercises()
        .then((list) => {
          setAll(list);
          setFailed(false);
        })
        .catch(() => setFailed(true));
    }, []),
  );
  const groups = useMemo(() => myListByGroup(all ?? []), [all]);
  const found = useMemo(() => searchExercises(all ?? [], query), [all, query]);
  const mine = all?.filter(inMyList).length ?? 0;
  const open = (e: Exercise) => router.push(`/gym/exercise/${e._id}` as Href);
  const grid = (list: Exercise[]) => (
    <Grid min={250} gap={12}>
      {list.map((e) => (
        <ExerciseCard key={e._id} exercise={e} onPress={() => open(e)} colors={c} />
      ))}
    </Grid>
  );
  const shown = group ? groups.filter((g) => g.group === group) : groups;

  return (
    <WebPage>
      <PageTitle title="Exercises" subtitle={all ? `${mine} in your list — search all ${all.length}` : "The exercise library"} right={<Button label="New exercise" icon="add" kind="primary" onPress={() => setAdding(true)} disabled={!all} />} />

      {/* Search, and the muscle groups */}
      <View style={{ flexDirection: "row", alignItems: "center", height: 44, maxWidth: 560, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
        <Ionicons name="search" size={17} color={c.faint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search every exercise"
          placeholderTextColor={c.faint}
          autoCorrect={false}
          autoCapitalize="none"
          style={[{ flex: 1, marginLeft: 8, fontSize: 15, color: c.text }, { outlineStyle: "none" } as object]}
        />
        {!!query && (
          <Pressable onPress={() => setQuery("")} accessibilityLabel="Clear search" hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={c.faint} />
          </Pressable>
        )}
      </View>
      {!found && all && (
        <View style={{ marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Chip label={`All · ${mine}`} on={!group} onPress={() => setGroup(null)} colors={c} />
          {groups.map((g) => (
            <Chip key={g.group} label={`${groupLabel(g.group)} · ${g.exercises.length}`} on={group === g.group} onPress={() => setGroup(group === g.group ? null : g.group)} colors={c} />
          ))}
        </View>
      )}

      <View style={{ marginTop: 20 }}>
        {!all ? (
          <Text style={{ fontSize: 14, color: c.muted }}>{failed ? "Couldn't load the exercises." : "Loading…"}</Text>
        ) : found ? (
          <>
            {found.core.length === 0 && found.moreCount === 0 && <Text style={{ fontSize: 14, color: c.muted }}>No exercise by that name.</Text>}
            {found.core.length > 0 && (
              <>
                <Heading text={`In your list · ${found.core.length}`} colors={c} />
                {grid(found.core)}
              </>
            )}
            {found.moreCount > 0 && (
              <>
                <Heading text={`More from the library · ${found.moreCount}`} colors={c} />
                {grid(found.more)}
                {found.moreCount > found.more.length && <Text style={{ textAlign: "center", marginTop: 12, fontSize: 13, color: c.faint }}>Keep typing to narrow it down</Text>}
              </>
            )}
          </>
        ) : (
          shown.map((g) => (
            <View key={g.group}>
              <Heading text={`${groupLabel(g.group)} · ${g.exercises.length}`} colors={c} />
              {grid(g.exercises)}
            </View>
          ))
        )}
      </View>

      {all && (
        <AddToMyList
          visible={adding}
          all={all}
          onClose={() => setAdding(false)}
          onChanged={setAll}
          onCustom={(name) => {
            setAdding(false);
            router.push(`/gym/exercise/new${name ? `?name=${encodeURIComponent(name)}` : ""}` as Href);
          }}
        />
      )}
    </WebPage>
  );
}

function Heading({ text, colors: c }: { text: string; colors: OrbitColors }) {
  return <Text style={{ marginTop: 8, marginBottom: 10, marginLeft: 2, fontSize: 12, fontWeight: "700", letterSpacing: 1.4, color: c.faint }}>{text.toUpperCase()}</Text>;
}

function Chip({ label, on, onPress, colors: c }: { label: string; on: boolean; onPress: () => void; colors: OrbitColors }) {
  return (
    <Pressable onPress={onPress} style={hoverable(({ hovered }: Hover) => ({ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? c.ink : hovered ? c.track : c.pill }))}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: on ? c.onInk : c.onPill }}>{label}</Text>
    </Pressable>
  );
}

// An exercise: its picture, its name, what it works and with what — and
// whether it's your own or one you added. Clicked: its page.
function ExerciseCard({ exercise: e, onPress, colors: c }: { exercise: Exercise; onPress: () => void; colors: OrbitColors }) {
  const detail = [groupLabel(e.group), e.equipment ? capital(e.equipment) : null].filter(Boolean).join(" · ");
  const tag = e.custom ? "Your own" : e.added ? "Added" : null;
  return (
    <Pressable onPress={onPress} style={hoverable(({ hovered }: Hover) => ({ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 10, paddingRight: 14, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: hovered ? c.faint : c.border, backgroundColor: hovered ? c.pill : c.surface }))}>
      <ExerciseIcon name={e.name} primary={e.primaryMuscles} secondary={e.secondaryMuscles} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14.5, fontWeight: "600", color: c.text }} numberOfLines={2}>
          {e.name}
        </Text>
        <Text style={{ marginTop: 2, fontSize: 12, color: c.muted }} numberOfLines={1}>
          {detail}
          {tag ? <Text style={{ fontWeight: "700", color: c.ink }}> · {tag}</Text> : null}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={c.faint} />
    </Pressable>
  );
}
