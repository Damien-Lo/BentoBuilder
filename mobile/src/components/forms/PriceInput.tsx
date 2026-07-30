import { Text, TextInput, View } from "react-native";

interface PriceInputProps {
  value: string;
  onChangeText: (value: string) => void;
  disabled?: boolean;
}

// What was paid for a pantry entry — optional, purely for future price
// tracking, so it stays out of the way of the required fields around it.
export function PriceInput({ value, onChangeText, disabled = false }: PriceInputProps) {
  return (
    <View
      style={{ height: 56 }}
      className={`flex-row items-center rounded-2xl border border-slate-200 bg-white px-4 ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <Text className="mr-1 text-base text-slate-400">$</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor="#94A3B8"
        className="flex-1 text-base text-slate-950"
      />
    </View>
  );
}

export default PriceInput;
