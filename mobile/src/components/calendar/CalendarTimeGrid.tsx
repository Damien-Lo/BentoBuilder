import { Ionicons } from "@expo/vector-icons";
import { usePaneDimensions } from "@/src/utils/pane";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";

import type { EventCalendar, EventOccurrence } from "@/src/services/calendarApi";
import { useOrbitTheme } from "@/src/theme/orbit";
import { hexToRgba, parseLocalDate } from "@/src/utils/mealPlan";

import { TaskChip } from "./TaskChip";
import {
  addDays,
  calendarColor,
  layoutDay,
  minutesLabel,
  WEEKDAYS_SHORT,
} from "./calendarUtils";
import { mealLine } from "./mealFood";

export const HOUR_HEIGHT = 56;
const LABEL_WIDTH = 48;
const SNAP_MINUTES = 15;
const GRID_HEIGHT = HOUR_HEIGHT * 24;

interface Props {
  // First day shown, and how many days side by side (1 = Day, 3 = 3-Day).
  startDate: string;
  dayCount: number;
  today: string;
  nowMinutes: number;
  events: EventOccurrence[];
  calendarsById: Map<string, EventCalendar>;
  onPressEvent: (event: EventOccurrence) => void;
  // A block was dragged out on empty time — create an event for it.
  onCreate: (date: string, startMinutes: number, endMinutes: number) => void;
  // Swiped to the previous/next page — move by this many days.
  onShiftDays: (days: number) => void;
  onPressDay?: (date: string) => void;
}

