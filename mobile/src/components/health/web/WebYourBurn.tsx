import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { burnHow, dayName, dayStatus, GymWeek, HowItWorks, n0, useBurn } from "@/src/components/health/BurnParts";
import { DayPlan } from "@/src/components/health/EnergyCard";
import type { EnergyDay } from "@/src/components/health/energy";
import { MetricChart } from "@/src/components/health/MetricChart";
import { showMeasure, UnitsToggle, useUnits } from "@/src/components/health/units";
import { Button, Card, hoverable, PageTitle, Row, WebPage } from "@/src/components/web/ui";
import type { Units } from "@/src/services/settingsService";
import { useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Your burn in a desktop browser: the answer and how sure it is, today
// live (with "logged everything?"), and last week's test along the top;
// the burn week by week beside the Watch's, the Watch's correction and
// this week's Gym sessions in the middle; why this week might not line
// up, and the last two weeks as a table — each day's food marked complete,
// not, or left to work out, right in its row. The ⓘ explains the method.

type Hover = { hovered?: boolean };

export function WebYourBurn() {
  const { colors: c } = useOrbitTheme();
  const [units] = useUnits("weight");
  const { data, mark } = useBurn(units);
  const [info, setInfo] = useState(false);

  const title = (
    <PageTitle
      title="Your burn"
      subtitle="What you use in a day — measured, and the Watch corrected to it"
      right={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <UnitsToggle page="weight" />
          {!!data && <Button label="How it's worked out" icon="information-circle-outline" onPress={() => setInfo(true)} small />}
        </View>
      }
    />
  );
  if (!data) {
    return (
      <WebPage>
        {title}
        <Text style={{ fontSize: 14, color: c.muted }}>Loading…</Text>
      </WebPage>
    );
  }

  const { energy: e, burn, balance, suggested, aim, sessions, weights } = data;
  const W = (kg: number, places = 1) => showMeasure("weight", kg, units, places);
  const today = e.days[0];
  const ratio = e.ratio;
  const offBy = ratio != null ? Math.round(Math.abs(ratio - 1) * 100) : null;
  const shownWeeks = [...e.weeks].reverse().filter((w) => w.measured != null || w.watch != null);
  const recent = e.days.slice(1, 15);
  const quiet = (text: string) => <Text style={{ marginTop: 8, fontSize: 12.5, lineHeight: 18, color: c.muted }}>{text}</Text>;

  return (
    <WebPage>
      {title}

      <Row>
        {/* The answer, and how sure it is */}
        <Card title="You burn about" style={{ flex: 1, minWidth: 300 }}>
          <Text style={{ fontSize: 34, fontWeight: "800", color: c.text }}>
            {n0(burn.value)} <Text style={{ fontSize: 16, fontWeight: "600", color: c.muted }}>kcal a day</Text>
          </Text>
          <Text style={{ marginTop: 8, fontSize: 13.5, lineHeight: 19, color: c.muted }}>{burnHow(e, burn)}</Text>
        </Card>

        {/* Today, live */}
        <Card title="Today" style={{ flex: 1.4, minWidth: 420 }}>
          <View style={{ flexDirection: "row" }}>
            <Figure label={balance.extra ? `Budget (+${n0(balance.extra)} active)` : "Budget"} value={n0(balance.allowed)} colors={c} />
            <Figure label="Eaten" value={n0(e.today.eaten)} colors={c} />
            <Figure label={e.today.out == null ? "Burned · no data today" : ratio ? `Burned so far (×${ratio.toFixed(2)})` : "Burned so far"} value={e.today.out != null ? n0(e.today.out) : "—"} colors={c} />
          </View>
          <DayPlan balance={balance} suggested={suggested} aim={aim} units={units} colors={c} />
          <Text style={{ marginTop: 8, fontSize: 12, color: c.faint }}>{e.today.synced ? "Burned: your Watch as of the last Apple Health sync, corrected." : "No data today yet — your budget still stands, from your measured burn."}</Text>
          <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: c.text }}>Logged everything today?</Text>
            {([true, false] as const).map((v) => (
              <Chip key={String(v)} label={v ? "Yes" : "Not yet"} on={today.marked === v} onPress={() => void mark(today, today.marked === v ? null : v)} colors={c} />
            ))}
          </View>
        </Card>

        {/* Last week, tested */}
        {e.check && (
          <Card title="Last 7 days, tested" style={{ flex: 1, minWidth: 300 }}>
            <View style={{ flexDirection: "row" }}>
              <Figure label="Predicted" value={`${e.check.predicted <= 0 ? "−" : "+"}${W(Math.abs(e.check.predicted))}`} colors={c} />
              <Figure label="Your weight did" value={`${e.check.actual <= 0 ? "−" : "+"}${W(Math.abs(e.check.actual))}`} colors={c} />
            </View>
            {(() => {
              const gap = e.check.actual - e.check.predicted;
              const close = Math.abs(gap) <= 0.25;
              return (
                <Text style={{ marginTop: 10, fontSize: 13.5, lineHeight: 19, color: close ? c.text : c.warning }}>
                  {close ? "Close — the numbers hold up." : `Off by ${W(Math.abs(gap))}: you ${gap < 0 ? "lost more" : "lost less"} than your burn and food said.${e.reasons.length ? " Likely why, below." : ""}`}
                </Text>
              );
            })()}
            {quiet(`From last week's burn (${n0(e.check.burnBefore)}) and what you ate (${n0(e.check.ate)} a day, ${e.check.days} logged days).`)}
          </Card>
        )}
      </Row>

      <Row>
        {/* Week by week */}
        <Card title="Week by week" subtitle="Your burn, measured, beside the Watch's" style={{ flex: 1.5, minWidth: 440 }}>
          {shownWeeks.length > 1 ? (
            <>
              <MetricChart points={shownWeeks.map((w) => ({ date: w.end, value: Math.round(w.measured ?? w.watch!), value2: w.watch != null ? Math.round(w.watch) : undefined }))} from={shownWeeks[0].end} to={shownWeeks[shownWeeks.length - 1].end} height={200} />
              <View style={{ marginTop: 8, flexDirection: "row", gap: 16 }}>
                <Legend color={c.fill} label="Measured" colors={c} />
                <Legend color={c.fill} faint label="Watch (as it reads)" colors={c} />
              </View>
            </>
          ) : (
            quiet("Shows once there are a couple of weeks to compare.")
          )}
        </Card>

        {/* The Watch's correction */}
        <Card title="Your Watch" style={{ flex: 1, minWidth: 300 }}>
          {ratio != null && e.watchAverage != null ? (
            <>
              <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>
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
            <Text style={{ fontSize: 13.5, lineHeight: 19, color: c.muted }}>{e.watchAverage == null ? "No Watch data yet — connect Apple Health on the Health page of your phone." : "Its correction comes once your burn is measured."}</Text>
          )}
        </Card>

        {/* Gym sessions this week: what each counts for */}
        <Card title="Gym this week" style={{ flex: 1, minWidth: 300 }}>
          <GymWeek sessions={sessions} weights={weights} ratio={ratio} colors={c} />
        </Card>
      </Row>

      <Row style={{ alignItems: "flex-start" }}>
        {/* Why this week might not line up */}
        {e.reasons.length > 0 && (
          <Card title="This week" subtitle="Why the numbers might not line up" style={{ flex: 1, minWidth: 300 }}>
            {e.reasons.map((r) => (
              <View key={r} style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
                <Ionicons name="ellipse" size={6} color={c.muted} style={{ marginTop: 7 }} />
                <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: c.text }}>{r}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Day by day, each markable in its row */}
        <Card title="The last two weeks" subtitle="Say whether you logged everything — days that aren't complete are left out, so a half-logged day can't make your burn look lower than it is" padded={false} style={{ flex: 2.2, minWidth: 560 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.border, backgroundColor: c.canvas }}>
            <Head label="Day" flex={1.2} colors={c} />
            <Head label="Eaten" width={72} colors={c} />
            <Head label="Burned" width={72} colors={c} />
            <Head label="Weight" width={72} colors={c} />
            <Head label="Counts as" width={92} colors={c} />
            <Head label="Logged" flex={2} colors={c} />
          </View>
          {recent.map((d, i) => (
            <DayRow key={d.date} day={d} first={i === 0} ratio={ratio} units={units} onMark={(v) => void mark(d, v)} colors={c} />
          ))}
        </Card>
      </Row>

      <HowItWorks open={info} onClose={() => setInfo(false)} e={e} burn={burn} units={units} colors={c} />
    </WebPage>
  );
}

// A day: what was eaten, burned and weighed, whether it counts, and what
// you said of it — logged everything, not everything, or left to work out.
function DayRow({ day: d, first, ratio, units, onMark, colors: c }: { day: EnergyDay; first: boolean; ratio: number | null; units: Units; onMark: (value: boolean | null) => void; colors: OrbitColors }) {
  const status = dayStatus(d);
  const cell = (text: string) => (
    <Text style={{ width: 72, fontSize: 13.5, color: text === "—" ? c.faint : c.text, fontVariant: ["tabular-nums"] }} numberOfLines={1}>
      {text}
    </Text>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 9, borderTopWidth: first ? 0 : 1, borderTopColor: c.border }}>
      <Text style={{ flex: 1.2, minWidth: 96, fontSize: 14, fontWeight: "600", color: c.text }} numberOfLines={1}>
        {dayName(d.date)}
      </Text>
      {cell(d.eaten ? n0(d.eaten) : "—")}
      {cell(d.watch != null ? n0(d.watch * (ratio ?? 1)) : "—")}
      {cell(d.weight != null ? showMeasure("weight", d.weight, units) : "—")}
      <View style={{ width: 92 }}>
        <View style={{ alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: status === "Complete" ? `${c.fill}26` : c.pill }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: status === "Complete" ? c.ink : c.muted }}>{status}</Text>
        </View>
      </View>
      <View style={{ flex: 2, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {(
          [
            [true, "Everything"],
            [false, "Not everything"],
            [null, "Decide for me"],
          ] as const
        ).map(([value, label]) => (
          <Chip key={label} label={label} on={d.marked === value} onPress={() => d.marked !== value && onMark(value)} small colors={c} />
        ))}
      </View>
    </View>
  );
}

function Chip({ label, on, onPress, small, colors: c }: { label: string; on: boolean; onPress: () => void; small?: boolean; colors: OrbitColors }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={hoverable(({ hovered }: Hover) => ({ paddingHorizontal: small ? 10 : 14, paddingVertical: small ? 5 : 7, borderRadius: 999, backgroundColor: on ? c.ink : hovered ? c.track : c.pill }))}
    >
      <Text style={{ fontSize: small ? 12 : 13.5, fontWeight: "700", color: on ? c.onInk : c.onPill }}>{label}</Text>
    </Pressable>
  );
}

function Head({ label, flex, width, colors: c }: { label: string; flex?: number; width?: number; colors: OrbitColors }) {
  return <Text style={{ flex, width, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, color: c.faint }}>{label.toUpperCase()}</Text>;
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
