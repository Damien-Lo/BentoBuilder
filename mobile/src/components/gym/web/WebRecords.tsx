import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import { exerciseBests, recordTimeline } from "@/src/components/gym/progressStats";
import { dayLabel } from "@/src/components/gym/schedule";
import { trackOf, type Track } from "@/src/components/gym/tracking";
import { useFinishedSessions } from "@/src/components/gym/useFinishedSessions";
import { BackLink } from "@/src/components/pantry/web/orbitWeb";
import { Card, CardLink, Empty, hoverable, PageTitle, Row, Stat, WebPage } from "@/src/components/web/ui";
import { OrbitPage, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Gym → Progress → Personal records in a desktop browser: how many records
// you've set (lately, and in all), then side by side every exercise you've
// done as a table — how often, when last, its best and, for a lift, its
// best estimated one-rep max (1RM) — and the records you've set lately,
// each beating your best before and by how much. A row opens the exercise.

type Hover = { hovered?: boolean };

// What each track's best is (under the number).
const BEST_LABEL: Record<Track, string> = { weight: "heaviest", bodyweight: "most reps", assisted: "least help", duration: "longest", cardio: "best" };

export function WebRecords({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const { sessions, failed } = useFinishedSessions();
  const [showAll, setShowAll] = useState(false);
  const open = (id: string) => router.push(`/gym/exercise/${id}` as Href);

  const timeline = sessions ? recordTimeline(sessions) : [];
  const recent = showAll ? timeline : timeline.slice(0, 10);
  const bests = sessions ? exerciseBests(sessions) : [];
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const lately = timeline.filter((r) => r.finishedAt >= monthAgo).length;

  return (
    <OrbitPage>
      <WebPage maxWidth={1280}>
        <BackLink label="Progress" onPress={onBack} />
        <PageTitle title="Personal records" subtitle="Your best lifts, and when you set them" />

        {!sessions ? (
          <Text style={{ fontSize: 14, color: c.muted }}>{failed ? "Couldn't load your records." : "Loading…"}</Text>
        ) : !bests.length ? (
          <Card>
            <Empty icon="trophy-outline" text="No records yet — finish a workout and your best lifts show here." />
          </Card>
        ) : (
          <>
            <Row>
              <Stat label="Records in the last 30 days" value={String(lately)} icon="trophy-outline" />
              <Stat label="Records in all" value={String(timeline.length)} icon="ribbon-outline" />
              <Stat label="Exercises done" value={String(bests.length)} icon="barbell-outline" />
            </Row>

            <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
              {/* Every exercise's bests */}
              <Card title="Best, by exercise" subtitle="The most recently done first" style={{ flex: 1.5, minWidth: 0 }} padded={false}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border }}>
                  <Text style={[head(c), { flex: 1 }]}>EXERCISE</Text>
                  <Text style={[head(c), { width: 70, textAlign: "right" }]}>TIMES</Text>
                  <Text style={[head(c), { width: 110, textAlign: "right" }]}>LAST</Text>
                  <Text style={[head(c), { width: 130, textAlign: "right" }]}>BEST</Text>
                  <Text style={[head(c), { width: 80, textAlign: "right" }]}>1RM</Text>
                  <View style={{ width: 16 }} />
                </View>
                {bests.map((b) => {
                  const track = trackOf(b.exercise);
                  const oneRm = track === "weight" ? b.records.find((r) => r.label === "Best 1RM")?.value : null;
                  return (
                    <Pressable key={b.exercise._id} onPress={() => open(b.exercise._id)} accessibilityRole="button" style={hoverable(({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: hovered ? c.pill : "transparent" }))}>
                      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 }}>
                        <ExerciseIcon name={b.exercise.name} primary={b.exercise.primaryMuscles} secondary={b.exercise.secondaryMuscles} size={36} />
                        <Text style={{ flex: 1, fontSize: 14.5, fontWeight: "600", color: c.text }} numberOfLines={1}>
                          {b.exercise.name}
                        </Text>
                      </View>
                      <Text style={[cell(c), { width: 70 }]}>{b.times}</Text>
                      <Text style={[cell(c), { width: 110 }]}>{dayLabel(b.lastDone)}</Text>
                      <View style={{ width: 130, alignItems: "flex-end" }}>
                        <Text style={{ fontSize: 14.5, fontWeight: "800", color: c.text }}>{b.best?.text ?? "—"}</Text>
                        {!!b.best && <Text style={{ fontSize: 11.5, color: c.faint }}>{BEST_LABEL[track]}</Text>}
                      </View>
                      <Text style={[cell(c), { width: 80, fontWeight: "700", color: oneRm ? c.text : c.faint }]}>{oneRm ? oneRm.replace(/\.\d+/, "") : "—"}</Text>
                      <Ionicons name="chevron-forward" size={16} color={c.faint} />
                    </Pressable>
                  );
                })}
              </Card>

              {/* Lately */}
              <Card
                title="Recent records"
                subtitle="Each beating your best before"
                action={timeline.length > 10 ? <CardLink label={showAll ? "Show fewer" : `Show all ${timeline.length}`} onPress={() => setShowAll((v) => !v)} /> : undefined}
                style={{ flex: 1, minWidth: 0 }}
                padded={false}
              >
                {recent.length === 0 ? (
                  <Text style={{ paddingHorizontal: 18, paddingBottom: 18, fontSize: 13.5, color: c.muted }}>Lift heavier than before on an exercise and it shows here.</Text>
                ) : (
                  recent.map((r) => (
                    <Pressable key={`${r.sessionId}-${r.exercise._id}`} onPress={() => open(r.exercise._id)} accessibilityRole="button" style={hoverable(({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: hovered ? c.pill : "transparent" }))}>
                      <ExerciseIcon name={r.exercise.name} primary={r.exercise.primaryMuscles} secondary={r.exercise.secondaryMuscles} size={36} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }} numberOfLines={1}>
                          {r.exercise.name}
                        </Text>
                        <Text style={{ marginTop: 1, fontSize: 12.5, color: c.muted }} numberOfLines={1}>
                          {dayLabel(r.finishedAt)} · {r.best.lower ? `was ${r.previous.text.replace("−", "")} of help` : `up from ${r.previous.text}`}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontSize: 14, fontWeight: "800", color: c.text }}>{r.best.text}</Text>
                        <Text style={{ marginTop: 1, fontSize: 12, fontWeight: "700", color: c.success }}>{r.gain}</Text>
                      </View>
                    </Pressable>
                  ))
                )}
              </Card>
            </View>
          </>
        )}
      </WebPage>
    </OrbitPage>
  );
}

const head = (c: OrbitColors) => ({ fontSize: 11, fontWeight: "700" as const, letterSpacing: 1, color: c.faint });
const cell = (c: OrbitColors) => ({ fontSize: 13.5, color: c.muted, textAlign: "right" as const, fontVariant: ["tabular-nums" as const] });
