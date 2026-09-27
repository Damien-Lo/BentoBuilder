import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  CORE_NUTRITION_FIELDS,
  EXTENDED_NUTRITION_FIELDS,
  EXTENDED_NUTRITION_GROUPS,
  NUTRITION_FIELD_META,
  type NutritionField,
} from "@/src/types/nutrition";
import { nutritionFieldLabel, type NutritionFormValues } from "@/src/utils/nutritionForm";

import { FieldLabel } from "./FieldLabel";
import { FormInput } from "./FormInput";

interface NutritionFieldsEditorProps {
  values: NutritionFormValues;
  onChange: (field: NutritionField, value: string) => void;
  onFocus?: () => void;
  // Small grey labels with the unit as placeholder, for tight layouts like
  // a restaurant dish card; the default uses full FieldLabels.
  compact?: boolean;
}

// The six core nutrients, plus the extended ones tucked into a collapsed
// "More nutrients" sub-section — they're tracked in the background, not
// front-and-center. Shared by every screen that edits an ingredient's or
// dish's nutrition, so they all look and behave the same.
export function NutritionFieldsEditor({
  values,
  onChange,
  onFocus,
  compact = false,
}: NutritionFieldsEditorProps) {
  const [moreExpanded, setMoreExpanded] = useState(false);

  const filledExtendedCount = EXTENDED_NUTRITION_FIELDS.filter(
    (field) => values[field].trim() !== "",
  ).length;

  function renderFields(fields: readonly NutritionField[]) {
    return (
      <View className="flex-row flex-wrap justify-between">
        {fields.map((field) => (
          <View key={field} style={{ width: "48%" }}>
            {compact ? (
              <Text className="mb-1 mt-2 text-xs text-slate-400">
                {NUTRITION_FIELD_META[field].label}
              </Text>
            ) : (
              <FieldLabel text={nutritionFieldLabel(field)} />
            )}
            <FormInput
              value={values[field]}
              placeholder={compact ? NUTRITION_FIELD_META[field].unit : "N/A"}
              keyboardType="decimal-pad"
              onFocus={onFocus}
              onChangeText={(value) => onChange(field, value)}
            />
            {field === "vitaminD" && (
              <Text className="mt-1 text-xs text-slate-400">
                Label in IU? Divide by 40 (e.g. 2000 IU = 50 mcg)
              </Text>
            )}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View>
      {renderFields(CORE_NUTRITION_FIELDS)}

      <Pressable
        className="mt-5 flex-row items-center justify-between"
        onPress={() => setMoreExpanded((current) => !current)}
      >
        <View className="mr-3 flex-1">
          <Text className="text-sm font-semibold text-slate-800">
            More nutrients
            {filledExtendedCount > 0 ? ` · ${filledExtendedCount} filled` : ""}
          </Text>
          {!compact && (
            <Text className="mt-0.5 text-xs leading-4 text-slate-500">
              Optional — sugars, fat breakdown, vitamins, minerals and
              caffeine.
            </Text>
          )}
        </View>
        <Ionicons name={moreExpanded ? "chevron-up" : "chevron-down"} size={20} color="#64748B" />
      </Pressable>

      {moreExpanded &&
        EXTENDED_NUTRITION_GROUPS.map((group) => (
          <View key={group.title} className="mt-4">
            <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {group.title}
            </Text>
            {renderFields(group.fields)}
          </View>
        ))}
    </View>
  );
}

export default NutritionFieldsEditor;
