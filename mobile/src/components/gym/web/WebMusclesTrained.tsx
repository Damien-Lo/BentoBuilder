import { useState } from "react";
import { Platform, Text, View } from "react-native";

import { heatColor, MuscleHeatMap, useDark } from "@/src/components/gym/MuscleMap";
import { MUSCLES, muscleLabel, muscleSets } from "@/src/components/gym/progressStats";
import { startOfWeek } from "@/src/components/gym/schedule";
import { useFinishedSessions } from "@/src/components/gym/useFinishedSessions";
import { BackLink } from "@/src/components/pantry/web/orbitWeb";
import { Card, PageTitle, Segmented, WebPage } from "@/src/components/web/ui";
import { themeColor } from "@/src/components/web/theme";
import { OrbitPage, useOrbitTheme } from "@/src/theme/orbit";

// Gym → Progress → Muscles trained in a desktop browser: over this week,
// 30 days or 3 months, the body front and back, large (the more sets a
// muscle got, the stronger its colour), and beside it the sets each muscle
// got, the most first, in two columns — then the ones that got none.

type Range = "week" | "month" | "quarter";
const RANGES: { value: Range; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "30 days" },
  { value: "quarter", label: "3 months" },
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

export function WebMusclesTrained({ onBack }: { onBack: () => void }) {
  const { colors: c } = useOrbitTheme();
  const dark = useDark();
  const { sessions, failed } = useFinishedSessions();
  const [range, setRange] = useState<Range>("week");

  const from = since(range);
  const sets = sessions ? muscleSets(sessions, from) : {};
  const workouts = (sessions ?? []).filter((s) => new Date(s.finishedAt) >= from).length;
  const trained = MUSCLES.filter((m) => (sets[m] ?? 0) > 0).sort((a, b) => sets[b] - sets[a]);
  const untrained = MUSCLES.filter((m) => !(sets[m] ?? 0));
  const most = trained.length ? sets[trained[0]] : 0;
  const total = trained.reduce((n, m) => n + sets[m], 0);
  // (On the web the colours are kept as drawn, whichever theme.)
  const fixed = (hex: string) => (Platform.OS === "web" ? themeColor(hexRgb(hex), hexRgb(hex)) : hex);
  // The list in two columns, the most first down the left.
  const half = Math.ceil(trained.length / 2);

  return (
    <OrbitPage>
      <WebPage maxWidth={1280}>
        <BackLink label="Progress" onPress={onBack} />
        <PageTitle title="Muscles trained" subtitle="The sets each muscle got" right={<Segmented options={RANGES} value={range} onChange={setRange} />} />

        {!sessions ? (
          <Text style={{ fontSize: 14, color: c.muted }}>{failed ? "Couldn't load your workouts." : "Loading…"}</Text>
        ) : (
          <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
            {/* The body */}
            <Card style={{ width: 480 }}>
              <MuscleHeatMap sets={sets} size={1.6} />
              <Text style={{ marginTop: 12, textAlign: "center", fontSize: 13, color: c.muted }}>
                {workouts ? `${workouts} workout${workouts === 1 ? "" : "s"} · the stronger the colour, the more sets` : "No workouts in this time"}
              </Text>
            </Card>

            <View style={{ flex: 1, minWidth: 0, gap: 16 }}>
              {/* Sets per muscle */}
              <Card title="Sets per muscle" subtitle={trained.length ? `${setsLabel(total)} sets across ${trained.length} muscle${trained.length === 1 ? "" : "s"}` : undefined}>
                {trained.length ? (
                  <View style={{ flexDirection: "row", gap: 28 }}>
                    {[trained.slice(0, half), trained.slice(half)].map((column, i) => (
                      <View key={i} style={{ flex: 1, minWidth: 0 }}>
                        {column.map((m) => (
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
                    ))}
                  </View>
                ) : (
                  <Text style={{ fontSize: 13.5, color: c.muted }}>No sets in this time — finish a workout and each muscle&apos;s sets show here.</Text>
                )}
                <Text style={{ marginTop: 10, fontSize: 12.5, lineHeight: 18, color: c.faint }}>A set counts whole for the muscles an exercise mainly works, and half for the ones it also works.</Text>
              </Card>

              {/* Not trained */}
              {untrained.length > 0 && (
                <Card title="Not trained" subtitle={`${untrained.length} of ${MUSCLES.length} muscles got no sets`}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {untrained.map((m) => (
                      <View key={m} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: c.border }}>
                        <Text style={{ fontSize: 13, color: c.muted }}>{muscleLabel(m)}</Text>
                      </View>
                    ))}
                  </View>
                </Card>
              )}
            </View>
          </View>
        )}
      </WebPage>
    </OrbitPage>
  );
}
