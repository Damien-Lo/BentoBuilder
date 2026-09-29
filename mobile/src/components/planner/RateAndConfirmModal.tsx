import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { RateSlider } from "./RateSlider";

interface RateAndConfirmModalProps {
  visible: boolean;
  // A recipe's name, or a directly-logged ingredient's (e.g. "Protein
  // Shake") — whichever the entry being rated actually is.
  itemName: string;
  saving?: boolean;
  // False when this rating prompt is an unavoidable step on top of an
  // already-decided confirm (e.g. right after adding something directly as
  // confirmed) rather than an opt-in swipe action — there's nothing left to
  // "back out" to in that case, so no Cancel button is shown, and dismissing
  // any other way (backdrop tap, hardware back button) falls through to
  // onSkip instead of onCancel, same as tapping "Skip rating" explicitly.
  // Defaults to true (the pre-existing swipe-to-rate-and-confirm behavior,
  // where nothing's been decided yet and backing out is a real option).
  allowCancel?: boolean;
  onCancel: () => void;
  // Confirms without saving a rating — distinct from onCancel, which backs
  // out of confirming entirely. Useful whenever this modal is shown as an
  // unavoidable step (e.g. right after adding something already-confirmed)
  // rather than an opt-in swipe action, so rating never blocks confirming.
  onSkip: () => void;
  onConfirm: (value: number) => void;
  // Shown only for the automatic prompt: stop auto-asking about this item
  // (then confirms, like skipping).
  onNeverAsk?: () => void;
}

// Swiping to confirm a planned recipe entry offers this as an alternative to
// a bare confirm — rate it 1-10, then confirm; the rating is saved and the
// entry flips to confirmed in one step. Also shown automatically (with the
// piece-size resolution, if any, already done) right after adding an entry
// directly as confirmed — skippable there via onSkip (and allowCancel:
// false), since that path has no separate opt-in gesture the way the swipe
// action does, and nothing to "cancel" back to.
export function RateAndConfirmModal({
  visible,
  itemName,
  saving = false,
  allowCancel = true,
  onCancel,
  onSkip,
  onConfirm,
  onNeverAsk,
}: RateAndConfirmModalProps) {
  const [value, setValue] = useState(5);

  useEffect(() => {
    if (visible) setValue(5);
  }, [visible]);

  const dismiss = allowCancel ? onCancel : onSkip;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        <Pressable className="absolute inset-0" onPress={dismiss} />

        <View className="w-full rounded-3xl bg-white p-5">
          <Text className="text-lg font-bold text-slate-950" numberOfLines={1}>
            Rate {itemName}
          </Text>
          <Text className="mt-0.5 mb-6 text-sm text-slate-400">How was it, out of 10?</Text>

          <Text className="mb-3 text-center text-3xl font-bold text-blue-600">{value}</Text>
          <RateSlider value={value} onChange={setValue} disabled={saving} />

          <View className="mt-6 flex-row gap-3">
            {allowCancel && (
              <Pressable
                disabled={saving}
                onPress={onCancel}
                className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200"
              >
                <Text className="text-sm font-semibold text-slate-600">Cancel</Text>
              </Pressable>
            )}
            <Pressable
              disabled={saving}
              onPress={() => onConfirm(value)}
              className={`flex-1 items-center rounded-2xl py-3.5 ${
                saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
              }`}
            >
              <Text className="text-sm font-semibold text-white">
                {saving ? "Saving..." : "Rate & Confirm"}
              </Text>
            </Pressable>
          </View>

          <Pressable disabled={saving} onPress={onSkip} className="mt-3 items-center py-1 active:opacity-60">
            <Text className="text-sm font-semibold text-blue-600">Skip rating, just confirm</Text>
          </Pressable>
          {onNeverAsk && (
            <Pressable disabled={saving} onPress={onNeverAsk} className="mt-1 items-center py-1 active:opacity-60">
              <Text className="text-xs text-slate-400">Don&apos;t ask about this again</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default RateAndConfirmModal;
