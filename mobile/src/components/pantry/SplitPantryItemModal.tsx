import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { DateTextInput, SearchableObjectDropdown } from "@/src/components/forms";
import { SplitSlider } from "./SplitSlider";
import type { SelectOption } from "@/src/services/optionsApi";
import { addIngredientToPantry, updatePantryItem } from "@/src/services/pantryApi";
import type { PantryItem } from "@/src/types/pantry";
import { referenceId, referenceName } from "@/src/utils/pantryDefaults";

interface SplitPantryItemModalProps {
  visible: boolean;
  item: PantryItem | null;
  ingredientName: string;
  storageLocations: SelectOption[];
  onClose: () => void;
  // newEntry is null when one side was left at zero — the whole item just
  // moved to the other side's location/expiry, nothing new was created.
  onSplit: (updatedOriginal: PantryItem, newEntry: PantryItem | null) => void;
}

function roundQty(value: number): number {
  return Math.round(value * 100) / 100;
}

// Splitting a 100g entry into 2 locations means: shrink the original entry
// down to one side's amount (and move it, if the location changed), and
// create a brand-new entry for the other side — same ingredient and
// purchase date, but amount, location, and expiry can all differ per side
// (e.g. defrosting fish: half stays in the freezer, half moves to the
// fridge with a much closer expiry date).
export function SplitPantryItemModal({
  visible,
  item,
  ingredientName,
  storageLocations,
  onClose,
  onSplit,
}: SplitPantryItemModalProps) {
  const total = item?.quantityAvailable ?? 0;

  const [ratio, setRatio] = useState(0.5);
  const [leftText, setLeftText] = useState("");
  const [rightText, setRightText] = useState("");
  const [leftLocationId, setLeftLocationId] = useState("");
  const [leftLocationName, setLeftLocationName] = useState("");
  const [leftLocationDraft, setLeftLocationDraft] = useState("");
  const [rightLocationId, setRightLocationId] = useState("");
  const [rightLocationName, setRightLocationName] = useState("");
  const [rightLocationDraft, setRightLocationDraft] = useState("");
  const [leftExpiryDate, setLeftExpiryDate] = useState("");
  const [rightExpiryDate, setRightExpiryDate] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset to a fresh 50/50 split, both sides starting at the entry's
  // current location and expiry date, every time a new entry is opened for
  // splitting.
  useEffect(() => {
    if (!item) return;

    const half = roundQty(item.quantityAvailable / 2);
    setRatio(0.5);
    setLeftText(String(half));
    setRightText(String(roundQty(item.quantityAvailable - half)));

    const locId = referenceId(item.storageLocation);
    const locName =
      referenceName(item.storageLocation) ||
      storageLocations.find((location) => location._id === locId)?.name ||
      "";

    setLeftLocationId(locId);
    setLeftLocationName(locName);
    setLeftLocationDraft(locName);
    setRightLocationId(locId);
    setRightLocationName(locName);
    setRightLocationDraft(locName);

    const expiry = item.expiryDate ? item.expiryDate.slice(0, 10) : "";
    setLeftExpiryDate(expiry);
    setRightExpiryDate(expiry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?._id]);

  function applyRatio(newRatio: number) {
    const clamped = Math.min(Math.max(newRatio, 0), 1);
    const left = roundQty(clamped * total);
    setRatio(clamped);
    setLeftText(String(left));
    setRightText(String(roundQty(total - left)));
  }

  function applyLeftText(text: string) {
    setLeftText(text);
    const left = Number(text);
    if (!Number.isFinite(left) || total <= 0) return;
    const clampedLeft = Math.min(Math.max(left, 0), total);
    setRightText(String(roundQty(total - clampedLeft)));
    setRatio(clampedLeft / total);
  }

  function applyRightText(text: string) {
    setRightText(text);
    const right = Number(text);
    if (!Number.isFinite(right) || total <= 0) return;
    const clampedRight = Math.min(Math.max(right, 0), total);
    const left = total - clampedRight;
    setLeftText(String(roundQty(left)));
    setRatio(left / total);
  }

  async function handleConfirm() {
    if (!item) return;

    const left = Number(leftText);
    const right = Number(rightText);

    if (!Number.isFinite(left) || !Number.isFinite(right) || left < 0 || right < 0) {
      Alert.alert("Invalid split", "Enter valid amounts for both sides.");
      return;
    }

    if (roundQty(left + right) !== roundQty(total)) {
      Alert.alert(
        "Invalid split",
        `Both sides must add up to ${total} ${item.quantityUnit}.`,
      );
      return;
    }

    if (left === 0 && right === 0) {
      Alert.alert("Invalid split", "Enter an amount for at least one side.");
      return;
    }

    // A side left at zero means everything moves to the other side's
    // location/expiry instead — no new entry, just update the original in
    // place, same as moving the whole thing.
    const usesLeftSide = left > 0;
    const usesRightSide = right > 0;

    if (usesLeftSide && !leftLocationId && !leftLocationDraft.trim()) {
      Alert.alert("Storage location required", "Choose a location for the left side.");
      return;
    }
    if (usesRightSide && !rightLocationId && !rightLocationDraft.trim()) {
      Alert.alert("Storage location required", "Choose a location for the right side.");
      return;
    }

    const ingredientId = referenceId(item.ingredient);
    if (!ingredientId) return;

    try {
      setSaving(true);

      const leftLocation = usesLeftSide
        ? (storageLocations.find((location) => location._id === leftLocationId) ??
          storageLocations.find(
            (location) => location.name.trim().toLowerCase() === leftLocationDraft.trim().toLowerCase(),
          ))
        : undefined;
      const rightLocation = usesRightSide
        ? (storageLocations.find((location) => location._id === rightLocationId) ??
          storageLocations.find(
            (location) => location.name.trim().toLowerCase() === rightLocationDraft.trim().toLowerCase(),
          ))
        : undefined;

      if (usesLeftSide && !leftLocation) {
        throw new Error("Choose an existing storage location for the left side.");
      }
      if (usesRightSide && !rightLocation) {
        throw new Error("Choose an existing storage location for the right side.");
      }

      if (!usesRightSide) {
        // Right side is zero — the whole entry just moves to the left
        // side's location/expiry.
        const updatedOriginal = await updatePantryItem(item._id, {
          quantityAvailable: left,
          storageLocation: leftLocation!._id,
          expiryDate: leftExpiryDate || null,
        });
        onSplit(updatedOriginal, null);
        onClose();
        return;
      }

      if (!usesLeftSide) {
        // Left side is zero — the whole entry moves to the right side's
        // location/expiry instead.
        const updatedOriginal = await updatePantryItem(item._id, {
          quantityAvailable: right,
          storageLocation: rightLocation!._id,
          expiryDate: rightExpiryDate || null,
        });
        onSplit(updatedOriginal, null);
        onClose();
        return;
      }

      const updatedOriginal = await updatePantryItem(item._id, {
        quantityAvailable: left,
        storageLocation: leftLocation!._id,
        expiryDate: leftExpiryDate || null,
      });

      const newEntry = await addIngredientToPantry({
        ingredient: ingredientId,
        storageLocation: rightLocation!._id,
        quantityAvailable: right,
        quantityUnit: item.quantityUnit,
        purchaseDate: item.purchaseDate || undefined,
        expiryDate: rightExpiryDate || undefined,
        lowStockThreshold: item.lowStockThreshold,
      });

      onSplit(updatedOriginal, newEntry);
      onClose();
    } catch (err) {
      Alert.alert(
        "Could not split",
        err instanceof Error ? err.message : "Failed to split the pantry entry.",
      );
    } finally {
      setSaving(false);
    }
  }

  const isMoveOnly = Number(leftText) === 0 || Number(rightText) === 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <Pressable className="absolute inset-0" onPress={onClose} />

          <View className="max-h-[85%] w-full rounded-3xl bg-white">
            <ScrollView
              contentContainerStyle={{ padding: 20 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text className="text-lg font-bold text-slate-950">Split entry</Text>
              <Text className="mt-0.5 mb-5 text-sm text-slate-400">
                {ingredientName} — {total} {item?.quantityUnit}
              </Text>

              <SplitSlider ratio={ratio} onChange={applyRatio} disabled={saving} />

              <View className="mt-4 flex-row items-center gap-3">
                <View className="flex-1">
                  <Text className="mb-1.5 text-xs font-semibold text-slate-500">Left</Text>
                  <View className="flex-row items-center rounded-2xl border border-slate-200 bg-white px-3">
                    <TextInput
                      value={leftText}
                      onChangeText={applyLeftText}
                      editable={!saving}
                      keyboardType="decimal-pad"
                      className="h-12 flex-1 text-base text-slate-950"
                    />
                    <Text className="text-sm text-slate-400">{item?.quantityUnit}</Text>
                  </View>
                </View>
                <View className="flex-1">
                  <Text className="mb-1.5 text-xs font-semibold text-slate-500">Right</Text>
                  <View className="flex-row items-center rounded-2xl border border-slate-200 bg-white px-3">
                    <TextInput
                      value={rightText}
                      onChangeText={applyRightText}
                      editable={!saving}
                      keyboardType="decimal-pad"
                      className="h-12 flex-1 text-base text-slate-950"
                    />
                    <Text className="text-sm text-slate-400">{item?.quantityUnit}</Text>
                  </View>
                </View>
              </View>

              <View className="mt-4 flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-1.5 text-xs font-semibold text-slate-500">
                    Left location
                  </Text>
                  <SearchableObjectDropdown<SelectOption>
                    options={storageLocations}
                    selectedId={leftLocationId}
                    selectedName={leftLocationName}
                    placeholder="Search or type a location"
                    disabled={saving}
                    onTextChange={(value) => {
                      if (value !== leftLocationName) setLeftLocationId("");
                      setLeftLocationDraft(value);
                    }}
                    onSelect={(option) => {
                      setLeftLocationId(option._id);
                      setLeftLocationName(option.name);
                      setLeftLocationDraft(option.name);
                    }}
                  />
                </View>
                <View className="flex-1">
                  <Text className="mb-1.5 text-xs font-semibold text-slate-500">
                    Right location
                  </Text>
                  <SearchableObjectDropdown<SelectOption>
                    options={storageLocations}
                    selectedId={rightLocationId}
                    selectedName={rightLocationName}
                    placeholder="Search or type a location"
                    disabled={saving}
                    onTextChange={(value) => {
                      if (value !== rightLocationName) setRightLocationId("");
                      setRightLocationDraft(value);
                    }}
                    onSelect={(option) => {
                      setRightLocationId(option._id);
                      setRightLocationName(option.name);
                      setRightLocationDraft(option.name);
                    }}
                  />
                </View>
              </View>

              <View className="mt-4 flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-1.5 text-xs font-semibold text-slate-500">
                    Left expiry
                  </Text>
                  <DateTextInput
                    value={leftExpiryDate}
                    onChangeText={setLeftExpiryDate}
                    editable={!saving}
                    className="h-12 rounded-2xl border border-slate-200 bg-white px-3 text-base text-slate-950"
                  />
                </View>
                <View className="flex-1">
                  <Text className="mb-1.5 text-xs font-semibold text-slate-500">
                    Right expiry
                  </Text>
                  <DateTextInput
                    value={rightExpiryDate}
                    onChangeText={setRightExpiryDate}
                    editable={!saving}
                    className="h-12 rounded-2xl border border-slate-200 bg-white px-3 text-base text-slate-950"
                  />
                </View>
              </View>

              <View className="mt-5 flex-row gap-3">
                <Pressable
                  disabled={saving}
                  onPress={onClose}
                  className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200"
                >
                  <Text className="text-sm font-semibold text-slate-600">Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={saving}
                  onPress={() => void handleConfirm()}
                  className={`flex-1 items-center rounded-2xl py-3.5 ${
                    saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
                  }`}
                >
                  <Text className="text-sm font-semibold text-white">
                    {saving ? "Saving..." : isMoveOnly ? "Move" : "Split"}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default SplitPantryItemModal;
