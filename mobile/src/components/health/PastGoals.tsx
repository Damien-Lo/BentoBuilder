import { Text, View } from "react-native";

import { showMeasure } from "@/src/components/health/units";
import type { PastGoal, Units } from "@/src/services/settingsService";
import type { OrbitColors } from "@/src/theme/orbit";

// Your goals before this one (newest first): each a cut, a bulk or keeping
// steady, from when it was set to when the next one took over — kept by the
// server when a new goal changed direction (server/services/weightGoal.js).
const NAMES = { lose: "Losing", gain: "Gaining", stay: "Keeping" } as const;
const day = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");

export function PastGoals({ goals, units, colors: c }: { goals: PastGoal[]; units: Units; colors: OrbitColors }) {
  if (!goals.length) return null;
  const W = (kg: number) => showMeasure("weight", kg, units, 1);
  return (
    <View>
      <Text style={{ marginTop: 24, marginBottom: 8, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>PAST GOALS</Text>
      <View style={{ borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }}>
        {[...goals].reverse().map((g, i) => {
          const change = g.startWeight != null && g.endWeight != null ? g.endWeight - g.startWeight : null;
          const good = change != null && (g.direction === "gain" ? change >= 0 : g.direction === "lose" ? change <= 0 : Math.abs(change) < 1);
          return (
            <View key={`${g.startDate}-${i}`} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: c.text }}>
                  {g.direction ? NAMES[g.direction] : "Goal"}
                  {g.goalWeight != null ? ` to ${W(g.goalWeight)}` : ""}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 12.5, color: c.muted }}>
                  {day(g.startDate)} → {day(g.endDate)}
                  {g.startWeight != null && g.endWeight != null ? ` · ${W(g.startWeight)} → ${W(g.endWeight)}` : ""}
                </Text>
              </View>
              {change != null && (
                <Text style={{ fontSize: 14, fontWeight: "700", color: good ? c.success : c.muted }}>
                  {change > 0 ? "+" : change < 0 ? "−" : ""}
                  {W(Math.abs(change))}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