// The Day / 3-Day view: an all-day strip, then the 24 hours, scrolling
// vertically. Swipe sideways to move by a page; long-press and drag on
// empty time to sketch a new event's time. (The phone's — always in
// Orbit's look, on the page; events keep their calendar's colour.)
export function CalendarTimeGrid({
  startDate,
  dayCount,
  today,
  nowMinutes,
  events,
  calendarsById,
  onPressEvent,
  onCreate,
  onShiftDays,
  onPressDay,
}: Props) {
  const { width } = usePaneDimensions();
  const pageWidth = width - LABEL_WIDTH;
  const columnWidth = pageWidth / dayCount;
  const verticalRef = useRef<ScrollView>(null);
  const pagerRef = useRef<ScrollView>(null);
  const [dragging, setDragging] = useState(false);
  const { colors: o } = useOrbitTheme();

  // Three pages — previous, current, next — re-centred after every swipe.
  const pages = useMemo(
    () => [-1, 0, 1].map((p) => Array.from({ length: dayCount }, (_, i) => addDays(startDate, p * dayCount + i))),
    [startDate, dayCount],
  );
  const currentDays = pages[1];

  useEffect(() => {
    pagerRef.current?.scrollTo({ x: pageWidth, animated: false });
  }, [startDate, dayCount, pageWidth]);

  // Open on whichever comes first: the shown days' first timed event, or an
  // hour before now (or 07:00 if there's nothing and it's early).
  useEffect(() => {
    const firstEvent = Math.min(
      ...currentDays.flatMap((day) => layoutDay(events, day).map((e) => e.start)),
    );
    const target = Math.min(Math.max(7 * 60, nowMinutes - 60), firstEvent - 30);
    const y = Math.max(0, (Math.min(target, 16 * 60) / 60) * HOUR_HEIGHT - 8);
    const t = setTimeout(() => verticalRef.current?.scrollTo({ y, animated: false }), 0);
    return () => clearTimeout(t);
    // On first show, switching Day/3-Day, and once events have loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayCount, events.length > 0]);

  const allDayByDay = currentDays.map((day) =>
    events.filter((e) => e.allDay && e.occurrenceDate <= day && e.occurrenceEndDate >= day),
  );
  const hasAllDay = allDayByDay.some((list) => list.length > 0);

  return (
    <View className="flex-1" style={{ backgroundColor: o.canvas }}>
      {/* Day headings + all-day events */}
      <View className="flex-row" style={{ borderBottomWidth: 1, borderBottomColor: o.border }}>
        <View style={{ width: LABEL_WIDTH }} className="justify-end pb-2">
          <Text className="text-center text-[10px] font-medium" style={{ color: o.faint }}>all-day</Text>
        </View>
        {currentDays.map((day, i) => {
          const d = parseLocalDate(day);
          const isToday = day === today;
          return (
            <Pressable
              key={day}
              onPress={() => onPressDay?.(day)}
              style={{ width: columnWidth, borderLeftWidth: 1, borderLeftColor: o.track }}
              className="px-1 pb-1.5 pt-1.5"
            >
              {/* Today in the Calendar's blue. */}
              <View className="flex-row items-baseline">
                <Text style={{ fontSize: 18, fontWeight: "800", color: isToday ? o.ink : o.text }}>{d.getDate()}</Text>
                <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: "600", color: isToday ? o.ink : o.muted }}>
                  {WEEKDAYS_SHORT[d.getDay()]}
                </Text>
              </View>
              <View style={{ minHeight: hasAllDay ? 24 : 8 }} className="mt-1 gap-1">
                {allDayByDay[i].map((event) => {
                  const color = calendarColor(calendarsById.get(event.calendar));
                  if (event.task) {
                    return (
                      <Pressable key={event._id} onPress={() => onPressEvent(event)}>
                        <TaskChip event={event} color={color} />
                      </Pressable>
                    );
                  }
                  return (
                    <Pressable
                      key={`${event._id}-${event.occurrenceDate}`}
                      onPress={() => onPressEvent(event)}
                      className="rounded-md px-1.5 py-0.5"
                      style={{ backgroundColor: hexToRgba(color, 0.18), borderLeftWidth: 3, borderLeftColor: color }}
                    >
                      <Text numberOfLines={1} className="text-[11px] font-semibold" style={{ color: o.text }}>
                        {event.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          );
        })}
      </View>

      <ScrollView ref={verticalRef} scrollEnabled={!dragging} showsVerticalScrollIndicator={false}>
        <View className="flex-row" style={{ height: GRID_HEIGHT + 16 }}>
          {/* Hour labels */}
          <View style={{ width: LABEL_WIDTH }}>
            {Array.from({ length: 24 }, (_, h) =>
              h === 0 ? null : (
                <Text
                  key={h}
                  className="absolute right-2 text-[11px] font-medium"
                  style={{ top: h * HOUR_HEIGHT + 8 - 7, color: o.faint }}
                >
                  {String(h).padStart(2, "0")}
                </Text>
              ),
            )}
          </View>

          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            scrollEnabled={!dragging}
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: pageWidth, y: 0 }}
            onMomentumScrollEnd={(e) => {
              const page = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
              if (page !== 1) onShiftDays((page - 1) * dayCount);
            }}
          >
            {pages.map((days) => (
              <View key={days[0]} className="flex-row" style={{ width: pageWidth, paddingTop: 8 }}>
                {days.map((day) => (
                  <DayColumn
                    key={day}
                    day={day}
                    width={columnWidth}
                    isToday={day === today}
                    nowMinutes={nowMinutes}
                    events={events}
                    calendarsById={calendarsById}
                    onPressEvent={onPressEvent}
                    onCreate={onCreate}
                    onDragChange={setDragging}
                  />
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

function DayColumn({
  day,
  width,
  isToday,
  nowMinutes,
  events,
  calendarsById,
  onPressEvent,
  onCreate,
  onDragChange,
}: {
  day: string;
  width: number;
  isToday: boolean;
  nowMinutes: number;
  events: EventOccurrence[];
  calendarsById: Map<string, EventCalendar>;
  onPressEvent: (event: EventOccurrence) => void;
  onCreate: (date: string, startMinutes: number, endMinutes: number) => void;
  onDragChange: (dragging: boolean) => void;
}) {
  const laidOut = useMemo(() => layoutDay(events, day), [events, day]);
  const { colors: o } = useOrbitTheme();

  // The block being sketched, in minutes.
  const anchor = useSharedValue(0);
  const current = useSharedValue(0);
  const active = useSharedValue(0);

  const create = (start: number, end: number) => onCreate(day, start, end);

  const drag = Gesture.Pan()
    .activateAfterLongPress(300)
    .onStart((e) => {
      const m = Math.floor(((e.y / HOUR_HEIGHT) * 60) / SNAP_MINUTES) * SNAP_MINUTES;
      anchor.value = Math.max(0, Math.min(1440 - SNAP_MINUTES, m));
      current.value = anchor.value + 60;
      active.value = 1;
      runOnJS(onDragChange)(true);
    })
    .onUpdate((e) => {
      const m = Math.round(((e.y / HOUR_HEIGHT) * 60) / SNAP_MINUTES) * SNAP_MINUTES;
      const clamped = Math.max(0, Math.min(1440, m));
      // Dragging only a little keeps the default one hour.
      current.value = Math.abs(clamped - anchor.value) < SNAP_MINUTES ? anchor.value + 60 : clamped;
    })
    .onEnd(() => {
      const start = Math.min(anchor.value, current.value);
      const end = Math.min(1440, Math.max(anchor.value, current.value));
      runOnJS(create)(start, end);
    })
    .onFinalize(() => {
      active.value = 0;
      runOnJS(onDragChange)(false);
    });

  const ghostStyle = useAnimatedStyle(() => {
    const start = Math.min(anchor.value, current.value);
    const end = Math.max(anchor.value, current.value);
    return {
      opacity: active.value,
      top: (start / 60) * HOUR_HEIGHT,
      height: Math.max(12, ((end - start) / 60) * HOUR_HEIGHT),
    };
  });

  return (
    <GestureDetector gesture={drag}>
      <View style={{ width, height: GRID_HEIGHT, borderLeftWidth: 1, borderLeftColor: o.track }}>
        {/* Hour and half-hour lines (the half hours fainter) */}
        {Array.from({ length: 24 }, (_, h) => (
          <View key={h} style={{ position: "absolute", top: h * HOUR_HEIGHT, left: 0, right: 0, height: HOUR_HEIGHT }}>
            <View style={{ borderTopWidth: 1, borderTopColor: o.border }} />
            <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderTopColor: o.track, marginTop: HOUR_HEIGHT / 2 - 1 }} />
          </View>
        ))}

        {laidOut.map(({ event, start, end, column, columns }) => {
          const color = calendarColor(calendarsById.get(event.calendar));
          const top = (start / 60) * HOUR_HEIGHT;
          const height = Math.max(13, ((end - start) / 60) * HOUR_HEIGHT - 2);
          const slot = (width - 4) / columns;
          return (
            <Pressable
              key={`${event._id}-${event.occurrenceDate}`}
              onPress={() => onPressEvent(event)}
              className="absolute overflow-hidden rounded-lg active:opacity-70"
              style={{
                top,
                height,
                left: 2 + column * slot,
                width: slot - 2,
                backgroundColor: hexToRgba(color, 0.16),
                borderLeftWidth: 3,
                borderLeftColor: color,
                paddingHorizontal: 5,
                paddingVertical: 3,
              }}
            >
              <Text
                numberOfLines={height < 34 ? 1 : 3}
                className={`font-semibold ${event.task?.completed ? "line-through" : ""} ${height < 20 ? "text-[10px]" : "text-xs"}`}
                style={[{ color: event.task?.completed ? o.faint : o.text }, height < 20 && { lineHeight: 11, marginTop: -2 }]}
              >
                {event.task && (
                  <Ionicons name={event.task.depth > 0 ? "diamond-outline" : "flag"} size={height < 20 ? 8 : 10} color={color} />
                )}
                {event.task ? " " : ""}
                {event.title}
              </Text>
              {/* A meal's food from the planner. */}
              {event.meal && height >= 30 && (
                <Text numberOfLines={height >= 56 ? 2 : 1} className="text-[10px]" style={{ color: event.meal.food ? o.icon : o.faint }}>
                  {event.meal.food?.eaten && <Ionicons name="checkmark-circle" size={10} color={o.success} />}
                  {event.meal.food?.eaten ? " " : ""}
                  {mealLine(event)}
                </Text>
              )}
              {height >= (event.meal ? 58 : 40) && (
                <Text numberOfLines={1} className="text-[10px]" style={{ color: o.muted }}>
                  {minutesLabel(event.startMinutes)}–{minutesLabel(event.endMinutes)}
                  {event.location ? ` · ${event.location}` : ""}
                  {event.task && event.task.depth > 0 ? ` · ${event.task.rootTitle}` : ""}
                </Text>
              )}
            </Pressable>
          );
        })}

        {isToday && (
          <View
            pointerEvents="none"
            style={{ position: "absolute", left: 0, right: 0, top: (nowMinutes / 60) * HOUR_HEIGHT - 1 }}
            className="flex-row items-center"
          >
            <View className="h-2.5 w-2.5 rounded-full" style={{ marginLeft: -5, backgroundColor: o.danger }} />
            <View className="h-0.5 flex-1" style={{ backgroundColor: o.danger }} />
          </View>
        )}

        <Animated.View
          pointerEvents="none"
          // The block being sketched, in the Calendar's blue.
          style={[{ position: "absolute", left: 2, right: 2, borderRadius: 8, borderWidth: 2, borderColor: o.fill, backgroundColor: hexToRgba(o.fill, 0.2) }, ghostStyle]}
        />
      </View>
    </GestureDetector>
  );
}

export default CalendarTimeGrid;
