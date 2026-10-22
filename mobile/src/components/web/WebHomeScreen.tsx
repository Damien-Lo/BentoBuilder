import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { addDays, calendarColor, minutesLabel, nowMinutes as currentMinutes, WEEKDAYS_SHORT, weekOf } from "@/src/components/calendar/calendarUtils";
import { entryName, mealLine } from "@/src/components/calendar/mealFood";
import { useCalendarData } from "@/src/components/calendar/useCalendarData";
import { useAccount } from "@/src/components/auth/AuthGate";
import { friendlyDate, longToday } from "@/src/components/todo/theme";
import { getMealPlanRange, type MealPlanEntry } from "@/src/services/mealPlanApi";
import { getPantryItems } from "@/src/services/pantryApi";
import { DEFAULT_SETTINGS, loadSettings, type AppSettings } from "@/src/services/settingsService";
import { KitchenTasks } from "@/src/components/planner/KitchenTasks";
import { usePlanNeeds } from "@/src/components/planner/usePlanNeeds";
import { getSmartTasks, getTodoDashboard, type TodoDashboard, type TodoTask } from "@/src/services/todoApi";
import type { PantryItem } from "@/src/types/pantry";
import { computeDayNutrition, parseLocalDate, SLOTS, todayStr } from "@/src/utils/mealPlan";

import { WEB_COMING_SOON } from "./nav";
import { themeColor } from "./theme";
import { BarChart, Button, Card, CardLink, Empty, GoalBar, Planned, Row, WebPage } from "./ui";
import { nutrientColor } from "@/src/theme/nutrients";
import { OrbitPage, SECTION_PALETTE, useOrbitTheme, type OrbitColors, type SectionId } from "@/src/theme/orbit";

// Home in a desktop browser: everything about today and this week on one
// page — the schedule, what's being eaten, tasks, the week's calories and
// what's about to go off in the pantry — each a way into its section.
// In Orbit's look: the hub, so in no section's colour (black for the main
// button, the selected thing), each card marked by its section's colour in
// the well by its title, as the phone's home colours each section's node.

type Hover = { hovered?: boolean };

const dayOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);

export function WebHomeScreen() {
  return (
    <OrbitPage>
      <HomePage />
    </OrbitPage>
  );
}

