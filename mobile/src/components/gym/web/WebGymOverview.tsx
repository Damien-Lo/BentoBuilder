import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { minutesLabel } from "@/src/components/calendar/calendarUtils";
import { ExerciseIcon } from "@/src/components/gym/ExerciseIcon";
import { lbs } from "@/src/components/gym/exerciseStats";
import { caloriesOf, plannedDays, startPlannedPath, todayPlanned, useGymOverview } from "@/src/components/gym/overview";
import type { PlannedDay } from "@/src/components/gym/plan";
import { sessionRecords } from "@/src/components/gym/progressStats";
import { dayLabel, durationLabel, thisWeek, weekStreak, type WeekDay } from "@/src/components/gym/schedule";
import { ActiveBanner, Figure, MusclesCard, Quiet, RecordsCard, type Hover } from "@/src/components/gym/web/parts";
import { Button, Card, CardLink, hoverable, PageTitle, Row, WebPage } from "@/src/components/web/ui";
import { sessionTotals, type GymSessionRecord } from "@/src/services/gymApi";
import { useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import { toDateStr } from "@/src/utils/mealPlan";

// Gym in a desktop browser: training at a glance, each card opening its
// page — today (what's planned, to start from here, or the workout under
// way), this week (the days planned and trained, the time and calories,
// the weeks in a row), the last workout (its numbers, exercises and
// records), your recent records, and the muscles you've trained this week.

export function WebGymOverview() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const { sessions, active, failed, weights, ratio, plan, today } = useGymOverview();
  const go = (path: string) => router.push(path as Href);
  const weekday = new Date().toLocaleDateString(undefined, { weekday: "long" });
  const week = sessions ? thisWeek(sessions) : null;

  const title = (
    <PageTitle
      title="Gym"
      subtitle={week ? `${weekday} · ${week.sessions.length} workout${week.sessions.length === 1 ? "" : "s"} this week` : "Your training at a glance"}
      right={
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label="Weekly plan" icon="calendar-outline" onPress={() => go("/gym/plan")} />
          <Button label="Workouts" icon="barbell-outline" kind="primary" onPress={() => go("/gym/workouts")} />
        </View>
      }
    />
  );
  if (!sessions || !week)
    return (
      <WebPage>
        {title}
        <Text style={{ fontSize: 14, color: c.muted }}>{failed ? "Couldn't load your training." : "Loading…"}</Text>
      </WebPage>
    );

  const streak = weekStreak(sessions);
  const last = sessions[0] ?? null;
  const todayPlan = todayPlanned(plan, today);
  const planned = plannedDays(plan);
  const trained = week.sessions.reduce((n, s) => n + sessionTotals(s).seconds, 0);
  const burned = caloriesOf(week.sessions, sessions, weights, ratio);

  return (
    <WebPage>
      {title}

      <Row>
        {/* Today — or the one under way */}
        <Card title={active ? "In progress" : "Today"} subtitle={active ? undefined : todayPlan.length ? `${todayPlan.length} planned` : undefined} style={{ flex: 1.2, minWidth: 420 }}>
          {active ? (
            <ActiveBanner active={active} onPress={() => go("/gym/session")} />
          ) : todayPlan.length ? (
            <View style={{ gap: 10 }}>
              {todayPlan.map((p) => (
                <TodayPlan
                  key={p.event._id}
                  item={p}
                  onStart={() => go(startPlannedPath(p))}
                  onOpen={() => go(p.status === "done" && p.session ? `/gym/sessions/${p.session}` : `/calendar/event/${p.event._id}?date=${p.date}`)}
                  colors={c}
                />
              ))}
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.pill }}>
                <Ionicons name="calendar-clear-outline" size={22} color={c.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }}>Nothing planned today</Text>
                <Text style={{ marginTop: 2, fontSize: 13, color: c.muted }}>Start any workout from Workouts, or plan your week</Text>
              </View>
              <Button label="Workouts" onPress={() => go("/gym/workouts")} small />
            </View>
          )}
        </Card>

        {/* This week */}
        <Card title="This week" subtitle="Planned days ringed, the days you trained filled" action={<CardLink label="Plan" onPress={() => go("/gym/plan")} />} style={{ flex: 1, minWidth: 420 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {week.days.map((day) => (
              <Day key={day.date.toISOString()} day={day} planned={planned.has(toDateStr(day.date))} isPast={toDateStr(day.date) < today} colors={c} />
            ))}
          </View>
          <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.border, flexDirection: "row", gap: 12 }}>
            <Figure label={week.sessions.length === 1 ? "workout" : "workouts"} value={String(week.sessions.length)} colors={c} />
            <Figure label="trained" value={week.sessions.length ? durationLabel(trained) : "—"} colors={c} />
            <Figure label="kcal burned" value={burned.kcal ? `${burned.estimated ? "~" : ""}${burned.kcal.toLocaleString()}` : "—"} colors={c} />
            <Figure label="in a row" value={streak ? `${streak} week${streak === 1 ? "" : "s"}` : "—"} colors={c} />
          </View>
          {!streak && (
            <View style={{ marginTop: 10 }}>
              <Quiet text="Train this week to start a streak." colors={c} />
            </View>
          )}
        </Card>
      </Row>

      <Row>
        {/* The last workout */}
        <Card title="Last workout" action={<CardLink label="History" onPress={() => go("/gym/history")} />} style={{ flex: 1.2, minWidth: 380 }}>
          {last ? <LastWorkout session={last} sessions={sessions} onOpen={() => go(`/gym/sessions/${last._id}`)} colors={c} /> : <Quiet text="Finish a workout and how it went shows here." colors={c} />}
        </Card>

        <RecordsCard sessions={sessions} count={5} style={{ flex: 1, minWidth: 320 }} />
        <MusclesCard sessions={sessions} style={{ flex: 1, minWidth: 300 }} />
      </Row>
    </WebPage>
  );
}

