import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

// Two decimals is plenty for a portion ("0.5", "1.25") and keeps float
// noise from +/- steps (0.1 + 1 + 1 ...) out of what gets saved.
function roundQty(n: number): number {
  return Math.round(n * 100) / 100;
}

// Positive number, or undefined when the text isn't one (blank, "0", "abc").
function parseQty(raw: string): number | undefined {
  const n = Number(raw.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? roundQty(n) : undefined;
}

// Quantity control for a restaurant dish: -/+ step by whole units, and the
// number itself is typeable (decimal pad) for fractional portions like half
// a sandwich.
//
// `onRemove` — called when "-" is pressed at 1 or below; omit it to clamp
// at 1 instead (e.g. a staged new dish, which is removed with its own X).
export function DishQuantityStepper({
  value,
  onChange,
  onRemove,
}: {
  value: number;
  onChange: (qty: number) => void;
  onRemove?: () => void;
}) {
  const [text, setText] = useState(String(value));

  // Only resync when the value actually differs from what's typed, so
  // reporting "1." as 1 mid-typing doesn't snap the field back to "1".
  useEffect(() => {
    setText(prev => (parseQty(prev) === value ? prev : String(value)));
  }, [value]);

  // Valid values are reported as they're typed — a Save/Add button tapped
  // while the field still has focus wouldn't blur it first.
  function handleChangeText(raw: string) {
    setText(raw);
    const n = parseQty(raw);
    if (n !== undefined) onChange(n);
  }

  function decrement() {
    if (value <= 1) {
      if (onRemove) onRemove();
      else onChange(1);
      return;
    }
    onChange(roundQty(value - 1));
  }

  return (
    <View className="flex-row items-center">
      <Pressable
        hitSlop={8}
        onPress={decrement}
        className="h-7 w-7 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200"
      >
        <Ionicons name="remove" size={14} color="#475569" />
      </Pressable>
      <TextInput
        value={text}
        onChangeText={handleChangeText}
        onBlur={() => setText(String(value))}
        keyboardType="decimal-pad"
        selectTextOnFocus
        className="mx-2 min-w-[44px] rounded-lg bg-slate-100 px-2 py-1 text-center text-sm font-semibold text-slate-700"
      />
      <Pressable
        hitSlop={8}
        onPress={() => onChange(roundQty(value + 1))}
        className="h-7 w-7 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200"
      >
        <Ionicons name="add" size={14} color="#475569" />
      </Pressable>
    </View>
  );
}

export default DishQuantityStepper;
