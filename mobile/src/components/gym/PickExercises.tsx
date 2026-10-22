import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Platform, ScrollView, Text, View } from "react-native";

import { ExerciseBrowser } from "@/src/components/gym/ExerciseBrowser";
import { Tap } from "@/src/components/ui/Tap";
import { getExercises, type Exercise } from "@/src/services/exerciseApi";
import { OrbitSection, useOrbitTheme } from "@/src/theme/orbit";

// "Add exercise": the library, to tick one or more, then add them.
export function PickExercises({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (picked: Exercise[]) => void }) {
  const { colors: c } = useOrbitTheme();
  const [all, setAll] = useState<Exercise[] | null>(null);
  const [picked, setPicked] = useState<Exercise[]>([]);
  useEffect(() => {
    if (!visible) return;
    setPicked([]);
    if (!all) getExercises().then(setAll, () => setAll([]));
  }, [visible, all]);
  const ids = useMemo(() => new Set(picked.map((e) => e._id)), [picked]);
  const toggle = (exercise: Exercise) => setPicked((list) => (list.some((e) => e._id === exercise._id) ? list.filter((e) => e._id !== exercise._id) : [...list, exercise]));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <OrbitSection section="gym">
        <View style={{ flex: 1, backgroundColor: c.canvas }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: Platform.OS === "ios" ? 16 : 12, paddingBottom: 10 }}>
            <Tap onPress={onClose} accessibilityRole="button" style={{ borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: c.onPill }}>Cancel</Text>
            </Tap>
            <Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: c.text }}>Add exercises</Text>
            <View style={{ width: 80 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {all ? <ExerciseBrowser all={all} picked={ids} onPick={toggle} /> : <ActivityIndicator style={{ marginTop: 24 }} color={c.muted} />}
          </ScrollView>
          {picked.length > 0 && (
            <View style={{ position: "absolute", left: 16, right: 16, bottom: 32 }}>
              <Tap onPress={() => onAdd(picked)} accessibilityRole="button" style={{ height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.ink }} pressedStyle={{ opacity: 0.85 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: c.onInk }}>
                  Add {picked.length} exercise{picked.length === 1 ? "" : "s"}
                </Text>
              </Tap>
            </View>
          )}
        </View>
      </OrbitSection>
    </Modal>
  );
}
