import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { CreatableStringDropdown } from "./CreatableStringDropdown";

type QuantityMode = "servings" | "total";

interface QuantityServingInputProps {
  quantityAvailable: string;
  quantityUnit: string;
  onChangeQuantity: (value: string) => void;
  onChangeUnit: (value: string) => void;
  unitOptions: string[];
  onAddUnit?: (unit: string) => void;
  defaultPortionAmount?: number;
  defaultPortionUnit?: string;
  disabled?: boolean;
  // "total" is a better default when editing an entry that already has a
  // real total amount saved — "servings" (the default) suits a fresh add.
  initialMode?: QuantityMode;
}

// Lets the user record how much of an ingredient they have either as a
// container/serving count (e.g. "25 servings" of a 2ml serving -> 50ml) or
// as the total amount directly (e.g. typing "50ml"). Both modes write the
// same underlying quantityAvailable/quantityUnit pair.
export function QuantityServingInput({
  quantityAvailable,
  quantityUnit,
  onChangeQuantity,
  onChangeUnit,
  unitOptions,
  onAddUnit,
  defaultPortionAmount,
  defaultPortionUnit,
  disabled = false,
  initialMode,
}: QuantityServingInputProps) {
  const hasPortionInfo =
    defaultPortionAmount != null && defaultPortionAmount > 0 && !!defaultPortionUnit;

  const [mode, setMode] = useState<QuantityMode>(
    initialMode ?? (hasPortionInfo ? "servings" : "total"),
  );
  // Seed the servings field from an existing total, so editing a saved
  // entry doesn't show a blank "# of servings" for stock that's already there.
  const [servingsText, setServingsText] = useState(() => {
    if (!hasPortionInfo || quantityUnit !== defaultPortionUnit) return "";
    const existing = Number(quantityAvailable);
    if (!Number.isFinite(existing) || existing <= 0) return "";
    const servings = existing / (defaultPortionAmount as number);
    return String(Math.round(servings * 1000) / 1000);
  });

  useEffect(() => {
    if (!hasPortionInfo && mode === "servings") {
      setMode("total");
    }
  }, [hasPortionInfo, mode]);

  const parsedServings = Number(servingsText);
  const computedTotal =
    hasPortionInfo && Number.isFinite(parsedServings)
      ? Math.round(parsedServings * (defaultPortionAmount as number) * 1000) / 1000
      : null;

  function handleServingsChange(value: string) {
    setServingsText(value);
    const parsed = Number(value);
    if (value.trim() === "" || !Number.isFinite(parsed)) {
      onChangeQuantity("");
      return;
    }
    const total = Math.round(parsed * (defaultPortionAmount as number) * 1000) / 1000;
    onChangeQuantity(String(total));
    onChangeUnit(defaultPortionUnit as string);
  }

  return (
    <View>
      {hasPortionInfo && (
        <View className="mb-2 flex-row rounded-xl border border-slate-200 bg-white p-1">
          <Pressable
            disabled={disabled}
            onPress={() => setMode("servings")}
            className={`flex-1 items-center rounded-lg py-2 ${mode === "servings" ? "bg-blue-600" : ""}`}
          >
            <Text
              className={`text-xs font-semibold ${mode === "servings" ? "text-white" : "text-slate-600"}`}
            >
              # of servings
            </Text>
          </Pressable>
          <Pressable
            disabled={disabled}
            onPress={() => setMode("total")}
            className={`flex-1 items-center rounded-lg py-2 ${mode === "total" ? "bg-blue-600" : ""}`}
          >
            <Text
              className={`text-xs font-semibold ${mode === "total" ? "text-white" : "text-slate-600"}`}
            >
              Total amount
            </Text>
          </Pressable>
        </View>
      )}

      {mode === "servings" && hasPortionInfo ? (
        <View>
          <View className="flex-row items-center">
            <TextInput
              value={servingsText}
              onChangeText={handleServingsChange}
              editable={!disabled}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#94A3B8"
              className="h-14 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
            />
            <Text className="ml-3 text-sm text-slate-500">
              × {defaultPortionAmount} {defaultPortionUnit} / serving
            </Text>
          </View>
          <Text className="mt-1.5 text-xs text-slate-400">
            {computedTotal != null
              ? `= ${computedTotal} ${defaultPortionUnit} total`
              : `Enter a number of servings`}
          </Text>
        </View>
      ) : (
        <View className="flex-row">
          <TextInput
            value={quantityAvailable}
            onChangeText={onChangeQuantity}
            editable={!disabled}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#94A3B8"
            className="mr-3 h-14 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
          />
          <View className="flex-1">
            <CreatableStringDropdown
              options={unitOptions}
              selectedValue={quantityUnit}
              placeholder="Unit"
              disabled={disabled}
              onSelect={(unit) => {
                onChangeUnit(unit);
                onAddUnit?.(unit);
              }}
            />
          </View>
        </View>
      )}
    </View>
  );
}

export default QuantityServingInput;
