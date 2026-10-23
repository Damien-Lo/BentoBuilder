import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { weeklyTotals, type WeekTotals } from "@/src/components/gym/progressStats";
import { useFinishedSessions } from "@/src/components/gym/useFinishedSessions";
import { BackLink } from "@/src/components/pantry/web/orbitWeb";
import { Card, hoverable, PageTitle, Segmented, Stat, WebPage } from "@/src/components/web/ui";
import { OrbitPage, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Gym → Progress → Volume over time in a desktop browser: week by week,
// over 12 weeks or 6 months, the weight you moved — or the sets, or the
// workouts — as bars across the page, each week's number on it; one week
// picked (this one, to start), and beside the chart its numbers against
// your weekly average. Under them every week as a table, the latest first,
// a row picking that week.

type Hover = { hovered?: boolean };
type Metric = "volume" | "sets" | "workouts";
const METRICS: { value: Metric; label: string }[] = [
  { value: "volume", label: "Volume" },
  { value: "sets", label: "Sets" },
  { value: "workouts", label: "Workouts" },
];
type Span = "12" | "26";
const SPANS: { value: Span; label: string }[] = [
  { value: "12", label: "12 weeks" },
  { value: "26", label: "6 months" },
];
const valueOf = (week: WeekTotals, metric: Metric) => week[metric];
const amount = (n: number, metric: Metric) => (metric === "volume" ? `${Math.round(n).toLocaleString()} lbs` : `${Math.round(n * 10) / 10} ${metric === "sets" ? "sets" : n === 1 ? "workout" : "workouts"}`);
// (On a bar: just the number, "12.4k" for a big one.)
const short = (n: number) => (n >= 10_000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n * 10) / 10));
const weekOf = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const percent = (change: number | null) => (change === null ? "—" : `${change >= 0 ? "+" : "−"}${Math.abs(Math.round(change * 100))}%`);

