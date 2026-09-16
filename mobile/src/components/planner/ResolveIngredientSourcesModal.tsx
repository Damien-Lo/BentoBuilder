import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import type { IngredientRequirement, ManualPieceInput, PantryGroup } from "@/src/utils/pantryDeduction";
import { wholePieceShortfall } from "@/src/utils/pantryDeduction";

interface ResolveIngredientSourcesModalProps {
  visible: boolean;
  // Only requirements that actually need input: real ambiguity (2+ groups)
  // and/or, for wholePiece, an outright shortfall with nothing in pantry to
  // cover part or all of what's needed.
  requirements: IngredientRequirement[];
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (selections: Record<string, string[]>, manualPieceEntries: ManualPieceInput[]) => void;
}

function formatExpiry(expiryDate: string | null): string {
  if (!expiryDate) return "No expiry";
  return `Exp. ${new Date(expiryDate).toLocaleDateString()}`;
}

// A "wholePiece" group's real per-member weights, each flagged for whether
// it actually qualifies — lets the user see *why* only some of a group's
// pieces count (too small/too large), not just a bare qualifying count.
function formatPieceWeights(group: PantryGroup, pieceWeightUnit: string): string {
  const qualifyingIds = new Set((group.qualifyingMembers ?? []).map((m) => m.pantryItemId));
  return group.members
    .map((m) => {
      const weight = `${m.quantityAvailable}${m.quantityUnit === pieceWeightUnit ? pieceWeightUnit : ` ${m.quantityUnit}`}`;
      return qualifyingIds.has(m.pantryItemId) ? weight : `${weight} ✗`;
    })
    .join(", ");
}

