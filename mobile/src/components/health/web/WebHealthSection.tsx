import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { durationLabel } from "@/src/components/gym/schedule";
import { hasMeasures, type MetricDef } from "@/src/components/health/healthSections";
import { MetricChart } from "@/src/components/health/MetricChart";
import { AddReading, clock, dayOf, hm, metricSummary, sleepSummary, STAGES, useHealthSection, whenLabel, type Range } from "@/src/components/health/SectionParts";
import { toShown, UnitsToggle, useUnits, type UnitPage } from "@/src/components/health/units";
import { useWatchRatio } from "@/src/components/health/watchCorrection";
import { kcalLabel, mergeWorkouts } from "@/src/components/health/workouts";
import { Button, Card, Empty, hoverable, PageTitle, Row, Segmented, Stat, WebPage } from "@/src/components/web/ui";
import type { GymSessionRecord } from "@/src/services/gymApi";
import type { HealthMetric } from "@/src/services/healthSync";
import type { WeightEntry } from "@/src/services/weightEntryApi";
import { SECTION_PALETTE, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// A Health section in a desktop browser: over a week, a month, three or a
// year (beside the title), each of its readings in a grid of cards — the
// latest, the average, and a wider chart — with Add on those typed in.
// Sleep: last night and its stages beside the nights charted wide, then the
// nights as a table. Workouts: the totals, then the Watch's and Gym's
// together as a table, a Gym one opening its session.

type Hover = { hovered?: boolean };
const RANGES: { value: Range; label: string }[] = [
  { value: "1W", label: "Week" },
  { value: "1M", label: "Month" },
  { value: "3M", label: "3 months" },
  { value: "1Y", label: "Year" },
];

export function WebHealthSection() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const { colors: c } = useOrbitTheme();
  const { section, head, range, setRange, metrics, sessions, weights, load, from, to } = useHealthSection(id);
  const [adding, setAdding] = useState<MetricDef | null>(null);

  if (!head) {
    return (
      <WebPage>
        <PageTitle title="Health" />
        <Card>
          <Empty icon="help-circle-outline" text="There's no section here." />
        </Card>
      </WebPage>
    );
  }
  const page = id as UnitPage;

  return (
    <WebPage>
      <PageTitle
        title={head.title}
        subtitle={head.subtitle}
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Segmented options={RANGES} value={range} onChange={setRange} />
            {((section && hasMeasures(section)) || id === "workouts") && <UnitsToggle page={page} />}
          </View>
        }
      />

      {!metrics ? (
        <Text style={{ fontSize: 14, color: c.muted }}>Loading…</Text>
      ) : id === "sleep" ? (
        <Sleep metrics={metrics} from={from} to={to} colors={c} />
      ) : id === "workouts" ? (
        <Workouts metrics={metrics} sessions={sessions} weights={weights} from={from} colors={c} />
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
          {section!.metrics.map((def) => (
            <MetricCard key={def.type} def={def} page={page} metrics={metrics} from={from} to={to} onAdd={() => setAdding(def)} colors={c} />
          ))}
        </View>
      )}

      <AddReading
        def={adding}
        page={page}
        onClose={() => setAdding(null)}
        onSaved={() => {
          setAdding(null);
          load();
        }}
        colors={c}
      />
    </WebPage>
  );
}

// --- A reading: the latest, the average, the chart ---

