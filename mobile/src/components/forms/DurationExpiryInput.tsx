import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { addDurationToDate, type DurationUnit } from "@/src/utils/date";

const UNIT_OPTIONS: { value: DurationUnit; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

interface DurationExpiryInputProps {
  purchaseDate: string;
  onApply: (expiryDate: string) => void;
  disabled?: boolean;
}

// Lets the user say "expires 3 weeks after purchase" instead of typing a
// calendar date directly. Applying computes purchaseDate + duration and
// hands the result back — it doesn't touch the expiry field on its own.
export function DurationExpiryInput({
  purchaseDate,
  onApply,
  disabled = false,
}: DurationExpiryInputProps) {
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<DurationUnit>("week");

  const parsedAmount = Number(amount);
  const canApply =
    !disabled && amount.trim() !== "" && Number.isFinite(parsedAmount) && parsedAmount > 0;

  function handleApply() {
    if (!canApply) return;
    onApply(addDurationToDate(purchaseDate, parsedAmount, unit));
  }

  return (
    <View>
      <View className="flex-row items-center">
        <TextInput
          value={amount}
          onChangeText={setAmount}
          editable={!disabled}
          keyboardType="number-pad"
          placeholder="e.g. 2"
          placeholderTextColor="#94A3B8"
          className="mr-2 h-11 w-16 rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-950"
        />

        <View className="mr-2 flex-1 flex-row rounded-xl border border-slate-200 bg-white p-1">
          {UNIT_OPTIONS.map((option) => {
            const isActive = option.value === unit;
            return (
              <Pressable
                key={option.value}
                disabled={disabled}
                onPress={() => setUnit(option.value)}
                className={`flex-1 items-center rounded-lg py-2 ${isActive ? "bg-blue-600" : ""}`}
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

        <Pressable
          disabled={!canApply}
          onPress={handleApply}
          className={`h-11 w-11 items-center justify-center rounded-xl ${
            canApply ? "bg-blue-600 active:bg-blue-700" : "bg-slate-200"
          }`}
        >
          <Ionicons name="checkmark" size={20} color={canApply ? "white" : "#94A3B8"} />
        </Pressable>
      </View>

      <Text className="mt-1.5 text-xs text-slate-400">
        Sets the expiry date to this long after the purchase date.
      </Text>
    </View>
  );
}

export default DurationExpiryInput;
