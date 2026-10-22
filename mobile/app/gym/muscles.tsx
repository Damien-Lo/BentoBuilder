import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";

import { Chips, GroupHeading, GymPage } from "@/src/components/gym/GymTabPage";
import { heatColor, MuscleHeatMap, useDark } from "@/src/components/gym/MuscleMap";
import { MUSCLES, muscleLabel, muscleSets } from "@/src/components/gym/progressStats";
import { startOfWeek } from "@/src/components/gym/schedule";
import { themeColor } from "@/src/components/web/theme";
import { getSessions, type GymSessionRecord } from "@/src/services/gymApi";
import { useOrbitTheme } from "@/src/theme/orbit";

// Gym → Progress → Muscles trained: over this week, 30 days or 3 months,
// how many sets each muscle got — on the body (the more, the stronger the
// colour) and as a list, the most first — and the ones that got none.

type Range = "week" | "month" | "quarter";
const RANGES: { id: Range; label: string }[] = [
  { id: "week", label: "This week" },
  { id: "month", label: "30 days" },
  { id: "quarter", label: "3 months" },
];
function since(range: Range) {
  if (range === "week") return startOfWeek();
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (range === "month" ? 30 : 91));
  return d;
}
// "12", "7.5".
const setsLabel = (n: number) => String(Math.round(n * 2) / 2);
const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");

export default function MusclesScreen() {
  return (
    <GymPage title="Muscles trained" subtitle="The sets each muscle got" parent="/gym/progress">
      <Muscles />
    </GymPage>
  );
}

function Muscles() {
  const { colors: c } = useOrbitTheme();
  const dark = useDark();
  const [sessions, setSessions] = useState<GymSessionRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [range, setRange] = useState<Range>("week");
  useFocusEffect(
    useCallback(() => {
      getSessions().then(setSessions, () => setFailed(true));
    }, []),
  );
  if (!sessions) return failed ? <Text style={{ marginTop: 24, textAlign: "center", fontSize: 14, color: c.muted }}>Couldn&apos;t load your workouts.</Text> : <ActivityIndicator style={{ marginTop: 24 }} color={c.muted} />;

  const from = since(range);
  const sets = muscleSets(sessions, from);
  const workouts = sessions.filter((s) => new Date(s.finishedAt) >= from).length;
  const trained = MUSCLES.filter((m) => (sets[m] ?? 0) > 0).sort((a, b) => sets[b] - sets[a]);
  const untrained = MUSCLES.filter((m) => !(sets[m] ?? 0));
  const most = trained.length ? sets[trained[0]] : 0;
  // (On the web the colours are kept as drawn, whichever theme.)
  const fixed = (hex: string) => (Platform.OS === "web" ? themeColor(hexRgb(hex), hexRgb(hex)) : hex);

  return (
    <>
      <View style={{ marginTop: 18 }}>
        <Chips options={RANGES} value={range} onChange={setRange} />
      </View>

      <View style={{ marginTop: 16, paddingVertical: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
        <MuscleHeatMap sets={sets} size={0.8} />
        <Text style={{ marginTop: 10, textAlign: "center", fontSize: 13, color: c.muted }}>
          {workouts ? `${workouts} workout${workouts === 1 ? "" : "s"} · the stronger the colour, the more sets` : "No workouts in this time"}
        </Text>
      </View>

      {trained.length > 0 && (
        <>
          <GroupHeading>Sets per muscle</GroupHeading>
          <View style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
            {trained.map((m) => (
              <View key={m} style={{ paddingVertical: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }}>{muscleLabel(m)}</Text>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }}>
                    {setsLabel(sets[m])} <Text style={{ fontWeight: "400", color: c.muted }}>sets</Text>
                  </Text>
                </View>
                <View style={{ marginTop: 6, height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: c.track }}>
                  <View style={{ width: `${(sets[m] / most) * 100}%`, height: "100%", borderRadius: 3, backgroundColor: fixed(heatColor(sets[m] / most, dark)) }} />
                </View>
              </View>
            ))}
          </View>
          <Text style={{ marginTop: 8, marginHorizontal: 4, fontSize: 12.5, lineHeight: 18, color: c.faint }}>A set counts whole for the muscles an exercise mainly works, and half for the ones it also works.</Text>
        </>
      )}

      {untrained.length > 0 && (
        <>
          <GroupHeading>Not trained</GroupHeading>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {untrained.map((m) => (
              <View key={m} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: c.border }}>
                <Text style={{ fontSize: 13, color: c.muted }}>{muscleLabel(m)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </>
  );
}
