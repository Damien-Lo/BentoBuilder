import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { RateSlider } from "@/src/components/planner/RateSlider";

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
  const [value, setValue] = useState(5);

  useEffect(() => {
    if (visible) setValue(5);
  }, [visible]);

  function handleClose() {
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        <Pressable className="absolute inset-0" onPress={handleClose} />

        <View className="w-full rounded-3xl bg-white p-5">
          <Text className="text-lg font-bold text-slate-950">{title}</Text>
          <Text className="mt-0.5 mb-6 text-sm text-slate-400">{subtitle}</Text>

          <Text className="mb-3 text-center text-3xl font-bold text-blue-600">{value}</Text>
          <RateSlider value={value} onChange={setValue} disabled={saving} />

          <View className="mt-6 flex-row gap-3">
            <Pressable
              disabled={saving}
              onPress={handleClose}
              className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200"
            >
              <Text className="text-sm font-semibold text-slate-600">Cancel</Text>
            </Pressable>
            <Pressable
              disabled={saving}
              onPress={() => onSubmit(value)}
              className={`flex-1 items-center rounded-2xl py-3.5 ${
                saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
              }`}
            >
              <Text className="text-sm font-semibold text-white">
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
