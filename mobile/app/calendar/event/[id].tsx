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
import { showActions } from "@/src/components/todo/theme";
import {
  deleteCalendarEvent,
  getCalendarEvent,
  getCalendars,
  type CalendarEvent,
  type EventCalendar,
} from "@/src/services/calendarApi";
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

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getCalendarEvent(id), getCalendars()])
        .then(([loaded, calendars]) => {
          if (cancelled) return;
          setEvent(loaded);
          setCalendar(calendars.find((c) => c._id === loaded.calendar) ?? null);
        })
        .catch(() => {
          if (!cancelled) Alert.alert("Couldn't load event", undefined, [{ text: "OK", onPress: () => router.back() }]);
        })
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [id, router]),
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

  async function remove(onlyThis: boolean) {
    try {
      await deleteCalendarEvent(id, onlyThis ? occurrence : undefined);
      router.back();
    } catch (error) {
      Alert.alert("Couldn't delete", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  function confirmDelete() {
    if (event?.repeat) {
      showActions("Delete repeating event", [
        { label: "Delete this event", destructive: true, onPress: () => void remove(true) },
        { label: "Delete all events in the series", destructive: true, onPress: () => void remove(false) },
      ]);
      return;
    }
    Alert.alert("Delete event?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void remove(false) },
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
          onPress={() => router.push({ pathname: "/calendar/edit", params: { id } })}
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

        <Pressable
          onPress={confirmDelete}
          className="items-center rounded-2xl border border-red-200 bg-red-50 py-3.5 active:bg-red-100"
        >
          <Text className="font-semibold text-red-600">Delete event</Text>
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