function MetricCard({ def, page, metrics, from, to, onAdd, colors: c }: { def: MetricDef; page: UnitPage; metrics: HealthMetric[]; from: string; to: string; onAdd: () => void; colors: OrbitColors }) {
  const [units] = useUnits(page);
  const { unit, pair, latest, averageText, show, points } = metricSummary(def, metrics, from, to, units);
  return (
    <Card title={def.label} subtitle={def.hint} action={def.manual ? <Button label="Add" icon="add" onPress={onAdd} small /> : undefined} style={{ flexBasis: "40%", flexGrow: 1, minWidth: 400 }}>
      {latest ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Text style={{ fontSize: 28, fontWeight: "800", color: c.text }}>{show(latest.value, pair?.get(latest.date)?.value)}</Text>
            {!!unit && <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted }}>{unit}</Text>}
            <Text style={{ marginLeft: "auto", fontSize: 12.5, color: c.muted }}>{whenLabel(latest.date)}</Text>
          </View>
          {averageText != null && <Text style={{ marginTop: 1, fontSize: 12.5, color: c.muted }}>{averageText}</Text>}
          {points.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              <MetricChart points={points} from={from} to={to} bars={def.total} height={180} />
            </View>
          ) : (
            <Text style={{ marginTop: 10, fontSize: 13, color: c.faint }}>Nothing in this time.</Text>
          )}
        </>
      ) : (
        <Text style={{ fontSize: 13.5, lineHeight: 19, color: c.muted }}>{def.manual ? "Add a reading, or it'll come from Apple Health once your phone's connected it." : "Comes from Apple Health once your phone's connected it."}</Text>
      )}
    </Card>
  );
}

// --- Sleep: last night, its stages, the nights over time ---

