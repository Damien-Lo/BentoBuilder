import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";

import { KCAL_PER_KG, todayBalance, type Balance } from "@/src/components/health/energy";
import { workOutTargets, type Aim } from "@/src/components/health/targets";
import { showMeasure, useUnits } from "@/src/components/health/units";
import { Tap } from "@/src/components/ui/Tap";
import { loadHealthInputs } from "@/src/services/healthInputs";
import type { Units } from "@/src/services/settingsService";
import { useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Today's energy, at a glance: what's left of your budget after what you've
// eaten (Kitchen) and what you've burned so far (your Watch, corrected to
// your measured burn); then, quietly, the day as a whole — what you're
// expected to burn, the deficit eating to your budget (and what it comes to
// a week), and, when your budget isn't what your goal and pace call for,
// theirs (in full, DayPlan, on Your burn). The
// budget is your calorie target (Targets' suggestion, until you set one).
// Tapped: Your burn, where it's all worked out. (Health's page; the home
// screen's Health card next.)

const n0 = (n: number) => Math.round(n).toLocaleString();

type State = { balance: Balance; suggested: number; aim: Aim };

export function EnergyCard() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const [units] = useUnits("weight");
  const [state, setState] = useState<State | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadHealthInputs()
        .then((inputs) => {
          const { targets, energy, burn, aim } = workOutTargets({ ...inputs, workoutsPerWeek: [], units });
          const cal = targets.find((t) => t.key === "calories")!;
          setState({ balance: todayBalance(energy, cal.current ?? cal.value, burn.value), suggested: cal.value, aim });
        })
        .catch(() => {});
    }, [units]),
  );

  if (!state) return <View style={{ marginTop: 18, height: 220, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }} />;
  const { balance: b, suggested, aim } = state;
  const over = b.left < 0;
  const share = Math.min(1, b.eaten / b.allowed);

  return (
    <Tap onPress={() => router.push("/health/burn" as Href)} accessibilityRole="button" accessibilityLabel={`${n0(Math.abs(b.left))} kcal ${over ? "over" : "left"} today. Your burn`} style={{ marginTop: 18, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }} pressedStyle={{ backgroundColor: c.pill }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ flex: 1, fontSize: 12.5, fontWeight: "700", letterSpacing: 0.8, color: c.ink }}>TODAY&apos;S ENERGY</Text>
        <Ionicons name="chevron-forward" size={16} color={c.faint} />
      </View>
      <Text style={{ marginTop: 4, fontSize: 32, fontWeight: "800", color: over ? c.danger : c.text }}>
        {n0(Math.abs(b.left))} <Text style={{ fontSize: 15, fontWeight: "600", color: c.muted }}>kcal {over ? "over" : "left"}</Text>
      </Text>
      <View style={{ marginTop: 10, height: 8, borderRadius: 4, backgroundColor: c.track, overflow: "hidden" }}>
        <View style={{ width: `${share * 100}%`, height: "100%", borderRadius: 4, backgroundColor: over ? c.danger : c.fill }} />
      </View>

      <View style={{ marginTop: 14, flexDirection: "row" }}>
        <Figure label={b.extra ? `Budget (+${n0(b.extra)} active)` : "Budget"} value={n0(b.allowed)} colors={c} />
        <Figure label="Eaten" value={n0(b.eaten)} colors={c} />
        <Figure label={b.burned != null ? "Burned so far" : "Burned · no data today"} value={b.burned != null ? n0(b.burned) : "—"} colors={c} />
      </View>

      {/* The day as a whole, quietly (in full on Your burn) */}
      <Text style={{ marginTop: 12, fontSize: 12.5, lineHeight: 18, color: c.muted }}>
        Expected burn {n0(b.expected)} · {b.deficit >= 0 ? "deficit" : "surplus"} {n0(Math.abs(b.deficit))} at your budget (≈ {showMeasure("weight", Math.abs((b.deficit * 7) / KCAL_PER_KG), units, 1)} a week)
      </Text>
      {Math.abs(b.budget - suggested) >= 20 && (
        <Text style={{ marginTop: 2, fontSize: 12, lineHeight: 17, color: c.faint }}>
          {aim.goalKg != null && aim.direction !== "stay" ? `For ${showMeasure("weight", aim.pace, units, 2)} a week to ${showMeasure("weight", aim.goalKg, units, 1)}` : "To stay where you are"}: {n0(suggested)}
        </Text>
      )}
    </Tap>
  );
}

// The day as a whole: expected burn, the deficit at your budget (a week's
// worth), and what your goal and pace would have it be.
export function DayPlan({ balance: b, suggested, aim, units, colors: c }: { balance: Balance; suggested: number; aim: Aim; units: Units; colors: OrbitColors }) {
  const W = (kg: number) => showMeasure("weight", kg, units, 1);
  const weekly = (deficit: number) => (deficit * 7) / KCAL_PER_KG;
  const recommendedDeficit = b.expected - b.extra - suggested;
  const goal = aim.goalKg != null && aim.direction !== "stay" ? `${showMeasure("weight", aim.pace, units, 2)} a week to ${W(aim.goalKg)}` : "staying where you are";
  return (
    <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border, gap: 8 }}>
      <Line label="Expected burn today" value={`${n0(b.expected)} kcal`} colors={c} />
      <Line label={b.deficit >= 0 ? "Deficit at your budget" : "Surplus at your budget"} value={`${n0(Math.abs(b.deficit))} kcal`} detail={`≈ ${W(Math.abs(weekly(b.deficit)))} a week`} colors={c} />
      {Math.abs(b.budget - suggested) >= 20 && (
        <Line label={`For ${goal}`} value={`${n0(suggested)} budget`} detail={`${recommendedDeficit >= 0 ? "a deficit" : "a surplus"} of ${n0(Math.abs(recommendedDeficit))}`} accent colors={c} />
      )}
    </View>
  );
}

function Line({ label, value, detail, accent, colors: c }: { label: string; value: string; detail?: string; accent?: boolean; colors: OrbitColors }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: accent ? c.ink : c.muted, fontWeight: accent ? "600" : "400" }}>{label}</Text>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: accent ? c.ink : c.text, fontVariant: ["tabular-nums"] }}>{value}</Text>
        {detail && <Text style={{ fontSize: 12, color: c.muted }}>{detail}</Text>}
      </View>
    </View>
  );
}

function Figure({ label, value, colors: c }: { label: string; value: string; colors: OrbitColors }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 19, fontWeight: "800", color: c.text, fontVariant: ["tabular-nums"] }}>{value}</Text>
      <Text style={{ marginTop: 2, fontSize: 12, color: c.muted }}>{label}</Text>
    </View>
  );
}
