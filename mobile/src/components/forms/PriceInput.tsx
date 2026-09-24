import { Text, TextInput, View } from "react-native";

interface PriceInputProps {
  value: string;
  onChangeText: (value: string) => void;
  disabled?: boolean;
  onFocus?: () => void;
  // A shorter, tighter rendering (40px vs. the default 56px) for cramped
  // layouts — e.g. alongside other compact fields in a tight row.
  compact?: boolean;
}

// What was paid for a pantry entry — optional, purely for future price
// tracking, so it stays out of the way of the required fields around it.
export function PriceInput({ value, onChangeText, disabled = false, onFocus, compact = false }: PriceInputProps) {
  return (
    <View
      style={{ height: compact ? 40 : 56 }}
      className={`flex-row items-center rounded-2xl border border-slate-200 bg-white ${
        compact ? "px-3" : "px-4"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <Text className={`mr-1 text-slate-400 ${compact ? "text-sm" : "text-base"}`}>$</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        editable={!disabled}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor="#94A3B8"
        className={`flex-1 text-slate-950 ${compact ? "text-sm" : "text-base"}`}
      />
    </View>
  );
}

export default PriceInput;
