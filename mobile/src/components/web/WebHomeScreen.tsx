import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { addDays, calendarColor, minutesLabel, WEEKDAYS_SHORT, weekOf } from "@/src/components/calendar/calendarUtils";
import { entryName, mealLine } from "@/src/components/calendar/mealFood";
import { useCalendarData } from "@/src/components/calendar/useCalendarData";
import { friendlyDate, longToday } from "@/src/components/todo/theme";
import { getMealPlanRange, type MealPlanEntry } from "@/src/services/mealPlanApi";
import { getPantryItems } from "@/src/services/pantryApi";
import { DEFAULT_SETTINGS, loadSettings, type AppSettings } from "@/src/services/settingsService";
import { getSmartTasks, getTodoDashboard, type TodoDashboard, type TodoTask } from "@/src/services/todoApi";
import type { PantryItem } from "@/src/types/pantry";
import { computeDayNutrition, parseLocalDate, SLOTS, todayStr } from "@/src/utils/mealPlan";

import { WEB_COMING_SOON } from "./nav";
import { BarChart, Button, Card, CardLink, Empty, GoalBar, Planned, Row, WEB, WebPage } from "./ui";

// Home in a desktop browser: everything about today and this week on one
// page — the schedule, what's being eaten, tasks, the week's calories and
// what's about to go off in the pantry — each a way into its section.

type Hover = { hovered?: boolean };

const dayOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);

