import { Ionicons } from "@expo/vector-icons";
import { usePaneDimensions } from "@/src/utils/pane";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { Tap } from "@/src/components/ui/Tap";
import type { EventCalendar, EventOccurrence } from "@/src/services/calendarApi";
import { useOrbitTheme } from "@/src/theme/orbit";
import { hexToRgba, parseLocalDate } from "@/src/utils/mealPlan";

import { TaskChip } from "./TaskChip";
import {
  addDays,
  calendarColor,
  minutesLabel,
  monthGrid,
  MONTHS_SHORT,
  shiftMonth,
  shortDateLabel,
  weekOf,
  WEEKDAYS_SHORT,
} from "./calendarUtils";
import { mealLine } from "./mealFood";

// ── Week strip / pull-down month ────────────────────────────────────────────

const STRIP_ROW_HEIGHT = 50;

// These are the phone's views (a desktop browser has its own, in web/), so
// they're always in Orbit's look: on the page itself, in the Calendar's
// blue. Events keep their calendar's own colour.

// The strip under the header: the focused week, sliding with your finger to
// the next/previous week. Drag the handle down (or tap it) and it unrolls
// into the whole month, row by row, following the finger; expanded, it
// slides by month.
export function WeekStrip({
  focusDate,
  today,
  weekStartDay,
  eventDays,
  onChangeFocus,
}: {
  focusDate: string;
  today: string;
  weekStartDay: number;
  // Dates with at least one event — they get a dot.
  eventDays: Set<string>;
  onChangeFocus: (date: string) => void;
}) {
  const { width } = usePaneDimensions();
  const pageWidth = width - 16;
  const pagerRef = useRef<ScrollView>(null);
  const { colors: o } = useOrbitTheme();

  const [expanded, setExpanded] = useState(false);
  // True while the month is unrolling/rolling up — the strip then shows the
  // month as one plain grid (no sideways paging) so it can be clipped.
  const [animating, setAnimating] = useState(false);

  const grid = useMemo(() => monthGrid(focusDate, weekStartDay), [focusDate, weekStartDay]);
  const focusRow = Math.max(0, grid.findIndex((week) => week.includes(focusDate)));

  const progress = useSharedValue(0);
  const dragStart = useSharedValue(0);
  const rows = useSharedValue(grid.length);
  const row = useSharedValue(focusRow);
  useEffect(() => {
    rows.value = grid.length;
    row.value = focusRow;
  }, [grid.length, focusRow, rows, row]);

  // Re-centre the pager after a swipe (or switching week <-> month).
  useLayoutEffect(() => {
    pagerRef.current?.scrollTo({ x: pageWidth, animated: false });
  }, [focusDate, expanded, animating, pageWidth]);

  const finish = (isExpanded: boolean) => {
    setExpanded(isExpanded);
    setAnimating(false);
  };

  const settle = (to: number) => {
    "worklet";
    progress.value = withSpring(
      to,
      { damping: 24, stiffness: 240, overshootClamping: true },
      (done) => {
        if (done) runOnJS(finish)(to === 1);
      },
    );
  };

  const toggle = () => {
    setAnimating(true);
    settle(expanded ? 0 : 1);
  };

  const pull = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onStart(() => {
      dragStart.value = progress.value;
      runOnJS(setAnimating)(true);
    })
    .onUpdate((e) => {
      const span = STRIP_ROW_HEIGHT * Math.max(1, rows.value - 1);
      progress.value = Math.min(1, Math.max(0, dragStart.value + e.translationY / span));
    })
    .onEnd((e) => {
      const to = e.velocityY > 400 ? 1 : e.velocityY < -400 ? 0 : progress.value > 0.5 ? 1 : 0;
      settle(to);
    });

  const clipStyle = useAnimatedStyle(() => ({
    height: STRIP_ROW_HEIGHT * (1 + (rows.value - 1) * progress.value),
  }));
  // Keeps the focused week in place while the rows above it unroll.
  const gridStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -row.value * STRIP_ROW_HEIGHT * (1 - progress.value) }],
  }));

  const select = (date: string) => {
    onChangeFocus(date);
    if (expanded) {
      setAnimating(true);
      settle(0);
    }
  };

  const focusMonth = parseLocalDate(focusDate).getMonth();
  const headers = weekOf(focusDate, weekStartDay).map((d) => WEEKDAYS_SHORT[parseLocalDate(d).getDay()][0]);

  const renderWeek = (week: string[], month: number | null) => (
    <View key={week[0]} className="flex-row" style={{ height: STRIP_ROW_HEIGHT }}>
      {week.map((day) => {
        const d = parseLocalDate(day);
        const selected = day === focusDate;
        const isToday = day === today;
        const outside = month != null && d.getMonth() !== month;
        return (
          <Pressable key={day} onPress={() => select(day)} className="flex-1 items-center pt-1" accessibilityState={{ selected }}>
            {/* The chosen day in the Calendar's blue; today, if it isn't
                chosen, ringed. */}
            <View
              className="h-9 w-9 items-center justify-center rounded-full"
              style={{
                backgroundColor: selected ? o.ink : "transparent",
                borderWidth: !selected && isToday ? 2 : 0,
                borderColor: o.selectedRing,
              }}
            >
              {d.getDate() === 1 && !selected && (
                <Text className="-mb-0.5 text-[9px] font-semibold" style={{ color: o.faint }}>
                  {MONTHS_SHORT[d.getMonth()]}
                </Text>
              )}
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: selected || isToday ? "700" : "500",
                  color: selected ? o.onInk : outside ? o.faint : o.text,
                }}
              >
                {d.getDate()}
              </Text>
            </View>
            <View className="mt-0.5 h-1 w-1 rounded-full" style={{ backgroundColor: eventDays.has(day) ? o.muted : "transparent" }} />
          </Pressable>
        );
      })}
    </View>
  );

  const pager = (pages: string[][][], months: (number | null)[]) => (
    <ScrollView
      ref={pagerRef}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      contentOffset={{ x: pageWidth, y: 0 }}
      onMomentumScrollEnd={(e) => {
        const page = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
        if (page === 1) return;
        const direction = page - 1;
        onChangeFocus(expanded ? shiftMonth(focusDate, direction) : addDays(focusDate, direction * 7));
      }}
    >
      {pages.map((weeks, i) => (
        <View key={weeks[0][0]} style={{ width: pageWidth }}>
          {weeks.map((week) => renderWeek(week, months[i]))}
        </View>
      ))}
    </ScrollView>
  );

  let body;
  if (animating) {
    body = <Animated.View style={gridStyle}>{grid.map((week) => renderWeek(week, focusMonth))}</Animated.View>;
  } else if (expanded) {
    const months = [-1, 0, 1].map((m) => shiftMonth(focusDate, m));
    body = pager(
      months.map((m) => monthGrid(m, weekStartDay)),
      months.map((m) => parseLocalDate(m).getMonth()),
    );
  } else {
    body = pager(
      [-7, 0, 7].map((offset) => [weekOf(addDays(focusDate, offset), weekStartDay)]),
      [null, null, null],
    );
  }

  return (
    // On the page itself, not a band of its own.
    <View style={{ backgroundColor: o.canvas }}>
      <View className="flex-row px-2">
        {headers.map((h, i) => (
          <Text key={i} className="flex-1 py-1 text-center" style={{ fontSize: 11, fontWeight: "600", color: o.faint }}>
            {h}
          </Text>
        ))}
      </View>
      <Animated.View style={[{ overflow: "hidden", marginHorizontal: 8 }, clipStyle]}>{body}</Animated.View>
      <GestureDetector gesture={pull}>
        <Pressable onPress={toggle} hitSlop={{ top: 4, bottom: 10, left: 40, right: 40 }} className="items-center pb-2.5 pt-1.5" accessibilityLabel={expanded ? "Show the week" : "Show the month"}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: o.track }} />
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
  const { colors: o } = useOrbitTheme();
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
      <View className="flex-1" style={{ backgroundColor: o.canvas }}>
        <View className="flex-row" style={{ borderBottomWidth: 1, borderBottomColor: o.border }}>
          {headers.map((h) => (
            <Text key={h} className="flex-1 py-2 text-center" style={{ fontSize: 11, fontWeight: "600", color: o.faint }}>
              {h}
            </Text>
          ))}
        </View>
        {weeks.map((week) => (
          <View key={week[0]} className="flex-1 flex-row" style={{ borderBottomWidth: 1, borderBottomColor: o.border }}>
            {week.map((day) => {
              const d = parseLocalDate(day);
              const dayEvents = events.filter((e) => e.occurrenceDate <= day && e.occurrenceEndDate >= day);
              const outside = d.getMonth() !== focusMonth;
              const isToday = day === today;
              return (
                <Tap
                  key={day}
                  onPress={() => onPressDay(day)}
                  // The days either side of the month a shade back.
                  style={{ flex: 1, paddingHorizontal: 2, paddingTop: 4, borderLeftWidth: 1, borderLeftColor: o.border, backgroundColor: outside ? o.track : "transparent" }}
                  pressedStyle={{ backgroundColor: o.pill }}
                >
                  <View
                    className="mb-0.5 h-6 w-6 items-center justify-center self-center rounded-full"
                    style={{ backgroundColor: isToday ? o.ink : "transparent" }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: isToday ? o.onInk : outside ? o.faint : o.text }}>
                      {d.getDate()}
                    </Text>
                  </View>
                  {dayEvents.slice(0, 3).map((event) => {
                    const color = calendarColor(calendarsById.get(event.calendar));
                    if (event.task) return <TaskChip key={event._id} event={event} color={color} size="small" />;
                    return (
                      <View
                        key={`${event._id}-${event.occurrenceDate}`}
                        className="mb-0.5 rounded px-1"
                        style={{ backgroundColor: hexToRgba(color, 0.16), borderLeftWidth: 2, borderLeftColor: color }}
                      >
                        <Text numberOfLines={1} className="text-[9px] font-medium" style={{ color: o.text }}>
                          {event.title}
                        </Text>
                      </View>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <Text className="text-center text-[9px]" style={{ color: o.faint }}>+{dayEvents.length - 3}</Text>
                  )}
                </Tap>
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
  const { colors: o } = useOrbitTheme();
  const dates = Array.from({ length: days }, (_, i) => addDays(focusDate, i));
  // Each day's events in a card of their own, under its heading.
  const card = { backgroundColor: o.surface, borderRadius: 18, borderWidth: 1, borderColor: o.border, overflow: "hidden" as const };
  return (
    <ScrollView className="flex-1" style={{ backgroundColor: o.canvas }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
      {dates.map((day) => {
        const dayEvents = events.filter((e) => e.occurrenceDate <= day && e.occurrenceEndDate >= day);
        return (
          <View key={day}>
            <View style={{ paddingHorizontal: 4, paddingTop: 18, paddingBottom: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: day === today ? o.ink : o.faint }}>
                {(day === today ? "Today · " : "") + shortDateLabel(day).toUpperCase()}
              </Text>
            </View>
            {dayEvents.length === 0 ? (
              <View style={card}>
                <Text style={{ paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: o.faint }}>No events</Text>
              </View>
            ) : (
              <View style={card}>
                {dayEvents.map((event, i) => {
                  const color = calendarColor(calendarsById.get(event.calendar));
                  return (
                    <Tap
                      key={`${event._id}-${event.occurrenceDate}`}
                      onPress={() => onPressEvent(event)}
                      style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: o.border }}
                      pressedStyle={{ backgroundColor: o.pill }}
                    >
                      <View className="w-14">
                        {event.task && event.allDay ? (
                          <Text style={{ fontSize: 12, fontWeight: "600", color: event.task.overdue ? o.danger : o.muted }}>
                            {event.task.depth > 0 ? "Subtask" : "Task due"}
                          </Text>
                        ) : event.allDay ? (
                          <Text style={{ fontSize: 12, fontWeight: "600", color: o.muted }}>All day</Text>
                        ) : (
                          <>
                            <Text style={{ fontSize: 12, fontWeight: "600", color: o.text }}>{minutesLabel(event.startMinutes)}</Text>
                            <Text style={{ fontSize: 12, color: o.faint }}>{minutesLabel(event.endMinutes)}</Text>
                          </>
                        )}
                      </View>
                      <View className="mr-3 w-1 self-stretch rounded-full" style={{ backgroundColor: color }} />
                      <View className="flex-1">
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "600",
                            color: event.task?.completed ? o.faint : o.text,
                            textDecorationLine: event.task?.completed ? "line-through" : "none",
                          }}
                          numberOfLines={1}
                        >
                          {event.title}
                        </Text>
                        {event.task && (
                          <View className="mt-0.5 flex-row items-center">
                            <Ionicons name={event.task.depth > 0 ? "diamond-outline" : "flag"} size={11} color={o.faint} />
                            <Text style={{ marginLeft: 4, fontSize: 12, color: o.muted }} numberOfLines={1}>
                              {event.task.rootNumber != null ? `#${event.task.rootNumber} ` : ""}
                              {event.task.depth > 0 ? event.task.rootTitle : "Task"}
                            </Text>
                          </View>
                        )}
                        {event.meal && (
                          <View className="mt-0.5 flex-row items-center">
                            <Ionicons
                              name={event.meal.food?.eaten ? "checkmark-circle" : "restaurant-outline"}
                              size={12}
                              color={event.meal.food?.eaten ? o.success : o.faint}
                            />
                            <Text style={{ marginLeft: 4, flex: 1, fontSize: 12, color: event.meal.food ? o.muted : o.faint }} numberOfLines={1}>
                              {mealLine(event)}
                            </Text>
                          </View>
                        )}
                        {!!event.location && (
                          <View className="mt-0.5 flex-row items-center">
                            <Ionicons name="location-outline" size={12} color={o.faint} />
                            <Text style={{ marginLeft: 4, fontSize: 12, color: o.muted }} numberOfLines={1}>
                              {event.location}
                            </Text>
                          </View>
                        )}
                      </View>
                      {event.repeat && <Ionicons name="repeat" size={14} color={o.faint} />}
                    </Tap>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