function HomePage() {
  const { colors: c } = useOrbitTheme();
  const { account } = useAccount();
  const router = useRouter();
  const today = todayStr();
  const calendar = useCalendarData(today);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [dashboard, setDashboard] = useState<TodoDashboard | null>(null);
  const [myDay, setMyDay] = useState<TodoTask[]>([]);
  const [pantry, setPantry] = useState<PantryItem[]>([]);

  const week = useMemo(() => weekOf(today, settings.weekStartDay), [today, settings.weekStartDay]);

  useFocusEffect(
    useCallback(() => {
      calendar.reload();
      loadSettings()
        .then((s) => {
          setSettings(s);
          const days = weekOf(todayStr(), s.weekStartDay);
          return getMealPlanRange(days[0], days[6]).then(setEntries);
        })
        .catch(() => {});
      getTodoDashboard().then(setDashboard).catch(() => {});
      getSmartTasks("myday").then(setMyDay).catch(() => {});
      getPantryItems().then(setPantry).catch(() => {});
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const kitchenPlan = usePlanNeeds();
  const conversions = settings.unitConversions;
  const todayEntries = entries.filter((e) => e.date === today);
  const eaten = computeDayNutrition(todayEntries.filter((e) => e.status === "confirmed"), conversions);
  const planned = computeDayNutrition(kitchenPlan.sized(todayEntries.filter((e) => e.status === "planned")), conversions);

  const todayEvents = calendar.visibleEvents
    .filter((e) => today >= e.occurrenceDate && today <= e.occurrenceEndDate)
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startMinutes - b.startMinutes);
  // The time, kept current, for the line on today's schedule.
  const [nowMinutes, setNowMinutes] = useState(currentMinutes);
  useEffect(() => {
    const timer = setInterval(() => setNowMinutes(currentMinutes()), 60_000);
    return () => clearInterval(timer);
  }, []);
  // The timed event on now (the first, if they overlap), or else the one
  // the line sits just above — the next to start, or the end of the list.
  const nowAt = (() => {
    const during = todayEvents.findIndex((e) => !e.allDay && e.startMinutes <= nowMinutes && nowMinutes < e.endMinutes);
    if (during >= 0) return { during, before: -1 };
    const next = todayEvents.findIndex((e) => !e.allDay && e.startMinutes > nowMinutes);
    return { during: -1, before: next >= 0 ? next : todayEvents.length };
  })();

  const weekBars = week.map((day) => {
    const dayEntries = entries.filter((e) => e.date === day);
    return {
      key: day,
      label: WEEKDAYS_SHORT[parseLocalDate(day).getDay()],
      sub: String(parseLocalDate(day).getDate()),
      value: computeDayNutrition(dayEntries.filter((e) => e.status === "confirmed"), conversions).calories ?? 0,
      value2: computeDayNutrition(kitchenPlan.sized(dayEntries.filter((e) => e.status === "planned")), conversions).calories ?? 0,
      highlight: day === today,
    };
  });

  const inStock = pantry.filter((p) => !p.isFinished);
  const soon = addDays(today, 7);
  const expired = inStock.filter((p) => (dayOf(p.expiryDate) ?? "9999") < today);
  const expiring = inStock
    .filter((p) => {
      const d = dayOf(p.expiryDate);
      return !!d && d >= today && d <= soon;
    })
    .sort((a, b) => (a.expiryDate ?? "").localeCompare(b.expiryDate ?? ""));

  const openMyDay = myDay.filter((t) => !t.completed);
  const overdue = dashboard?.overdueTasks ?? [];
  // The Tasks card's list: what's late, then My Day, then what's due in the
  // week ahead (soonest first) — each task once.
  const shownTasks: { task: TodoTask; kind: "late" | "myday" | "soon" }[] = [];
  for (const [kind, list] of [["late", overdue], ["myday", openMyDay], ["soon", dashboard?.upcomingTasks ?? []]] as const) {
    for (const task of list) if (!shownTasks.some((s) => s.task._id === task._id)) shownTasks.push({ task, kind });
  }
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  // (The name set in Settings, or else the account's first name.)
  const name = settings.displayName || account?.name.split(" ")[0] || "";

  return (
    <WebPage>
      <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 20 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>
            {greeting}
            {name ? `, ${name}` : ""}
          </Text>
          <Text style={{ marginTop: 2, fontSize: 14, color: c.muted }}>{longToday()}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label="Plan the week" icon="restaurant-outline" onPress={() => router.navigate("/planner")} />
          <Button label="New event" icon="add" kind="primary" onPress={() => router.navigate({ pathname: "/calendar", params: { new: today } })} />
        </View>
      </View>

      <Row>
        {/* Today's schedule */}
        <Card style={{ flex: 1.15, minWidth: 340 }} padded={false}>
          <Head section="calendar" icon="calendar-clear-outline" title="Today's schedule" subtitle={`${todayEvents.length} item${todayEvents.length === 1 ? "" : "s"}`} action={<CardLink label="Calendar" onPress={() => router.navigate("/calendar")} />} c={c} />
          {todayEvents.length === 0 ? (
            <Empty icon="calendar-clear-outline" text="Nothing scheduled today" />
          ) : (
            <View style={{ paddingBottom: 8 }}>
              {todayEvents.map((event, index) => {
                const color = calendarColor(calendar.calendarsById.get(event.calendar));
                // Where the day has got to: a line across the event that's
                // on now (as far down it as the event is through), or in
                // the gap before the next one.
                const during = index === nowAt.during;
                const through = during ? (nowMinutes - event.startMinutes) / Math.max(1, event.endMinutes - event.startMinutes) : 0;
                return (
                  <View key={`${event._id}-${event.occurrenceDate}`}>
                  {index === nowAt.before && <NowLine />}
                  <Pressable
                    onPress={() =>
                      event.task
                        ? router.push({ pathname: "/lists/task/[id]", params: { id: event.task.depth > 0 ? event.task.rootId : event.task.id } })
                        : router.push({ pathname: "/calendar/event/[id]", params: { id: event._id, date: event.occurrenceDate } })
                    }
                    style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 7, backgroundColor: hovered ? c.pill : "transparent" })}
                  >
                    <Text style={{ width: 92, fontSize: 12, color: c.muted }}>
                      {event.allDay ? (event.task ? "Due today" : "All day") : `${minutesLabel(event.startMinutes)} – ${minutesLabel(event.endMinutes)}`}
                    </Text>
                    <View style={{ width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: color, marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: event.task?.completed ? c.faint : c.text, textDecorationLine: event.task?.completed ? "line-through" : "none" }}>
                        {event.title}
                      </Text>
                      {event.meal && (
                        <Text numberOfLines={1} style={{ fontSize: 12, color: event.meal.food ? c.muted : c.faint }}>
                          {event.meal.food?.eaten && <Ionicons name="checkmark-circle" size={11} color={c.success} />}
                          {event.meal.food?.eaten ? " " : ""}
                          {mealLine(event)}
                        </Text>
                      )}
                    </View>
                    {during && (
                      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: `${Math.round(through * 100)}%` }}>
                        <NowLine />
                      </View>
                    )}
                  </Pressable>
                  </View>
                );
              })}
              {nowAt.before === todayEvents.length && <NowLine />}
            </View>
          )}
        </Card>

        {/* Today's food */}
        <Card style={{ flex: 1, minWidth: 320 }} padded={false}>
          <Head section="kitchen" icon="restaurant-outline" title="Today's food" action={<CardLink label="Week plan" onPress={() => router.navigate("/planner")} />} c={c} />
          <View style={{ paddingHorizontal: 18, paddingBottom: 18 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            {/* (Over the day's goal, the number in red.) */}
            <Text style={{ fontSize: 32, fontWeight: "800", letterSpacing: -0.5, color: settings.dailyCalorieLimit && (eaten.calories ?? 0) > settings.dailyCalorieLimit * 1.05 ? c.danger : c.text }}>{Math.round(eaten.calories ?? 0)}</Text>
            {(planned.calories ?? 0) > 0 && <Text style={{ marginLeft: 6, fontSize: 16, fontWeight: "600", color: c.faint }}>+{Math.round(planned.calories ?? 0)}</Text>}
            <Text style={{ marginLeft: 6, fontSize: 14, color: c.muted }}>kcal{settings.dailyCalorieLimit ? ` of ${settings.dailyCalorieLimit}` : ""}</Text>
          </View>
          <GoalBar label="Protein" value={eaten.protein ?? 0} planned={planned.protein ?? 0} goal={settings.dailyProteinLimit} unit="g" color={nutrientColor("protein")} />
          <GoalBar label="Carbs" value={eaten.carbs ?? 0} planned={planned.carbs ?? 0} goal={settings.dailyCarbsLimit} unit="g" color={nutrientColor("carbs")} />
          <GoalBar label="Fats" value={eaten.fats ?? 0} planned={planned.fats ?? 0} goal={settings.dailyFatsLimit} unit="g" color={nutrientColor("fats")} />
          <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: c.track, paddingTop: 6 }}>
            {SLOTS.map((slot) => {
              const inSlot = todayEntries.filter((e) => e.slot === slot.id);
              return (
                <View key={slot.id} style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 5 }}>
                  <Ionicons name={slot.icon} size={15} color={slot.iconColor} style={{ marginTop: 1 }} />
                  <Text style={{ width: 74, marginLeft: 8, fontSize: 13, fontWeight: "600", color: c.icon }}>{slot.label}</Text>
                  <Text numberOfLines={2} style={{ flex: 1, fontSize: 13, color: inSlot.length ? c.icon : c.faint }}>
                    {inSlot.length ? inSlot.map(entryName).join(", ") : "—"}
                  </Text>
                  {inSlot.length > 0 && inSlot.every((e) => e.status === "confirmed") && <Ionicons name="checkmark-circle" size={15} color={c.success} />}
                </View>
              );
            })}
          </View>
          </View>
        </Card>

        {/* Tasks */}
        <Card style={{ flex: 1, minWidth: 320 }} padded={false}>
          <Head section="tasks" icon="checkbox-outline" title="Tasks" action={<CardLink label="All tasks" onPress={() => router.navigate("/lists/tasks")} />} c={c} />
          <View style={{ flexDirection: "row", paddingHorizontal: 18, paddingBottom: 10, gap: 18 }}>
            <Mini label="My Day" value={openMyDay.length} c={c} />
            <Mini label="Overdue" value={dashboard?.overdue ?? 0} tone={dashboard?.overdue ? c.danger : undefined} c={c} />
            <Mini label="In progress" value={dashboard?.inProgress ?? 0} c={c} />
            <Mini label="Due this week" value={dashboard?.dueSoon ?? 0} c={c} />
          </View>
          {shownTasks.length === 0 ? (
            <Empty icon="checkmark-done-outline" text="Nothing overdue, in My Day or due this week" />
          ) : (
            <View style={{ paddingBottom: 8 }}>
              {shownTasks.slice(0, 7).map(({ task, kind }) => (
                <Pressable
                  key={task._id}
                  onPress={() => router.push({ pathname: "/lists/task/[id]", params: { id: task._id } })}
                  style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 7, backgroundColor: hovered ? c.pill : "transparent" })}
                >
                  <Ionicons name={kind === "late" ? "alert-circle" : kind === "myday" ? "sunny-outline" : "calendar-outline"} size={16} color={kind === "late" ? c.danger : kind === "myday" ? c.warning : c.muted} />
                  <Text numberOfLines={1} style={{ flex: 1, marginLeft: 10, fontSize: 14, color: c.text }}>
                    {task.title}
                  </Text>
                  {!!task.dueDate && <Text style={{ fontSize: 12, color: kind === "late" ? c.danger : c.muted }}>Due {friendlyDate(task.dueDate)}</Text>}
                </Pressable>
              ))}
            </View>
          )}
        </Card>
      </Row>

      <Row>
        {/* The week's calories */}
        <Card style={{ flex: 2, minWidth: 480 }} padded={false}>
          <Head section="nutrition" icon="pie-chart-outline" title="This week" subtitle="Calories eaten each day, with what's still planned shown lighter" action={<CardLink label="Nutrition" onPress={() => router.navigate("/health")} />} c={c} />
          <View style={{ paddingHorizontal: 18, paddingBottom: 18, paddingTop: 14 }}>
            <BarChart data={weekBars} goal={settings.dailyCalorieLimit} height={190} color={nutrientColor("calories")} />
          </View>
        </Card>

        {/* Kitchen: what needs doing today and tomorrow */}
        <Card style={{ flex: 1, minWidth: 320 }} padded={false}>
          <Head section="kitchen" icon="flame-outline" title="Kitchen tasks" subtitle="Today and tomorrow" action={<CardLink label="Plan" onPress={() => router.navigate("/plan")} />} c={c} />
          <KitchenTasks plan={kitchenPlan} days={1} />
        </Card>

        {/* Pantry */}
        <Card style={{ flex: 1, minWidth: 320 }} padded={false}>
          <Head section="kitchen" icon="basket-outline" title="Pantry" action={<CardLink label="Pantry" onPress={() => router.navigate("/PantryMainPage")} />} c={c} />
          <View style={{ flexDirection: "row", paddingHorizontal: 18, paddingBottom: 10, gap: 18 }}>
            <Mini label="In stock" value={inStock.length} c={c} />
            <Mini label="Expired" value={expired.length} tone={expired.length ? c.danger : undefined} c={c} />
            <Mini label="Within 7 days" value={expiring.length} tone={expiring.length ? c.warning : undefined} c={c} />
          </View>
          {expiring.length === 0 ? (
            <Empty icon="leaf-outline" text="Nothing expiring this week" />
          ) : (
            <View style={{ paddingBottom: 8 }}>
              {expiring.slice(0, 6).map((item) => (
                <Pressable
                  key={item._id}
                  onPress={() => router.push({ pathname: "/pantry/edit/[id]", params: { id: item._id } })}
                  style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 7, backgroundColor: hovered ? c.pill : "transparent" })}
                >
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: c.text }}>
                    {item.ingredient?.name ?? "Item"}
                  </Text>
                  <Text style={{ fontSize: 12, color: c.warning }}>{friendlyDate(dayOf(item.expiryDate)!)}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </Card>
      </Row>

      {/* Sections that don't exist yet */}
      <Text style={{ marginTop: 6, marginBottom: 10, fontSize: 11, fontWeight: "700", letterSpacing: 1, color: c.faint }}>COMING LATER</Text>
      <Row>
        {WEB_COMING_SOON.map((item) => (
          <Planned key={item.label} icon={item.icon} title={item.label} text={item.text} minHeight={130} style={{ flex: 1, minWidth: 240 }} />
        ))}
      </Row>
    </WebPage>
  );
}

