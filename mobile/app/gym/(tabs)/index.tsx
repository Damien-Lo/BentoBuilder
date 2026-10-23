import { useRouter, type Href } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";

import { clock } from "@/src/components/gym/activeSession";
import { lbs } from "@/src/components/gym/exerciseStats";
import { caloriesOf, plannedDays, startPlannedPath, todayPlanned, useGymOverview } from "@/src/components/gym/overview";
import { sessionRecords } from "@/src/components/gym/progressStats";
import { dayLabel, durationLabel, thisWeek, weekStreak, type WeekDay } from "@/src/components/gym/schedule";
import { minutesLabel } from "@/src/components/calendar/calendarUtils";
import type { PlannedDay } from "@/src/components/gym/plan";
import { WebGymOverview } from "@/src/components/gym/web/WebGymOverview";
import { toDateStr } from "@/src/utils/mealPlan";
import { Tap } from "@/src/components/ui/Tap";
import { sessionTotals, type GymSessionRecord } from "@/src/services/gymApi";
import { OrbitPage, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// Gym → Overview: how training's going at a glance — what's planned today
// (the Gym calendar's workouts, to start from here) or the workout under
// way, this week with the days planned (a ring) and trained (filled), and
// the weekly plan a tap away, this week day by day, the weeks in a
// row you've trained, the time trained and calories burned (each session's,
// measured or estimated: sessionEnergy.ts), and how the last workout went.
// (A desktop browser: all of it as a dashboard — WebGymOverview.)
export default function GymOverviewTab() {
  const wide = useWideWeb();
  return wide ? (
    <OrbitPage>
      <WebGymOverview />
    </OrbitPage>
  ) : (
    <GymOverview />
  );
}

function GymOverview() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const { sessions, active, failed, weights, ratio, plan, today } = useGymOverview();
  const resume = () => router.push("/gym/session" as Href);

  const loaded = !!sessions;
  const week = sessions ? thisWeek(sessions) : null;
  const streak = sessions ? weekStreak(sessions) : 0;
  const last = sessions?.[0] ?? null;
  const weekday = new Date().toLocaleDateString(undefined, { weekday: "long" });
  const todayPlan = todayPlanned(plan, today);
  const planned = plannedDays(plan);
  const start = (p: PlannedDay) => router.push(startPlannedPath(p) as Href);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>Gym</Text>
        <Text style={{ marginTop: 2, fontSize: 14, color: c.muted }}>
          {week ? `${weekday} · ${week.sessions.length} workout${week.sessions.length === 1 ? "" : "s"} this week` : "Your training at a glance"}
        </Text>

        {!loaded ? (
          failed ? <Text style={{ marginTop: 32, textAlign: "center", fontSize: 14, color: c.muted }}>Couldn&apos;t load your training.</Text> : <ActivityIndicator style={{ marginTop: 32 }} color={c.muted} />
        ) : (
          <>
            {/* Today's plan — or the one under way */}
            <Heading colors={c}>{active ? "IN PROGRESS" : "TODAY"}</Heading>
            {active ? (
              <Tap onPress={resume} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 18, backgroundColor: c.success }} pressedStyle={{ opacity: 0.85 }}>
                <Ionicons name="barbell" size={24} color="#FFFFFF" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: "700", color: "#FFFFFF" }} numberOfLines={1}>
                    {active.name}
                  </Text>
                  <Text style={{ marginTop: 2, fontSize: 13, fontWeight: "600", color: "#FFFFFF", opacity: 0.85 }}>Started {clock((Date.now() - new Date(active.startedAt).getTime()) / 1000)} ago</Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFFFFF" }}>Resume</Text>
                <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
              </Tap>
            ) : todayPlan.length ? (
              <View style={{ gap: 10 }}>
                {todayPlan.map((p) => (
                  <TodayPlan key={p.event._id} item={p} onStart={() => start(p)} onOpen={() => router.push(`/calendar/event/${p.event._id}?date=${p.date}` as Href)} onSession={(id) => router.push(`/gym/sessions/${id}` as Href)} colors={c} />
                ))}
              </View>
            ) : (
              <Tap onPress={() => router.push("/gym/workouts" as Href)} accessibilityRole="button" accessibilityHint="Opens Workouts" style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }} pressedStyle={{ backgroundColor: c.pill }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.pill }}>
                  <Ionicons name="calendar-clear-outline" size={22} color={c.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }}>Nothing planned today</Text>
                  <Text style={{ marginTop: 2, fontSize: 13, color: c.muted }}>Start any workout from Workouts, or plan your week</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.faint} />
              </Tap>
            )}

            {/* This week */}
            {week && (
              <>
                <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                  <View style={{ flex: 1 }}>
                    <Heading colors={c}>THIS WEEK</Heading>
                  </View>
                  <Tap onPress={() => router.push("/gym/plan" as Href)} accessibilityRole="link" hitSlop={8} style={{ marginBottom: 8, marginRight: 4, flexDirection: "row", alignItems: "center", gap: 2 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: c.ink }}>Plan</Text>
                    <Ionicons name="chevron-forward" size={13} color={c.ink} />
                  </Tap>
                </View>
                <View style={{ padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    {week.days.map((day) => (
                      <Day key={day.date.toISOString()} day={day} planned={planned.has(toDateStr(day.date))} isPast={toDateStr(day.date) < today} colors={c} />
                    ))}
                  </View>
                  {week.sessions.length > 0 && (
                    <View style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Ionicons name="time-outline" size={18} color={c.text} />
                      <Text style={{ flex: 1, fontSize: 14, color: c.muted }}>
                        <Text style={{ fontWeight: "700", color: c.text }}>{durationLabel(week.sessions.reduce((n, s) => n + sessionTotals(s).seconds, 0))}</Text> trained
                        {(() => {
                          const { kcal, estimated } = caloriesOf(week.sessions, sessions!, weights, ratio);
                          return kcal ? (
                            <>
                              {" · "}
                              <Text style={{ fontWeight: "700", color: c.text }}>
                                {estimated ? "~" : ""}
                                {kcal.toLocaleString()} kcal
                              </Text>{" "}
                              burned
                            </>
                          ) : null;
                        })()}
                      </Text>
                    </View>
                  )}
                  <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="flame" size={18} color={streak ? c.text : c.faint} />
                    <Text style={{ flex: 1, fontSize: 14, color: c.muted }}>
                      {streak ? (
                        <>
                          <Text style={{ fontWeight: "700", color: c.text }}>
                            {streak} week{streak === 1 ? "" : "s"}
                          </Text>{" "}
                          in a row
                        </>
                      ) : (
                        "Train this week to start a streak"
                      )}
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* The last workout */}
            {last && sessions && (
              <>
                <Heading colors={c}>LAST WORKOUT</Heading>
                <LastCard session={last} sessions={sessions} onOpen={() => router.push(`/gym/sessions/${last._id}` as Href)} colors={c} />
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Heading({ children, colors: c }: { children: string; colors: OrbitColors }) {
  return <Text style={{ marginTop: 22, marginBottom: 8, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>{children}</Text>;
}

// A day this week: filled when you trained, today dotted.
// (Planned and not done: a ring — amber once the day's gone by.)
function Day({ day, planned, isPast, colors: c }: { day: WeekDay; planned: boolean; isPast: boolean; colors: OrbitColors }) {
  const ring = planned && !day.done;
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: day.today ? "800" : "600", color: day.today ? c.text : c.faint }}>{day.label}</Text>
      <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: day.done ? c.ink : "transparent", borderWidth: ring ? 2 : 0, borderColor: isPast ? c.warning : c.ink }}>
        {day.done ? <Ionicons name="checkmark" size={18} color={c.onInk} /> : <Text style={{ fontSize: 13, fontWeight: "600", color: day.today ? c.text : c.faint }}>{day.date.getDate()}</Text>}
      </View>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: day.today ? c.text : "transparent" }} />
    </View>
  );
}

