import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  addDays,
  calendarColor,
  daysBetween,
  durationLabel,
  longDateLabel,
  minutesLabel,
  remindLabel,
  repeatLabel,
  shortDateLabel,
} from "@/src/components/calendar/calendarUtils";
import { buildMealFood, mealKey, type MealFood } from "@/src/components/calendar/mealFood";
import { showActions } from "@/src/components/todo/theme";
import {
  deleteCalendarEvent,
  getCalendarEvent,
  getCalendars,
  type CalendarEvent,
  type SeriesScope,
  type EventCalendar,
} from "@/src/services/calendarApi";
import { getMealPlanForDate } from "@/src/services/mealPlanApi";
import { loadSettings } from "@/src/services/settingsService";
import { hexToRgba } from "@/src/utils/mealPlan";

// One event, as Outlook's event page shows it: the summary card (title,
// date, time, repeat), then location / notes / reminder, then delete. `date`
// is the occurrence that was tapped (for a repeating event).
export default function CalendarEventScreen() {
  const router = useRouter();
  const { id, date } = useLocalSearchParams<{ id: string; date?: string }>();
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [calendar, setCalendar] = useState<EventCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  // A meal event: that day's food for its meal from the planner
  // (undefined while loading, null when nothing's planned).
  const [food, setFood] = useState<MealFood | null | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getCalendarEvent(id), getCalendars()])
        .then(([loaded, calendars]) => {
          if (cancelled) return;
          setEvent(loaded);
          setCalendar(calendars.find((c) => c._id === loaded.calendar) ?? null);
          const slot = loaded.mealSlot;
          if (slot) {
            const day = date ?? loaded.date;
            Promise.all([getMealPlanForDate(day), loadSettings()])
              .then(([entries, settings]) => {
                if (!cancelled) setFood(buildMealFood(entries, settings.unitConversions).get(mealKey(day, slot)) ?? null);
              })
              .catch(() => !cancelled && setFood(null));
          }
        })
        .catch(() => {
          if (!cancelled) Alert.alert("Couldn't load event", undefined, [{ text: "OK", onPress: () => router.back() }]);
        })
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [id, date, router]),
  );

  if (loading || !event) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
      </SafeAreaView>
    );
  }

  const occurrence = date ?? event.date;
  const span = daysBetween(event.date, event.endDate);
  const occurrenceEnd = addDays(occurrence, span);
  const color = calendarColor(calendar);
  const duration = span * 1440 + event.endMinutes - event.startMinutes;

  async function remove(scope: SeriesScope) {
    try {
      await deleteCalendarEvent(id, scope, occurrence);
      router.back();
    } catch (error) {
      Alert.alert("Couldn't delete", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  // A regular meal (from the Meals calendar's times) can only be changed a
  // day at a time here; the series is changed in the meal times.
  const regularMeal = !!event.mealAuto && !!event.repeat;

  function confirmDelete() {
    if (regularMeal) {
      Alert.alert("Skip this meal?", "Only this day's block is removed. To stop it every week, change your meal times.", [
        { text: "Cancel", style: "cancel" },
        { text: "Skip this day", style: "destructive", onPress: () => void remove("one") },
      ]);
      return;
    }
    if (event?.repeat) {
      showActions("Delete repeating event", [
        { label: "Delete this event", destructive: true, onPress: () => void remove("one") },
        { label: "Delete this and following events", destructive: true, onPress: () => void remove("following") },
        { label: "Delete all events in the series", destructive: true, onPress: () => void remove("all") },
      ]);
      return;
    }
    Alert.alert("Delete event?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void remove("all") },
    ]);
  }

  // A repeating event asks which occurrences the edit is for first.
  function startEdit() {
    const open = (scope?: SeriesScope) =>
      router.push({ pathname: "/calendar/edit", params: { id, occurrence, ...(scope ? { scope } : {}) } });
    if (!event?.repeat) {
      open();
      return;
    }
    if (regularMeal) {
      open("one");
      return;
    }
    showActions("Edit repeating event", [
      { label: "Only this event", onPress: () => open("one") },
      { label: "This and following events", onPress: () => open("following") },
      { label: "All events in the series", onPress: () => open("all") },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <View className="flex-row items-center border-b border-slate-200 bg-white px-3 py-2.5">
        <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-100">
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <View className="ml-1 flex-1 items-center">
          <Text className="text-base font-bold text-slate-950" numberOfLines={1}>
            {calendar?.name ?? "Calendar"}
          </Text>
        </View>
        <Pressable
          onPress={startEdit}
          accessibilityLabel="Edit event"
          className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-100"
        >
          <Ionicons name="create-outline" size={23} color="#2563EB" />
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {/* Summary */}
        <View className="mb-3 flex-row rounded-3xl border border-slate-200 bg-white p-4">
          <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: hexToRgba(color, 0.15) }}>
            <View className="h-4 w-4 rounded-full" style={{ backgroundColor: color }} />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-xl font-bold text-slate-950">{event.title}</Text>
            <Text className="mt-1.5 text-base text-slate-700">{longDateLabel(occurrence)}</Text>
            {event.allDay ? (
              <Text className="mt-0.5 text-base text-slate-500">
                {span === 0 ? "All day" : `All day, until ${shortDateLabel(occurrenceEnd)}`}
              </Text>
            ) : (
              <Text className="mt-0.5 text-base text-slate-500">
                {minutesLabel(event.startMinutes)} → {minutesLabel(event.endMinutes)}
                {span > 0 ? ` ${shortDateLabel(occurrenceEnd)}` : ""} ({durationLabel(duration)})
              </Text>
            )}
            {event.seriesId && !event.repeat && (
              <View className="mt-1.5 flex-row items-center">
                <Ionicons name="git-branch-outline" size={15} color="#64748B" />
                <Text className="ml-1.5 flex-1 text-sm text-slate-500">Changed from its repeating series</Text>
              </View>
            )}
            {event.repeat && (
              <View className="mt-1.5 flex-row items-center">
                <Ionicons name="repeat" size={15} color="#64748B" />
                <Text className="ml-1.5 flex-1 text-sm text-slate-500">{repeatLabel(event.repeat, event.date)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Details */}
        <View className="mb-3 overflow-hidden rounded-3xl border border-slate-200 bg-white">
          {!!event.location && (
            <Detail icon="location-outline">
              <Text className="text-base text-slate-900">{event.location}</Text>
            </Detail>
          )}
          {!!event.description && (
            <Detail icon="reorder-three-outline">
              <Text className="text-base leading-6 text-slate-700">{event.description}</Text>
            </Detail>
          )}
          <Detail icon="notifications-outline">
            <Text className="text-base text-slate-900">{remindLabel(event.remindMinutes)}</Text>
          </Detail>
          <Detail icon="calendar-outline" last>
            <View className="flex-row items-center">
              <View className="mr-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              <Text className="text-base text-slate-900">{calendar?.name ?? "Calendar"}</Text>
            </View>
          </Detail>
        </View>

        {/* Food from the planner */}
        {event.mealSlot && (
          <View className="mb-3 overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <View className="flex-row items-center px-4 pb-1 pt-3.5">
              <Ionicons name="restaurant-outline" size={18} color="#64748B" />
              <Text className="ml-2 flex-1 text-base font-semibold text-slate-900">Food</Text>
              {!!food && (
                <Text className="text-sm font-semibold text-slate-700">{Math.round(food.nutrition.calories ?? 0)} kcal</Text>
              )}
            </View>
            {food === undefined ? (
              <ActivityIndicator className="my-4" color="#2563EB" />
            ) : !food ? (
              <Text className="px-4 pb-3 pt-1 text-sm text-slate-500">Nothing planned for this meal yet.</Text>
            ) : (
              <>
                {food.items.map((item) => (
                  <View key={item.id} className="flex-row items-center border-t border-slate-100 px-4 py-3">
                    <Ionicons
                      name={item.eaten ? "checkmark-circle" : "ellipse-outline"}
                      size={18}
                      color={item.eaten ? "#16A34A" : "#CBD5E1"}
                    />
                    <Text className="ml-2.5 flex-1 text-base text-slate-900" numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text className="text-sm text-slate-500">{item.kcal} kcal</Text>
                  </View>
                ))}
                <View className="flex-row border-t border-slate-100 px-4 py-3">
                  <Macro label="Protein" value={food.nutrition.protein} />
                  <Macro label="Carbs" value={food.nutrition.carbs} />
                  <Macro label="Fat" value={food.nutrition.fats} />
                </View>
              </>
            )}
            <Pressable
              onPress={() => router.navigate({ pathname: "/planner", params: { date: occurrence } })}
              className="flex-row items-center justify-center border-t border-slate-100 py-3.5 active:bg-slate-50"
            >
              <Text className="font-semibold text-blue-700">{food ? "Open in planner" : "Plan this meal"}</Text>
              <Ionicons name="chevron-forward" size={16} color="#1D4ED8" style={{ marginLeft: 4 }} />
            </Pressable>
          </View>
        )}

        {regularMeal && (
          <Pressable
            onPress={() => router.push("/calendar/meal-times")}
            className="mb-3 flex-row items-center rounded-2xl bg-blue-50 px-4 py-3 active:bg-blue-100"
          >
            <Ionicons name="time-outline" size={18} color="#1D4ED8" />
            <Text className="ml-2 flex-1 text-sm text-blue-900">
              This is one of your regular meal times. Editing here changes this day only.
            </Text>
            <Text className="text-sm font-semibold text-blue-700">Change times</Text>
          </Pressable>
        )}

        <Pressable
          onPress={confirmDelete}
          className="items-center rounded-2xl border border-red-200 bg-red-50 py-3.5 active:bg-red-100"
        >
          <Text className="font-semibold text-red-600">{regularMeal ? "Skip this day" : "Delete event"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ icon, children, last = false }: { icon: keyof typeof Ionicons.glyphMap; children: ReactNode; last?: boolean }) {
  return (
    <View className={`flex-row items-start px-4 py-3.5 ${last ? "" : "border-b border-slate-100"}`}>
      <Ionicons name={icon} size={20} color="#64748B" style={{ marginTop: 1 }} />
      <View className="ml-3 flex-1">{children}</View>
    </View>
  );
}

function Macro({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-sm font-semibold text-slate-900">{Math.round(value ?? 0)} g</Text>
      <Text className="text-xs text-slate-500">{label}</Text>
    </View>
  );
}
