import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Fragment, useCallback, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { KCAL_PER_KG, type Energy, type EnergyDay } from "@/src/components/health/energy";
import { MetricChart } from "@/src/components/health/MetricChart";
import { workOutTargets, type Burn } from "@/src/components/health/targets";
import { showMeasure, UnitsToggle, useUnits } from "@/src/components/health/units";
import { PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { Tap } from "@/src/components/ui/Tap";
import { loadHealthInputs } from "@/src/services/healthInputs";
import { addHealthReading, deleteHealthReading } from "@/src/services/healthSync";
import type { Units } from "@/src/services/settingsService";
import { OrbitPage, OrbitSection, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Health → Your burn: the calories you use in a day, and how they're known
// (energy.ts). The answer and how sure it is; today, live (the Watch so far,
// corrected) with "logged everything?" to mark the day; last week's test —
// what the burn said your weight would do, and what it did; the burn week
// by week beside the Watch's; the Watch's correction; why this week might
// not line up; and the last two weeks a day at a time, each day's food
// markable as complete or not. The ⓘ explains the whole method.

const n0 = (n: number) => Math.round(n).toLocaleString();
const dayName = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

export default function BurnScreen() {
  return (
    <OrbitSection section="health">
      <OrbitPage>
        <YourBurn />
      </OrbitPage>
    </OrbitSection>
  );
}

function YourBurn() {
  const leave = useGoBack("/health-section");
  const { colors: c } = useOrbitTheme();
  const [units] = useUnits("weight");
  const [data, setData] = useState<{ energy: Energy; burn: Burn } | null>(null);
  const [info, setInfo] = useState(false);

  const load = useCallback(() => {
    loadHealthInputs().then((inputs) => {
      const { energy, burn } = workOutTargets({ ...inputs, workoutsPerWeek: [], units });
      setData({ energy, burn });
    });
  }, [units]);
  useFocusEffect(load);

  // A day's food: marked complete, not, or left to work out.
  async function mark(day: EnergyDay, value: boolean | null) {
    try {
      if (day.markId) await deleteHealthReading(day.markId);
      if (value != null) await addHealthReading("foodComplete", value ? 1 : 0, "", day.date);
      load();
    } catch (error) {
      Alert.alert("Couldn't save that", error instanceof Error ? error.message : "Something went wrong.");
    }
  }
  function askMark(day: EnergyDay) {
    Alert.alert(dayName(day.date), day.eaten ? `${n0(day.eaten)} kcal logged` : "Nothing logged", [
      { text: "Logged everything", onPress: () => void mark(day, true) },
      { text: "Not everything", onPress: () => void mark(day, false) },
      ...(day.marked != null ? [{ text: "Decide for me", onPress: () => void mark(day, null) }] : []),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  if (!data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.muted} />
      </SafeAreaView>
    );
  }

  const { energy: e, burn } = data;
  const W = (kg: number, places = 1) => showMeasure("weight", kg, units, places);
  const today = e.days[0];
  const ratio = e.ratio;
  const offBy = ratio != null ? Math.round(Math.abs(ratio - 1) * 100) : null;
  const shownWeeks = [...e.weeks].reverse().filter((w) => w.measured != null || w.watch != null);
  const recent = e.days.slice(1, 15);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        <PageHeader
          title="Your burn"
          subtitle="What you use in a day — measured, and the Watch corrected to it"
          onBack={leave}
          action={
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <UnitsToggle page="weight" />
              <Tap onPress={() => setInfo(true)} accessibilityRole="button" accessibilityLabel="How this is worked out" hitSlop={8} style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
                <Ionicons name="information" size={19} color={c.text} />
              </Tap>
            </View>
          }
        />

        {/* The answer, and how sure it is */}
        <Card colors={c} style={{ marginTop: 18 }}>
          <Label colors={c}>YOU BURN ABOUT</Label>
          <Text style={{ marginTop: 4, fontSize: 34, fontWeight: "800", color: c.text }}>
            {n0(burn.value)} <Text style={{ fontSize: 16, fontWeight: "600", color: c.muted }}>kcal a day</Text>
          </Text>
          <Text style={{ marginTop: 6, fontSize: 13.5, lineHeight: 19, color: c.muted }}>
            {burn.how === "measured"
              ? `Measured from the last 4 weeks: ${e.completeDays} fully logged days and ${e.weighIns} weigh-ins.`
              : burn.how === "apple"
                ? `From your Watch for now — measured once there are 10 fully logged days and 8 weigh-ins in 4 weeks (${e.completeDays} and ${e.weighIns} so far).`
                : "Estimated from About you for now — your Watch or 4 weeks of food logs and weigh-ins will replace it."}
          </Text>
        </Card>

        {/* Today, live */}
        <Card colors={c} style={{ marginTop: 14 }}>
          <Label colors={c}>TODAY</Label>
          <View style={{ marginTop: 8, flexDirection: "row" }}>
            <Figure label="Eaten" value={n0(e.today.eaten)} colors={c} />
            <Figure label={ratio ? `Burned so far (×${ratio.toFixed(2)})` : "Burned so far"} value={e.today.out != null ? n0(e.today.out) : "—"} colors={c} />
            <Figure label="A usual day by now" value={e.today.usualByNow != null ? n0(e.today.usualByNow) : "—"} colors={c} />
          </View>
          <Text style={{ marginTop: 8, fontSize: 12, color: c.faint }}>{e.today.synced ? "Burned: your Watch as of the last Apple Health sync, corrected." : "No Watch reading for today yet."}</Text>
          <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 14.5, fontWeight: "600", color: c.text }}>Logged everything today?</Text>
            {([true, false] as const).map((v) => {
              const on = today.marked === v;
              return (
                <Tap key={String(v)} onPress={() => void mark(today, on ? null : v)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? c.ink : c.pill }} pressedStyle={{ opacity: 0.75 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: "700", color: on ? c.onInk : c.onPill }}>{v ? "Yes" : "Not yet"}</Text>
                </Tap>
              );
            })}
          </View>
        </Card>

        {/* Last week, tested */}
        {e.check && (
          <Card colors={c} style={{ marginTop: 14 }}>
            <Label colors={c}>LAST 7 DAYS, TESTED</Label>
            <View style={{ marginTop: 8, flexDirection: "row" }}>
              <Figure label="Predicted" value={`${e.check.predicted <= 0 ? "−" : "+"}${W(Math.abs(e.check.predicted))}`} colors={c} />
              <Figure label="Your weight did" value={`${e.check.actual <= 0 ? "−" : "+"}${W(Math.abs(e.check.actual))}`} colors={c} />
            </View>
            {(() => {
              const gap = e.check.actual - e.check.predicted;
              const close = Math.abs(gap) <= 0.25;
              return (
                <Text style={{ marginTop: 8, fontSize: 13.5, lineHeight: 19, color: close ? c.text : c.warning }}>
                  {close ? "Close — the numbers hold up." : `Off by ${W(Math.abs(gap))}: you ${gap < 0 ? "lost more" : "lost less"} than your burn and food said.${e.reasons.length ? " Likely why, below." : ""}`}
                </Text>
              );
            })()}
            <Text style={{ marginTop: 4, fontSize: 12.5, lineHeight: 17, color: c.muted }}>
              From last week&apos;s burn ({n0(e.check.burnBefore)}) and what you ate ({n0(e.check.ate)} a day, {e.check.days} logged days).
            </Text>
          </Card>
        )}

        {/* Week by week */}
        {shownWeeks.length > 1 && (
          <Card colors={c} style={{ marginTop: 14 }}>
            <Label colors={c}>WEEK BY WEEK</Label>
            <View style={{ marginTop: 10 }}>
              <MetricChart points={shownWeeks.map((w) => ({ date: w.end, value: Math.round(w.measured ?? w.watch!), value2: w.watch != null ? Math.round(w.watch) : undefined }))} from={shownWeeks[0].end} to={shownWeeks[shownWeeks.length - 1].end} />
            </View>
            <View style={{ marginTop: 8, flexDirection: "row", gap: 16 }}>
              <Legend color={c.fill} label="Measured" colors={c} />
              <Legend color={c.fill} faint label="Watch (as it reads)" colors={c} />
            </View>
          </Card>
        )}

        {/* The Watch's correction */}
        <Card colors={c} style={{ marginTop: 14 }}>
          <Label colors={c}>YOUR WATCH</Label>
          {ratio != null && e.watchAverage != null ? (
            <>
              <Text style={{ marginTop: 4, fontSize: 22, fontWeight: "800", color: c.text }}>
                Reads {offBy}% {ratio > 1 ? "low" : "high"} <Text style={{ fontSize: 14, fontWeight: "600", color: c.muted }}>× {ratio.toFixed(2)} to correct</Text>
              </Text>
              <Text style={{ marginTop: 6, fontSize: 13.5, lineHeight: 19, color: c.muted }}>
                It says {n0(e.watchAverage)} a day over the last 4 weeks; measured, it&apos;s {n0(burn.value)}. Today&apos;s burn is the Watch × {ratio.toFixed(2)}.
              </Text>
              <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {shownWeeks
                  .filter((w) => w.ratio != null)
                  .map((w) => (
                    <View key={w.end} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: c.canvas }}>
                      <Text style={{ fontSize: 11, color: c.faint }}>{new Date(`${w.end}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: c.text, fontVariant: ["tabular-nums"] }}>×{w.ratio!.toFixed(2)}</Text>
                    </View>
                  ))}
              </View>
            </>
          ) : (
            <Text style={{ marginTop: 6, fontSize: 13.5, lineHeight: 19, color: c.muted }}>{e.watchAverage == null ? "No Watch data yet — connect Apple Health on the Health page." : "Its correction comes once your burn is measured."}</Text>
          )}
        </Card>

        {/* Why this week might not line up */}
        {e.reasons.length > 0 && (
          <Card colors={c} style={{ marginTop: 14 }}>
            <Label colors={c}>THIS WEEK</Label>
            {e.reasons.map((r) => (
              <View key={r} style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
                <Ionicons name="ellipse" size={6} color={c.muted} style={{ marginTop: 7 }} />
                <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: c.text }}>{r}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Day by day */}
        <Text style={{ marginTop: 24, marginBottom: 8, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>THE LAST TWO WEEKS</Text>
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }}>
          {recent.map((d, i) => (
            <Fragment key={d.date}>
              {i > 0 && <View style={{ height: 1, marginLeft: 14, backgroundColor: c.border }} />}
              <DayRow day={d} ratio={ratio} units={units} onPress={() => askMark(d)} colors={c} />
            </Fragment>
          ))}
        </View>
        <Text style={{ marginTop: 10, marginHorizontal: 4, fontSize: 12.5, lineHeight: 18, color: c.faint }}>Tap a day to say whether you logged everything. Days that aren&apos;t complete are left out, so a half-logged day can&apos;t make your burn look lower than it is.</Text>
      </ScrollView>

      <HowItWorks open={info} onClose={() => setInfo(false)} e={e} burn={burn} units={units} colors={c} />
    </SafeAreaView>
  );
}

function DayRow({ day: d, ratio, units, onPress, colors: c }: { day: EnergyDay; ratio: number | null; units: Units; onPress: () => void; colors: OrbitColors }) {
  const status = d.eaten == null || d.eaten === 0 ? "Not logged" : d.complete ? "Complete" : "Partial";
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={`${dayName(d.date)}: ${status}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11 }} pressedStyle={{ backgroundColor: c.pill }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, fontWeight: "600", color: c.text }}>{dayName(d.date)}</Text>
        <Text style={{ marginTop: 2, fontSize: 12.5, color: c.muted, fontVariant: ["tabular-nums"] }} numberOfLines={1}>
          {d.eaten ? `${n0(d.eaten)} eaten` : "—"}
          {d.watch != null ? ` · ${n0(d.watch * (ratio ?? 1))} burned` : ""}
          {d.weight != null ? ` · ${showMeasure("weight", d.weight, units)}` : ""}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: status === "Complete" ? `${c.fill}26` : c.pill }}>
        {d.marked != null && <Ionicons name="checkmark" size={12} color={status === "Complete" ? c.ink : c.muted} />}
        <Text style={{ fontSize: 12, fontWeight: "700", color: status === "Complete" ? c.ink : c.muted }}>{status}</Text>
      </View>
    </Tap>
  );
}

