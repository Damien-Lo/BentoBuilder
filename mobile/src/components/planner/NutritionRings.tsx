import { Text, View } from "react-native";

import type { NutritionLimits } from "@/src/components/health/NutritionSummaryCard";
import { TickRing } from "@/src/components/ui/TickRing";
import { nutrientColor, type MainNutrient } from "@/src/theme/nutrients";
import { useOrbitTheme } from "@/src/theme/orbit";
import type { DayNutrition } from "@/src/utils/mealPlan";

// The day's nutrition on Log, in Orbit's look: calories as the home
// screen's ring of marks, and beside it a short bar each for the macros and
// sodium in its own colour (theme/nutrients.ts) — eaten solid, planned
// faded after it, and the number of what's over its goal in red. (The same figures as NutritionSummaryCard, which the Health
// pages still use.)
// (`untitled`: under a heading that already names it.)
export function NutritionRings({ title, subtitle, confirmed, planned, limits, untitled = false }: { title: string; subtitle?: string; confirmed: DayNutrition; planned: DayNutrition; limits: NutritionLimits; untitled?: boolean }) {
  const { colors: c, dark } = useOrbitTheme();
  const share = (value: number, limit: number | null) => (limit && limit > 0 ? value / limit : 0);

  const calLimit = limits.calories;
  const calOver = calLimit != null && confirmed.calories > calLimit;
  const left = calLimit != null ? calLimit - confirmed.calories : null;

  // (Sodium only once there's any, or a limit for it.)
  const hasSodium = confirmed.sodium > 0 || planned.sodium > 0 || limits.sodium != null;
  const rows: { key: MainNutrient; label: string; value: number; more: number; limit: number | null; unit: string }[] = [
    { key: "protein", label: "Protein", value: confirmed.protein, more: planned.protein, limit: limits.protein, unit: "g" },
    { key: "carbs", label: "Carbs", value: confirmed.carbs, more: planned.carbs, limit: limits.carbs, unit: "g" },
    { key: "fats", label: "Fats", value: confirmed.fats, more: planned.fats, limit: limits.fats, unit: "g" },
    { key: "fiber", label: "Fiber", value: confirmed.fiber, more: planned.fiber, limit: limits.fiber, unit: "g" },
    ...(hasSodium ? [{ key: "sodium" as const, label: "Sodium", value: confirmed.sodium, more: planned.sodium, limit: limits.sodium, unit: " mg" }] : []),
  ];

  return (
    <View style={{ backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.border, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", display: untitled ? "none" : "flex" }}>
        <Text style={{ flex: 1, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>{title.toUpperCase()}</Text>
        {!!subtitle && <Text style={{ fontSize: 12, color: c.faint }}>{subtitle}</Text>}
      </View>

      {/* Calories as the ring, with what's left in it; the rest beside it */}
      <View style={{ marginTop: untitled ? 2 : 12, flexDirection: "row", alignItems: "center" }}>
        <View style={{ width: 108, height: 108, alignItems: "center", justifyContent: "center" }}>
          <TickRing size={108} value={share(confirmed.calories, calLimit)} extra={share(planned.calories, calLimit)} marks={44} tick={7} color={calOver ? c.warning : c.fill} track={c.track} />
          <Text style={{ fontSize: 24, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>{Math.round(confirmed.calories)}</Text>
          <Text style={{ fontSize: 11, fontWeight: left != null ? "600" : "400", color: calOver ? c.warning : c.muted }}>
            {left != null ? `${Math.abs(Math.round(left))} ${calOver ? "over" : "left"}` : "kcal"}
          </Text>
          {planned.calories > 0 && <Text style={{ fontSize: 10, color: c.faint }}>+{Math.round(planned.calories)} planned</Text>}
        </View>
        <View style={{ flex: 1, marginLeft: 18, gap: rows.length > 4 ? 7 : 9 }}>
          {rows.map(({ key, label, value, more, limit, unit }) => {
            const over = limit != null && value > limit;
            const eaten = Math.min(1, share(value, limit));
            const withPlanned = Math.min(1, share(value + more, limit));
            const tone = nutrientColor(key, dark);
            return (
              <View key={label}>
                <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                  <Text style={{ flex: 1, fontSize: 12.5, fontWeight: "600", color: c.text }}>{label}</Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: over ? c.danger : c.text }}>{Math.round(value)}</Text>
                  <Text style={{ fontSize: 11, color: c.faint }}>
                    {limit != null ? ` / ${limit}${unit}` : unit}
                    {more > 0 ? ` +${Math.round(more)}` : ""}
                  </Text>
                </View>
                {limit != null && (
                  <View style={{ marginTop: 4, height: 5, borderRadius: 2.5, overflow: "hidden", flexDirection: "row", backgroundColor: c.track }}>
                    <View style={{ width: `${eaten * 100}%`, backgroundColor: tone }} />
                    <View style={{ width: `${Math.max(0, withPlanned - eaten) * 100}%`, backgroundColor: tone, opacity: 0.35 }} />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
