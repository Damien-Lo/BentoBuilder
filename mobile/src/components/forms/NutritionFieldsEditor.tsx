import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

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
import { nutrientColor, type MainNutrient } from "@/src/theme/nutrients";
import { useOrbitPage, useOrbitTheme } from "@/src/theme/orbit";

interface NutritionFieldsEditorProps {
  values: NutritionFormValues;
  onChange: (field: NutritionField, value: string) => void;
  onFocus?: () => void;
  // Small grey labels with the unit as placeholder, for tight layouts like
  // a restaurant dish card; the default uses full FieldLabels.
  compact?: boolean;
  // Three-per-row cells with the unit inside (and an icon on the main six),
  // like the receipt review card — for roomier, card-based pages.
  grid?: boolean;
}

// Short labels and icons for the grid layout (each icon in its nutrient's
// colour — the dark shade on an Orbit page in dark mode).
const GRID_CORE: Partial<Record<NutritionField, { label: string; icon: keyof typeof Ionicons.glyphMap; nutrient: MainNutrient }>> = {
  calories: { label: "Calories", icon: "flame", nutrient: "calories" },
  protein: { label: "Protein", icon: "barbell", nutrient: "protein" },
  carbs: { label: "Carbs", icon: "leaf", nutrient: "carbs" },
  fats: { label: "Fat", icon: "water", nutrient: "fats" },
  fiber: { label: "Fiber", icon: "nutrition", nutrient: "fiber" },
  sodium: { label: "Sodium", icon: "flask", nutrient: "sodium" },
};

const GRID_SHORT_LABELS: Partial<Record<NutritionField, string>> = {
  polyunsaturatedFat: "Polyunsat. fat",
  monounsaturatedFat: "Monounsat. fat",
  omega3: "Omega-3",
  thiamin: "B1 Thiamin",
  riboflavin: "B2 Riboflavin",
  niacin: "B3 Niacin",
};

function GridCell({
  field,
  value,
  onChange,
  onFocus,
}: {
  field: NutritionField;
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
}) {
  // (On an Orbit page, in its colours.)
  const o = useOrbitPage();
  const { dark } = useOrbitTheme();
  const core = GRID_CORE[field];
  const meta = NUTRITION_FIELD_META[field];
  return (
    <View className="rounded-xl border border-slate-200 bg-white px-2.5 pb-1.5 pt-2" style={o && { backgroundColor: o.surface, borderColor: o.border, borderRadius: 14 }}>
      <View className="flex-row items-center">
        {core && <Ionicons name={core.icon} size={12} color={nutrientColor(core.nutrient, !!o && dark)} />}
        <Text numberOfLines={1} className={`flex-1 text-xs text-slate-500 ${core ? "ml-1" : ""}`} style={o && { color: o.muted }}>
          {core?.label ?? GRID_SHORT_LABELS[field] ?? meta.label}
        </Text>
      </View>
      <View className="flex-row items-center">
        <TextInput
          value={value}
          onChangeText={onChange}
          onFocus={onFocus}
          keyboardType="decimal-pad"
          placeholder="—"
          placeholderTextColor={o?.faint ?? "#CBD5E1"}
          className="flex-1 py-1 text-base font-medium text-slate-950"
          style={o && { color: o.text }}
        />
        <Text className="text-xs text-slate-400" style={o && { color: o.faint }}>{meta.unit}</Text>
      </View>
    </View>
  );
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
  grid = false,
}: NutritionFieldsEditorProps) {
  const [moreExpanded, setMoreExpanded] = useState(false);
  // (On an Orbit page, in its colours.)
  const o = useOrbitPage();

  const filledExtendedCount = EXTENDED_NUTRITION_FIELDS.filter(
    (field) => values[field].trim() !== "",
  ).length;

  if (grid) {
    const renderGrid = (fields: readonly NutritionField[]) => (
      <View className="-mx-1 flex-row flex-wrap">
        {fields.map((field) => (
          <View key={field} className="mb-2 px-1" style={{ width: "33.333%" }}>
            <GridCell
              field={field}
              value={values[field]}
              onChange={(value) => onChange(field, value)}
              onFocus={onFocus}
            />
          </View>
        ))}
      </View>
    );

    return (
      <View className="mt-3">
        {renderGrid(CORE_NUTRITION_FIELDS)}
        <Pressable
          className="flex-row items-center rounded-xl bg-blue-50 px-3 py-2.5 active:bg-blue-100"
          style={o && { backgroundColor: o.pill, borderRadius: 14 }}
          onPress={() => setMoreExpanded((current) => !current)}
        >
          <Text className="text-sm font-semibold text-blue-700" style={o && { color: o.onPill }}>More nutrients</Text>
          <Text className="ml-1 flex-1 text-sm text-blue-500" style={o && { color: o.muted }}>
            · {filledExtendedCount} of {EXTENDED_NUTRITION_FIELDS.length} filled
          </Text>
          <Ionicons name={moreExpanded ? "chevron-up" : "chevron-down"} size={16} color={o?.muted ?? "#1D4ED8"} />
        </Pressable>
        {moreExpanded &&
          EXTENDED_NUTRITION_GROUPS.map((group) => (
            <View key={group.title} className="mt-3">
              <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400" style={o && { color: o.faint }}>
                {group.title}
              </Text>
              {renderGrid(group.fields)}
              {group.fields.includes("vitaminD" as never) && (
                <Text className="-mt-1 mb-1 text-xs text-slate-400" style={o && { color: o.faint }}>
                  Vitamin D label in IU? Divide by 40 (2000 IU = 50 mcg).
                </Text>
              )}
            </View>
          ))}
      </View>
    );
  }

  function renderFields(fields: readonly NutritionField[]) {
    return (
      <View className="flex-row flex-wrap justify-between">
        {fields.map((field) => (
          <View key={field} style={{ width: "48%" }}>
            {compact ? (
              <Text className="mb-1 mt-2 text-xs text-slate-400" style={o && { color: o.faint }}>
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
              <Text className="mt-1 text-xs text-slate-400" style={o && { color: o.faint }}>
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
          <Text className="text-sm font-semibold text-slate-800" style={o && { color: o.text }}>
            More nutrients
            {filledExtendedCount > 0 ? ` · ${filledExtendedCount} filled` : ""}
          </Text>
          {!compact && (
            <Text className="mt-0.5 text-xs leading-4 text-slate-500" style={o && { color: o.muted }}>
              Optional — sugars, fat breakdown, vitamins, minerals and
              caffeine.
            </Text>
          )}
        </View>
        <Ionicons name={moreExpanded ? "chevron-up" : "chevron-down"} size={20} color={o?.muted ?? "#64748B"} />
      </Pressable>

      {moreExpanded &&
        EXTENDED_NUTRITION_GROUPS.map((group) => (
          <View key={group.title} className="mt-4">
            <Text className="text-xs font-bold uppercase tracking-wider text-slate-400" style={o && { color: o.faint, letterSpacing: 1.2 }}>
              {group.title}
            </Text>
            {renderFields(group.fields)}
          </View>
        ))}
    </View>
  );
}

export default NutritionFieldsEditor;
