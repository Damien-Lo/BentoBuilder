import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { Fragment, useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { addDays, minutesLabel, MONTHS_SHORT } from "@/src/components/calendar/calendarUtils";
import { useGymPlan, type PlannedDay } from "@/src/components/gym/plan";
import { WebGymPlan } from "@/src/components/gym/web/WebGymPlan";
import { PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitPage, OrbitSection, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import { parseLocalDate, todayStr } from "@/src/utils/mealPlan";
import { useWideWeb } from "@/src/utils/useWideWeb";

// Gym → Plan: your training, a week at a time (Monday first, week by week)
// — each training time in the Gym calendar with that day's workout and how
// it went. Tapped, that day: its workout changed for it alone, started,
// skipped, or its series edited; a day's +, a training time added on that
// day each week. (A desktop browser: the week as a grid — WebGymPlan.)

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function GymPlanScreen() {
  // (A desktop browser: the week as a grid, like the Kitchen's.)
  const wide = useWideWeb();
  return (
    <OrbitSection section="gym">
      <OrbitPage>{wide ? <WebGymPlan /> : <GymPlan />}</OrbitPage>
    </OrbitSection>
  );
}

function GymPlan() {
  const router = useRouter();
  const leave = useGoBack("/gym");
  const { colors: c } = useOrbitTheme();
  const today = todayStr();
  const thisMonday = addDays(today, -((parseLocalDate(today).getDay() + 6) % 7));
  const [monday, setMonday] = useState(thisMonday);
  const [plan, load] = useGymPlan();
  useFocusEffect(
    useCallback(() => {
      void load(monday, addDays(monday, 6), today);
    }, [load, monday, today]),
  );

  // The week, Monday first.
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const count = plan?.length ?? 0;
  const span = `${parseLocalDate(monday).getDate()} ${MONTHS_SHORT[parseLocalDate(monday).getMonth()]} – ${parseLocalDate(addDays(monday, 6)).getDate()} ${MONTHS_SHORT[parseLocalDate(addDays(monday, 6)).getMonth()]}`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        <PageHeader title="Weekly plan" subtitle={plan ? `${count} planned · ${monday === thisMonday ? "this week" : span}` : "Your training, day by day"} onBack={leave} />
        {/* Week by week */}
        <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Tap onPress={() => setMonday(addDays(monday, -7))} accessibilityLabel="The week before" style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
            <Ionicons name="chevron-back" size={18} color={c.onPill} />
          </Tap>
          <Tap onPress={() => setMonday(thisMonday)} disabled={monday === thisMonday} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: c.text }}>{span}</Text>
            {monday !== thisMonday && <Text style={{ fontSize: 12, color: c.ink }}>Back to this week</Text>}
          </Tap>
          <Tap onPress={() => setMonday(addDays(monday, 7))} accessibilityLabel="The week after" style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
            <Ionicons name="chevron-forward" size={18} color={c.onPill} />
          </Tap>
        </View>
        {!plan ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={c.muted} />
        ) : (
          <View style={{ marginTop: 18, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }}>
            {week.map((date, i) => {
              const day = DAYS[(parseLocalDate(date).getDay() + 6) % 7];
              const items = plan.filter((p) => p.date === date).sort((a, b) => a.event.startMinutes - b.event.startMinutes);
              return (
                <Fragment key={date}>
                  {i > 0 && <View style={{ height: 1, backgroundColor: c.border }} />}
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
                    <Text style={{ width: 44, paddingTop: items.length ? 9 : 2, fontSize: 13, fontWeight: "700", color: date === today ? c.ink : c.muted }}>{day.slice(0, 3).toUpperCase()}</Text>
                    <View style={{ flex: 1, gap: 6 }}>
                      {items.length ? items.map((p) => <PlanItem key={`${p.event._id}-${p.date}`} item={p} onPress={() => router.push(`/calendar/event/${p.event._id}?date=${p.date}` as Href)} colors={c} />) : <Text style={{ paddingTop: 2, fontSize: 14, color: c.faint }}>Rest</Text>}
                    </View>
                    <Tap onPress={() => router.push(`/calendar/edit?calendar=gym&date=${date}&repeat=weekly` as Href)} accessibilityRole="button" accessibilityLabel={`Add a workout on ${day}s`} hitSlop={6} style={{ width: 32, height: 32, marginTop: items.length ? 4 : -4, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
                      <Ionicons name="add" size={18} color={c.onPill} />
                    </Tap>
                  </View>
                </Fragment>
              );
            })}
          </View>
        )}
        <Text style={{ marginTop: 12, marginHorizontal: 4, fontSize: 12.5, lineHeight: 18, color: c.faint }}>
          Tap a day&apos;s workout to plan that day — a different routine for it alone — or to start it, skip it, or edit its series (Edit). + adds a training time on that day each week.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PlanItem({ item: p, onPress, colors: c }: { item: PlannedDay; onPress: () => void; colors: OrbitColors }) {
  const exercises = p.routine?.exercises.filter((e) => e.exercise).length ?? 0;
  return (
    <Tap onPress={onPress} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, backgroundColor: c.canvas }} pressedStyle={{ opacity: 0.7 }}>
      <Ionicons name="barbell" size={17} color={c.ink} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, fontWeight: "600", color: c.text }} numberOfLines={1}>
          {p.routine?.name ?? "Any workout"}
        </Text>
        <Text style={{ marginTop: 1, fontSize: 12.5, color: c.muted }}>
          {minutesLabel(p.event.startMinutes)}–{minutesLabel(p.event.endMinutes)}
          {p.status === "done" ? " · done ✓" : p.status === "skipped" ? " · skipped" : p.status === "missed" ? " · missed" : exercises ? ` · ${exercises} exercises` : ""}
          {(p.event.gymPlanned ?? []).some((x) => x.date === p.date) ? " · this day only" : p.event.repeat ? "" : " · just once"}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color={c.faint} />
    </Tap>
  );
}