// A card's top: its section's colour in the well by the title (the hub's
// cards each belong to one), then the title, and a link in the corner.
function Head({ section, icon, title, subtitle, action, c }: { section: SectionId; icon: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string; action?: ReactNode; c: OrbitColors }) {
  const shades = SECTION_PALETTE[section];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10 }}>
      <View style={{ width: 30, height: 30, marginRight: 10, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: shades.tint }}>
        <Ionicons name={icon} size={16} color={shades.dark} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }}>{title}</Text>
        {!!subtitle && <Text style={{ marginTop: 1, fontSize: 12, color: c.muted }}>{subtitle}</Text>}
      </View>
      {action}
    </View>
  );
}

function Mini({ label, value, tone, c }: { label: string; value: number; tone?: string; c: OrbitColors }) {
  return (
    <View>
      <Text style={{ fontSize: 22, fontWeight: "800", color: tone ?? c.text }}>{value}</Text>
      <Text style={{ fontSize: 11, color: c.muted }}>{label}</Text>
    </View>
  );
}

// "Now" on today's schedule: a light red line that takes up no room.
const NOW_RED = themeColor("248,113,113", "248,113,113", 0.75);

function NowLine() {
  return (
    <View pointerEvents="none" style={{ height: 0, zIndex: 2 }}>
      <View style={{ position: "absolute", left: 12, right: 14, top: -1, height: 2, borderRadius: 1, backgroundColor: NOW_RED }} />
      <View style={{ position: "absolute", left: 9, top: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: NOW_RED }} />
    </View>
  );
}
