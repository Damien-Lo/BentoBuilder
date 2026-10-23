import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { durationLabel } from "@/src/components/gym/schedule";
import { DayPlan } from "@/src/components/health/EnergyCard";
import { todayBalance, type Balance, type Energy } from "@/src/components/health/energy";
import { MetricChart } from "@/src/components/health/MetricChart";
import { fit, workOutTargets, type Aim, type Burn, type Target } from "@/src/components/health/targets";
import { showMeasure, toShown, useUnits } from "@/src/components/health/units";
import { WeightChart } from "@/src/components/health/WeightChart";
import { kcalLabel, mergeWorkouts, type WorkoutItem } from "@/src/components/health/workouts";
import { Card, CardLink, hoverable, PageTitle, Row, WebPage } from "@/src/components/web/ui";
import { getSessions } from "@/src/services/gymApi";
import { loadHealthInputs, type HealthInputs } from "@/src/services/healthInputs";
import { getHealthMetrics, type HealthMetric } from "@/src/services/healthSync";
import { useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Health in a desktop browser: everything at a glance, each card opening its
// page — today's energy (budget, eaten, burned, and the day as a whole), your
// weight toward your goal, how you move (steps and exercise), your heart
// (resting rate and variability), your sleep, this week's workouts (Gym and
// the Watch, with their calories), your burn (measured, and the Watch's
// correction), your targets (how personal, what's suggested), and the rest
// of Health a click away. From what your phone syncs from Apple Health.

type Hover = { hovered?: boolean };
const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n: number) => dayOf(new Date(Date.now() - n * 86_400_000));
const n0 = (n: number) => Math.round(n).toLocaleString();
const hm = (minutes: number) => `${Math.floor(minutes / 60)}h ${pad(Math.round(minutes % 60))}m`;

type Data = {
  inputs: HealthInputs;
  heart: HealthMetric[];
  energy: Energy;
  burn: Burn;
  aim: Aim;
  targets: Target[];
  balance: Balance;
  suggested: number;
  workouts: WorkoutItem[];
};

