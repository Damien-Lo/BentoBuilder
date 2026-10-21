import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { RateSlider } from "@/src/components/planner/RateSlider";
import { useOrbitPage } from "@/src/theme/orbit";

interface RateRecipeModalProps {
  visible: boolean;
  saving?: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onSubmit: (value: number) => void;
}

// Same drag-slider widget used everywhere else a 1-10 rating is collected
// (RateAndConfirmModal in the planner) — kept in sync rather than each
// screen rolling its own input.
export function RateRecipeModal({
  visible,
  saving = false,
  title = "Rate this recipe",
  subtitle = "How was it, out of 10?",
  onClose,
  onSubmit,
}: RateRecipeModalProps) {
  // (On a page in Orbit's look, its colours, light or dark.)
  const o = useOrbitPage();
  const [value, setValue] = useState(5);

  useEffect(() => {
    if (visible) setValue(5);
  }, [visible]);

  function handleClose() {
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-6" style={o && { backgroundColor: o.scrim }}>
        <Pressable className="absolute inset-0" onPress={handleClose} />

        <View className="w-full rounded-3xl bg-white p-5" style={o && { backgroundColor: o.surface, borderRadius: 28, borderWidth: 1, borderColor: o.border }}>
          <Text className="text-lg font-bold text-slate-950" style={o && { color: o.text, fontWeight: "800" }}>{title}</Text>
          <Text className="mt-0.5 mb-6 text-sm text-slate-400" style={o && { color: o.muted }}>{subtitle}</Text>

          <Text className="mb-3 text-center text-3xl font-bold text-blue-600" style={o && { color: o.ink, fontWeight: "800" }}>{value}</Text>
          <RateSlider value={value} onChange={setValue} disabled={saving} />

          <View className="mt-6 flex-row gap-3">
            <Pressable
              disabled={saving}
              onPress={handleClose}
              className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200"
              style={o && { backgroundColor: o.pill, height: 52, justifyContent: "center", paddingVertical: 0, borderRadius: 16 }}
            >
              <Text className="text-sm font-semibold text-slate-600" style={o && { color: o.onPill, fontSize: 15 }}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={saving}
              onPress={() => onSubmit(value)}
              className={`flex-1 items-center rounded-2xl py-3.5 ${
                saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
              }`}
              style={o && { backgroundColor: o.ink, opacity: saving ? 0.5 : 1, height: 52, justifyContent: "center", paddingVertical: 0, borderRadius: 16 }}
            >
              <Text className="text-sm font-semibold text-white" style={o && { color: o.onInk, fontSize: 15 }}>
                {saving ? "Saving..." : "Save rating"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default RateRecipeModal;
