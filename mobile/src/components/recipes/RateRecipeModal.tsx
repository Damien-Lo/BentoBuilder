import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

interface RateRecipeModalProps {
  visible: boolean;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (value: number) => void;
}

const VALUES = Array.from({ length: 10 }, (_, i) => i + 1);

// A simple 1-10 tap-to-pick rating — discrete values don't benefit from a
// drag slider's precision, so a grid of chips (matching the app's existing
// pill-toggle style) is the clearest input.
export function RateRecipeModal({ visible, saving = false, onClose, onSubmit }: RateRecipeModalProps) {
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (visible) setSelected(null);
  }, [visible]);

  function handleClose() {
    setSelected(null);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        <Pressable className="absolute inset-0" onPress={handleClose} />

        <View className="w-full rounded-3xl bg-white p-5">
          <Text className="text-lg font-bold text-slate-950">Rate this recipe</Text>
          <Text className="mt-0.5 mb-5 text-sm text-slate-400">How was it, out of 10?</Text>

          <View className="flex-row flex-wrap gap-2">
            {VALUES.map((value) => {
              const isSelected = selected === value;
              return (
                <Pressable
                  key={value}
                  disabled={saving}
                  onPress={() => setSelected(value)}
                  className={`h-12 w-12 items-center justify-center rounded-2xl border ${
                    isSelected ? "border-blue-600 bg-blue-600" : "border-slate-200 bg-white"
                  }`}
                >
                  <Text className={`text-base font-semibold ${isSelected ? "text-white" : "text-slate-700"}`}>
                    {value}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-5 flex-row gap-3">
            <Pressable
              disabled={saving}
              onPress={handleClose}
              className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200"
            >
              <Text className="text-sm font-semibold text-slate-600">Cancel</Text>
            </Pressable>
            <Pressable
              disabled={saving || selected == null}
              onPress={() => {
                if (selected != null) onSubmit(selected);
              }}
              className={`flex-1 items-center rounded-2xl py-3.5 ${
                saving || selected == null ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
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
