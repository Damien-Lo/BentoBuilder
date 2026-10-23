import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { addDays, minutesLabel, MONTHS_SHORT, WEEKDAYS_SHORT } from "@/src/components/calendar/calendarUtils";
import { useGymPlan, type PlannedDay } from "@/src/components/gym/plan";
import { Button, Card, hoverable, PageTitle, WebPage } from "@/src/components/web/ui";
import { setGymDay, setGymStatus } from "@/src/services/calendarApi";
import { getWorkouts, type GymWorkout } from "@/src/services/gymApi";
import { OrbitPage, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import { parseLocalDate, todayStr } from "@/src/utils/mealPlan";

// Gym's weekly plan in a desktop browser: a column a day, its training
// stacked by time (Gym 08:15, Cardio 17:00…), each the workout planned
// that day — the series', or that day's own — and how it went (done,
// missed, skipped). One, picked, is planned beside the week: a routine for
// that day alone (or back to the series'), started, marked done, skipped,
// or its series edited. Week by week; + adds a training time on a day.

type Hover = { hovered?: boolean };
const mondayOf = (date: string) => addDays(date, -((parseLocalDate(date).getDay() + 6) % 7));
const dayLabel = (date: string) => {
  const d = parseLocalDate(date);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};

export function WebGymPlan() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const today = todayStr();
  const [weekStart, setWeekStart] = useState(mondayOf(today));
  const [plan, load] = useGymPlan();
  const [routines, setRoutines] = useState<GymWorkout[]>([]);
  const [picked, setPicked] = useState<{ event: string; date: string } | null>(null);

  const reload = useCallback(() => void load(weekStart, addDays(weekStart, 6), today), [load, weekStart, today]);
  useFocusEffect(
    useCallback(() => {
      reload();
      getWorkouts().then(setRoutines).catch(() => {});
    }, [reload]),
  );

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const cell = (event: string, date: string) => plan?.find((p) => p.event._id === event && p.date === date) ?? null;
  const selected = picked ? cell(picked.event, picked.date) : null;
  const sunday = addDays(weekStart, 6);
  const range = `${dayLabel(weekStart)} – ${dayLabel(sunday)}`;

  async function act(change: () => Promise<unknown>) {
    try {
      await change();
      reload();
    } catch (error) {
      Alert.alert("Couldn't change it", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  return (
    <OrbitPage>
      <WebPage>
        <PageTitle
          title="Weekly plan"
          subtitle={`${range} · each training time in your Gym calendar, planned day by day`}
          right={
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Button label="" icon="chevron-back" small onPress={() => setWeekStart(addDays(weekStart, -7))} />
              <Button label="This week" small onPress={() => setWeekStart(mondayOf(today))} disabled={weekStart === mondayOf(today)} />
              <Button label="" icon="chevron-forward" small onPress={() => setWeekStart(addDays(weekStart, 7))} />
              <Button label="Add a training time" icon="add" kind="primary" small onPress={() => router.push(`/calendar/edit?calendar=gym&date=${weekStart}&repeat=weekly` as Href)} />
            </View>
          }
        />

        <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
          {/* The week: a column a day, its training stacked by time */}
          <Card style={{ flex: 1, minWidth: 0 }} padded={false}>
            <View style={{ flexDirection: "row", minHeight: 360 }}>
              {days.map((d, i) => {
                const items = (plan ?? []).filter((p) => p.date === d).sort((a, b) => a.event.startMinutes - b.event.startMinutes);
                return (
                  <View key={d} style={{ flex: 1, minWidth: 0, borderLeftWidth: i ? 1 : 0, borderLeftColor: c.border, backgroundColor: d === today ? `${c.fill}0D` : "transparent" }}>
                    <View style={{ paddingVertical: 10, alignItems: "center", borderBottomWidth: 1, borderBottomColor: c.border }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: d === today ? c.ink : c.muted }}>{WEEKDAYS_SHORT[parseLocalDate(d).getDay()].toUpperCase()}</Text>
                      <Text style={{ marginTop: 2, fontSize: 16, fontWeight: "800", color: d === today ? c.ink : c.text }}>{parseLocalDate(d).getDate()}</Text>
                    </View>
                    <View style={{ padding: 6, gap: 6 }}>
                      {items.map((p) => {
                        const on = picked?.event === p.event._id && picked.date === d;
                        return <PlanCell key={`${p.event._id}-${d}`} item={p} on={on} onPress={() => setPicked(on ? null : { event: p.event._id, date: d })} colors={c} />;
                      })}
                      {!items.length && plan && <Text style={{ paddingVertical: 6, textAlign: "center", fontSize: 12, color: c.faint }}>Rest</Text>}
                      <Pressable onPress={() => router.push(`/calendar/edit?calendar=gym&date=${d}&repeat=weekly` as Href)} style={hoverable(({ hovered }: Hover) => ({ alignItems: "center", paddingVertical: 6, borderRadius: 8, backgroundColor: hovered ? c.pill : "transparent" }))}>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: c.faint }}>+ Add</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>

          {/* The day picked: planned here */}
          <Card style={{ width: 320 }} title={selected ? `${dayLabel(selected.date)}` : "Plan a day"} subtitle={selected ? `${selected.event.title} · ${minutesLabel(selected.event.startMinutes)}–${minutesLabel(selected.event.endMinutes)}` : undefined}>
            {selected ? (
              <DayPanel
                item={selected}
                today={today}
                routines={routines}
                onRoutine={(id) => act(() => setGymDay(selected.event._id, selected.date, id))}
                onStatus={(s) => act(() => setGymStatus(selected.event._id, selected.date, s))}
                onStart={() => router.push((selected.routine ? `/gym/session?workout=${selected.routine._id}&plan=${selected.event._id}&planDate=${selected.date}` : "/gym/workouts") as Href)}
                onSession={(id) => router.push(`/gym/sessions/${id}` as Href)}
                onEdit={() => router.push((selected.event.repeat ? `/calendar/edit?id=${selected.event._id}&occurrence=${selected.date}&scope=all` : `/calendar/edit?id=${selected.event._id}`) as Href)}
                colors={c}
              />
            ) : (
              <Text style={{ fontSize: 13.5, lineHeight: 19, color: c.muted }}>
                Pick a session in the week to plan it: a different workout for that day alone, or back to its series&apos; — or to edit what repeats (the same each time, by weekday, or in turn).
              </Text>
            )}
          </Card>
        </View>
      </WebPage>
    </OrbitPage>
  );
}

// A day's cell: the workout planned (the day's own marked), and how it went.
function PlanCell({ item: p, on, onPress, colors: c }: { item: PlannedDay; on: boolean; onPress: () => void; colors: OrbitColors }) {
  const own = (p.event.gymPlanned ?? []).some((x) => x.date === p.date);
  const tone = p.status === "done" ? c.success : p.status === "missed" ? c.warning : p.status === "skipped" ? c.faint : c.ink;
  return (
    <Pressable
      onPress={onPress}
      style={hoverable(({ hovered }: Hover) => ({
        padding: 8,
        borderRadius: 10,
        borderWidth: on ? 2 : 1,
        borderColor: on ? c.ink : c.border,
        backgroundColor: hovered ? c.pill : c.surface,
        borderLeftWidth: 4,
        borderLeftColor: tone,
      }))}
    >
      <Text style={{ fontSize: 11, fontWeight: "600", color: c.muted }} numberOfLines={1}>
        {minutesLabel(p.event.startMinutes)} · {p.event.title}
      </Text>
      <Text style={{ marginTop: 2, fontSize: 12.5, fontWeight: "700", color: p.status === "skipped" ? c.faint : c.text, textDecorationLine: p.status === "skipped" ? "line-through" : "none" }} numberOfLines={2}>
        {p.routine?.name ?? "Any workout"}
      </Text>
      <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", gap: 4 }}>
        {p.status === "done" && <Ionicons name="checkmark-circle" size={12} color={c.success} />}
        {p.status === "missed" && <Ionicons name="alert-circle" size={12} color={c.warning} />}
        <Text style={{ fontSize: 11, color: c.muted }} numberOfLines={1}>
          {p.status === "done" ? "Done" : p.status === "missed" ? "Missed" : p.status === "skipped" ? "Skipped" : own ? "This day only" : "Planned"}
        </Text>
      </View>
    </Pressable>
  );
}

// The day picked: its workout (for this day alone, or the series'), and what
// to do with it.
function DayPanel({
  item: p,
  today,
  routines,
  onRoutine,
  onStatus,
  onStart,
  onSession,
  onEdit,
  colors: c,
}: {
  item: PlannedDay;
  today: string;
  routines: GymWorkout[];
  onRoutine: (id: string | null | "series") => void;
  onStatus: (s: "done" | "skipped" | "open") => void;
  onStart: () => void;
  onSession: (id: string) => void;
  onEdit: () => void;
  colors: OrbitColors;
}) {
  const own = (p.event.gymPlanned ?? []).some((x) => x.date === p.date);
  const current = p.routine?._id ?? null;
  const chip = (key: string, label: string, on: boolean, onPress: () => void) => (
    <Pressable key={key} onPress={onPress} style={hoverable(({ hovered }: Hover) => ({ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, backgroundColor: on ? c.ink : hovered ? c.track : c.pill }))}>
      <Text style={{ fontSize: 12.5, fontWeight: "600", color: on ? c.onInk : c.onPill }}>{label}</Text>
    </Pressable>
  );
  return (
    <View>
      <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.8, color: c.faint }}>{own ? "THIS DAY'S WORKOUT · THIS DAY ONLY" : "THIS DAY'S WORKOUT"}</Text>
      <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {[{ _id: null as string | null, name: "Any workout" }, ...routines].map((w) => chip(w._id ?? "any", w.name, current === w._id, () => current !== w._id && onRoutine(w._id)))}
      </View>
      {own && (
        <Pressable onPress={() => onRoutine("series")} style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: c.ink }}>Back to the series&apos; plan</Text>
        </Pressable>
      )}

      <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.border, gap: 8 }}>
        <Text style={{ fontSize: 13.5, color: c.text }}>
          {p.status === "done" ? "Done" : p.status === "skipped" ? "Skipped" : p.status === "missed" ? "Missed" : p.date === today ? "Today" : "Not yet"}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(p.status === "open" || p.status === "missed") && p.date <= today && <Button label="Start" icon="play" kind="primary" small onPress={onStart} />}
          {(p.status === "open" || p.status === "missed") && <Button label="Mark done" icon="checkmark" small onPress={() => onStatus("done")} />}
          {(p.status === "open" || p.status === "missed") && <Button label="Skip" small onPress={() => onStatus("skipped")} />}
          {(p.status === "done" || p.status === "skipped") && <Button label="Not done after all" small onPress={() => onStatus("open")} />}
          {p.status === "done" && p.session && <Button label="The session" icon="open-outline" small onPress={() => onSession(p.session!)} />}
        </View>
      </View>

      <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.border }}>
        <Button label={p.event.repeat ? "Edit series" : "Edit"} icon="repeat" small onPress={onEdit} />
        <Text style={{ marginTop: 6, fontSize: 12, lineHeight: 17, color: c.faint }}>{p.event.repeat ? "What repeats: its time, days, and workouts — the same each time, by weekday, or in turn." : "Its time and workout."}</Text>
      </View>
    </View>
  );
}