// The last workout: when, how long, how much, and any records it set.
function LastCard({ session, sessions, onOpen, colors: c }: { session: GymSessionRecord; sessions: GymSessionRecord[]; onOpen: () => void; colors: OrbitColors }) {
  const totals = sessionTotals(session);
  const records = sessionRecords(session, sessions);
  return (
    <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={session.name} style={{ padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }} pressedStyle={{ backgroundColor: c.pill }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: c.text }} numberOfLines={1}>
            {session.name}
          </Text>
          <Text style={{ marginTop: 2, fontSize: 13, color: c.muted }}>{dayLabel(session.finishedAt)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.faint} />
      </View>
      <View style={{ marginTop: 14, flexDirection: "row" }}>
        <Figure label="Duration" value={durationLabel(totals.seconds)} colors={c} />
        <Figure label="Volume" value={`${lbs(Math.round(totals.volume))} lbs`} colors={c} />
        <Figure label="Sets" value={String(totals.sets)} colors={c} />
      </View>
      {records.length > 0 && (
        <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border, gap: 6 }}>
          {records.slice(0, 3).map((r) => (
            <View key={r.exercise._id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="trophy" size={15} color={c.warning} />
              <Text style={{ flex: 1, fontSize: 14, color: c.text }} numberOfLines={1}>
                {r.exercise.name}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }}>{r.best.text}</Text>
            </View>
          ))}
          {records.length > 3 && <Text style={{ fontSize: 13, color: c.muted }}>and {records.length - 3} more record{records.length - 3 === 1 ? "" : "s"}</Text>}
        </View>
      )}
    </Tap>
  );
}

