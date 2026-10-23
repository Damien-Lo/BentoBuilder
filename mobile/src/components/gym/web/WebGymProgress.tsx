import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { lbs } from "@/src/components/gym/exerciseStats";
import { recordTimeline } from "@/src/components/gym/progressStats";
import { dayLabel, durationLabel, startOfWeek, weekStreak } from "@/src/components/gym/schedule";
import { MusclesCard, Quiet, RecordsCard, VolumeCard, type Hover } from "@/src/components/gym/web/parts";
import { Card, CardLink, hoverable, PageTitle, Row, Stat, WebPage } from "@/src/components/web/ui";
import { getSessions, sessionTotals, type GymSessionRecord } from "@/src/services/gymApi";
import { useOrbitTheme } from "@/src/theme/orbit";

// Gym's Progress in a desktop browser: this week in numbers (workouts,
// sets, the weight moved, the weeks in a row, records this month), then the
// ways to look back as cards, each opening its page — your volume week by
// week, the muscles you've trained, your recent records, and your history.

export function WebGymProgress() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const [sessions, setSessions] = useState<GymSessionRecord[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      getSessions().then(setSessions, () => setSessions([]));
    }, []),
  );
  const go = (path: string) => router.push(path as Href);

  if (!sessions)
    return (
      <WebPage>
        <PageTitle title="Progress" subtitle="How your training's going" />
        <Text style={{ fontSize: 14, color: c.muted }}>Loading…</Text>
      </WebPage>
    );

  // This week: from Monday.
  const monday = startOfWeek();
  const week = sessions.filter((s) => new Date(s.finishedAt) >= monday);
  const totals = week.map(sessionTotals);
  const volume = totals.reduce((n, t) => n + t.volume, 0);
  const sets = totals.reduce((n, t) => n + t.sets, 0);
  const streak = weekStreak(sessions);
  const records = recordTimeline(sessions).filter((r) => new Date(r.finishedAt).getTime() >= Date.now() - 30 * 86_400_000).length;

  return (
    <WebPage>
      <PageTitle title="Progress" subtitle="How your training's going" />

      {/* This week */}
      <Row>
        <Stat label="Workouts this week" value={String(week.length)} icon="barbell-outline" />
        <Stat label="Sets this week" value={String(sets)} icon="layers-outline" />
        <Stat label="Moved this week" value={`${Math.round(volume).toLocaleString()}`} sub="lbs" icon="trending-up-outline" />
        <Stat label="Weeks in a row" value={String(streak)} sub={streak ? undefined : "Train this week to start a streak"} icon="flame-outline" />
        <Stat label="Records this month" value={String(records)} sub="in the last 30 days" icon="trophy-outline" />
      </Row>

      <Row>
        <VolumeCard sessions={sessions} style={{ flex: 1.5, minWidth: 460 }} />
        <MusclesCard sessions={sessions} style={{ flex: 1, minWidth: 320 }} />
      </Row>

      <Row>
        <RecordsCard sessions={sessions} style={{ flex: 1, minWidth: 380 }} />

        {/* History */}
        <Card title="History" subtitle={sessions.length ? `${sessions.length} workout${sessions.length === 1 ? "" : "s"} finished` : undefined} action={<CardLink label="All of it" onPress={() => go("/gym/history")} />} style={{ flex: 1, minWidth: 380 }}>
          {sessions.length === 0 && <Quiet text="Start one from Workouts and finish it — it shows here." colors={c} />}
          {sessions.slice(0, 6).map((s) => {
            const t = sessionTotals(s);
            return (
              <Pressable key={s._id} onPress={() => go(`/gym/sessions/${s._id}`)} style={hoverable(({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 6, marginHorizontal: -6, borderRadius: 10, backgroundColor: hovered ? c.pill : "transparent" }))}>
                <Ionicons name="barbell" size={16} color={c.ink} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: "600", color: c.text }} numberOfLines={1}>
                    {s.name}
                  </Text>
                  <Text style={{ marginTop: 1, fontSize: 12, color: c.muted }}>{dayLabel(s.finishedAt)}</Text>
                </View>
                <Text style={{ fontSize: 12.5, color: c.muted }}>
                  {durationLabel(t.seconds)} · {lbs(Math.round(t.volume))} lbs · {t.sets} sets
                </Text>
              </Pressable>
            );
          })}
        </Card>
      </Row>
    </WebPage>
  );
}