export function WebHealthDashboard() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const [units] = useUnits("weight");
  const [data, setData] = useState<Data | null>(null);
  const go = (path: string) => router.push(path as Href);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadHealthInputs(), getHealthMetrics(["restingHeartRate", "hrv", "vo2max"], daysAgo(30)).catch(() => [] as HealthMetric[]), getSessions().catch(() => [])])
        .then(([inputs, heart, sessions]) => {
          const { targets, energy, burn, aim } = workOutTargets({ ...inputs, workoutsPerWeek: [], units });
          const cal = targets.find((t) => t.key === "calories")!;
          const monday = daysAgo((new Date().getDay() + 6) % 7);
          setData({
            inputs,
            heart,
            energy,
            burn,
            aim,
            targets,
            balance: todayBalance(energy, cal.current ?? cal.value, burn.value),
            suggested: cal.value,
            workouts: mergeWorkouts(inputs.metrics, sessions, monday, inputs.weights, energy.ratio),
          });
        })
        .catch(() => {});
    }, [units]),
  );

  if (!data) {
    return (
      <WebPage>
        <PageTitle title="Health" subtitle="Your body, what you eat, and how you're doing" />
        <Text style={{ fontSize: 14, color: c.muted }}>Loading…</Text>
      </WebPage>
    );
  }

  const { inputs, heart, energy, burn, aim, targets, balance: b, suggested, workouts } = data;
  const today = inputs.today;
  const of = (type: string, days: number) => inputs.metrics.filter((m) => m.type === type && m.date >= daysAgo(days)).sort((x, y) => x.date.localeCompare(y.date));
  const W = (kg: number, places = 1) => showMeasure("weight", kg, units, places);

  // Weight: the latest, a week's change, and toward the goal.
  const weights = [...inputs.weights].sort((x, y) => x.date.localeCompare(y.date));
  const latest = weights[weights.length - 1] ?? null;
  const weekAgo = [...weights].reverse().find((w) => w.date <= daysAgo(7)) ?? null;
  const change = latest && weekAgo ? latest.weight - weekAgo.weight : null;
  const eta = aim.weeks != null ? new Date(Date.now() + aim.weeks * 7 * 86_400_000).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;

  // Activity, heart, sleep.
  const steps = of("steps", 14);
  const stepsToday = steps.find((m) => m.date === today)?.value ?? null;
  const stepsTarget = targets.find((t) => t.key === "steps");
  const monday = daysAgo((new Date().getDay() + 6) % 7);
  const exerciseWeek = inputs.metrics.filter((m) => m.type === "exerciseMinutes" && m.date >= monday).reduce((s, m) => s + m.value, 0);
  const exerciseTarget = targets.find((t) => t.key === "exercise");
  const rhr = heart.filter((m) => m.type === "restingHeartRate").sort((x, y) => x.date.localeCompare(y.date));
  const hrv = heart.filter((m) => m.type === "hrv").sort((x, y) => x.date.localeCompare(y.date));
  const vo2 = heart.filter((m) => m.type === "vo2max").sort((x, y) => x.date.localeCompare(y.date));
  const sleep = of("sleep", 14);
  const lastNight = sleep.length && sleep[sleep.length - 1].date >= daysAgo(1) ? sleep[sleep.length - 1].value : null;
  const sleepWeek = sleep.filter((m) => m.date >= daysAgo(7));
  const sleepAvg = sleepWeek.length ? sleepWeek.reduce((s, m) => s + m.value, 0) / sleepWeek.length : null;
  const sleepTarget = targets.find((t) => t.key === "sleep");

  // Targets: how personal, and what's suggested.
  const personal = targets.filter((t) => fit(t) !== "guideline");
  const yours = personal.filter((t) => fit(t) === "yours").length;
  const differs = targets.filter((t) => t.current != null && Math.abs(t.value - t.current) / t.value > 0.04);

  const big = (value: string, unit: string, tone?: string) => (
    <Text style={{ fontSize: 30, fontWeight: "800", color: tone ?? c.text }}>
      {value} <Text style={{ fontSize: 14, fontWeight: "600", color: c.muted }}>{unit}</Text>
    </Text>
  );
  const quiet = (text: string) => <Text style={{ marginTop: 4, fontSize: 12.5, lineHeight: 18, color: c.muted }}>{text}</Text>;
  const over = b.left < 0;

  return (
    <WebPage>
      <PageTitle title="Health" subtitle="Your body, what you eat, and how you're doing — from what your phone syncs from Apple Health" />

      <Row>
        {/* Today's energy */}
        <Card title="Today's energy" action={<CardLink label="Your burn" onPress={() => go("/health/burn")} />} style={{ flex: 1.4, minWidth: 420 }}>
          {big(n0(Math.abs(b.left)), `kcal ${over ? "over" : "left"}`, over ? c.danger : undefined)}
          <View style={{ marginTop: 10, height: 8, borderRadius: 4, backgroundColor: c.track, overflow: "hidden" }}>
            <View style={{ width: `${Math.min(1, b.eaten / b.allowed) * 100}%`, height: "100%", borderRadius: 4, backgroundColor: over ? c.danger : c.fill }} />
          </View>
          <View style={{ marginTop: 14, flexDirection: "row" }}>
            <Figure label={b.extra ? `Budget (+${n0(b.extra)} active)` : "Budget"} value={n0(b.allowed)} colors={c} />
            <Figure label="Eaten" value={n0(b.eaten)} colors={c} />
            <Figure label={b.burned != null ? "Burned so far" : "Burned · no data today"} value={b.burned != null ? n0(b.burned) : "—"} colors={c} />
          </View>
          <DayPlan balance={b} suggested={suggested} aim={aim} units={units} colors={c} />
        </Card>

        {/* Weight */}
        <Card title="Weight" action={<CardLink label="Weight" onPress={() => go("/health/weight")} />} style={{ flex: 1, minWidth: 340 }}>
          {latest ? big(W(latest.weight).replace(/ \w+$/, ""), units === "metric" ? "kg" : "lbs") : big("—", "")}
          {quiet(
            [change != null ? `${change <= 0 ? "−" : "+"}${W(Math.abs(change))} this week` : null, aim.goalKg != null ? `goal ${W(aim.goalKg)}` : null, eta ? `there around ${eta}` : null].filter(Boolean).join(" · ") || "No weigh-ins yet",
          )}
          {weights.length > 1 && (
            <View style={{ marginTop: 12 }}>
              <WeightChart points={weights.filter((w) => w.date >= daysAgo(30)).map((w) => ({ date: w.date, weight: Math.round(toShown("weight", w.weight, units) * 10) / 10 }))} goal={aim.goalKg != null ? Math.round(toShown("weight", aim.goalKg, units) * 10) / 10 : null} height={150} />
            </View>
          )}
        </Card>
      </Row>

      <Row>
        {/* Activity */}
        <Card title="Activity" action={<CardLink label="Activity" onPress={() => go("/health/section/activity")} />} style={{ flex: 1, minWidth: 300 }}>
          {big(stepsToday != null ? n0(stepsToday) : "—", "steps today")}
          {quiet(`${stepsTarget ? `Target ${n0(stepsTarget.current ?? stepsTarget.value)}` : ""} · exercise ${n0(exerciseWeek)} of ${n0(exerciseTarget?.current ?? exerciseTarget?.value ?? 150)} min this week`)}
          {steps.length > 1 && (
            <View style={{ marginTop: 10 }}>
              <MetricChart points={steps.map((m) => ({ date: m.date, value: m.value }))} from={daysAgo(13)} to={today} bars height={110} />
            </View>
          )}
        </Card>

        {/* Heart */}
        <Card title="Heart" action={<CardLink label="Heart" onPress={() => go("/health/section/heart")} />} style={{ flex: 1, minWidth: 300 }}>
          {big(rhr.length ? n0(rhr[rhr.length - 1].value) : "—", "bpm at rest")}
          {quiet([hrv.length ? `HRV ${n0(hrv[hrv.length - 1].value)} ms` : null, vo2.length ? `VO₂ max ${vo2[vo2.length - 1].value.toFixed(1)}` : null].filter(Boolean).join(" · ") || "From your Watch")}
          {rhr.length > 1 && (
            <View style={{ marginTop: 10 }}>
              <MetricChart points={rhr.map((m) => ({ date: m.date, value: m.value }))} from={daysAgo(29)} to={today} height={110} />
            </View>
          )}
        </Card>

        {/* Sleep */}
        <Card title="Sleep" action={<CardLink label="Sleep" onPress={() => go("/health/section/sleep")} />} style={{ flex: 1, minWidth: 300 }}>
          {big(lastNight != null ? hm(lastNight) : "—", "last night")}
          {quiet(sleepAvg != null ? `${hm(sleepAvg)} on average this week (${sleepWeek.length} night${sleepWeek.length === 1 ? "" : "s"}) · target ${hm(sleepTarget?.current ?? sleepTarget?.value ?? 480)}` : "No nights tracked lately — wear your Watch to bed.")}
          {sleep.length > 1 && (
            <View style={{ marginTop: 10 }}>
              <MetricChart points={sleep.map((m) => ({ date: m.date, value: Math.round(m.value) }))} from={daysAgo(13)} to={today} bars height={110} />
            </View>
          )}
        </Card>
      </Row>

      <Row>
        {/* This week's workouts */}
        <Card title="Workouts this week" subtitle={workouts.length ? `${workouts.length} · ${durationLabel(workouts.reduce((s, w) => s + w.minutes, 0) * 60)}${kcalLabel(workouts) ? ` · ${kcalLabel(workouts)}` : ""}` : undefined} action={<CardLink label="Workouts" onPress={() => go("/health/section/workouts")} />} style={{ flex: 1, minWidth: 340 }}>
          {workouts.length === 0 && quiet("None yet this week.")}
          {workouts.slice(0, 6).map((w) => (
            <Pressable key={w.key} onPress={() => w.gym && go(`/gym/sessions/${w.gym}`)} disabled={!w.gym} style={hoverable(({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, paddingHorizontal: 6, borderRadius: 8, backgroundColor: hovered && w.gym ? c.pill : "transparent" }))}>
              <Ionicons name={w.gym ? "barbell" : "walk"} size={16} color={c.ink} />
              <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "600", color: c.text }} numberOfLines={1}>
                {w.name}
              </Text>
              <Text style={{ fontSize: 12.5, color: c.muted }}>
                {new Date(`${w.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })} · {durationLabel(w.minutes * 60)}
                {w.kcal ? ` · ${w.estimated ? "~" : ""}${n0(w.kcal)} kcal` : ""}
              </Text>
            </Pressable>
          ))}
        </Card>

        {/* Your burn */}
        <Card title="Your burn" action={<CardLink label="How it's worked out" onPress={() => go("/health/burn")} />} style={{ flex: 1, minWidth: 300 }}>
          {big(n0(burn.value), "kcal a day")}
          {quiet(burn.how === "measured" ? `Measured from 4 weeks of food and weigh-ins (${energy.completeDays} full days, ${energy.weighIns} weigh-ins)` : burn.how === "blending" ? `Calibrating: ${Math.round((burn.share ?? 0) * 100)}% measured so far` : burn.how === "apple" ? "From your Watch, until it's measured" : "Estimated from About you")}
          {energy.ratio != null && quiet(`Your Watch reads ${Math.round(Math.abs(energy.ratio - 1) * 100)}% ${energy.ratio > 1 ? "low" : "high"} — corrected ×${energy.ratio.toFixed(2)}`)}
          {energy.check && quiet(`Last 7 days: predicted ${energy.check.predicted <= 0 ? "−" : "+"}${W(Math.abs(energy.check.predicted))}, your weight did ${energy.check.actual <= 0 ? "−" : "+"}${W(Math.abs(energy.check.actual))}`)}
        </Card>

        {/* Your targets */}
        <Card title="Your Targets" action={<CardLink label="Your Targets" onPress={() => go("/health/targets")} />} style={{ flex: 1, minWidth: 300 }}>
          {big(`${yours} of ${personal.length}`, "from your data")}
          {differs.length ? quiet("Suggested changes:") : quiet("Your targets match what's suggested.")}
          {differs.slice(0, 4).map((t) => (
            <View key={t.key} style={{ marginTop: 4, flexDirection: "row" }}>
              <Text style={{ flex: 1, fontSize: 13, color: c.text }}>{t.label}</Text>
              <Text style={{ fontSize: 13, color: c.muted }}>
                {n0(t.current!)} → <Text style={{ fontWeight: "700", color: c.ink }}>{n0(t.value)}</Text> {t.unit}
              </Text>
            </View>
          ))}
        </Card>
      </Row>

      {/* The rest of Health */}
      <Card title="More">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(
            [
              ["About you", "person", "/health/about"],
              ["Body measurements", "body", "/health/section/body"],
              ["Vitals", "pulse", "/health/section/vitals"],
              ["Mind", "happy", "/health/section/mind"],
              ["Water & caffeine", "water", "/health/section/drinks"],
              ["Nutrition", "leaf", "/health"],
              ["All nutrients", "list", "/health/nutrients"],
              ["Weekly report", "bar-chart", "/health/weekly-report"],
            ] as const
          ).map(([label, icon, path]) => (
            <Pressable key={path} onPress={() => go(path)} style={hoverable(({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: hovered ? c.track : c.pill }))}>
              <Ionicons name={icon} size={15} color={c.ink} />
              <Text style={{ fontSize: 13.5, fontWeight: "600", color: c.onPill }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>
    </WebPage>
  );
}

function Figure({ label, value, colors: c }: { label: string; value: string; colors: OrbitColors }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 20, fontWeight: "800", color: c.text, fontVariant: ["tabular-nums"] }}>{value}</Text>
      <Text style={{ marginTop: 2, fontSize: 12, color: c.muted }}>{label}</Text>
    </View>
  );
}