// Shown when confirming a recipe/meal/ingredient entry that has at least
// one ingredient with more than one pantry source to choose from (e.g. two
// brands of soy sauce). Tapping a source toggles it into that ingredient's
// pick order — first tapped drains first, and if it doesn't fully cover
// the need the next tapped source (or the next untouched one) picks up the
// rest. Any ingredient left untouched here just falls back to the
// automatic nearest-expiry order — nothing here is a hard requirement.
export function ResolveIngredientSourcesModal({
  visible,
  requirements,
  saving = false,
  onCancel,
  onConfirm,
}: ResolveIngredientSourcesModalProps) {
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  // One text field per shortfall slot, keyed by ingredientId - e.g. needing
  // 2 steaks with only 1 in pantry leaves a shortfall of 1, so one field.
  // Left blank, that slot just stays unfulfilled (typing a weight is always
  // optional, never a hard requirement to get past this modal).
  const [manualWeights, setManualWeights] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!visible) return;
    setSelections({});
    setManualWeights(
      Object.fromEntries(
        requirements
          .map((req) => [req.ingredientId, Array.from({ length: wholePieceShortfall(req) }, () => "")] as const)
          .filter(([, slots]) => slots.length > 0),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function toggleGroup(ingredientId: string, groupKey: string) {
    setSelections((current) => {
      const picked = current[ingredientId] ?? [];
      const next = picked.includes(groupKey)
        ? picked.filter((key) => key !== groupKey)
        : [...picked, groupKey];
      return { ...current, [ingredientId]: next };
    });
  }

  function updateManualWeight(ingredientId: string, index: number, value: string) {
    setManualWeights((current) => {
      const slots = [...(current[ingredientId] ?? [])];
      slots[index] = value;
      return { ...current, [ingredientId]: slots };
    });
  }

  function handleConfirmPress() {
    const manualPieceEntries: ManualPieceInput[] = [];
    for (const req of requirements) {
      const unit = req.pieceWeightUnit || "g";
      for (const raw of manualWeights[req.ingredientId] ?? []) {
        const weight = Number(raw);
        if (raw.trim() && Number.isFinite(weight) && weight > 0) {
          manualPieceEntries.push({ ingredientId: req.ingredientId, weight, unit });
        }
      }
    }
    onConfirm(selections, manualPieceEntries);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        <Pressable className="absolute inset-0" onPress={onCancel} />

        <View className="max-h-[85%] w-full rounded-3xl bg-white">
          <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
            <Text className="text-lg font-bold text-slate-950">Confirm what you used</Text>
            <Text className="mt-0.5 mb-5 text-sm text-slate-400">
              Some ingredients need a bit more info — pick a pantry source if there&apos;s more
              than one, or type a weight for anything not logged in. Anything left untouched uses
              the soonest-to-expire source automatically.
            </Text>

            {requirements.map((req) => {
              const picked = selections[req.ingredientId] ?? [];
              const pickedAmount = picked.reduce((sum, key) => {
                const group = req.groups.find((g) => g.key === key);
                return sum + (group?.totalAvailable ?? 0);
              }, 0);
              const remaining = Math.max(0, Math.round((req.neededQuantity - pickedAmount) * 100) / 100);
              const manualSlots = manualWeights[req.ingredientId] ?? [];
              const pieceWeightUnit = req.pieceWeightUnit || "g";

              return (
                <View key={req.ingredientId} className="mb-5 rounded-2xl border border-slate-200 p-4">
                  <View className="flex-row items-center justify-between">
                    <Text className="flex-1 font-semibold text-slate-900" numberOfLines={1}>
                      {req.ingredientName}
                    </Text>
                    <Text className="ml-2 text-xs text-slate-400">
                      Needs {req.neededQuantity} {req.unit}
                    </Text>
                  </View>

                  {picked.length > 0 && req.groups.length > 1 && (
                    <Text className="mt-1 text-xs font-medium text-slate-500">
                      {remaining > 0
                        ? `Still needs ${remaining} ${req.unit} — pick another source below`
                        : "Fully covered by your picks"}
                    </Text>
                  )}

                  {req.groups.length > 1 && (
                    <View className="mt-3">
                      {req.groups.map((group) => {
                        const order = picked.indexOf(group.key);
                        const isSelected = order !== -1;
                        return (
                          <Pressable
                            key={group.key}
                            disabled={saving}
                            onPress={() => toggleGroup(req.ingredientId, group.key)}
                            className={`mb-2 flex-row items-center rounded-2xl border px-3 py-2.5 ${
                              isSelected ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"
                            }`}
                          >
                            <View className="flex-1">
                              <Text className="text-sm font-semibold text-slate-900" numberOfLines={1}>
                                {group.displayName}
                              </Text>
                              <Text className="mt-0.5 text-xs text-slate-400">
                                {req.matchMode === "wholePiece"
                                  ? `${group.totalAvailable} of ${group.members.length} qualify (${
                                      formatPieceWeights(group, pieceWeightUnit)
                                    }) · ${formatExpiry(group.expiryDate)}`
                                  : `${group.totalAvailable} ${req.unit} available · ${formatExpiry(group.expiryDate)}`}
                              </Text>
                            </View>
                            {isSelected ? (
                              <View className="h-6 w-6 items-center justify-center rounded-full bg-blue-600">
                                <Text className="text-xs font-bold text-white">{order + 1}</Text>
                              </View>
                            ) : (
                              <Ionicons name="ellipse-outline" size={20} color="#CBD5E1" />
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  {manualSlots.length > 0 && (
                    <View className="mt-3 rounded-2xl bg-amber-50 p-3">
                      <Text className="text-xs font-semibold text-amber-800">
                        {req.groups.length > 0
                          ? `${manualSlots.length} more not in your pantry`
                          : "Nothing in your pantry qualifies"}
                      </Text>
                      <Text className="mt-0.5 text-xs leading-4 text-amber-700">
                        Bought and used without logging it in? Type the weight for accurate
                        nutrition — it won&apos;t be deducted from pantry since there&apos;s
                        nothing there to deduct. Leave blank to skip.
                      </Text>
                      {manualSlots.map((value, index) => (
                        <View key={index} className="mt-2 flex-row items-center">
                          <Text className="w-16 text-xs text-amber-700">
                            {req.unit.charAt(0).toUpperCase() + req.unit.slice(1)} {index + 1}
                          </Text>
                          <TextInput
                            value={value}
                            onChangeText={(text) => updateManualWeight(req.ingredientId, index, text)}
                            editable={!saving}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor="#B45309"
                            className="ml-2 h-11 flex-1 rounded-2xl border border-amber-200 bg-white px-3 text-base text-slate-950"
                          />
                          <Text className="ml-2 text-sm text-amber-700">{pieceWeightUnit}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}

            <View className="mt-2 flex-row gap-3">
              <Pressable
                disabled={saving}
                onPress={onCancel}
                className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200"
              >
                <Text className="text-sm font-semibold text-slate-600">Cancel</Text>
              </Pressable>
              <Pressable
                disabled={saving}
                onPress={handleConfirmPress}
                className={`flex-1 items-center rounded-2xl py-3.5 ${
                  saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
                }`}
              >
                <Text className="text-sm font-semibold text-white">
                  {saving ? "Confirming..." : "Confirm"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default ResolveIngredientSourcesModal;
