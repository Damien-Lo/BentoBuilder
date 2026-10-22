import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { Chips, GroupHeading, GymPage } from "@/src/components/gym/GymTabPage";
import { weeklyTotals, type WeekTotals } from "@/src/components/gym/progressStats";
import { Tap } from "@/src/components/ui/Tap";
import { getSessions, type GymSessionRecord } from "@/src/services/gymApi";
import { useOrbitTheme } from "@/src/theme/orbit";

// Gym → Progress → Volume over time: week by week, over 12 weeks or 6
// months, the weight you moved — or the sets, or the workouts — as bars.
// Tap a week for its numbers; the week's against your average beside it.

type Metric = "volume" | "sets" | "workouts";
const METRICS: { id: Metric; label: string }[] = [
  { id: "volume", label: "Volume" },
  { id: "sets", label: "Sets" },
  { id: "workouts", label: "Workouts" },
];
type Span = "12" | "26";
const SPANS: { id: Span; label: string }[] = [
  { id: "12", label: "12 weeks" },
  { id: "26", label: "6 months" },
];
const value = (week: WeekTotals, metric: Metric) => week[metric];
const amount = (n: number, metric: Metric) => (metric === "volume" ? `${Math.round(n).toLocaleString()} lbs` : `${Math.round(n * 10) / 10} ${metric === "sets" ? "sets" : n === 1 ? "workout" : "workouts"}`);
const weekOf = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function VolumeScreen() {
  return (
    <GymPage title="Volume over time" subtitle="How much you've done, week by week" parent="/gym/progress">
      <Volume />
    </GymPage>
  );
}

function Volume() {
  const { colors: c } = useOrbitTheme();
  const [sessions, setSessions] = useState<GymSessionRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [metric, setMetric] = useState<Metric>("volume");
  const [span, setSpan] = useState<Span>("12");
  const [picked, setPicked] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      getSessions().then(setSessions, () => setFailed(true));
    }, []),
  );
  if (!sessions) return failed ? <Text style={{ marginTop: 24, textAlign: "center", fontSize: 14, color: c.muted }}>Couldn&apos;t load your workouts.</Text> : <ActivityIndicator style={{ marginTop: 24 }} color={c.muted} />;

  const weeks = weeklyTotals(sessions, Number(span));
  const values = weeks.map((w) => value(w, metric));
  const most = Math.max(1, ...values);
  const index = picked !== null && picked < weeks.length ? picked : weeks.length - 1;
  const week = weeks[index];
  // The average over the weeks before this one that had any training.
  const earlier = weeks.slice(0, -1).filter((w) => w.workouts > 0);
  const average = earlier.length ? earlier.reduce((n, w) => n + value(w, metric), 0) / earlier.length : null;
  const change = average ? (value(week, metric) - average) / average : null;
  const chartHeight = 170;
  const narrow = weeks.length > 12;

  return (
    <>
      <View style={{ marginTop: 18, gap: 10 }}>
        <Chips options={METRICS} value={metric} onChange={setMetric} />
        <Chips
          options={SPANS}
          value={span}
          onChange={(s) => {
            setSpan(s);
            setPicked(null);
          }}
        />
      </View>

      <View style={{ marginTop: 16, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
        {/* The picked week */}
        <Text style={{ fontSize: 12.5, fontWeight: "600", color: c.muted }}>{index === weeks.length - 1 ? "This week" : `Week of ${weekOf(week.start)}`}</Text>
        <Text style={{ marginTop: 2, fontSize: 26, fontWeight: "800", color: c.text }}>{amount(value(week, metric), metric)}</Text>
        <Text style={{ marginTop: 2, fontSize: 13, color: c.muted }}>
          {week.workouts} workout{week.workouts === 1 ? "" : "s"} · {week.sets} sets
        </Text>

        {/* The weeks */}
        <View style={{ marginTop: 18, height: chartHeight, flexDirection: "row", alignItems: "flex-end", gap: narrow ? 3 : 6 }}>
          {weeks.map((w, i) => {
            const v = values[i];
            const on = i === index;
            return (
              <Tap key={w.start.toISOString()} onPress={() => setPicked(i)} accessibilityRole="button" accessibilityLabel={`Week of ${weekOf(w.start)}: ${amount(v, metric)}`} style={{ flex: 1, height: "100%", justifyContent: "flex-end" }}>
                <View style={{ height: Math.max(v ? 4 : 2, (v / most) * chartHeight), borderRadius: narrow ? 3 : 5, backgroundColor: on ? c.ink : v ? c.faint : c.track, opacity: on || !v ? 1 : 0.55 }} />
              </Tap>
            );
          })}
        </View>
        <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 11.5, color: c.faint }}>{weekOf(weeks[0].start)}</Text>
          <Text style={{ fontSize: 11.5, color: c.faint }}>This week</Text>
        </View>
      </View>

      {/* Against the average */}
      <GroupHeading>Compared</GroupHeading>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Figure label="Weekly average" value={average !== null ? amount(average, metric) : "—"} />
        <Figure
          label={index === weeks.length - 1 ? "This week" : "That week"}
          value={change === null ? "—" : `${change >= 0 ? "+" : "−"}${Math.abs(Math.round(change * 100))}%`}
          tone={change === null ? undefined : change >= 0 ? c.success : c.danger}
        />
      </View>
      <Text style={{ marginTop: 8, marginHorizontal: 4, fontSize: 12.5, lineHeight: 18, color: c.faint }}>
        The average is of the weeks before this one that you trained in.{metric === "volume" ? " Volume is weight × reps; assisted exercises aren't counted." : ""}
      </Text>
    </>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const { colors: c } = useOrbitTheme();
  return (
    <View style={{ flex: 1, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
      <Text style={{ fontSize: 12.5, color: c.muted }}>{label}</Text>
      <Text style={{ marginTop: 4, fontSize: 20, fontWeight: "800", color: tone ?? c.text }}>{value}</Text>
    </View>
  );
}