function Figure({ label, value, colors: c }: { label: string; value: string; colors: OrbitColors }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 12, color: c.muted }}>{label}</Text>
      <Text style={{ marginTop: 2, fontSize: 16, fontWeight: "700", color: c.text }}>{value}</Text>
    </View>
  );
}

// A workout planned today: its routine and time, and Start — or, done, the
// session; skipped, said so. Tapped: its calendar event.
function TodayPlan({ item: p, onStart, onOpen, onSession, colors: c }: { item: PlannedDay; onStart: () => void; onOpen: () => void; onSession: (id: string) => void; colors: OrbitColors }) {
  const exercises = p.routine?.exercises.filter((e) => e.exercise).length ?? 0;
  const time = `${minutesLabel(p.event.startMinutes)}–${minutesLabel(p.event.endMinutes)}`;
  return (
    <Tap onPress={p.status === "done" && p.session ? () => onSession(p.session!) : onOpen} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }} pressedStyle={{ backgroundColor: c.pill }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: p.status === "done" ? c.success : c.ink }}>
        <Ionicons name={p.status === "done" ? "checkmark" : "barbell"} size={22} color={p.status === "done" ? "#FFFFFF" : c.onInk} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }} numberOfLines={1}>
          {p.routine?.name ?? "Any workout"}
        </Text>
        <Text style={{ marginTop: 2, fontSize: 13, color: c.muted }}>
          {p.status === "done" ? "Done today" : p.status === "skipped" ? "Skipped today" : time}
          {p.status === "open" && exercises ? ` · ${exercises} exercises` : ""}
        </Text>
      </View>
      {p.status === "open" ? (
        <Tap onPress={onStart} accessibilityRole="button" accessibilityLabel={`Start ${p.routine?.name ?? "a workout"}`} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: c.ink }} pressedStyle={{ opacity: 0.85 }}>
          <Ionicons name="play" size={14} color={c.onInk} />
          <Text style={{ fontSize: 14, fontWeight: "700", color: c.onInk }}>Start</Text>
        </Tap>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={c.faint} />
      )}
    </Tap>
  );
}
