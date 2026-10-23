import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";

import { sessionCalories, weightOn } from "@/src/components/gym/sessionEnergy";
import { KCAL_PER_KG, todayBalance, type Balance, type Energy, type EnergyDay } from "@/src/components/health/energy";
import { workOutTargets, type Aim, type Burn } from "@/src/components/health/targets";
import { showMeasure } from "@/src/components/health/units";
import { Tap } from "@/src/components/ui/Tap";
import { getSessions, type GymSessionRecord } from "@/src/services/gymApi";
import { loadHealthInputs } from "@/src/services/healthInputs";
import { addHealthReading, deleteHealthReading } from "@/src/services/healthSync";
import type { Units } from "@/src/services/settingsService";
import type { WeightEntry } from "@/src/services/weightEntryApi";
import type { OrbitColors } from "@/src/theme/orbit";

// Your burn's pieces, for its phone page and its desktop one: what it's
// worked out from (loaded, and a day's food marked complete or not), how
// it's known in words, this week's Gym sessions and what each counts for,
// and the ⓘ that explains the method.

export const n0 = (n: number) => Math.round(n).toLocaleString();
export const dayName = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

export type BurnData = { energy: Energy; burn: Burn; balance: Balance; suggested: number; aim: Aim; sessions: GymSessionRecord[]; weights: WeightEntry[] };

// What the page shows, loaded each time it's opened; and a day's food
// marked complete (true), not (false), or left to work out (null).
export function useBurn(units: Units) {
  const [data, setData] = useState<BurnData | null>(null);
  const load = useCallback(() => {
    Promise.all([loadHealthInputs(), getSessions().catch(() => [] as GymSessionRecord[])]).then(([inputs, sessions]) => {
      const { energy, burn, targets, aim } = workOutTargets({ ...inputs, workoutsPerWeek: [], units });
      const cal = targets.find((t) => t.key === "calories")!;
      setData({ energy, burn, balance: todayBalance(energy, cal.current ?? cal.value, burn.value), suggested: cal.value, aim, sessions, weights: inputs.weights });
    });
  }, [units]);
  useFocusEffect(load);

  const mark = useCallback(
    async (day: EnergyDay, value: boolean | null) => {
      try {
        if (day.markId) await deleteHealthReading(day.markId);
        if (value != null) await addHealthReading("foodComplete", value ? 1 : 0, "", day.date);
        load();
      } catch (error) {
        Alert.alert("Couldn't save that", error instanceof Error ? error.message : "Something went wrong.");
      }
    },
    [load],
  );
  return { data, mark };
}

// How the burn is known, in a sentence.
export function burnHow(e: Energy, burn: Burn) {
  return burn.how === "measured"
    ? `Measured from the last 4 weeks: ${e.completeDays} fully logged days and ${e.weighIns} weigh-ins.`
    : burn.how === "blending"
      ? `Calibrating: ${Math.round((burn.share ?? 0) * 100)}% measured so far (${e.partial?.days ?? 0} of 10 complete days, ${e.partial?.weighIns ?? 0} of 8 weigh-ins), the rest from ${burn.from === "apple" ? "your Watch" : "About you"}. Fully measured once both are there.`
      : burn.how === "apple"
        ? `From your Watch for now — measured once there are 10 fully logged days and 8 weigh-ins in 4 weeks (${e.completeDays} and ${e.weighIns} so far).`
        : "Estimated from About you for now — your Watch or 4 weeks of food logs and weigh-ins will replace it.";
}

// A day's food, as it stands.
export const dayStatus = (d: EnergyDay) => (d.eaten == null || d.eaten === 0 ? "Not logged" : d.complete ? "Complete" : "Partial");

// This week's Gym sessions, and what each counts for in your burn: one
// your Watch measured (a workout running on it), its calories corrected by
// your Watch's ratio — already in the day's burn, through the Watch; one it
// didn't, an estimate, not counted.
export function GymWeek({ sessions, weights, ratio, colors: c }: { sessions: GymSessionRecord[]; weights: WeightEntry[]; ratio: number | null; colors: OrbitColors }) {
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = sessions.filter((s) => new Date(s.startedAt) >= monday);
  return (
    <>
      {week.length === 0 && <Text style={{ marginTop: 6, fontSize: 13.5, color: c.muted }}>No sessions yet this week.</Text>}
      {week.map((s) => {
        const cal = sessionCalories(s, sessions, weightOn(weights, s.startedAt), ratio);
        const raw = s.vitals?.kcal;
        return (
          <View key={s._id} style={{ marginTop: 10, flexDirection: "row", gap: 10 }}>
            <Ionicons name={cal?.measured ? "checkmark-circle" : "remove-circle-outline"} size={17} color={cal?.measured ? c.success : c.faint} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: c.text }} numberOfLines={1}>
                  {s.name}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: "700", color: cal?.measured ? c.text : c.muted, fontVariant: ["tabular-nums"] }}>{cal ? `${cal.measured ? "" : "~"}${cal.kcal.toLocaleString()} kcal` : "—"}</Text>
              </View>
              <Text style={{ marginTop: 1, fontSize: 12.5, lineHeight: 17, color: c.muted }}>
                {cal?.measured && raw != null
                  ? `Watch ${Math.round(raw)}${ratio != null ? ` × ${ratio.toFixed(2)} = ${cal.kcal}` : ""} · counted, in the day's burn`
                  : "Estimated — no Watch workout, so not counted"}
              </Text>
            </View>
          </View>
        );
      })}
      <Text style={{ marginTop: 10, fontSize: 12, lineHeight: 17, color: c.faint }}>Start a strength workout on your Watch when you lift: only sessions it measures count toward your burn.</Text>
    </>
  );
}

// The ⓘ: how your burn is worked out, the Watch corrected, and what it all
// assumes — in your own numbers.
export function HowItWorks({ open, onClose, e, burn, units, colors: c }: { open: boolean; onClose: () => void; e: Energy; burn: Burn; units: Units; colors: OrbitColors }) {
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
      text: ["To start, your Watch's figure is used as it reads (Apple Health usually has months of it); without the Watch, the formula from About you (your burn at rest × how active you are). From about 4 logged days and weigh-ins, what they say is blended in — a share as large as the share of the 10 days and 8 weigh-ins there are — so it moves toward measured gradually instead of jumping on day 10."],
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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.5)" }}>
        {/* The backdrop: tapped, it closes (behind the card, so the card scrolls) */}
        <Pressable onPress={onClose} accessibilityLabel="Close" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} />
        <View style={{ width: "100%", maxWidth: 460, maxHeight: "88%", borderRadius: 22, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }}>
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
        </View>
      </View>
    </Modal>
  );
}
