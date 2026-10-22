import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Modal, Platform, ScrollView, Text, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitSection, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// A workout's exercises in a sheet, to put in a new order: each row (its
// icon and name) dragged by the handle on its right — the others slide out
// of its way — then Done. (`items` by a key of their own; `onDone` gets the
// keys in the new order.)

type Row = { key: string; name: string; primary: string[]; secondary: string[] };

const ROW = 64;
const GAP = 8;
const STEP = ROW + GAP;

export function ReorderExercises({ visible, items, onClose, onDone }: { visible: boolean; items: Row[]; onClose: () => void; onDone: (keys: string[]) => void }) {
  const { colors: c } = useOrbitTheme();
  // Where each row is, by its key: a place in the list (0 at the top).
  const positions = useSharedValue<Record<string, number>>({});
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    if (!visible) return;
    positions.value = Object.fromEntries(items.map((item, i) => [item.key, i]));
    setOrder(items.map((item) => item.key));
  }, [visible, items, positions]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {/* (A sheet is outside the app's gesture root: it needs its own.) */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <OrbitSection section="gym">
          <View style={{ flex: 1, backgroundColor: c.canvas }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: Platform.OS === "ios" ? 16 : 12, paddingBottom: 10 }}>
              <Tap onPress={onClose} accessibilityRole="button" style={{ borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: c.onPill }}>Cancel</Text>
              </Tap>
              <Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: c.text }}>Reorder</Text>
              <Tap onPress={() => onDone(order)} accessibilityRole="button" style={{ borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9, backgroundColor: c.ink }} pressedStyle={{ opacity: 0.8 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: c.onInk }}>Done</Text>
              </Tap>
            </View>
            <Text style={{ paddingHorizontal: 20, marginBottom: 12, fontSize: 13, color: c.muted }}>Drag an exercise by its handle to move it.</Text>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
              <View style={{ height: items.length * STEP }}>
                {items.map((item) => (
                  <DragRow key={item.key} row={item} positions={positions} count={items.length} onMoved={setOrder} colors={c} />
                ))}
              </View>
            </ScrollView>
          </View>
        </OrbitSection>
      </GestureHandlerRootView>
    </Modal>
  );
}

// The keys, by where they now are.
function orderOf(positions: Record<string, number>) {
  "worklet";
  return Object.keys(positions).sort((a, b) => positions[a] - positions[b]);
}

function DragRow({ row, positions, count, onMoved, colors: c }: { row: Row; positions: SharedValue<Record<string, number>>; count: number; onMoved: (keys: string[]) => void; colors: OrbitColors }) {
  const top = useSharedValue((positions.value[row.key] ?? 0) * STEP);
  const dragging = useSharedValue(false);
  const from = useSharedValue(0);

  // Another row moved past this one: slide to its new place.
  useAnimatedReaction(
    () => positions.value[row.key],
    (place, before) => {
      if (place !== undefined && place !== before && !dragging.value) top.value = withTiming(place * STEP, { duration: 180 });
    },
  );

  const drag = Gesture.Pan()
    .onBegin(() => {
      dragging.value = true;
      from.value = top.value;
    })
    .onUpdate((e) => {
      top.value = Math.max(0, Math.min((count - 1) * STEP, from.value + e.translationY));
      // Past halfway into a neighbour's place: they swap.
      const place = Math.round(top.value / STEP);
      const current = positions.value[row.key];
      if (place !== current) {
        const other = Object.keys(positions.value).find((k) => positions.value[k] === place);
        const next = { ...positions.value, [row.key]: place };
        if (other) next[other] = current;
        positions.value = next;
      }
    })
    .onFinalize(() => {
      dragging.value = false;
      top.value = withTiming(positions.value[row.key] * STEP, { duration: 160 });
      runOnJS(onMoved)(orderOf(positions.value));
    });

  const style = useAnimatedStyle(() => ({
    top: top.value,
    zIndex: dragging.value ? 10 : 0,
    transform: [{ scale: withTiming(dragging.value ? 1.03 : 1, { duration: 120 }) }],
    shadowOpacity: withTiming(dragging.value ? 0.18 : 0, { duration: 120 }),
  }));

  return (
    <Animated.View
      style={[
        { position: "absolute", left: 0, right: 0, height: ROW, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 12, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, shadowColor: "#000", shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
        style,
      ]}
    >
      <ExerciseIcon name={row.name} primary={row.primary} secondary={row.secondary} size={40} />
      <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: c.text }} numberOfLines={1}>
        {row.name}
      </Text>
      {/* The handle */}
      <GestureDetector gesture={drag}>
        <View accessible accessibilityLabel={`Drag to move ${row.name}`} style={{ width: 56, height: ROW, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="reorder-three" size={26} color={c.muted} />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}