export function WebHomeScreen() {
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

  const conversions = settings.unitConversions;
  const todayEntries = entries.filter((e) => e.date === today);
  const eaten = computeDayNutrition(todayEntries.filter((e) => e.status === "confirmed"), conversions);
  const planned = computeDayNutrition(todayEntries.filter((e) => e.status === "planned"), conversions);

  const todayEvents = calendar.visibleEvents
    .filter((e) => today >= e.occurrenceDate && today <= e.occurrenceEndDate)
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startMinutes - b.startMinutes);

  const weekBars = week.map((day) => {
    const dayEntries = entries.filter((e) => e.date === day);
    return {
      key: day,
      label: WEEKDAYS_SHORT[parseLocalDate(day).getDay()],
      sub: String(parseLocalDate(day).getDate()),
      value: computeDayNutrition(dayEntries.filter((e) => e.status === "confirmed"), conversions).calories ?? 0,
      value2: computeDayNutrition(dayEntries.filter((e) => e.status === "planned"), conversions).calories ?? 0,
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
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <WebPage>
      <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 20 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 28, fontWeight: "700", color: WEB.text }}>
            {greeting}
            {settings.displayName ? `, ${settings.displayName}` : ""}
          </Text>
          <Text style={{ marginTop: 2, fontSize: 14, color: WEB.muted }}>{longToday()}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label="Plan the week" icon="restaurant-outline" onPress={() => router.navigate("/planner")} />
          <Button label="New event" icon="add" kind="primary" onPress={() => router.push({ pathname: "/calendar/edit", params: { date: today } })} />
        </View>
      </View>

      <Row>
        {/* Today's schedule */}
        <Card title="Today's schedule" subtitle={`${todayEvents.length} item${todayEvents.length === 1 ? "" : "s"}`} action={<CardLink label="Calendar" onPress={() => router.navigate("/calendar")} />} style={{ flex: 1.15, minWidth: 340 }} padded={false}>
          {todayEvents.length === 0 ? (
            <Empty icon="calendar-clear-outline" text="Nothing scheduled today" />
          ) : (
            <View style={{ paddingBottom: 8 }}>
              {todayEvents.map((event) => {
                const color = calendarColor(calendar.calendarsById.get(event.calendar));
                return (
                  <Pressable
                    key={`${event._id}-${event.occurrenceDate}`}
                    onPress={() =>
                      event.task
                        ? router.push({ pathname: "/lists/task/[id]", params: { id: event.task.depth > 0 ? event.task.rootId : event.task.id } })
                        : router.push({ pathname: "/calendar/event/[id]", params: { id: event._id, date: event.occurrenceDate } })
                    }
                    style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 7, backgroundColor: hovered ? "#F8FAFC" : "transparent" })}
                  >
                    <Text style={{ width: 92, fontSize: 12, color: WEB.muted }}>
                      {event.allDay ? (event.task ? "Due today" : "All day") : `${minutesLabel(event.startMinutes)} – ${minutesLabel(event.endMinutes)}`}
                    </Text>
                    <View style={{ width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: color, marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: event.task?.completed ? WEB.faint : WEB.text, textDecorationLine: event.task?.completed ? "line-through" : "none" }}>
                        {event.title}
                      </Text>
                      {event.meal && (
                        <Text numberOfLines={1} style={{ fontSize: 12, color: event.meal.food ? WEB.muted : WEB.faint }}>
                          {event.meal.food?.eaten && <Ionicons name="checkmark-circle" size={11} color={WEB.green} />}
                          {event.meal.food?.eaten ? " " : ""}
                          {mealLine(event)}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Card>

        {/* Today's food */}
        <Card title="Today's food" action={<CardLink label="Week plan" onPress={() => router.navigate("/planner")} />} style={{ flex: 1, minWidth: 320 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <Text style={{ fontSize: 32, fontWeight: "700", color: WEB.text }}>{Math.round(eaten.calories ?? 0)}</Text>
            {(planned.calories ?? 0) > 0 && <Text style={{ marginLeft: 6, fontSize: 16, fontWeight: "600", color: WEB.faint }}>+{Math.round(planned.calories ?? 0)}</Text>}
            <Text style={{ marginLeft: 6, fontSize: 14, color: WEB.muted }}>kcal{settings.dailyCalorieLimit ? ` of ${settings.dailyCalorieLimit}` : ""}</Text>
          </View>
          <GoalBar label="Protein" value={eaten.protein ?? 0} planned={planned.protein ?? 0} goal={settings.dailyProteinLimit} unit="g" />
          <GoalBar label="Carbs" value={eaten.carbs ?? 0} planned={planned.carbs ?? 0} goal={settings.dailyCarbsLimit} unit="g" color="#D97706" />
          <GoalBar label="Fats" value={eaten.fats ?? 0} planned={planned.fats ?? 0} goal={settings.dailyFatsLimit} unit="g" color="#DB2777" />
          <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: WEB.line, paddingTop: 6 }}>
            {SLOTS.map((slot) => {
              const inSlot = todayEntries.filter((e) => e.slot === slot.id);
              return (
                <View key={slot.id} style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 5 }}>
                  <Ionicons name={slot.icon} size={15} color={slot.iconColor} style={{ marginTop: 1 }} />
                  <Text style={{ width: 74, marginLeft: 8, fontSize: 13, fontWeight: "600", color: WEB.body }}>{slot.label}</Text>
                  <Text numberOfLines={2} style={{ flex: 1, fontSize: 13, color: inSlot.length ? WEB.body : WEB.faint }}>
                    {inSlot.length ? inSlot.map(entryName).join(", ") : "—"}
                  </Text>
                  {inSlot.length > 0 && inSlot.every((e) => e.status === "confirmed") && <Ionicons name="checkmark-circle" size={15} color={WEB.green} />}
                </View>
              );
            })}
          </View>
        </Card>

        {/* Tasks */}
        <Card title="Tasks" action={<CardLink label="All tasks" onPress={() => router.navigate("/lists/tasks")} />} style={{ flex: 1, minWidth: 320 }} padded={false}>
          <View style={{ flexDirection: "row", paddingHorizontal: 18, paddingBottom: 10, gap: 18 }}>
            <Mini label="My Day" value={openMyDay.length} />
            <Mini label="Overdue" value={dashboard?.overdue ?? 0} tone={dashboard?.overdue ? WEB.red : undefined} />
            <Mini label="In progress" value={dashboard?.inProgress ?? 0} />
            <Mini label="Done" value={dashboard?.completed ?? 0} />
          </View>
          {overdue.length + openMyDay.length === 0 ? (
            <Empty icon="checkmark-done-outline" text="Nothing overdue, nothing in My Day" />
          ) : (
            <View style={{ paddingBottom: 8 }}>
              {[...overdue, ...openMyDay.filter((t) => !overdue.some((o) => o._id === t._id))].slice(0, 7).map((task) => {
                const late = overdue.some((o) => o._id === task._id);
                return (
                  <Pressable
                    key={task._id}
                    onPress={() => router.push({ pathname: "/lists/task/[id]", params: { id: task._id } })}
                    style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 7, backgroundColor: hovered ? "#F8FAFC" : "transparent" })}
                  >
                    <Ionicons name={late ? "alert-circle" : "sunny-outline"} size={16} color={late ? WEB.red : WEB.amber} />
                    <Text numberOfLines={1} style={{ flex: 1, marginLeft: 10, fontSize: 14, color: WEB.text }}>
                      {task.title}
                    </Text>
                    {!!task.dueDate && <Text style={{ fontSize: 12, color: late ? WEB.red : WEB.muted }}>Due {friendlyDate(task.dueDate)}</Text>}
                  </Pressable>
                );
              })}
            </View>
          )}
        </Card>
      </Row>

      <Row>
        {/* The week's calories */}
        <Card title="This week" subtitle="Calories eaten each day, with what's still planned shown lighter" action={<CardLink label="Nutrition" onPress={() => router.navigate("/health")} />} style={{ flex: 2, minWidth: 480 }}>
          <View style={{ paddingTop: 14 }}>
            <BarChart data={weekBars} goal={settings.dailyCalorieLimit} height={190} />
          </View>
        </Card>

        {/* Pantry */}
        <Card title="Pantry" action={<CardLink label="Pantry" onPress={() => router.navigate("/PantryMainPage")} />} style={{ flex: 1, minWidth: 320 }} padded={false}>
          <View style={{ flexDirection: "row", paddingHorizontal: 18, paddingBottom: 10, gap: 18 }}>
            <Mini label="In stock" value={inStock.length} />
            <Mini label="Expired" value={expired.length} tone={expired.length ? WEB.red : undefined} />
            <Mini label="Within 7 days" value={expiring.length} tone={expiring.length ? WEB.amber : undefined} />
          </View>
          {expiring.length === 0 ? (
            <Empty icon="leaf-outline" text="Nothing expiring this week" />
          ) : (
            <View style={{ paddingBottom: 8 }}>
              {expiring.slice(0, 6).map((item) => (
                <Pressable
                  key={item._id}
                  onPress={() => router.push({ pathname: "/pantry/edit/[id]", params: { id: item._id } })}
                  style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 7, backgroundColor: hovered ? "#F8FAFC" : "transparent" })}
                >
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: WEB.text }}>
                    {item.ingredient?.name ?? "Item"}
                  </Text>
                  <Text style={{ fontSize: 12, color: WEB.amber }}>{friendlyDate(dayOf(item.expiryDate)!)}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </Card>
      </Row>

      {/* Sections that don't exist yet */}
      <Text style={{ marginTop: 6, marginBottom: 10, fontSize: 11, fontWeight: "700", letterSpacing: 1, color: WEB.faint }}>COMING LATER</Text>
      <Row>
        {WEB_COMING_SOON.map((item) => (
          <Planned key={item.label} icon={item.icon} title={item.label} text={item.text} minHeight={130} style={{ flex: 1, minWidth: 240 }} />
        ))}
      </Row>
    </WebPage>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <View>
      <Text style={{ fontSize: 22, fontWeight: "700", color: tone ?? WEB.text }}>{value}</Text>
      <Text style={{ fontSize: 11, color: WEB.muted }}>{label}</Text>
    </View>
  );
}