// The ⓘ: how your burn is worked out, the Watch corrected, and what it all
// assumes — in your own numbers.
function HowItWorks({ open, onClose, e, burn, units, colors: c }: { open: boolean; onClose: () => void; e: Energy; burn: Burn; units: Units; colors: OrbitColors }) {
  const W = (kg: number, places = 1) => showMeasure("weight", kg, units, places);
  const w0 = e.weeks[0];
  const sections: { title: string; text: string[] }[] = [
    {
      title: "The idea",
      text: [
        "Over a few weeks, what you eat minus what you burn shows up on the scale: a kilo (2.2 lb) of body weight is about 7,700 kcal. So what you ate, together with what your weight did, tells us what you burned — measured from you, not guessed from a formula or a heart rate.",
        ...(burn.how === "measured" && w0?.ate != null && w0.trendPerWeek != null
          ? [`Yours: you ate ${n0(w0.ate)} kcal a day on fully logged days, and your weight moved ${w0.trendPerWeek <= 0 ? "−" : "+"}${W(Math.abs(w0.trendPerWeek), 2)} a week. ${n0(w0.ate)} − (${w0.trendPerWeek < 0 ? "−" : ""}${Math.abs(w0.trendPerWeek / 7).toFixed(3)} kg a day × ${KCAL_PER_KG.toLocaleString()}) ≈ ${n0(w0.raw ?? burn.value)} kcal a day.`]
          : []),
      ],
    },
    {
      title: "Smoothing out water",
      text: ["Day to day the scale swings with water — salt, carbs, a hard session — by a pound or two. So it's not any one weigh-in that's used but a straight line through all of them over four weeks: each is one point of about 28, so a one-day jump barely moves it, while a real change shows straight away (a running average would lag behind it by a week or more)."],
    },
    {
      title: "Only complete days",
      text: [
        `A half-logged day would make it look like you ate less, and so burned less. Only days you marked "logged everything", or that came close to your usual (at least 60% of it${e.usualIntake ? ` — ${n0(e.usualIntake * 0.6)} kcal, from your usual ${n0(e.usualIntake)}` : ""}), are counted. Mark a day either way and that's what's used.`,
      ],
    },
    {
      title: "Four weeks at a time, and steady",
      text: ["Each week it's worked out again over the four weeks to that day, with at least 10 complete days and 8 weigh-ins. It can move at most 100 kcal from one week to the next, so a strange week can't throw it — if it's real, the weeks after will agree."],
    },
    {
      title: "Correcting the Watch",
      text: [
        "Your Watch estimates your burn from heart rate, movement and your size — usually off by a steady amount for each person (and only counting while it's on your wrist, so days it was off for long are left out). Over the same four weeks it's compared with your measured burn (counting the days it was worn), and the difference becomes its correction.",
        ...(e.ratio != null && e.watchAverage != null ? [`Yours: it said ${n0(e.watchAverage)} a day; measured, ${n0(burn.value)} — so × ${e.ratio.toFixed(2)}. During the day, "burned so far" is the Watch × ${e.ratio.toFixed(2)}, so it's live and right for you.`] : []),
      ],
    },
    {
      title: "Testing it",
      text: ["Each week, last week's burn and what you ate this week say what your weight should have done; your weigh-ins say what it did. If they keep matching, the numbers can be trusted. If they don't, it shows why — days not fully logged, a water swing, the Watch not worn, or a change in what you did."],
    },
    {
      title: "Before there's enough",
      text: ["Without 4 weeks of logs and weigh-ins, your Watch's figure is used as it reads; without the Watch, the formula from About you (your burn at rest × how active you are). Each is replaced as soon as there's better."],
    },
    {
      title: "What it assumes",
      text: [
        "That what's logged is what was eaten — portions weighed or close to it. Logging less than you ate makes your burn read low, never high, so the budget errs on the careful side.",
        "That a kilo is about 7,700 kcal. That's true of fat; early on some of a loss is water, and muscle gained while losing fat is worth less — the four-week window and the weekly limit soften both.",
      ],
    },
  ];
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel="Close" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.5)" }}>
        <Pressable onPress={() => {}} style={{ width: "100%", maxWidth: 460, maxHeight: "88%", borderRadius: 22, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", letterSpacing: 0.8, color: c.ink }}>HOW YOUR BURN IS WORKED OUT</Text>
              <Tap onPress={onClose} accessibilityLabel="Close" hitSlop={10}>
                <Ionicons name="close" size={20} color={c.faint} />
              </Tap>
            </View>
            {sections.map((s) => (
              <View key={s.title} style={{ marginTop: 16 }}>
                <Text style={{ fontSize: 15.5, fontWeight: "700", color: c.text }}>{s.title}</Text>
                {s.text.map((t, i) => (
                  <Text key={i} style={{ marginTop: 6, fontSize: 14, lineHeight: 20.5, color: i > 0 && t.startsWith("Yours") ? c.text : c.icon, fontWeight: t.startsWith("Yours") ? "600" : "400" }}>
                    {t}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Card({ children, style, colors: c }: { children: React.ReactNode; style?: object; colors: OrbitColors }) {
  return <View style={[{ padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }, style]}>{children}</View>;
}
function Label({ children, colors: c }: { children: string; colors: OrbitColors }) {
  return <Text style={{ fontSize: 12.5, fontWeight: "700", letterSpacing: 0.8, color: c.ink }}>{children}</Text>;
}
function Figure({ label, value, colors: c }: { label: string; value: string; colors: OrbitColors }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 20, fontWeight: "800", color: c.text, fontVariant: ["tabular-nums"] }}>{value}</Text>
      <Text style={{ marginTop: 2, fontSize: 12, color: c.muted }}>{label}</Text>
    </View>
  );
}
function Legend({ color, faint, label, colors: c }: { color: string; faint?: boolean; label: string; colors: OrbitColors }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: color, opacity: faint ? 0.4 : 1 }} />
      <Text style={{ fontSize: 12, color: c.muted }}>{label}</Text>
    </View>
  );
}

