import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

import type { EventCalendar, EventOccurrence } from "@/src/services/calendarApi";
import { hexToRgba, parseLocalDate } from "@/src/utils/mealPlan";

import {
  addDays,
  calendarColor,
  minutesLabel,
  monthGrid,
  shortDateLabel,
  weekOf,
  WEEKDAYS_SHORT,
} from "./calendarUtils";

// ── Week strip / pull-down month ────────────────────────────────────────────

// The strip under the header: the focused week, or (pulled down) the whole
// month. Swipe sideways for the next/previous week (or month); drag the
// handle, or tap it, to expand/collapse.
export function WeekStrip({
  focusDate,
  today,
  weekStartDay,
  expanded,
  eventDays,
  onSelect,
  onShift,
  onSetExpanded,
}: {
  focusDate: string;
  today: string;
  weekStartDay: number;
  expanded: boolean;
  // Dates with at least one event — they get a dot.
  eventDays: Set<string>;
  onSelect: (date: string) => void;
  // -1 / +1: previous / next week (month when expanded).
  onShift: (direction: number) => void;
  onSetExpanded: (expanded: boolean) => void;
}) {
  const focusMonth = parseLocalDate(focusDate).getMonth();
  const weeks = expanded ? monthGrid(focusDate, weekStartDay) : [weekOf(focusDate, weekStartDay)];
  const headers = weekOf(focusDate, weekStartDay).map((d) => WEEKDAYS_SHORT[parseLocalDate(d).getDay()][0]);

  const swipe = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 40) runOnJS(onShift)(e.translationX < 0 ? 1 : -1);
    });

  const pull = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onEnd((e) => {
      if (e.translationY > 20) runOnJS(onSetExpanded)(true);
      else if (e.translationY < -20) runOnJS(onSetExpanded)(false);
    });

  return (
    <View className="border-b border-slate-200 bg-white">
      <GestureDetector gesture={swipe}>
        <View className="px-2">
          <View className="flex-row">
            {headers.map((h, i) => (
              <Text key={i} className="flex-1 py-1 text-center text-xs font-semibold text-slate-400">
                {h}
              </Text>
            ))}
          </View>
          {weeks.map((week) => (
            <View key={week[0]} className="flex-row">
              {week.map((day) => {
                const d = parseLocalDate(day);
                const selected = day === focusDate;
                const isToday = day === today;
                const outside = expanded && d.getMonth() !== focusMonth;
                return (
                  <Pressable key={day} onPress={() => onSelect(day)} className="flex-1 items-center py-1">
                    <View
                      className={`h-9 w-9 items-center justify-center rounded-full ${selected ? "bg-blue-600" : ""}`}
                    >
                      {d.getDate() === 1 && !selected ? (
                        <Text className="text-[9px] font-semibold text-slate-400">
                          {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]}
                        </Text>
                      ) : null}
                      <Text
                        className={`text-base ${
                          selected
                            ? "font-bold text-white"
                            : isToday
                              ? "font-bold text-blue-600"
                              : outside
                                ? "text-slate-300"
                                : "text-slate-800"
                        }`}
                      >
                        {d.getDate()}
                      </Text>
                    </View>
                    <View
                      className={`mt-0.5 h-1 w-1 rounded-full ${eventDays.has(day) ? "bg-slate-400" : "bg-transparent"}`}
                    />
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </GestureDetector>

      <GestureDetector gesture={pull}>
        <Pressable onPress={() => onSetExpanded(!expanded)} hitSlop={6} className="items-center pb-2 pt-1">
          <View className="h-1.5 w-10 rounded-full bg-slate-300" />
        </Pressable>
      </GestureDetector>
    </View>
  );
}

// ── Month view ──────────────────────────────────────────────────────────────

export function MonthView({
  focusDate,
  today,
  weekStartDay,
  events,
  calendarsById,
  onPressDay,
  onShift,
}: {
  focusDate: string;
  today: string;
  weekStartDay: number;
  events: EventOccurrence[];
  calendarsById: Map<string, EventCalendar>;
  onPressDay: (date: string) => void;
  onShift: (direction: number) => void;
}) {
  const focusMonth = parseLocalDate(focusDate).getMonth();
  const weeks = monthGrid(focusDate, weekStartDay);
  const headers = weeks[0].map((d) => WEEKDAYS_SHORT[parseLocalDate(d).getDay()]);

  const swipe = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 40) runOnJS(onShift)(e.translationX < 0 ? 1 : -1);
    });

  return (
    <GestureDetector gesture={swipe}>
      <View className="flex-1 bg-white">
        <View className="flex-row border-b border-slate-200">
          {headers.map((h) => (
            <Text key={h} className="flex-1 py-2 text-center text-xs font-semibold text-slate-400">
              {h}
            </Text>
          ))}
        </View>
        {weeks.map((week) => (
          <View key={week[0]} className="flex-1 flex-row border-b border-slate-100">
            {week.map((day) => {
              const d = parseLocalDate(day);
              const dayEvents = events.filter((e) => e.occurrenceDate <= day && e.occurrenceEndDate >= day);
              const outside = d.getMonth() !== focusMonth;
              const isToday = day === today;
              return (
                <Pressable
                  key={day}
                  onPress={() => onPressDay(day)}
                  className={`flex-1 border-l border-slate-100 px-0.5 pt-1 active:bg-slate-50 ${outside ? "bg-slate-50" : ""}`}
                >
                  <View className={`mb-0.5 h-6 w-6 items-center justify-center self-center rounded-full ${isToday ? "bg-blue-600" : ""}`}>
                    <Text
                      className={`text-xs font-semibold ${isToday ? "text-white" : outside ? "text-slate-300" : "text-slate-700"}`}
                    >
                      {d.getDate()}
                    </Text>
                  </View>
                  {dayEvents.slice(0, 3).map((event) => {
                    const color = calendarColor(calendarsById.get(event.calendar));
                    return (
                      <View
                        key={`${event._id}-${event.occurrenceDate}`}
                        className="mb-0.5 rounded px-1"
                        style={{ backgroundColor: hexToRgba(color, 0.16), borderLeftWidth: 2, borderLeftColor: color }}
                      >
                        <Text numberOfLines={1} className="text-[9px] font-medium text-slate-800">
                          {event.title}
                        </Text>
                      </View>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <Text className="text-center text-[9px] text-slate-400">+{dayEvents.length - 3}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </GestureDetector>
  );
}

// ── Agenda view ─────────────────────────────────────────────────────────────

export function AgendaView({
  focusDate,
  today,
  days,
  events,
  calendarsById,
  onPressEvent,
}: {
  focusDate: string;
  today: string;
  days: number;
  events: EventOccurrence[];
  calendarsById: Map<string, EventCalendar>;
  onPressEvent: (event: EventOccurrence) => void;
}) {
  const dates = Array.from({ length: days }, (_, i) => addDays(focusDate, i));
  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerStyle={{ paddingBottom: 120 }}>
      {dates.map((day) => {
        const dayEvents = events.filter((e) => e.occurrenceDate <= day && e.occurrenceEndDate >= day);
        return (
          <View key={day}>
            <View className="border-b border-slate-100 bg-slate-50 px-4 pb-1.5 pt-4">
              <Text className={`text-xs font-bold uppercase tracking-wide ${day === today ? "text-blue-600" : "text-slate-500"}`}>
                {day === today ? "Today · " : ""}
                {shortDateLabel(day)}
              </Text>
            </View>
            {dayEvents.length === 0 ? (
              <Text className="bg-white px-4 py-3 text-sm text-slate-400">No events</Text>
            ) : (
              dayEvents.map((event) => {
                const color = calendarColor(calendarsById.get(event.calendar));
                return (
                  <Pressable
                    key={`${event._id}-${event.occurrenceDate}`}
                    onPress={() => onPressEvent(event)}
                    className="flex-row items-center border-b border-slate-100 bg-white px-4 py-3 active:bg-slate-50"
                  >
                    <View className="w-14">
                      {event.allDay ? (
                        <Text className="text-xs font-semibold text-slate-500">All day</Text>
                      ) : (
                        <>
                          <Text className="text-xs font-semibold text-slate-900">{minutesLabel(event.startMinutes)}</Text>
                          <Text className="text-xs text-slate-400">{minutesLabel(event.endMinutes)}</Text>
                        </>
                      )}
                    </View>
                    <View className="mr-3 w-1 self-stretch rounded-full" style={{ backgroundColor: color }} />
                    <View className="flex-1">
                      <Text className="text-[15px] font-semibold text-slate-900" numberOfLines={1}>
                        {event.title}
                      </Text>
                      {!!event.location && (
                        <View className="mt-0.5 flex-row items-center">
                          <Ionicons name="location-outline" size={12} color="#94A3B8" />
                          <Text className="ml-1 text-xs text-slate-500" numberOfLines={1}>
                            {event.location}
                          </Text>
                        </View>
                      )}
                    </View>
                    {event.repeat && <Ionicons name="repeat" size={14} color="#94A3B8" />}
                  </Pressable>
                );
              })
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
