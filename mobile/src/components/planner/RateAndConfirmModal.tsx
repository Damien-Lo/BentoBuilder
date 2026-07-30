import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { RateSlider } from "./RateSlider";

interface RateAndConfirmModalProps {
  visible: boolean;
  recipeName: string;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (value: number) => void;
}

// Swiping to confirm a planned recipe entry offers this as an alternative to
// a bare confirm — rate it 1-10, then confirm; the rating is saved and the
// entry flips to confirmed in one step.
export function RateAndConfirmModal({
  visible,
  recipeName,
  saving = false,
  onCancel,
  onConfirm,
}: RateAndConfirmModalProps) {
  const [value, setValue] = useState(5);

  useEffect(() => {
    if (visible) setValue(5);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        <Pressable className="absolute inset-0" onPress={onCancel} />

        <View className="w-full rounded-3xl bg-white p-5">
          <Text className="text-lg font-bold text-slate-950" numberOfLines={1}>
            Rate {recipeName}
          </Text>
          <Text className="mt-0.5 mb-6 text-sm text-slate-400">How was it, out of 10?</Text>

          <Text className="mb-3 text-center text-3xl font-bold text-blue-600">{value}</Text>
          <RateSlider value={value} onChange={setValue} disabled={saving} />

          <View className="mt-6 flex-row gap-3">
            <Pressable
              disabled={saving}
              onPress={onCancel}
              className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200"
            >
              <Text className="text-sm font-semibold text-slate-600">Cancel</Text>
            </Pressable>
            <Pressable
              disabled={saving}
              onPress={() => onConfirm(value)}
              className={`flex-1 items-center rounded-2xl py-3.5 ${
                saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
              }`}
            >
              <Text className="text-sm font-semibold text-white">
                {saving ? "Saving..." : "Confirm"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default RateAndConfirmModal;