function Sleep({ metrics, from, to, colors: c }: { metrics: HealthMetric[]; from: string; to: string; colors: OrbitColors }) {
  const { last, inRange, avg, avgStage, stagesTotal } = sleepSummary(metrics, from, to);
  if (!last) {
    return (
      <Card>
        <Empty icon="moon-outline" text="Your nights come from Apple Health once it's connected — sleep with your Watch on, or set up Sleep on your iPhone." />
      </Card>
    );
  }
  // The nights in the time chosen, newest first (a month's at most).
  const shown = inRange.slice(0, 31);

  return (
    <>
      <Row>
        <Card title={last.date === dayOf(new Date()) ? "Last night" : whenLabel(last.date)} style={{ flex: 1, minWidth: 320 }}>
          <Text style={{ fontSize: 32, fontWeight: "800", color: c.text }}>{hm(last.value)}</Text>
          <Text style={{ fontSize: 13, color: c.muted }}>
            asleep · {clock(last.start)} – {clock(last.end)}
          </Text>
          {stagesTotal > 0 && (
            <>
              <View style={{ marginTop: 14, flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden", backgroundColor: c.track }}>
                {STAGES.map((st) => {
                  const v = last.detail?.[st.key] ?? 0;
                  return v ? <View key={st.key} style={{ flex: v, backgroundColor: c.fill, opacity: st.opacity }} /> : null;
                })}
              </View>
              <View style={{ marginTop: 12, gap: 6 }}>
                {STAGES.map((st) => (
                  <View key={st.key} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c.fill, opacity: st.opacity }} />
                    <Text style={{ flex: 1, fontSize: 13, color: c.muted }}>{st.label}</Text>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: c.text, fontVariant: ["tabular-nums"] }}>{hm(last.detail?.[st.key] ?? 0)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </Card>

        <Card title="Hours asleep" subtitle={avg != null ? `Average ${hm(avg)} a night${avgStage("deep") ? ` · deep ${hm(avgStage("deep"))}, REM ${hm(avgStage("rem"))}` : ""}` : undefined} style={{ flex: 2.2, minWidth: 520 }}>
          <MetricChart points={inRange.map((n) => ({ date: n.date, value: Math.round((n.value / 60) * 10) / 10 }))} from={from} to={to} bars height={240} />
        </Card>
      </Row>

      {shown.length > 0 && (
        <Card title="Nights" subtitle={inRange.length > shown.length ? `The latest ${shown.length} of ${inRange.length}` : undefined} padded={false}>
          <TableHead columns={[["Night", 1.4], ["Asleep", 1], ["Bed – wake", 1.4], ...STAGES.map((st) => [st.label, 1] as [string, number])]} colors={c} />
          {shown.map((n, i) => (
            <View key={n.date} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
              <Text style={{ flex: 1.4, fontSize: 13.5, fontWeight: "600", color: c.text }}>{whenLabel(n.date)}</Text>
              <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "700", color: c.text, fontVariant: ["tabular-nums"] }}>{hm(n.value)}</Text>
              <Text style={{ flex: 1.4, fontSize: 13, color: c.muted, fontVariant: ["tabular-nums"] }}>{n.start ? `${clock(n.start)} – ${clock(n.end)}` : "—"}</Text>
              {STAGES.map((st) => (
                <Text key={st.key} style={{ flex: 1, fontSize: 13, color: n.detail?.[st.key] ? c.text : c.faint, fontVariant: ["tabular-nums"] }}>
                  {n.detail?.[st.key] ? hm(n.detail[st.key]) : "—"}
                </Text>
              ))}
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

// --- Workouts: the Watch's and Gym's, by day ---

function Workouts({ metrics, sessions, weights, from, colors: c }: { metrics: HealthMetric[]; sessions: GymSessionRecord[]; weights: WeightEntry[]; from: string; colors: OrbitColors }) {
  const router = useRouter();
  const [units] = useUnits("workouts");
  const ratio = useWatchRatio();
  const items = mergeWorkouts(metrics, sessions, from, weights, ratio);
  const minutes = items.reduce((s, w) => s + w.minutes, 0);

  return (
    <>
      <Row>
        <Stat label="Workouts" value={String(items.length)} icon="fitness" />
        <Stat label="Time" value={durationLabel(minutes * 60)} icon="time-outline" />
        <Stat label="Active" value={kcalLabel(items) ?? "—"} icon="flame-outline" />
      </Row>
      <Card title="Workouts" padded={false}>
        {items.length === 0 ? (
          <Empty icon="fitness-outline" text="Your Watch's workouts come from Apple Health once it's connected; Gym's show here as you finish them." />
        ) : (
          <>
            <TableHead columns={[["Workout", 2.4], ["When", 1.3], ["Time", 1], ["Calories", 1], ["Distance", 1]]} lead={34} trail={16} colors={c} />
            {items.map((w, i) => (
              <Pressable
                key={w.key}
                onPress={w.gym ? () => router.push(`/gym/sessions/${w.gym}` as Href) : undefined}
                disabled={!w.gym}
                accessibilityRole={w.gym ? "link" : undefined}
                style={hoverable(({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: c.border, backgroundColor: hovered && w.gym ? c.pill : "transparent" }))}
              >
                <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: w.gym ? SECTION_PALETTE.gym.base : c.fill }}>
                  <Ionicons name={w.gym ? "barbell" : "fitness"} size={18} color="#FFFFFF" />
                </View>
                <View style={{ flex: 2.4 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }} numberOfLines={1}>
                    {w.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: c.faint }}>{w.gym ? "Gym" : "Watch"}</Text>
                </View>
                <Text style={{ flex: 1.3, fontSize: 13, color: c.muted }}>{whenLabel(w.date)}</Text>
                <Text style={{ flex: 1, fontSize: 13, color: c.text, fontVariant: ["tabular-nums"] }}>{durationLabel(w.minutes * 60)}</Text>
                <Text style={{ flex: 1, fontSize: 13, color: w.kcal ? c.text : c.faint, fontVariant: ["tabular-nums"] }}>{w.kcal ? `${w.estimated ? "~" : ""}${w.kcal.toLocaleString()} kcal` : "—"}</Text>
                <Text style={{ flex: 1, fontSize: 13, color: w.km ? c.text : c.faint, fontVariant: ["tabular-nums"] }}>{w.km ? `${Math.round(toShown("distance", w.km, units) * 100) / 100} ${units === "metric" ? "km" : "mi"}` : "—"}</Text>
                <View style={{ width: 16 }}>{w.gym && <Ionicons name="chevron-forward" size={16} color={c.faint} />}</View>
              </Pressable>
            ))}
          </>
        )}
      </Card>
    </>
  );
}

// A table's column headings, spaced as its rows are (`lead`/`trail`: room
// for an icon before, a chevron after).
function TableHead({ columns, lead, trail, colors: c }: { columns: [string, number][]; lead?: number; trail?: number; colors: OrbitColors }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.border, backgroundColor: c.canvas }}>
      {!!lead && <View style={{ width: lead }} />}
      {columns.map(([label, flex]) => (
        <Text key={label} style={{ flex, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, color: c.faint }}>
          {label.toUpperCase()}
        </Text>
      ))}
      {!!trail && <View style={{ width: trail }} />}
    </View>
  );
}
