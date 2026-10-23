import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { durationLabel } from "@/src/components/gym/schedule";
import { hasMeasures, type MetricDef } from "@/src/components/health/healthSections";
import { toShown, UnitsToggle, useUnits, type UnitPage } from "@/src/components/health/units";
import { MetricChart } from "@/src/components/health/MetricChart";
import { AddReading, clock, dayOf, hm, metricSummary, RANGE_DAYS, sleepSummary, STAGES, useHealthSection, whenLabel, type Range } from "@/src/components/health/SectionParts";
import { useWatchRatio } from "@/src/components/health/watchCorrection";
import { WebHealthSection } from "@/src/components/health/web/WebHealthSection";
import { kcalLabel, mergeWorkouts } from "@/src/components/health/workouts";
import { PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { Tap } from "@/src/components/ui/Tap";
import type { GymSessionRecord } from "@/src/services/gymApi";
import type { WeightEntry } from "@/src/services/weightEntryApi";
import type { HealthMetric } from "@/src/services/healthSync";
import { OrbitPage, OrbitSection, SECTION_PALETTE, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// One of Health's sections (healthSections.ts): each of its readings — the
// latest, the average, and a chart over a week, a month, three or a year —
// from Apple Health, or typed in (Add). Sleep (each night, its stages) and
// Workouts (the Watch's and Gym's together) have their own. In Health's
// colour, in imperial or metric (the page's own switch, beside the title,
// where it matters). (A desktop browser: the readings in a grid, the
// charts wider — WebHealthSection.)
// (`id`: activity, body, heart, vitals, mind, drinks, sleep, workouts.)

export default function HealthSectionScreen() {
  const wide = useWideWeb();
  return (
    <OrbitSection section="health">
      <OrbitPage>{wide ? <WebHealthSection /> : <SectionPage />}</OrbitPage>
    </OrbitSection>
  );
}

function SectionPage() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const leave = useGoBack("/health-section");
  const { colors: c } = useOrbitTheme();
  // (Its readings over the time chosen: SectionParts.)
  const { section, head, range, setRange, metrics, sessions, weights, load, from, to } = useHealthSection(id);
  const [adding, setAdding] = useState<MetricDef | null>(null);

  if (!head) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas, padding: 16 }}>
        <PageHeader title="Health" onBack={leave} />
        <Text style={{ marginTop: 24, color: c.muted }}>There&apos;s no section here.</Text>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <PageHeader title={head.title} subtitle={head.subtitle} onBack={leave} action={(section && hasMeasures(section)) || id === "workouts" ? <UnitsToggle page={id as UnitPage} /> : undefined} />

        <View style={{ marginTop: 16, flexDirection: "row", gap: 6 }}>
          {(Object.keys(RANGE_DAYS) as Range[]).map((r) => {
            const on = r === range;
            return (
              <Tap key={r} onPress={() => setRange(r)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 10, backgroundColor: on ? c.ink : c.pill }} pressedStyle={{ opacity: 0.75 }}>
                <Text style={{ fontSize: 13.5, fontWeight: "700", color: on ? c.onInk : c.onPill }}>{r}</Text>
              </Tap>
            );
          })}
        </View>

        {!metrics ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={c.muted} />
        ) : id === "sleep" ? (
          <Sleep metrics={metrics} from={from} to={to} colors={c} />
        ) : id === "workouts" ? (
          <Workouts metrics={metrics} sessions={sessions} weights={weights} from={from} colors={c} />
        ) : (
          section!.metrics.map((def) => <MetricCard key={def.type} def={def} page={id as UnitPage} metrics={metrics} from={from} to={to} onAdd={() => setAdding(def)} colors={c} />)
        )}
      </ScrollView>
      <AddReading
        def={adding}
        page={id as UnitPage}
        onClose={() => setAdding(null)}
        onSaved={() => {
          setAdding(null);
          load();
        }}
        colors={c}
      />
    </SafeAreaView>
  );
}

// --- A reading: the latest, the average, the chart ---

function MetricCard({ def, page, metrics, from, to, onAdd, colors: c }: { def: MetricDef; page: UnitPage; metrics: HealthMetric[]; from: string; to: string; onAdd: () => void; colors: OrbitColors }) {
  const [units] = useUnits(page);
  const { unit, pair, latest, averageText, show, points } = metricSummary(def, metrics, from, to, units);

  return (
    <View style={{ marginTop: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }}>{def.label}</Text>
          {!!def.hint && <Text style={{ marginTop: 1, fontSize: 12, color: c.faint }}>{def.hint}</Text>}
        </View>
        {def.manual && (
          <Tap onPress={onAdd} accessibilityRole="button" accessibilityLabel={`Add ${def.label}`} style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
            <Ionicons name="add" size={15} color={c.onPill} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: c.onPill }}>Add</Text>
          </Tap>
        )}
      </View>
      {latest ? (
        <>
          <View style={{ marginTop: 8, flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Text style={{ fontSize: 26, fontWeight: "800", color: c.text }}>{show(latest.value, pair?.get(latest.date)?.value)}</Text>
            {!!unit && <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted }}>{unit}</Text>}
            <Text style={{ marginLeft: "auto", fontSize: 12.5, color: c.muted }}>{whenLabel(latest.date)}</Text>
          </View>
          {averageText != null && <Text style={{ marginTop: 1, fontSize: 12.5, color: c.muted }}>{averageText}</Text>}
          {points.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              <MetricChart points={points} from={from} to={to} bars={def.total} />
            </View>
          ) : (
            <Text style={{ marginTop: 8, fontSize: 13, color: c.faint }}>Nothing in this time.</Text>
          )}
        </>
      ) : (
        <Text style={{ marginTop: 8, fontSize: 13.5, lineHeight: 19, color: c.muted }}>{def.manual ? "Add a reading, or it'll come from Apple Health once it's connected." : "Comes from Apple Health once it's connected."}</Text>
      )}
    </View>
  );
}

