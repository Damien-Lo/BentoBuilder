import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import type { CustomUnitConversion } from "@/src/utils/unitConversion";
import { CreatableStringDropdown } from "./CreatableStringDropdown";

interface UnitConversionsEditorProps {
  conversions: CustomUnitConversion[];
  onChange: (conversions: CustomUnitConversion[]) => void;
  unitOptions?: string[];
  disabled?: boolean;
}

// Same add/remove list UI as Settings' app-wide "Unit Conversions" section,
// scoped here to one ingredient — e.g. "10 g = 1 tbsp" for ginger
// specifically, since mass<->volume factors are density-dependent and
// don't hold across unrelated ingredients.
export function UnitConversionsEditor({
  conversions,
  onChange,
  unitOptions = [],
  disabled = false,
}: UnitConversionsEditorProps) {
  const [unitAmount, setUnitAmount] = useState("1");
  const [unit, setUnit] = useState("");
  const [baseAmount, setBaseAmount] = useState("");
  const [baseUnit, setBaseUnit] = useState("");

  function add() {
    const trimmedUnit = unit.trim();
    const trimmedBaseUnit = baseUnit.trim();
    const parsedUnitAmount = Number(unitAmount);
    const parsedBaseAmount = Number(baseAmount);

    if (
      !trimmedUnit ||
      !trimmedBaseUnit ||
      !Number.isFinite(parsedUnitAmount) ||
      parsedUnitAmount <= 0 ||
      !Number.isFinite(parsedBaseAmount) ||
      parsedBaseAmount <= 0
    ) {
      Alert.alert(
        "Incomplete conversion",
        "Enter a positive amount and unit on both sides, e.g. 10 g = 1 tbsp.",
      );
      return;
    }

    onChange([
      ...conversions,
      {
        unit: trimmedUnit,
        baseUnit: trimmedBaseUnit,
        factor: parsedBaseAmount / parsedUnitAmount,
      },
    ]);
    setUnitAmount("1");
    setUnit("");
    setBaseAmount("");
    setBaseUnit("");
  }

  function remove(index: number) {
    onChange(conversions.filter((_, i) => i !== index));
  }

  return (
    <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {conversions.length === 0 ? (
        <View className="px-4 py-4">
          <Text className="text-sm text-slate-400">No conversions yet.</Text>
        </View>
      ) : (
        conversions.map((conversion, index) => (
          <View
            key={`${conversion.unit}-${conversion.baseUnit}-${index}`}
            className="flex-row items-center justify-between border-b border-slate-100 px-4 py-3.5 last:border-b-0"
          >
            <Text className="flex-1 text-base text-slate-700">
              1 {conversion.unit} = {conversion.factor} {conversion.baseUnit}
            </Text>
            <Pressable disabled={disabled} onPress={() => remove(index)} hitSlop={10}>
              <Ionicons name="close-circle" size={20} color="#94A3B8" />
            </Pressable>
          </View>
        ))
      )}

      <View className="gap-2 border-t border-slate-100 px-4 py-3.5">
        <View className="flex-row items-center gap-2">
          <TextInput
            value={unitAmount}
            onChangeText={setUnitAmount}
            placeholder="10"
            placeholderTextColor="#94A3B8"
            keyboardType="decimal-pad"
            editable={!disabled}
            className="w-16 rounded-xl bg-slate-100 px-3 py-2 text-base text-slate-900"
          />
          <View className="flex-1">
            <CreatableStringDropdown
              options={unitOptions}
              selectedValue={unit}
              placeholder="unit"
              disabled={disabled}
              onSelect={setUnit}
            />
          </View>
        </View>

        <Text className="text-center text-slate-400">=</Text>

        <View className="flex-row items-center gap-2">
          <TextInput
            value={baseAmount}
            onChangeText={setBaseAmount}
            placeholder="1"
            placeholderTextColor="#94A3B8"
            keyboardType="decimal-pad"
            editable={!disabled}
            className="w-16 rounded-xl bg-slate-100 px-3 py-2 text-base text-slate-900"
          />
          <View className="flex-1">
            <CreatableStringDropdown
              options={unitOptions}
              selectedValue={baseUnit}
              placeholder="unit"
              disabled={disabled}
              onSelect={setBaseUnit}
            />
          </View>
        </View>

        <Pressable
          disabled={disabled}
          onPress={add}
          className="mt-1 h-10 items-center justify-center rounded-xl bg-blue-600 active:bg-blue-700"
        >
          <Ionicons name="add" size={22} color="white" />
        </Pressable>
      </View>
    </View>
  );
}

export default UnitConversionsEditor;
