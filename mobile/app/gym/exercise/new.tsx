import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MuscleMap } from "@/src/components/gym/MuscleMap";
import { MUSCLES, muscleLabel } from "@/src/components/gym/progressStats";
import type { Track } from "@/src/components/gym/tracking";
import { Tap } from "@/src/components/ui/Tap";
import { createExercise } from "@/src/services/exerciseApi";
import { OrbitSection, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Gym → Exercises → New exercise → Custom: an exercise of your own — its
// name, how it's logged, what it takes, and the muscles it works (shown on
// the body as they're chosen). Saved, it's in your list and opens on its
// own page. (`name`: what was typed in the search, to start from.)

const TRACKS: { id: Track; label: string; hint: string }[] = [
  { id: "weight", label: "Weight × reps", hint: "Most lifts" },
  { id: "bodyweight", label: "Bodyweight reps", hint: "Push-ups, dips — weight added if any" },
  { id: "assisted", label: "Assisted", hint: "The help × reps: less help is stronger" },
  { id: "duration", label: "Time", hint: "A hold, like a plank" },
  { id: "cardio", label: "Distance & time", hint: "Running, rowing, cycling" },
];
// (As the library names them.)
const EQUIPMENT: { id: string; label: string }[] = [
  { id: "barbell", label: "Barbell" },
  { id: "dumbbell", label: "Dumbbell" },
  { id: "machine", label: "Machine" },
  { id: "cable", label: "Cable" },
  { id: "kettlebells", label: "Kettlebell" },
  { id: "bands", label: "Band" },
  { id: "body only", label: "None" },
  { id: "other", label: "Other" },
];

export default function NewExerciseScreen() {
  return (
    <OrbitSection section="gym">
      <NewExercise />
    </OrbitSection>
  );
}

function NewExercise() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const { name: typed } = useLocalSearchParams<{ name?: string }>();
  const [name, setName] = useState(typed ?? "");
  const [track, setTrack] = useState<Track>("weight");
  const [equipment, setEquipment] = useState<string | null>(null);
  const [primary, setPrimary] = useState<string | null>(null);
  const [secondary, setSecondary] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/gym/exercises" as Href));

  async function save() {
    if (saving) return;
    if (!name.trim()) return Alert.alert("Name it", "Give your exercise a name first.");
    if (track !== "cardio" && !primary) return Alert.alert("Which muscle?", "Choose the muscle it mainly works.");
    setSaving(true);
    try {
      const made = await createExercise({ name: name.trim(), track, equipment, primaryMuscles: primary ? [primary] : [], secondaryMuscles: secondary });
      router.replace(`/gym/exercise/${made._id}` as Href);
    } catch (error) {
      setSaving(false);
      Alert.alert("Couldn't save it", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6 }}>
        <Tap onPress={back} accessibilityRole="button" style={{ borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: c.onPill }}>Cancel</Text>
        </Tap>
        <Tap onPress={() => void save()} disabled={saving} accessibilityRole="button" style={{ borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9, backgroundColor: c.ink, opacity: saving ? 0.6 : 1 }} pressedStyle={{ opacity: 0.85 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: c.onInk }}>{saving ? "Saving…" : "Save"}</Text>
        </Tap>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>Custom exercise</Text>
          <Text style={{ marginTop: 2, fontSize: 14, color: c.muted }}>Your own — it joins your list</Text>

          <Heading colors={c}>NAME</Heading>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Landmine Press (Single Arm)"
            placeholderTextColor={c.faint}
            autoFocus={!typed}
            style={[{ height: 50, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, fontSize: 17, fontWeight: "600", color: c.text }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
          />

          <Heading colors={c}>LOGGED AS</Heading>
          <View style={{ gap: 8 }}>
            {TRACKS.map((t) => {
              const on = t.id === track;
              return (
                <Tap key={t.id} onPress={() => setTrack(t.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, borderWidth: on ? 2 : 1, borderColor: on ? c.ink : c.border, backgroundColor: c.surface }} pressedStyle={{ backgroundColor: c.pill }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: c.text }}>{t.label}</Text>
                    <Text style={{ marginTop: 1, fontSize: 12.5, color: c.muted }}>{t.hint}</Text>
                  </View>
                  <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? c.ink : c.faint} />
                </Tap>
              );
            })}
          </View>

          <Heading colors={c}>EQUIPMENT</Heading>
          <ChipRow options={EQUIPMENT} isOn={(id) => equipment === id} onPress={(id) => setEquipment((e) => (e === id ? null : id))} colors={c} />

          <Heading colors={c}>{track === "cardio" ? "MAINLY WORKS (OPTIONAL)" : "MAINLY WORKS"}</Heading>
          <ChipRow
            options={MUSCLES.map((m) => ({ id: m, label: muscleLabel(m) }))}
            isOn={(m) => primary === m}
            onPress={(m) => {
              setPrimary((p) => (p === m ? null : m));
              setSecondary((list) => list.filter((x) => x !== m));
            }}
            colors={c}
          />

          <Heading colors={c}>ALSO WORKS</Heading>
          <ChipRow
            options={MUSCLES.filter((m) => m !== primary).map((m) => ({ id: m, label: muscleLabel(m) }))}
            isOn={(m) => secondary.includes(m)}
            onPress={(m) => setSecondary((list) => (list.includes(m) ? list.filter((x) => x !== m) : [...list, m]))}
            colors={c}
          />

          {(primary || secondary.length > 0) && (
            <View style={{ marginTop: 18, paddingVertical: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
              <MuscleMap primary={primary ? [primary] : []} secondary={secondary} size={0.7} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Heading({ children, colors: c }: { children: string; colors: OrbitColors }) {
  return <Text style={{ marginTop: 22, marginBottom: 8, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>{children}</Text>;
}

function ChipRow({ options, isOn, onPress, colors: c }: { options: { id: string; label: string }[]; isOn: (id: string) => boolean; onPress: (id: string) => void; colors: OrbitColors }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = isOn(o.id);
        return (
          <Tap key={o.id} onPress={() => onPress(o.id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: on ? c.ink : c.pill }} pressedStyle={{ opacity: 0.75 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: on ? c.onInk : c.onPill }}>{o.label}</Text>
          </Tap>
        );
      })}
    </View>
  );
}