// A day this week: filled when you trained, today underlined. (Planned and
// not done: a ring — amber once the day's gone by.)
function Day({ day, planned, isPast, colors: c }: { day: WeekDay; planned: boolean; isPast: boolean; colors: OrbitColors }) {
  const ring = planned && !day.done;
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: day.today ? "800" : "600", color: day.today ? c.text : c.faint }}>{day.date.toLocaleDateString(undefined, { weekday: "short" })}</Text>
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: day.done ? c.ink : "transparent", borderWidth: ring ? 2 : 0, borderColor: isPast ? c.warning : c.ink }}>
        {day.done ? <Ionicons name="checkmark" size={20} color={c.onInk} /> : <Text style={{ fontSize: 14, fontWeight: "600", color: day.today ? c.text : c.faint }}>{day.date.getDate()}</Text>}
      </View>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: day.today ? c.text : "transparent" }} />
    </View>
  );
}

// A workout planned today: its routine, its time and exercises, and Start —
// or, done, the session; skipped, said so. Clicked: its calendar event (or,
// done, the session).
function TodayPlan({ item: p, onStart, onOpen, colors: c }: { item: PlannedDay; onStart: () => void; onOpen: () => void; colors: OrbitColors }) {
  const exercises = p.routine?.exercises.filter((e) => e.exercise) ?? [];
  const time = `${minutesLabel(p.event.startMinutes)}–${minutesLabel(p.event.endMinutes)}`;
  return (
    <Pressable onPress={onOpen} style={hoverable(({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: hovered ? c.pill : c.surface }))}>
      <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: p.status === "done" ? c.success : c.ink }}>
        <Ionicons name={p.status === "done" ? "checkmark" : "barbell"} size={22} color={p.status === "done" ? "#FFFFFF" : c.onInk} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }} numberOfLines={1}>
          {p.routine?.name ?? "Any workout"}
        </Text>
        <Text style={{ marginTop: 2, fontSize: 13, color: c.muted }} numberOfLines={1}>
          {p.status === "done" ? "Done today" : p.status === "skipped" ? "Skipped today" : `${p.event.title} · ${time}`}
          {p.status === "open" && exercises.length ? ` · ${exercises.length} exercises` : ""}
        </Text>
        {p.status === "open" && exercises.length > 0 && (
          <Text style={{ marginTop: 4, fontSize: 12.5, lineHeight: 18, color: c.icon }} numberOfLines={2}>
            {exercises.map((e) => e.exercise.name).join(", ")}
          </Text>
        )}
      </View>
      {p.status === "open" ? <Button label="Start" icon="play" kind="primary" onPress={onStart} /> : <Ionicons name="chevron-forward" size={18} color={c.faint} />}
    </Pressable>
  );
}

// The last workout: when, how long, how much, its exercises, and any
// records it set. Clicked: the session.
function LastWorkout({ session, sessions, onOpen, colors: c }: { session: GymSessionRecord; sessions: GymSessionRecord[]; onOpen: () => void; colors: OrbitColors }) {
  const totals = sessionTotals(session);
  const records = sessionRecords(session, sessions);
  const exercises = session.exercises.filter((e) => e.exercise);
  return (
    <Pressable onPress={onOpen} style={hoverable(({ hovered }: Hover) => ({ margin: -8, padding: 8, borderRadius: 12, backgroundColor: hovered ? c.pill : "transparent" }))}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: c.text }} numberOfLines={1}>
            {session.name}
          </Text>
          <Text style={{ marginTop: 2, fontSize: 13, color: c.muted }}>{dayLabel(session.finishedAt)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.faint} />
      </View>
      <View style={{ marginTop: 14, flexDirection: "row", gap: 12 }}>
        <Figure label="Duration" value={durationLabel(totals.seconds)} colors={c} />
        <Figure label="Volume" value={`${lbs(Math.round(totals.volume))} lbs`} colors={c} />
        <Figure label="Sets" value={String(totals.sets)} colors={c} />
      </View>
      {exercises.length > 0 && (
        <View style={{ marginTop: 14, gap: 6 }}>
          {exercises.slice(0, 5).map((e, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ExerciseIcon name={e.exercise!.name} primary={e.exercise!.primaryMuscles} secondary={e.exercise!.secondaryMuscles} size={28} />
              <Text style={{ flex: 1, fontSize: 13.5, color: c.icon }} numberOfLines={1}>
                {e.sets.length} × {e.exercise!.name}
              </Text>
            </View>
          ))}
          {exercises.length > 5 && <Text style={{ fontSize: 12.5, color: c.muted }}>and {exercises.length - 5} more</Text>}
        </View>
      )}
      {records.length > 0 && (
        <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border, gap: 6 }}>
          {records.slice(0, 3).map((r) => (
            <View key={r.exercise._id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="trophy" size={15} color={c.warning} />
              <Text style={{ flex: 1, fontSize: 13.5, color: c.text }} numberOfLines={1}>
                {r.exercise.name}
              </Text>
              <Text style={{ fontSize: 13.5, fontWeight: "700", color: c.text }}>{r.best.text}</Text>
            </View>
          ))}
          {records.length > 3 && <Text style={{ fontSize: 12.5, color: c.muted }}>and {records.length - 3} more record{records.length - 3 === 1 ? "" : "s"}</Text>}
        </View>
      )}
    </Pressable>
  );
}
