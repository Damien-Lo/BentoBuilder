import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import type { IngredientRequirement } from "@/src/utils/pantryDeduction";

interface ResolveIngredientSourcesModalProps {
  visible: boolean;
  requirements: IngredientRequirement[]; // only ambiguous ones (2+ groups)
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (selections: Record<string, string[]>) => void;
}

function formatExpiry(expiryDate: string | null): string {
  if (!expiryDate) return "No expiry";
  return `Exp. ${new Date(expiryDate).toLocaleDateString()}`;
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

  useEffect(() => {
    if (visible) setSelections({});
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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        <Pressable className="absolute inset-0" onPress={onCancel} />

        <View className="max-h-[85%] w-full rounded-3xl bg-white">
          <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
            <Text className="text-lg font-bold text-slate-950">Choose sources</Text>
            <Text className="mt-0.5 mb-5 text-sm text-slate-400">
              More than one pantry entry could cover these — tap to choose which to use. Anything
              left untouched uses the soonest-to-expire source automatically.
            </Text>

            {requirements.map((req) => {
              const picked = selections[req.ingredientId] ?? [];
              const pickedAmount = picked.reduce((sum, key) => {
                const group = req.groups.find((g) => g.key === key);
                return sum + (group?.totalAvailable ?? 0);
              }, 0);
              const remaining = Math.max(0, Math.round((req.neededQuantity - pickedAmount) * 100) / 100);

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

                  {picked.length > 0 && (
                    <Text className="mt-1 text-xs font-medium text-slate-500">
                      {remaining > 0
                        ? `Still needs ${remaining} ${req.unit} — pick another source below`
                        : "Fully covered by your picks"}
                    </Text>
                  )}

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
                              {group.totalAvailable} {req.unit} available · {formatExpiry(group.expiryDate)}
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
                onPress={() => onConfirm(selections)}
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
