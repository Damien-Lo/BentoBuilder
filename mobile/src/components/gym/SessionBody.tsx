import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";

import { ageOn } from "@/src/components/health/bodyStats";
import { useWatchRatio } from "@/src/components/health/watchCorrection";
import { Tap } from "@/src/components/ui/Tap";
import type { GymSessionRecord } from "@/src/services/gymApi";
import { loadSettings } from "@/src/services/settingsService";
import { getWeightEntries } from "@/src/services/weightEntryApi";
import type { OrbitColors } from "@/src/theme/orbit";

import { sessionCalories, weightOn, type SessionCalories } from "./sessionEnergy";

// A session's body side, from your Watch (Apple Health) lined up with the
// session's own time: the calories it cost (measured, or estimated from
// your own rate — tapped, how), your heart rate (average and highest), a
// minute at a time through the session with each set you ticked marked
// along the bottom, and the time in each heart-rate zone (by your maximum:
// 220 less your age, or higher if you've reached it).

const ZONES = [
  { name: "Easy", from: 0.5, color: "#94A3B8" },
  { name: "Light", from: 0.6, color: "#38BDF8" },
  { name: "Moderate", from: 0.7, color: "#22C55E" },
  { name: "Hard", from: 0.8, color: "#F59E0B" },
  { name: "Max", from: 0.9, color: "#EF4444" },
];
const zoneOf = (share: number) => [...ZONES].reverse().find((z) => share >= z.from) ?? null;

export function SessionBody({ session, all, colors: c }: { session: GymSessionRecord; all: GymSessionRecord[]; colors: OrbitColors }) {
  const [me, setMe] = useState<{ kg: number | null; age: number | null } | null>(null);
  const [width, setWidth] = useState(0);
  const ratio = useWatchRatio();
  useEffect(() => {
    Promise.all([getWeightEntries().catch(() => []), loadSettings()])
      .then(([weights, settings]) => {
        // (Your weight then: the weigh-in nearest before the session.)
        setMe({ kg: weightOn(weights, session.startedAt), age: ageOn(settings.birthDate, new Date(session.startedAt)) });
      })
      .catch(() => setMe({ kg: null, age: null }));
  }, [session.startedAt]);

  if (!me) return null;
  const v = session.vitals;
  const cal: SessionCalories | null = sessionCalories(session, all, me.kg, ratio);
  const hr = v?.hr ?? [];
  const max = Math.max(me.age != null ? 220 - me.age : 190, v?.maxHr ?? 0);
  const beats = hr.filter((b) => b > 0);
  // Minutes in each zone.
  const inZone = ZONES.map((z) => ({ ...z, minutes: beats.filter((b) => zoneOf(b / max)?.name === z.name).length }));
  const zoned = inZone.reduce((n, z) => n + z.minutes, 0);
  const mostly = zoned ? inZone.reduce((a, b) => (b.minutes > a.minutes ? b : a)) : null;
  const start = new Date(session.startedAt).getTime();
  const sets = session.exercises.flatMap((e) => e.sets.map((s) => s.doneAt)).filter((t): t is string => !!t).map((t) => (new Date(t).getTime() - start) / 60_000);
  const top = Math.max(...beats, 1);
  const low = Math.min(...beats, top) - 10;

  return (
    <View style={{ marginTop: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="heart" size={14} color="#EF4444" />
        <Text style={{ flex: 1, fontSize: 12.5, fontWeight: "700", letterSpacing: 0.8, color: c.muted }}>YOUR BODY</Text>
        {v && <Text style={{ fontSize: 12, color: c.faint }}>{v.watchWorkout ? "Watch workout" : "Watch worn, no workout"}</Text>}
      </View>

      <View style={{ marginTop: 10, flexDirection: "row" }}>
        <Tap onPress={() => cal && Alert.alert(cal.measured ? "Calories, from your Watch" : "Calories, estimated", cal.how.join("\n\n"))} disabled={!cal} accessibilityRole="button" style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: c.text }}>{cal ? `${cal.measured ? "" : "~"}${cal.kcal.toLocaleString()}` : "—"}</Text>
          <Text style={{ marginTop: 2, fontSize: 12, color: c.muted }}>
            {cal ? (cal.measured ? "kcal · Watch" : "kcal · estimated") : "kcal"} <Ionicons name="information-circle-outline" size={12} color={c.faint} />
          </Text>
        </Tap>
        <Figure value={v?.avgHr ? `${v.avgHr}` : "—"} label="avg bpm" colors={c} />
        <Figure value={v?.maxHr ? `${v.maxHr}` : "—"} label="peak bpm" colors={c} />
      </View>

      {beats.length >= 3 ? (
        <>
          {/* A minute at a time, each bar in its zone's colour; the sets you
              ticked marked along the bottom. */}
          <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ marginTop: 14, height: 70, flexDirection: "row", alignItems: "flex-end", gap: 1 }}>
            {width > 0 &&
              hr.map((b, i) => (
                <View key={i} style={{ flex: 1, height: b ? Math.max(3, ((b - low) / (top - low)) * 70) : 0, borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: zoneOf(b / max)?.color ?? c.track }} />
              ))}
          </View>
          <View style={{ height: 8, marginTop: 3 }}>
            {width > 0 &&
              sets.map((m, i) => (
                <View key={i} style={{ position: "absolute", left: Math.max(0, Math.min(width - 4, (m / hr.length) * width - 2)), top: 2, width: 4, height: 4, borderRadius: 2, backgroundColor: c.muted }} />
              ))}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 11, color: c.faint }}>Start</Text>
            {sets.length > 0 && <Text style={{ fontSize: 11, color: c.faint }}>• a set</Text>}
            <Text style={{ fontSize: 11, color: c.faint }}>{hr.length} min</Text>
          </View>

          {/* Time in each zone */}
          <View style={{ marginTop: 12, height: 8, borderRadius: 4, overflow: "hidden", flexDirection: "row", backgroundColor: c.track }}>
            {inZone.map((z) => (z.minutes ? <View key={z.name} style={{ flex: z.minutes, backgroundColor: z.color }} /> : null))}
          </View>
          <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 4 }}>
            {inZone
              .filter((z) => z.minutes)
              .map((z) => (
                <View key={z.name} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: z.color }} />
                  <Text style={{ fontSize: 12, color: c.muted }}>
                    {z.name} {z.minutes} min
                  </Text>
                </View>
              ))}
          </View>
          {v && !v.watchWorkout && <Text style={{ marginTop: 8, fontSize: 12.5, lineHeight: 17, color: c.faint }}>Heart rate every few minutes — start a strength workout on your Watch while you lift for it every few seconds, and calories measured.</Text>}
          {mostly && (
            <Text style={{ marginTop: 8, fontSize: 12.5, lineHeight: 17, color: c.faint }}>
              Mostly {mostly.name.toLowerCase()} — zones by your maximum, {max} bpm{me.age != null ? ` (220 less your age${v?.maxHr && v.maxHr > 220 - me.age ? ", or the highest you've reached" : ""})` : ""}.
            </Text>
          )}
        </>
      ) : (
        <Text style={{ marginTop: 10, fontSize: 12.5, lineHeight: 17, color: c.faint }}>
          {v ? "Too little heart rate from your Watch in this session to chart." : "No Watch data for this session."}
        </Text>
      )}
    </View>
  );
}

function Figure({ value, label, colors: c }: { value: string; label: string; colors: OrbitColors }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 20, fontWeight: "800", color: c.text }}>{value}</Text>
      <Text style={{ marginTop: 2, fontSize: 12, color: c.muted }}>{label}</Text>
    </View>
  );
}
