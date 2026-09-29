import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  EXTENDED_NUTRITION_FIELDS,
  EXTENDED_NUTRITION_GROUPS,
  NUTRITION_FIELD_META,
  type PartialNutrition,
} from "@/src/types/nutrition";

function formatAmount(value: number, decimals: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

// A read-only, collapsed-by-default list of every nutrient beyond the main
// six (sugars and fats, vitamins, minerals, caffeine), for the bottom of a
// detail page's nutrition card. Vitamins and minerals also show their % of
// the daily value. Unknown values show "—", never 0.
export function MoreNutrientsPanel({ nutrition }: { nutrition: PartialNutrition | null | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const values = nutrition ?? {};
  const known = EXTENDED_NUTRITION_FIELDS.filter((field) => values[field] != null).length;

  return (
    <View>
      <Pressable
        onPress={() => setExpanded((current) => !current)}
        className="flex-row items-center rounded-xl bg-blue-50 px-3 py-2.5 active:bg-blue-100"
      >
        <Ionicons name="list-outline" size={15} color="#1D4ED8" />
        <Text className="ml-2 text-sm font-semibold text-blue-700">All nutrients & vitamins</Text>
        <Text className="ml-1 flex-1 text-sm text-blue-500">
          · {known} of {EXTENDED_NUTRITION_FIELDS.length}
        </Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color="#1D4ED8" />
      </Pressable>

      {expanded &&
        EXTENDED_NUTRITION_GROUPS.map((group) => (
          <View key={group.title} className="mt-3">
            <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {group.title}
            </Text>
            {group.fields.map((field, index) => {
              const meta = NUTRITION_FIELD_META[field];
              const value = values[field];
              return (
                <View
                  key={field}
                  className={`flex-row items-center py-2 ${
                    index < group.fields.length - 1 ? "border-b border-slate-100" : ""
                  }`}
                >
                  <Text className="flex-1 text-sm text-slate-600">{meta.label}</Text>
                  {value != null ? (
                    <>
                      <Text className="text-sm font-semibold text-slate-900">
                        {formatAmount(value, meta.decimals)} {meta.unit}
                      </Text>
                      {meta.dailyValue ? (
                        <Text className="w-14 text-right text-xs text-slate-400">
                          {Math.round((value / meta.dailyValue) * 100)}% DV
                        </Text>
                      ) : (
                        <View className="w-14" />
                      )}
                    </>
                  ) : (
                    <>
                      <Text className="text-sm text-slate-300">—</Text>
                      <View className="w-14" />
                    </>
                  )}
                </View>
              );
            })}
          </View>
        ))}
    </View>
  );
}

export default MoreNutrientsPanel;