export function WebVolume({ onBack }: { onBack: () => void }) {
  const { colors: c } = useOrbitTheme();
  const { sessions, failed } = useFinishedSessions();
  const [metric, setMetric] = useState<Metric>("volume");
  const [span, setSpan] = useState<Span>("12");
  const [picked, setPicked] = useState<number | null>(null);

  const controls = (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <Segmented options={METRICS} value={metric} onChange={setMetric} />
      <Segmented
        options={SPANS}
        value={span}
        onChange={(s) => {
          setSpan(s);
          setPicked(null);
        }}
      />
    </View>
  );

  if (!sessions) {
    return (
      <OrbitPage>
        <WebPage maxWidth={1280}>
          <BackLink label="Progress" onPress={onBack} />
          <PageTitle title="Volume over time" subtitle="How much you've done, week by week" right={controls} />
          <Text style={{ fontSize: 14, color: c.muted }}>{failed ? "Couldn't load your workouts." : "Loading…"}</Text>
        </WebPage>
      </OrbitPage>
    );
  }

  const weeks = weeklyTotals(sessions, Number(span));
  const values = weeks.map((w) => valueOf(w, metric));
  const most = Math.max(1, ...values);
  const index = picked !== null && picked < weeks.length ? picked : weeks.length - 1;
  const week = weeks[index];
  const isThisWeek = index === weeks.length - 1;
  // The average over the weeks before this one that had any training.
  const earlier = weeks.slice(0, -1).filter((w) => w.workouts > 0);
  const average = earlier.length ? earlier.reduce((n, w) => n + valueOf(w, metric), 0) / earlier.length : null;
  const against = (w: WeekTotals) => (average ? (valueOf(w, metric) - average) / average : null);
  const change = against(week);
  const chartHeight = 260;
  const narrow = weeks.length > 12;

  return (
    <OrbitPage>
      <WebPage maxWidth={1280}>
        <BackLink label="Progress" onPress={onBack} />
        <PageTitle title="Volume over time" subtitle="How much you've done, week by week" right={controls} />

        <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
          {/* The weeks */}
          <Card title="Week by week" subtitle="Click a week for its numbers" style={{ flex: 1, minWidth: 0 }}>
            <View style={{ marginTop: 8, height: chartHeight + 18, flexDirection: "row", alignItems: "flex-end", gap: narrow ? 4 : 10 }}>
              {weeks.map((w, i) => {
                const v = values[i];
                const on = i === index;
                return (
                  <Pressable key={w.start.toISOString()} onPress={() => setPicked(i)} accessibilityRole="button" accessibilityLabel={`Week of ${weekOf(w.start)}: ${amount(v, metric)}`} style={{ flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center" }}>
                    {({ hovered }: Hover) => (
                      <>
                        {v > 0 && (
                          <Text numberOfLines={1} style={{ marginBottom: 3, fontSize: narrow ? 10 : 11, fontWeight: on ? "800" : "600", color: on ? c.ink : c.muted }}>
                            {short(v)}
                          </Text>
                        )}
                        <View style={{ width: "100%", maxWidth: 56, height: Math.max(v ? 4 : 2, (v / most) * chartHeight), borderRadius: narrow ? 3 : 6, backgroundColor: on ? c.ink : v ? c.faint : c.track, opacity: on || !v ? 1 : hovered ? 0.85 : 0.55 }} />
                      </>
                    )}
                  </Pressable>
                );
              })}
            </View>
            <View style={{ marginTop: 6, flexDirection: "row", gap: narrow ? 4 : 10, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 6 }}>
              {weeks.map((w, i) => (
                <Text key={w.start.toISOString()} numberOfLines={1} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: i === index ? "700" : "500", color: i === index ? c.ink : c.faint }}>
                  {i === weeks.length - 1 ? "Now" : !narrow || i % 2 === (weeks.length - 1) % 2 ? weekOf(w.start) : ""}
                </Text>
              ))}
            </View>
          </Card>

          {/* The picked week, against the average */}
          <View style={{ width: 340, gap: 12 }}>
            <Stat label={isThisWeek ? "This week" : `Week of ${weekOf(week.start)}`} value={amount(valueOf(week, metric), metric)} sub={`${week.workouts} workout${week.workouts === 1 ? "" : "s"} · ${week.sets} sets`} />
            <Stat label="Weekly average" value={average !== null ? amount(average, metric) : "—"} sub="Of the weeks before this one you trained in" />
            <Stat label={isThisWeek ? "This week, against it" : "That week, against it"} value={percent(change)} tone={change === null ? undefined : change >= 0 ? "good" : "bad"} />
            {metric === "volume" && <Text style={{ marginHorizontal: 4, fontSize: 12.5, lineHeight: 18, color: c.faint }}>Volume is weight × reps (and any weight added to bodyweight moves); help, holds and cardio aren&apos;t counted.</Text>}
          </View>
        </View>

        {/* Every week */}
        <Card title="Every week" subtitle="The latest first" padded={false}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 18, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border }}>
            <Text style={[head(c), { flex: 1 }]}>WEEK OF</Text>
            <Text style={[head(c), { width: 110, textAlign: "right" }]}>WORKOUTS</Text>
            <Text style={[head(c), { width: 110, textAlign: "right" }]}>SETS</Text>
            <Text style={[head(c), { width: 150, textAlign: "right" }]}>VOLUME</Text>
            <Text style={[head(c), { width: 140, textAlign: "right" }]}>AGAINST AVERAGE</Text>
          </View>
          {weeks
            .map((w, i) => ({ w, i }))
            .reverse()
            .map(({ w, i }) => {
              const on = i === index;
              const vs = w.workouts ? against(w) : null;
              return (
                <Pressable key={w.start.toISOString()} onPress={() => setPicked(i)} accessibilityRole="button" style={hoverable(({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 18, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: on ? c.pill : hovered ? c.canvas : "transparent" }))}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: on ? "700" : "600", color: c.text }}>{i === weeks.length - 1 ? `This week (${weekOf(w.start)})` : weekOf(w.start)}</Text>
                  <Text style={[cell(c), { width: 110 }]}>{w.workouts}</Text>
                  <Text style={[cell(c), { width: 110 }]}>{w.sets}</Text>
                  <Text style={[cell(c), { width: 150 }]}>{Math.round(w.volume).toLocaleString()} lbs</Text>
                  <Text style={[cell(c), { width: 140, fontWeight: "700", color: vs === null ? c.faint : vs >= 0 ? c.success : c.danger }]}>{percent(vs)}</Text>
                </Pressable>
              );
            })}
        </Card>
      </WebPage>
    </OrbitPage>
  );
}

const head = (c: OrbitColors) => ({ fontSize: 11, fontWeight: "700" as const, letterSpacing: 1, color: c.faint });
const cell = (c: OrbitColors) => ({ fontSize: 13.5, color: c.text, textAlign: "right" as const, fontVariant: ["tabular-nums" as const] });
