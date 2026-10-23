import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { clock } from "@/src/components/gym/activeSession";
import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import { durationLabel } from "@/src/components/gym/schedule";
import { useFinishedSessions } from "@/src/components/gym/useFinishedSessions";
import { BackLink } from "@/src/components/pantry/web/orbitWeb";
import { Card, Empty, hoverable, PageTitle, Row, Stat, WebPage } from "@/src/components/web/ui";
import { sessionTotals, type GymSessionRecord } from "@/src/services/gymApi";
import { OrbitPage, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Gym → Progress → History in a desktop browser: what you've done in all
// (workouts, time, weight moved, sets), then every workout you've finished
// as a table, the latest first, a card a month (with the month's totals) —
// each row its day and time, its name, its exercises, how long it took,
// the weight moved and the sets. A row opens the workout.

type Hover = { hovered?: boolean };
const n0 = (n: number) => Math.round(n).toLocaleString();

export function WebSessionHistory({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const { sessions, failed } = useFinishedSessions();

  // By month, the latest first.
  const months: { title: string; sessions: GymSessionRecord[] }[] = [];
  for (const s of sessions ?? []) {
    const title = new Date(s.finishedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const last = months[months.length - 1];
    if (last?.title === title) last.sessions.push(s);
    else months.push({ title, sessions: [s] });
  }
  const sum = (list: GymSessionRecord[]) =>
    list.reduce(
      (all, s) => {
        const t = sessionTotals(s);
        return { seconds: all.seconds + t.seconds, volume: all.volume + t.volume, sets: all.sets + t.sets };
      },
      { seconds: 0, volume: 0, sets: 0 },
    );
  const total = sum(sessions ?? []);

  return (
    <OrbitPage>
      <WebPage maxWidth={1280}>
        <BackLink label="Progress" onPress={onBack} />
        <PageTitle title="History" subtitle="Every workout you've finished" />

        {!sessions ? (
          <Text style={{ fontSize: 14, color: c.muted }}>{failed ? "Couldn't load your workouts." : "Loading…"}</Text>
        ) : sessions.length === 0 ? (
          <Card>
            <Empty icon="time-outline" text="No workouts yet — start one from Workouts and finish it, and it shows here." />
          </Card>
        ) : (
          <>
            <Row>
              <Stat label="Workouts" value={n0(sessions.length)} icon="barbell-outline" />
              <Stat label="Time in all" value={durationLabel(total.seconds)} icon="time-outline" />
              <Stat label="Weight moved" value={`${n0(total.volume)} lbs`} icon="trending-up-outline" />
              <Stat label="Sets" value={n0(total.sets)} icon="layers-outline" />
            </Row>

            <View style={{ gap: 16 }}>
              {months.map((month) => {
                const t = sum(month.sessions);
                return (
                  <Card key={month.title} title={month.title} subtitle={`${month.sessions.length} workout${month.sessions.length === 1 ? "" : "s"} · ${durationLabel(t.seconds)} · ${n0(t.volume)} lbs · ${n0(t.sets)} sets`} padded={false}>
                    <Head colors={c} />
                    {month.sessions.map((s) => (
                      <SessionRow key={s._id} session={s} onPress={() => router.push(`/gym/sessions/${s._id}` as Href)} colors={c} />
                    ))}
                  </Card>
                );
              })}
            </View>
          </>
        )}
      </WebPage>
    </OrbitPage>
  );
}

// The table's columns: their widths, shared by the heading and each row.
const COL = { when: 190, time: 90, volume: 120, sets: 60 };
const head = (c: OrbitColors) => ({ fontSize: 11, fontWeight: "700" as const, letterSpacing: 1, color: c.faint });

function Head({ colors: c }: { colors: OrbitColors }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 18, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border }}>
      <Text style={[head(c), { width: COL.when }]}>WHEN</Text>
      <Text style={[head(c), { width: 220 }]}>WORKOUT</Text>
      <Text style={[head(c), { flex: 1 }]}>EXERCISES</Text>
      <Text style={[head(c), { width: COL.time, textAlign: "right" }]}>TIME</Text>
      <Text style={[head(c), { width: COL.volume, textAlign: "right" }]}>VOLUME</Text>
      <Text style={[head(c), { width: COL.sets, textAlign: "right" }]}>SETS</Text>
      <View style={{ width: 16 }} />
    </View>
  );
}

// A workout: when, its name, its exercises (their icons, then their names),
// and what it came to.
function SessionRow({ session: s, onPress, colors: c }: { session: GymSessionRecord; onPress: () => void; colors: OrbitColors }) {
  const t = sessionTotals(s);
  const d = new Date(s.finishedAt);
  const exercises = s.exercises.filter((e) => e.exercise);
  const figure = { fontSize: 14, fontWeight: "700" as const, color: c.text, textAlign: "right" as const, fontVariant: ["tabular-nums" as const] };
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={hoverable(({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 18, paddingVertical: 11, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: hovered ? c.pill : "transparent" }))}>
      <View style={{ width: COL.when }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }}>{d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</Text>
        <Text style={{ marginTop: 1, fontSize: 12.5, color: c.muted }}>{d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Text>
      </View>
      <Text style={{ width: 220, fontSize: 14.5, fontWeight: "700", color: c.text }} numberOfLines={2}>
        {s.name}
      </Text>
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 2 }}>
          {exercises.slice(0, 4).map((e, i) => (
            <ExerciseIcon key={i} name={e.exercise!.name} primary={e.exercise!.primaryMuscles} secondary={e.exercise!.secondaryMuscles} size={28} />
          ))}
        </View>
        <Text style={{ flex: 1, fontSize: 13, color: c.muted }} numberOfLines={2}>
          {exercises.map((e) => `${e.sets.length} × ${e.exercise!.name}`).join(", ")}
        </Text>
      </View>
      <Text style={[figure, { width: COL.time }]}>{clock(t.seconds)}</Text>
      <Text style={[figure, { width: COL.volume }]}>{n0(t.volume)} lbs</Text>
      <Text style={[figure, { width: COL.sets }]}>{t.sets}</Text>
      <Ionicons name="chevron-forward" size={16} color={c.faint} />
    </Pressable>
  );
}
