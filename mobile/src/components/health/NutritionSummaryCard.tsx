import { Text, View } from "react-native";

import { hexToRgba, pct, type DayNutrition } from "@/src/utils/mealPlan";
import type { CoreNutritionField } from "@/src/types/nutrition";
import { nutrientColor } from "@/src/theme/nutrients";
import type { OrbitColors } from "@/src/theme/orbit";

// Core-only on purpose — this card is the "main 6" summary; extended
// nutrients (and any goals for them) belong to the secondary all-nutrients
// view, not here.
export type NutritionLimits = Record<CoreNutritionField, number | null>;

// Shared nutrition summary card — a calorie bar plus per-macro bars, each
// showing a solid "confirmed" segment with a lighter "+planned" segment
// continuing on from it. Used by the planner's day/week pages and by the
// Health tab's Nutrition and Weekly Report pages, so all three read as the
// same visual language.
// (`orbit`: in Orbit's look, in these colours — the Weekly Report in a
// desktop browser: its card, and calories in their own colour, the number
// red when over rather than the bar.)
export function NutritionSummaryCard({
  title,
  subtitle,
  confirmed,
  planned,
  limits,
  orbit: o,
}: {
  title: string;
  subtitle?: string;
  confirmed: DayNutrition;
  planned: DayNutrition;
  limits: NutritionLimits;
  orbit?: OrbitColors | null;
}) {
  const confirmedCalPct = pct(confirmed.calories, limits.calories);
  const totalCalPct = pct(confirmed.calories + planned.calories, limits.calories);
  const plannedCalSegment = Math.max(totalCalPct - confirmedCalPct, 0);
  const calOverLimit = confirmedCalPct >= 1;
  const calBar = o ? nutrientColor("calories") : calOverLimit ? "#F87171" : "#3B82F6";
  const track = o ? { backgroundColor: o.track } : undefined;

  const macros = [
    { label: "Protein", confirmedValue: confirmed.protein, plannedValue: planned.protein, unit: "g", limit: limits.protein, bar: nutrientColor("protein") },
    { label: "Carbs",   confirmedValue: confirmed.carbs,   plannedValue: planned.carbs,   unit: "g", limit: limits.carbs,   bar: nutrientColor("carbs") },
    { label: "Fats",    confirmedValue: confirmed.fats,    plannedValue: planned.fats,    unit: "g", limit: limits.fats,    bar: nutrientColor("fats") },
    { label: "Fiber",   confirmedValue: confirmed.fiber,   plannedValue: planned.fiber,   unit: "g", limit: limits.fiber,   bar: nutrientColor("fiber") },
  ] as const;

  const hasSodiumData = confirmed.sodium > 0 || planned.sodium > 0 || limits.sodium != null;

  return (
    <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white" style={o ? { backgroundColor: o.surface, borderColor: o.border, borderRadius: 18 } : undefined}>
      {/* Calories row */}
      <View className="border-b border-slate-100 px-5 pb-4 pt-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {title}
          </Text>
          {subtitle && (
            <Text className="text-xs font-semibold text-slate-400">{subtitle}</Text>
          )}
        </View>
        <View className="mt-2 flex-row items-end justify-between">
          <View className="flex-row items-end">
            <Text className="text-4xl font-bold text-slate-900" style={o ? { color: calOverLimit ? o.danger : o.text, fontWeight: "800", letterSpacing: -0.5 } : undefined}>
              {confirmed.calories}
            </Text>
            {planned.calories > 0 && (
              <Text className="mb-1 ml-1 text-lg font-semibold text-slate-300">
                +{planned.calories}
              </Text>
            )}
            <Text className="mb-1 ml-1.5 text-base text-slate-400">kcal</Text>
          </View>
          {limits.calories != null && (
            <Text className="mb-1 text-sm text-slate-400">
              / {limits.calories} kcal
            </Text>
          )}
        </View>
        {limits.calories != null && (
          <View className="mt-2 h-2 w-full flex-row overflow-hidden rounded-full bg-slate-100" style={track}>
            <View style={{ width: `${confirmedCalPct * 100}%`, backgroundColor: calBar }} />
            <View style={{ width: `${plannedCalSegment * 100}%`, backgroundColor: hexToRgba(calBar, 0.35) }} />
          </View>
        )}
      </View>

      {/* Macro columns */}
      <View className={`flex-row px-4 pt-4 ${hasSodiumData ? "border-b border-slate-100 pb-4" : "pb-4"}`}>
        {macros.map(({ label, confirmedValue, plannedValue, unit, limit, bar }) => {
          const confirmedF = pct(confirmedValue, limit);
          const totalF = pct(confirmedValue + plannedValue, limit);
          const plannedSegment = Math.max(totalF - confirmedF, 0);
          const over = confirmedF >= 1;
          return (
            <View key={label} className="flex-1 items-center px-1">
              {/* (Over its goal: the number in red; the bar keeps its colour.) */}
              <Text className="text-sm font-bold text-slate-800" style={over ? { color: "#DC2626" } : undefined}>
                {confirmedValue}{unit}
                {plannedValue > 0 && (
                  <Text className="text-slate-300"> +{plannedValue}{unit}</Text>
                )}
              </Text>
              <Text className="mt-0.5 text-xs text-slate-400">{label}</Text>
              {limit != null && (
                <View className="mt-2 h-1.5 w-full flex-row overflow-hidden rounded-full bg-slate-100" style={track}>
                  <View style={{ height: 6, width: `${confirmedF * 100}%`, backgroundColor: bar }} />
                  <View style={{ height: 6, width: `${plannedSegment * 100}%`, backgroundColor: hexToRgba(bar, 0.35) }} />
                </View>
              )}
              {limit != null && (
                <Text className="mt-0.5 text-[10px] text-slate-300">
                  /{limit}{unit}
                </Text>
              )}
            </View>
          );
        })}
      </View>

      {/* Sodium row */}
      {hasSodiumData && (
        <View className="px-5 pb-4 pt-3">
          {(() => {
            const confirmedF = pct(confirmed.sodium, limits.sodium);
            const totalF = pct(confirmed.sodium + planned.sodium, limits.sodium);
            const plannedSegment = Math.max(totalF - confirmedF, 0);
            const over = confirmedF >= 1;
            return (
              <>
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-semibold text-slate-500">Sodium</Text>
                  <Text className="text-xs text-slate-400" style={over ? { color: "#DC2626", fontWeight: "700" } : undefined}>
                    {confirmed.sodium}
                    {planned.sodium > 0 && ` +${planned.sodium}`} mg
                    {limits.sodium != null && ` / ${limits.sodium} mg`}
                  </Text>
                </View>
                {limits.sodium != null && (
                  <View className="mt-1.5 h-1.5 w-full flex-row overflow-hidden rounded-full bg-slate-100" style={track}>
                    <View style={{ height: 6, width: `${confirmedF * 100}%`, backgroundColor: nutrientColor("sodium") }} />
                    <View style={{ height: 6, width: `${plannedSegment * 100}%`, backgroundColor: hexToRgba(nutrientColor("sodium"), 0.35) }} />
                  </View>
                )}
              </>
            );
          })()}
        </View>
      )}
    </View>
  );
}

export default NutritionSummaryCard;
