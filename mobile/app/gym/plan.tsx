import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { Fragment, useCallback } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { addDays, minutesLabel } from "@/src/components/calendar/calendarUtils";
import { useGymPlan, type PlannedDay } from "@/src/components/gym/plan";
import { PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitPage, OrbitSection, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import { parseLocalDate, todayStr } from "@/src/utils/mealPlan";

// Gym → Plan: your weekly split, a day at a time (Monday first) — each
// workout a repeating event in the Gym calendar, with its time and routine.
// Tapped, the workout's series is edited (the routine, the time, the days);
// a day's +, a workout added on that day each week. (One day of it is moved
// or skipped in the Calendar, like any repeating event.)

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function GymPlanScreen() {
  return (
    <OrbitSection section="gym">
      <OrbitPage>
        <GymPlan />
      </OrbitPage>
    </OrbitSection>
  );
}

function GymPlan() {
  const router = useRouter();
  const leave = useGoBack("/gym");
  const { colors: c } = useOrbitTheme();
  const today = todayStr();
  const [plan, load] = useGymPlan();
  useFocusEffect(
    useCallback(() => {
      void load(today, addDays(today, 6), today);
    }, [load, today]),
  );

  // The next seven days, Monday first: each weekday's date this coming week.
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i)).sort((a, b) => ((parseLocalDate(a).getDay() + 6) % 7) - ((parseLocalDate(b).getDay() + 6) % 7));
  const count = plan?.filter((p) => p.event.repeat).length ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        <PageHeader title="Weekly plan" subtitle={plan ? `${count} workout${count === 1 ? "" : "s"} a week, in your Gym calendar` : "Your split, day by day"} onBack={leave} />
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
                      {items.length ? items.map((p) => <PlanItem key={`${p.event._id}-${p.date}`} item={p} onPress={() => router.push((p.event.repeat ? `/calendar/edit?id=${p.event._id}&occurrence=${p.date}&scope=all` : `/calendar/edit?id=${p.event._id}`) as Href)} colors={c} />) : <Text style={{ paddingTop: 2, fontSize: 14, color: c.faint }}>Rest</Text>}
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
          Each is a repeating workout in your Gym calendar: tap one to change its routine, time or days; + adds one on that day each week. Move or skip a single day in the Calendar.
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
          {exercises ? ` · ${exercises} exercises` : ""}
          {p.event.repeat ? "" : " · just this week"}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color={c.faint} />
    </Tap>
  );
}
