import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { CreatableStringDropdown } from "./CreatableStringDropdown";
import { UnitFamilyDropdown } from "./UnitFamilyDropdown";
import {
  convertAmountForUnitChange,
  getRelatedUnits,
  type CustomUnitConversion,
} from "@/src/utils/unitConversion";

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
  // When both are provided, shows a "× N entries" stepper below the amount
  // — e.g. "2 × 100 g" creates 2 separate pantry entries of 100g each
  // rather than one 200g entry. The caller owns the looping at submit time;
  // this component only collects the count.
  entryCount?: string;
  onChangeEntryCount?: (value: string) => void;
  // When provided alongside entryCount (> 1), also offers "different weight
  // per piece" — for irregularly-sized items bought together (a few fish
  // fillets, a couple of steaks) where reusing one shared amount for every
  // entry would be wrong. A non-empty array signals that mode is active;
  // the caller owns looping over it at submit time (one pantry entry per
  // element, each its own quantityAvailable) instead of the shared amount.
  perEntryAmounts?: string[];
  onChangePerEntryAmounts?: (amounts: string[]) => void;
  // Lets switching the unit within a convertible family (e.g. g -> kg)
  // rescale the entered amount to the equivalent value, instead of leaving
  // the number as-is under a now-mismatched unit.
  customUnitConversions?: CustomUnitConversion[];
  // Fires when any of this widget's own text fields gains focus — same
  // purpose as a plain TextInput's onFocus, just applied to whichever one of
  // the several fields here (servings, total, entry count, per-piece) the
  // user actually taps into.
  onFocus?: () => void;
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
  entryCount,
  onChangeEntryCount,
  perEntryAmounts,
  onChangePerEntryAmounts,
  customUnitConversions = [],
  onFocus,
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

  const parsedEntryCount = Math.max(1, Math.round(Number(entryCount)) || 1);
  const effectiveUnit = quantityUnit || defaultPortionUnit || "";

  // Once the ingredient's own unit is known, the pantry quantity's unit is
  // restricted to its family (same convertible-family rule already applied
  // to recipe ingredient rows) — free-typing a brand-new unrelated unit is
  // no longer allowed here, since that unit would never participate in
  // stock/availability math. Falls back to free text only when the caller
  // has no defaultPortionUnit to anchor a family to.
  const familyUnits = defaultPortionUnit
    ? getRelatedUnits(defaultPortionUnit, customUnitConversions)
    : [];

  // A non-empty perEntryAmounts signals "different weight per piece" mode
  // is active - resized here (padding new slots with the shared amount as
  // a starting point, trimming extras) any time the entry count itself
  // changes, so the parent's committed array is always the right length
  // at submit time even if the user never touches an individual field.
  const isPerEntryMode = (perEntryAmounts?.length ?? 0) > 0;

  function resizePerEntryAmounts(newCount: number) {
    if (!isPerEntryMode || !onChangePerEntryAmounts) return;
    onChangePerEntryAmounts(
      Array.from({ length: newCount }, (_, i) => perEntryAmounts?.[i] ?? quantityAvailable),
    );
  }

  function adjustEntryCount(delta: number) {
    const next = Math.max(1, parsedEntryCount + delta);
    onChangeEntryCount?.(String(next));
    resizePerEntryAmounts(next);
  }

  function handleEntryCountTextChange(value: string) {
    onChangeEntryCount?.(value);
    const parsed = Math.max(1, Math.round(Number(value)) || 1);
    resizePerEntryAmounts(parsed);
  }

  function toggleDifferentWeights() {
    if (isPerEntryMode) {
      onChangePerEntryAmounts?.([]);
    } else {
      onChangePerEntryAmounts?.(Array.from({ length: parsedEntryCount }, () => quantityAvailable));
    }
  }

  function updatePerEntryAmount(index: number, value: string) {
    const next = [...(perEntryAmounts ?? [])];
    next[index] = value;
    onChangePerEntryAmounts?.(next);
  }

  function handleUnitSelect(unit: string) {
    const converted = convertAmountForUnitChange(
      Number(quantityAvailable),
      quantityUnit,
      unit,
      customUnitConversions,
    );
    if (converted != null) onChangeQuantity(String(converted));
    onChangeUnit(unit);
    onAddUnit?.(unit);
  }

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
              onFocus={onFocus}
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
            onFocus={onFocus}
            editable={!disabled}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#94A3B8"
            className="mr-3 h-14 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
          />
          <View className="flex-1">
            {defaultPortionUnit ? (
              <UnitFamilyDropdown
                unit={quantityUnit || defaultPortionUnit}
                options={familyUnits}
                disabled={disabled}
                onSelect={handleUnitSelect}
              />
            ) : (
              <CreatableStringDropdown
                options={unitOptions}
                selectedValue={quantityUnit}
                placeholder="Unit"
                disabled={disabled}
                onSelect={handleUnitSelect}
              />
            )}
          </View>
        </View>
      )}

      {onChangeEntryCount && (
        <View className="mt-3">
          <Text className="mb-1.5 text-xs font-semibold text-slate-500">Number of entries</Text>
          <View className="flex-row items-center">
            <Pressable
              disabled={disabled}
              onPress={() => adjustEntryCount(-1)}
              className="h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white active:bg-slate-50"
            >
              <Ionicons name="remove" size={18} color="#475569" />
            </Pressable>
            <TextInput
              value={entryCount}
              onChangeText={handleEntryCountTextChange}
              onFocus={onFocus}
              editable={!disabled}
              keyboardType="number-pad"
              className="mx-2 h-11 w-16 rounded-2xl border border-slate-200 bg-white text-center text-base text-slate-950"
            />
            <Pressable
              disabled={disabled}
              onPress={() => adjustEntryCount(1)}
              className="h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white active:bg-slate-50"
            >
              <Ionicons name="add" size={18} color="#475569" />
            </Pressable>
          </View>

          {parsedEntryCount > 1 && !isPerEntryMode && (
            <Text className="mt-1.5 text-xs text-slate-400">
              Creates {parsedEntryCount} separate pantry entries of{" "}
              {mode === "servings" && computedTotal != null
                ? `${computedTotal} ${defaultPortionUnit}`
                : `${quantityAvailable || "0"} ${effectiveUnit}`}{" "}
              each.
            </Text>
          )}

          {parsedEntryCount > 1 && onChangePerEntryAmounts && (
            <Pressable
              disabled={disabled}
              className="mt-2 self-start"
              onPress={toggleDifferentWeights}
            >
              <Text className="text-xs font-semibold text-blue-600">
                {isPerEntryMode
                  ? "Same weight for all — tap to switch back"
                  : "Different weight per piece? (e.g. a few fillets of different sizes)"}
              </Text>
            </Pressable>
          )}

          {isPerEntryMode && (
            <View className="mt-2">
              {Array.from({ length: parsedEntryCount }, (_, index) => (
                <View key={index} className="mt-1.5 flex-row items-center">
                  <Text className="w-16 text-xs text-slate-500">Piece {index + 1}</Text>
                  <TextInput
                    value={perEntryAmounts?.[index] ?? ""}
                    onChangeText={(value) => updatePerEntryAmount(index, value)}
                    onFocus={onFocus}
                    editable={!disabled}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#94A3B8"
                    className="ml-2 h-11 flex-1 rounded-2xl border border-slate-200 bg-white px-3 text-base text-slate-950"
                  />
                  <Text className="ml-2 text-sm text-slate-500">{effectiveUnit}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default QuantityServingInput;
