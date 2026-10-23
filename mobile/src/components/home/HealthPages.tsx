import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView } from "react-native-gesture-handler";
import { Text, View } from "react-native";

import { durationLabel } from "@/src/components/gym/schedule";
import { todayBalance, type Balance } from "@/src/components/health/energy";
import { workOutTargets } from "@/src/components/health/targets";
import { showMeasure, useUnits } from "@/src/components/health/units";
import { mergeWorkouts, type WorkoutItem } from "@/src/components/health/workouts";
import { Tap } from "@/src/components/ui/Tap";
import { getSessions } from "@/src/services/gymApi";
import { loadHealthInputs } from "@/src/services/healthInputs";
import { nutrientColor } from "@/src/theme/nutrients";
import { useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

import type { Today } from "./useToday";

// The home screen's Health card, a page at a time — swiped across, the dots
// saying where you are: Overview (today's energy and your weight),
// Nutrition (today's calories and macros), Workouts (this week's — Gym and
// the Watch together) and Sleep (last night). A page, tapped, opens its
// page in Health — the section's own pages, without anything more on the
// home screen.

const n0 = (n: number) => Math.round(n).toLocaleString();
const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (minutes: number) => `${Math.floor(minutes / 60)}h ${pad(Math.round(minutes % 60))}m`;

type Glance = {
  balance: Balance;
  workouts: WorkoutItem[]; // this week, newest first
  lastNight: number | null; // minutes asleep
  week: number | null; // the last 7 nights' average
  nights: number;
  sleepTarget: number;
};

export function HealthPages({ t, go, colors: c }: { t: Today; go: (route: Href) => void; colors: OrbitColors }) {
  const { dark } = useOrbitTheme();
  const [units] = useUnits("weight");
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const [g, setG] = useState<Glance | null>(null);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadHealthInputs(), getSessions().catch(() => [])])
        .then(([inputs, sessions]) => {
          const { targets, energy, burn } = workOutTargets({ ...inputs, workoutsPerWeek: [], units });
          const cal = targets.find((x) => x.key === "calories")!;
          const monday = dayOf(new Date(Date.now() - ((new Date().getDay() + 6) % 7) * 86_400_000));
          const sleep = inputs.metrics.filter((m) => m.type === "sleep").sort((a, b) => b.date.localeCompare(a.date));
          const recent = sleep.filter((m) => m.date >= dayOf(new Date(Date.now() - 7 * 86_400_000)));
          const yesterday = dayOf(new Date(Date.now() - 86_400_000));
          setG({
            balance: todayBalance(energy, cal.current ?? cal.value, burn.value),
            workouts: mergeWorkouts(inputs.metrics, sessions, monday),
            lastNight: sleep[0] && sleep[0].date >= yesterday ? sleep[0].value : null,
            week: recent.length ? recent.reduce((s, m) => s + m.value, 0) / recent.length : null,
            nights: recent.length,
            sleepTarget: inputs.settings.targets.sleep ?? 480,
          });
        })
        .catch(() => {});
    }, [units]),
  );

  const W = (kg: number) => showMeasure("weight", kg, units);
  const big = (value: string, unit: string, tone?: string) => (
    <Text style={{ fontSize: 24, fontWeight: "700", color: tone ?? c.text }}>
      {value} <Text style={{ fontSize: 14, fontWeight: "400", color: c.muted }}>{unit}</Text>
    </Text>
  );
  const bar = (share: number, color: string, label?: string, detail?: string) => (
    <View key={label} style={{ marginTop: 10 }}>
      {label && (
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: c.onPill }}>{label}</Text>
          <Text style={{ fontSize: 12, color: c.muted }}>{detail}</Text>
        </View>
      )}
      <View style={{ marginTop: label ? 4 : 0, height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: c.track }}>
        <View style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, height: "100%", borderRadius: 3, backgroundColor: color }} />
      </View>
    </View>
  );
  const line = (text: string, faint?: boolean) => <Text style={{ marginTop: 8, fontSize: 13, lineHeight: 18, color: faint ? c.faint : c.muted }}>{text}</Text>;

  // The pages.
  const b = g?.balance;
  const eaten = t.eaten;
  const s = t.settings;
  const macro = (label: string, value: number | null | undefined, limit: number | null, color: string) => bar(limit ? (value ?? 0) / limit : 0, color, label, `${Math.round(value ?? 0)}${limit ? ` / ${limit}` : ""} g`);
  const workouts = g?.workouts ?? [];
  const minutes = workouts.reduce((n, w) => n + w.minutes, 0);
  const kcal = workouts.reduce((n, w) => n + (w.kcal ?? 0), 0);
  const pages: { title: string; route: Href; body: React.ReactNode }[] = [
    {
      title: "Overview",
      route: "/health-section" as Href,
      body: b ? (
        <>
          {big(n0(Math.abs(b.left)), `kcal ${b.left < 0 ? "over" : "left"}`, b.left < 0 ? c.danger : undefined)}
          {bar(b.eaten / b.allowed, b.left < 0 ? c.danger : c.fill)}
          {line(`Budget ${n0(b.allowed)} · eaten ${n0(b.eaten)} · ${b.burned != null ? `burned ${n0(b.burned)} so far` : "burned: no data today"}`)}
          {t.latestWeight
            ? line(`${W(t.latestWeight.weight)}${t.weightChange != null ? ` · ${t.weightChange > 0 ? "+" : "−"}${W(Math.abs(t.weightChange))} this week` : ""}${s.goalWeight ? ` · goal ${W(s.goalWeight)}` : ""}`)
            : line("No weigh-ins yet", true)}
        </>
      ) : (
        line("Loading…", true)
      ),
    },
    {
      title: "Nutrition",
      route: "/health/today" as Href,
      body: (
        <>
          {big(n0(eaten.calories ?? 0), `of ${n0(b?.allowed ?? t.goal)} kcal`)}
          {macro("Protein", eaten.protein, s.dailyProteinLimit, nutrientColor("protein", dark))}
          {macro("Carbs", eaten.carbs, s.dailyCarbsLimit, nutrientColor("carbs", dark))}
          {macro("Fat", eaten.fats, s.dailyFatsLimit, nutrientColor("fats", dark))}
        </>
      ),
    },
    {
      title: "Workouts",
      route: "/health/section/workouts" as Href,
      body: (
        <>
          {big(String(workouts.length), `workout${workouts.length === 1 ? "" : "s"} this week`)}
          {line(workouts.length ? `${durationLabel(minutes * 60)}${kcal ? ` · ${n0(kcal)} active kcal` : ""}` : "None yet this week")}
          {workouts.slice(0, 2).map((w) => (
            <View key={w.key} style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name={w.gym ? "barbell-outline" : "walk-outline"} size={16} color={c.muted} />
              <Text style={{ flex: 1, fontSize: 13.5, color: c.text }} numberOfLines={1}>
                {w.name}
              </Text>
              <Text style={{ fontSize: 12.5, color: c.muted }}>
                {new Date(`${w.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })} · {durationLabel(w.minutes * 60)}
              </Text>
            </View>
          ))}
        </>
      ),
    },
    {
      title: "Sleep",
      route: "/health/section/sleep" as Href,
      body:
        g?.lastNight != null ? (
          <>
            {big(hm(g.lastNight), "last night")}
            {bar(g.lastNight / g.sleepTarget, c.fill)}
            {line(`Target ${hm(g.sleepTarget)}${g.week != null ? ` · ${hm(g.week)} on average, ${g.nights} night${g.nights === 1 ? "" : "s"} this week` : ""}`)}
          </>
        ) : (
          <>
            {big("—", "last night")}
            {line(g?.week != null ? `${hm(g.week)} on average this week (${g.nights} night${g.nights === 1 ? "" : "s"})` : "No sleep tracked lately — wear your Watch to bed.", g?.week == null)}
          </>
        ),
    },
  ];

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={{ marginHorizontal: -20 }}
        >
          {pages.map((p) => (
            <Tap key={p.title} onPress={() => go(p.route)} accessibilityRole="button" accessibilityLabel={`${p.title}. Open`} style={{ width: width + 40, paddingHorizontal: 20 }} pressedStyle={{ opacity: 0.7 }}>
              <View style={{ marginBottom: 6, flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: c.ink }}>{p.title}</Text>
                <Ionicons name="chevron-forward" size={13} color={c.ink} />
              </View>
              {p.body}
            </Tap>
          ))}
        </ScrollView>
      )}
      {/* Where you are */}
      <View style={{ marginTop: 12, flexDirection: "row", justifyContent: "center", gap: 6 }}>
        {pages.map((p, i) => (
          <View key={p.title} style={{ width: i === page ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === page ? c.ink : c.track }} />
        ))}
      </View>
    </View>
  );
}