// --- Sleep: last night, its stages, the nights over time ---

function Sleep({ metrics, from, to, colors: c }: { metrics: HealthMetric[]; from: string; to: string; colors: OrbitColors }) {
  const { last, inRange, avg, avgStage, stagesTotal } = sleepSummary(metrics, from, to);

  if (!last) return <Text style={{ marginTop: 20, fontSize: 14, lineHeight: 20, color: c.muted }}>Your nights come from Apple Health once it&apos;s connected — sleep with your Watch on, or set up Sleep on your iPhone.</Text>;

  return (
    <>
      <View style={{ marginTop: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
        <Text style={{ fontSize: 12.5, fontWeight: "600", color: c.muted }}>{last.date === dayOf(new Date()) ? "Last night" : whenLabel(last.date)}</Text>
        <Text style={{ marginTop: 2, fontSize: 30, fontWeight: "800", color: c.text }}>{hm(last.value)}</Text>
        <Text style={{ fontSize: 13, color: c.muted }}>
          asleep · {clock(last.start)} – {clock(last.end)}
        </Text>
        {stagesTotal > 0 && (
          <>
            <View style={{ marginTop: 12, flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", backgroundColor: c.track }}>
              {STAGES.map((st) => {
                const v = last.detail?.[st.key] ?? 0;
                return v ? <View key={st.key} style={{ flex: v, backgroundColor: c.fill, opacity: st.opacity }} /> : null;
              })}
            </View>
            <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {STAGES.map((st) => (
                <View key={st.key} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: c.fill, opacity: st.opacity }} />
                  <Text style={{ fontSize: 12.5, color: c.muted }}>
                    {st.label} <Text style={{ fontWeight: "700", color: c.text }}>{hm(last.detail?.[st.key] ?? 0)}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      <View style={{ marginTop: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }}>Hours asleep</Text>
        {avg != null && (
          <Text style={{ marginTop: 2, fontSize: 12.5, color: c.muted }}>
            Average {hm(avg)} a night{avgStage("deep") ? ` · deep ${hm(avgStage("deep"))}, REM ${hm(avgStage("rem"))}` : ""}
          </Text>
        )}
        <View style={{ marginTop: 10 }}>
          <MetricChart points={inRange.map((n) => ({ date: n.date, value: Math.round((n.value / 60) * 10) / 10 }))} from={from} to={to} bars />
        </View>
      </View>
    </>
  );
}

// --- Workouts: the Watch's and Gym's, by day ---

// Strength workouts (traditional and functional): the kind a Gym session is.
function Workouts({ metrics, sessions, weights, from, colors: c }: { metrics: HealthMetric[]; sessions: GymSessionRecord[]; weights: WeightEntry[]; from: string; colors: OrbitColors }) {
  const router = useRouter();
  const [units] = useUnits("workouts");
  const ratio = useWatchRatio();
  const items = mergeWorkouts(metrics, sessions, from, weights, ratio);
  const minutes = items.reduce((s, w) => s + w.minutes, 0);

  return (
    <>
      <View style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
        {[
          { label: "Workouts", value: String(items.length) },
          { label: "Time", value: durationLabel(minutes * 60) },
          { label: "Active", value: kcalLabel(items) ?? "—" },
        ].map((f) => (
          <View key={f.label} style={{ flex: 1, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
            <Text style={{ fontSize: 12, color: c.muted }}>{f.label}</Text>
            <Text style={{ marginTop: 2, fontSize: 17, fontWeight: "800", color: c.text }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {f.value}
            </Text>
          </View>
        ))}
      </View>
      {items.length === 0 ? (
        <Text style={{ marginTop: 20, fontSize: 14, lineHeight: 20, color: c.muted }}>Your Watch&apos;s workouts come from Apple Health once it&apos;s connected; Gym&apos;s show here as you finish them.</Text>
      ) : (
        <View style={{ marginTop: 12, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }}>
          {items.map((w, i) => (
            <Tap key={w.key} onPress={w.gym ? () => router.push(`/gym/sessions/${w.gym}` as Href) : undefined} disabled={!w.gym} accessibilityRole={w.gym ? "button" : undefined} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }} pressedStyle={{ backgroundColor: c.pill }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: w.gym ? SECTION_PALETTE.gym.base : c.fill }}>
                <Ionicons name={w.gym ? "barbell" : "fitness"} size={18} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: c.text }} numberOfLines={1}>
                  {w.name}
                </Text>
                <Text style={{ marginTop: 1, fontSize: 12.5, color: c.muted }}>
                  {whenLabel(w.date)} · {durationLabel(w.minutes * 60)}
                  {w.kcal ? ` · ${w.estimated ? "~" : ""}${w.kcal.toLocaleString()} kcal` : ""}
                  {w.km ? ` · ${Math.round(toShown("distance", w.km, units) * 100) / 100} ${units === "metric" ? "km" : "mi"}` : ""}
                  {w.gym ? " · Gym" : ""}
                </Text>
              </View>
              {w.gym && <Ionicons name="chevron-forward" size={16} color={c.faint} />}
            </Tap>
          ))}
        </View>
      )}
    </>
  );
}
