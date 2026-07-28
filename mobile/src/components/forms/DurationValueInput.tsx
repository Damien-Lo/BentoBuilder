import { Pressable, Text, TextInput, View } from "react-native";

import type { DurationUnit } from "@/src/utils/date";

const UNIT_OPTIONS: { value: DurationUnit; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

interface DurationValueInputProps {
  amount: string;
  unit: DurationUnit;
  onChangeAmount: (value: string) => void;
  onChangeUnit: (unit: DurationUnit) => void;
  disabled?: boolean;
}

// A plain "N days/weeks/months/years" value — unlike DurationExpiryInput,
// this doesn't compute a target date from a purchase date; it just captures
// the amount + unit as-is (e.g. an ingredient's own default shelf life).
export function DurationValueInput({
  amount,
  unit,
  onChangeAmount,
  onChangeUnit,
  disabled = false,
}: DurationValueInputProps) {
  const parsedAmount = Number(amount);

  return (
    <View className="flex-row items-center">
      <TextInput
        value={amount}
        onChangeText={onChangeAmount}
        editable={!disabled}
        keyboardType="number-pad"
        placeholder="e.g. 2"
        placeholderTextColor="#94A3B8"
        className="mr-2 h-12 w-16 rounded-2xl border border-slate-200 bg-white px-3 text-base text-slate-950"
      />

      <View className="flex-1 flex-row rounded-2xl border border-slate-200 bg-white p-1">
        {UNIT_OPTIONS.map((option) => {
          const isActive = option.value === unit;
          return (
            <Pressable
              key={option.value}
              disabled={disabled}
              onPress={() => onChangeUnit(option.value)}
              className={`flex-1 items-center rounded-xl py-2.5 ${isActive ? "bg-blue-600" : ""}`}
            >
              <Text
                className={`text-xs font-semibold ${isActive ? "text-white" : "text-slate-600"}`}
              >
                {option.label}
                {parsedAmount > 1 ? "s" : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default DurationValueInput;
