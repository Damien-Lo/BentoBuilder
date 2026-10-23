import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { clock } from "@/src/components/gym/activeSession";
import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import type { Achievement } from "@/src/components/gym/progressStats";
import { SessionBody } from "@/src/components/gym/SessionBody";
import { setText, trackOf } from "@/src/components/gym/tracking";
import { BackLink } from "@/src/components/pantry/web/orbitWeb";
import { Button, Card, Empty, hoverable, PageTitle, Row, Stat, WebPage } from "@/src/components/web/ui";
import { setLabels, setTypeOf, sessionTotals, type GymSessionRecord } from "@/src/services/gymApi";
import { OrbitPage, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// One finished workout in a desktop browser: every exercise down the left,
// each with its sets in a row (warm-ups and drops by their letter) and the
// records it set marked — each opening the exercise's page; beside them how
// long it took and what it came to, your body (calories, your heart rate a
// minute at a time, its zones) and the records it set. Just finished, it
// opens with how it went. Edit and Delete at the top. (Editing is the
// phone's page, in a column.)

type Hover = { hovered?: boolean };

// The records card's trophy: gold, either theme.
const GOLD = "#EAB308";

export function WebSessionDetail({
  session,
  failed,
  records,
  all,
  finished,
  onBack,
  onDone,
  onEdit,
  onDelete,
}: {
  session: GymSessionRecord | null;
  failed: boolean;
  // Records it set (null while they're worked out).
  records: Achievement[] | null;
  // Every workout, for its calories by your own rate.
  all: GymSessionRecord[];
  finished: boolean;
  onBack: () => void;
  onDone: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();

  if (!session) {
    return (
      <OrbitPage>
        <WebPage maxWidth={1280}>
          <BackLink label="Back" onPress={onBack} />
          <PageTitle title="Workout" />
          <Text style={{ fontSize: 14, color: c.muted }}>{failed ? "Couldn't load this workout." : "Loading…"}</Text>
        </WebPage>
      </OrbitPage>
    );
  }

  const t = sessionTotals(session);
  const d = new Date(session.finishedAt);
  const exercises = session.exercises.filter((e) => e.exercise);
  const recordsOf = (id: string) => (records ?? []).filter((r) => r.exercise._id === id);

  return (
    <OrbitPage>
      <WebPage maxWidth={1280}>
        <BackLink label="Back" onPress={onBack} />
        <PageTitle
          title={session.name}
          subtitle={`${d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}
          right={
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button label="Edit" icon="create-outline" onPress={onEdit} />
              <Button label="Delete" icon="trash-outline" onPress={onDelete} />
            </View>
          }
        />

        {/* Just finished: how it went */}
        {finished && (
          <View style={{ marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 18, backgroundColor: c.success }}>
            <Ionicons name="checkmark-circle" size={26} color="#FFFFFF" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: "800", color: "#FFFFFF" }}>Workout done</Text>
              <Text style={{ marginTop: 2, fontSize: 13.5, color: "#FFFFFF", opacity: 0.9 }}>
                {records?.length ? `${records.length} new record${records.length === 1 ? "" : "s"} — nice work.` : "Saved to your history. Nice work."}
              </Text>
            </View>
            <Pressable onPress={onDone} accessibilityRole="button" style={hoverable(({ hovered }: Hover) => ({ borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7, backgroundColor: hovered ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.22)" }))}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>Done</Text>
            </Pressable>
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
          {/* Its exercises, each with its sets */}
          <View style={{ flex: 1, minWidth: 0, gap: 16 }}>
            {exercises.map((e, i) => (
              <ExerciseCard key={i} item={e} records={recordsOf(e.exercise!._id)} onOpen={() => router.push(`/gym/exercise/${e.exercise!._id}` as Href)} colors={c} />
            ))}
            {!exercises.length && (
              <Card>
                <Empty icon="barbell-outline" text="No exercises left in this workout." />
              </Card>
            )}
          </View>

          {/* What it came to, your body, its records */}
          <View style={{ width: 460 }}>
            <Row gap={12}>
              <Stat label="Time" value={clock(t.seconds)} icon="time-outline" />
              <Stat label="Volume" value={`${Math.round(t.volume).toLocaleString()} lbs`} icon="barbell-outline" />
            </Row>
            <Row gap={12} style={{ marginBottom: 0 }}>
              <Stat label="Sets" value={String(t.sets)} icon="layers-outline" />
              <Stat label="Records" value={records ? String(records.length) : "…"} icon="trophy-outline" />
            </Row>
            <SessionBody session={session} all={all} colors={c} />
            <Card title="Records" subtitle="Each exercise's best — or its total weight — beaten" style={{ marginTop: 12 }}>
              {records === null ? (
                <Text style={{ fontSize: 13, color: c.muted }}>Working them out…</Text>
              ) : records.length === 0 ? (
                <Text style={{ fontSize: 13, lineHeight: 18, color: c.muted }}>None this time — beat an exercise&apos;s best and it shows here.</Text>
              ) : (
                records.map((r) => (
                  <Pressable
                    key={`${r.exercise._id}-${r.kind}`}
                    onPress={() => router.push(`/gym/exercise/${r.exercise._id}` as Href)}
                    style={hoverable(({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 6, marginHorizontal: -6, borderRadius: 8, backgroundColor: hovered ? c.pill : "transparent" }))}
                  >
                    <Ionicons name="trophy" size={15} color={GOLD} />
                    <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "600", color: c.text }} numberOfLines={1}>
                      {r.exercise.name}
                    </Text>
                    <Text style={{ fontSize: 13.5, fontWeight: "800", color: c.text }}>
                      {r.text} <Text style={{ fontWeight: "700", color: c.success }}>{r.gain}</Text>
                    </Text>
                  </Pressable>
                ))
              )}
            </Card>
          </View>
        </View>
      </WebPage>
    </OrbitPage>
  );
}

// An exercise in the workout: its name (opening its page), any note, the
// records it set, and its sets side by side.
function ExerciseCard({ item: e, records, onOpen, colors: c }: { item: GymSessionRecord["exercises"][number]; records: Achievement[]; onOpen: () => void; colors: OrbitColors }) {
  const exercise = e.exercise!;
  const track = trackOf(exercise);
  const labels = setLabels(e.sets);
  return (
    <Card padded={false}>
      <Pressable onPress={onOpen} accessibilityRole="button" style={hoverable(({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: hovered ? c.pill : "transparent" }))}>
        <ExerciseIcon name={exercise.name} primary={exercise.primaryMuscles} secondary={exercise.secondaryMuscles} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }} numberOfLines={1}>
            {exercise.name}
          </Text>
          <Text style={{ marginTop: 1, fontSize: 12.5, color: c.muted }}>
            {e.sets.length} set{e.sets.length === 1 ? "" : "s"}
          </Text>
        </View>
        {records.map((r) => (
          <View key={r.kind} style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: c.pill }}>
            <Ionicons name="trophy" size={12} color={GOLD} />
            <Text style={{ fontSize: 12, fontWeight: "700", color: c.onPill }}>
              {r.text} · {r.gain}
            </Text>
          </View>
        ))}
        <Ionicons name="chevron-forward" size={16} color={c.faint} />
      </Pressable>
      <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
        {!!e.note && <Text style={{ marginBottom: 10, fontSize: 13.5, fontStyle: "italic", color: c.muted }}>{e.note}</Text>}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {e.sets.map((s, n) => (
            <View key={n} style={{ minWidth: 150, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.canvas }}>
              <Text style={{ width: 18, fontSize: 13, fontWeight: "800", color: setTypeOf(s.type).color ?? c.faint }}>{labels[n]}</Text>
              <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }}>{setText(s, track)}</Text>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}
