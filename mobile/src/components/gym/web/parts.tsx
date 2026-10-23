import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { Children, useState, type ReactNode } from "react";
import { Platform, Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { clock, type ActiveSession } from "@/src/components/gym/activeSession";
import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import { heatColor, MuscleHeatMap, useDark } from "@/src/components/gym/MuscleMap";
import { muscleLabel, muscleSets, recordTimeline, weeklyTotals } from "@/src/components/gym/progressStats";
import { dayLabel, startOfWeek } from "@/src/components/gym/schedule";
import { Card, CardLink, hoverable } from "@/src/components/web/ui";
import { themeColor } from "@/src/components/web/theme";
import type { GymSessionRecord } from "@/src/services/gymApi";
import { useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// What Gym's desktop pages share: a grid of cards, the workout under way,
// a figure and its label, and the cards both the Overview and Progress
// show — your recent records, the muscles you've trained this week, and
// your volume week by week — each opening its page.

export type Hover = { hovered?: boolean };

// Cards in columns as many as fit, each at least `min` wide, the same width.
export function Grid({ min = 300, gap = 16, children }: { min?: number; gap?: number; children: ReactNode }) {
  const [width, setWidth] = useState(0);
  const columns = Math.max(1, Math.floor((width + gap) / (min + gap)));
  const each = Math.floor((width - gap * (columns - 1)) / columns);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
      {width > 0 && Children.map(children, (child) => <View style={{ width: each }}>{child}</View>)}
    </View>
  );
}

// The workout under way, to go back to.
export function ActiveBanner({ active, onPress }: { active: ActiveSession; onPress: () => void }) {
  const { colors: c } = useOrbitTheme();
  return (
    <Pressable onPress={onPress} style={hoverable(({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 16, backgroundColor: c.success, opacity: hovered ? 0.9 : 1 }))}>
      <Ionicons name="barbell" size={22} color="#FFFFFF" />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.6, color: "#FFFFFF", opacity: 0.85 }}>WORKOUT IN PROGRESS · STARTED {clock((Date.now() - new Date(active.startedAt).getTime()) / 1000)} AGO</Text>
        <Text style={{ marginTop: 2, fontSize: 16, fontWeight: "700", color: "#FFFFFF" }} numberOfLines={1}>
          {active.name}
        </Text>
      </View>
      <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>Resume</Text>
      <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
    </Pressable>
  );
}

// A number, its label under it.
export function Figure({ label, value, tone, colors: c }: { label: string; value: string; tone?: string; colors: OrbitColors }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ fontSize: 20, fontWeight: "800", color: tone ?? c.text, fontVariant: ["tabular-nums"] }} numberOfLines={1}>
        {value}
      </Text>
      <Text style={{ marginTop: 2, fontSize: 12, color: c.muted }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export const Quiet = ({ text, colors: c }: { text: string; colors: OrbitColors }) => <Text style={{ fontSize: 13, lineHeight: 19, color: c.muted }}>{text}</Text>;

// The records you've set lately (each beating your best before, and by
// how much), each opening its exercise.
export function RecordsCard({ sessions, count = 6, style }: { sessions: GymSessionRecord[]; count?: number; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const timeline = recordTimeline(sessions);
  const month = timeline.filter((r) => new Date(r.finishedAt).getTime() >= Date.now() - 30 * 86_400_000).length;
  return (
    <Card title="Recent records" subtitle={timeline.length ? `${month} in the last 30 days · ${timeline.length} in all` : undefined} action={<CardLink label="Personal records" onPress={() => router.push("/gym/records" as Href)} />} style={style}>
      {timeline.length === 0 && <Quiet text="Lift heavier than before on an exercise and it shows here." colors={c} />}
      {timeline.slice(0, count).map((r) => (
        <Pressable
          key={`${r.sessionId}-${r.exercise._id}`}
          onPress={() => router.push(`/gym/exercise/${r.exercise._id}` as Href)}
          style={hoverable(({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, paddingHorizontal: 6, marginHorizontal: -6, borderRadius: 10, backgroundColor: hovered ? c.pill : "transparent" }))}
        >
          <ExerciseIcon name={r.exercise.name} primary={r.exercise.primaryMuscles} secondary={r.exercise.secondaryMuscles} size={34} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 13.5, fontWeight: "600", color: c.text }} numberOfLines={1}>
              {r.exercise.name}
            </Text>
            <Text style={{ marginTop: 1, fontSize: 12, color: c.muted }} numberOfLines={1}>
              {dayLabel(r.finishedAt)} · {r.best.lower ? `was ${r.previous.text.replace("−", "")} of help` : `up from ${r.previous.text}`}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 13.5, fontWeight: "800", color: c.text }}>{r.best.text}</Text>
            <Text style={{ marginTop: 1, fontSize: 11.5, fontWeight: "700", color: c.success }}>{r.gain}</Text>
          </View>
        </Pressable>
      ))}
    </Card>
  );
}

// "12", "7.5".
const setsLabel = (n: number) => String(Math.round(n * 2) / 2);
const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");

// The muscles you've trained this week: on the body (the more sets, the
// stronger the colour), and the most-trained as bars.
export function MusclesCard({ sessions, style }: { sessions: GymSessionRecord[]; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const dark = useDark();
  const from = startOfWeek();
  const sets = muscleSets(sessions, from);
  const trained = Object.keys(sets)
    .filter((m) => sets[m] > 0)
    .sort((a, b) => sets[b] - sets[a]);
  const most = trained.length ? sets[trained[0]] : 0;
  // (On the web the colours are kept as drawn, whichever theme.)
  const fixed = (hex: string) => (Platform.OS === "web" ? themeColor(hexRgb(hex), hexRgb(hex)) : hex);
  return (
    <Card title="Muscles this week" subtitle={trained.length ? `${trained.length} trained · the stronger the colour, the more sets` : undefined} action={<CardLink label="Muscles trained" onPress={() => router.push("/gym/muscles" as Href)} />} style={style}>
      <MuscleHeatMap sets={sets} size={0.6} />
      {trained.length === 0 ? (
        <View style={{ marginTop: 8 }}>
          <Quiet text="No sets yet this week." colors={c} />
        </View>
      ) : (
        <View style={{ marginTop: 10, gap: 8 }}>
          {trained.slice(0, 5).map((m) => (
            <View key={m}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: c.text }}>{muscleLabel(m)}</Text>
                <Text style={{ fontSize: 13, fontWeight: "700", color: c.text }}>
                  {setsLabel(sets[m])} <Text style={{ fontWeight: "400", color: c.muted }}>sets</Text>
                </Text>
              </View>
              <View style={{ marginTop: 4, height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: c.track }}>
                <View style={{ width: `${(sets[m] / most) * 100}%`, height: "100%", borderRadius: 3, backgroundColor: fixed(heatColor(sets[m] / most, dark)) }} />
              </View>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const weekOf = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

// The weight you've moved week by week, over 12 weeks, as bars: this week's
// (or the one pointed at) against your average — of the weeks before this
// one you trained in.
export function VolumeCard({ sessions, style }: { sessions: GymSessionRecord[]; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const [hover, setHover] = useState<number | null>(null);
  const weeks = weeklyTotals(sessions, 12);
  const most = Math.max(1, ...weeks.map((w) => w.volume));
  const index = hover ?? weeks.length - 1;
  const week = weeks[index];
  const earlier = weeks.slice(0, -1).filter((w) => w.workouts > 0);
  const average = earlier.length ? earlier.reduce((n, w) => n + w.volume, 0) / earlier.length : null;
  const change = average ? (week.volume - average) / average : null;
  const height = 150;
  return (
    <Card title="Volume over time" subtitle="The weight you've moved, week by week" action={<CardLink label="Volume over time" onPress={() => router.push("/gym/volume" as Href)} />} style={style}>
      <View style={{ flexDirection: "row", gap: 16 }}>
        <Figure label={index === weeks.length - 1 ? "This week" : `Week of ${weekOf(week.start)}`} value={`${Math.round(week.volume).toLocaleString()} lbs`} colors={c} />
        <Figure label="workouts · sets" value={`${week.workouts} · ${week.sets}`} colors={c} />
        <Figure label="Weekly average" value={average !== null ? `${Math.round(average).toLocaleString()} lbs` : "—"} colors={c} />
        <Figure label="Against the average" value={change === null ? "—" : `${change >= 0 ? "+" : "−"}${Math.abs(Math.round(change * 100))}%`} tone={change === null ? undefined : change >= 0 ? c.success : c.danger} colors={c} />
      </View>
      <View style={{ marginTop: 16, height, flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
        {weeks.map((w, i) => {
          const on = i === index;
          return (
            <Pressable key={w.start.toISOString()} onHoverIn={() => setHover(i)} onHoverOut={() => setHover(null)} onPress={() => router.push("/gym/volume" as Href)} style={{ flex: 1, height: "100%", justifyContent: "flex-end" }}>
              <View style={{ height: Math.max(w.volume ? 4 : 2, (w.volume / most) * height), borderRadius: 5, backgroundColor: on ? c.ink : w.volume ? c.faint : c.track, opacity: on || !w.volume ? 1 : 0.55 }} />
            </Pressable>
          );
        })}
      </View>
      <View style={{ marginTop: 6, flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 11.5, color: c.faint }}>{weekOf(weeks[0].start)}</Text>
        <Text style={{ fontSize: 11.5, color: c.faint }}>This week</Text>
      </View>
    </Card>
  );
}
