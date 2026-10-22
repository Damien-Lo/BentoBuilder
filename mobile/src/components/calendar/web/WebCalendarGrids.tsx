import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { EventCalendar, EventOccurrence } from "@/src/services/calendarApi";
import { hexToRgba, parseLocalDate } from "@/src/utils/mealPlan";

import { calendarColor, layoutDay, minutesLabel, monthGrid, MONTHS_SHORT, WEEKDAYS_SHORT } from "../calendarUtils";
import { mealLine } from "../mealFood";
import { getWebScale } from "@/src/components/web/scale";
import { themeColor } from "@/src/components/web/theme";
import { LIGHT, SECTION_PALETTE, useOrbitPage, useOrbitTheme } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";
import { TaskChip } from "../TaskChip";

// The desktop calendar's two grids, laid out like Outlook on the web: a
// time grid of day columns (day / work week / week) and a month of weeks.

const HOUR_HEIGHT = 52;
const GUTTER = 56;
const SNAP = 15;

const hoverStyle = (hovered: boolean | undefined, base: string, over: string) => (hovered ? over : base);

// The grids' colours. On a desktop page in Orbit's look, or in a section,
// Orbit's: today and the day picked in the section's own colour (the
// Calendar's blue, the Kitchen's orange where its session booker shows the
// week), today's column in a faint wash of it. Anywhere else (a date picker
// on a page not redesigned yet, or a narrow window) the older blue look.
interface GridColors {
  surface: string;
  line: string; // hour lines, column edges
  halfLine: string; // half-hour lines
  hover: string;
  outside: string; // a month's days from the months either side
  text: string;
  body: string;
  muted: string;
  faint: string;
  subtle: string; // an event's time, the mini month's arrows
  iconHover: string;
  dim: string; // a mini month's days outside it
  accent: string; // today, the day picked
  onAccent: string;
  todayWash: string; // today's column
  monthToday: string; // today in the month
  band: string; // the week on show, in the mini month
  bandRadius: number;
  pick: string; // a day hovered in the mini month
  spanFill: string; // the time being dragged out
  spanText: string;
  now: string;
}

const OLD_GRID: GridColors = {
  surface: "#FFFFFF",
  line: "#E2E8F0",
  halfLine: "#F1F5F9",
  hover: "#F8FAFC",
  outside: "#FAFBFC",
  text: "#0F172A",
  body: "#334155",
  muted: "#64748B",
  faint: "#94A3B8",
  subtle: "#475569",
  iconHover: "#E2E8F0",
  dim: "#CBD5E1",
  accent: "#2563EB",
  onAccent: "#FFFFFF",
  todayWash: "#F8FBFF",
  monthToday: "#FFFFFF",
  band: "#EFF6FF",
  bandRadius: 6,
  pick: "#DBEAFE",
  spanFill: "rgba(37,99,235,0.18)",
  spanText: "#1D4ED8",
  now: "#EF4444",
};

// "r,g,b" of a "#RRGGBB", or `a` blended `t` of the way to `b`.
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const blend = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",");
// (Orbit's dark card, which a dark wash is laid over.)
const DARK_SURFACE = [23, 26, 33];

export function useGridColors(): GridColors {
  const wide = useWideWeb();
  const page = useOrbitPage();
  const { colors: c } = useOrbitTheme();
  return useMemo(() => {
    // (In a section its ink is its own colour, not the plain theme's.)
    if (!wide || (!page && c.ink === LIGHT.ink)) return OLD_GRID;
    const hue = Object.values(SECTION_PALETTE).find((p) => p.dark === c.ink);
    // A faint wash of the section's colour, given its own dark (translated,
    // a pale tint comes out too strong on the dark).
    const wash = hue ? themeColor(blend(rgb(hue.tint), [255, 255, 255], 0.7), blend(DARK_SURFACE, rgb(hue.base), 0.06)) : c.canvas;
    return {
      surface: c.surface,
      line: c.border,
      halfLine: c.track,
      hover: c.pill,
      outside: c.canvas,
      text: c.text,
      body: c.icon,
      muted: c.muted,
      faint: c.faint,
      subtle: c.muted,
      iconHover: c.pill,
      dim: c.orbit,
      accent: c.ink,
      onAccent: c.onInk,
      todayWash: wash,
      monthToday: wash,
      band: wash,
      bandRadius: 14,
      pick: hue?.tint ?? c.pill,
      spanFill: hue?.tint ?? c.pill,
      spanText: c.ink,
      now: c.danger,
    };
  }, [wide, page, c]);
}

// ── Time grid ────────────────────────────────────────────────────────────────

export function WebTimeGrid({
  days,
  today,
  nowMinutes,
  events,
  calendarsById,
  onPressEvent,
  onCreate,
  onPressDay,
}: {
  days: string[];
  today: string;
  nowMinutes: number;
  events: EventOccurrence[];
  calendarsById: Map<string, EventCalendar>;
  onPressEvent: (event: EventOccurrence) => void;
  // A click (an hour from there) or a drag (its span) on empty time.
  onCreate: (date: string, startMinutes: number, endMinutes: number) => void;
  onPressDay: (date: string) => void;
}) {
  const g = useGridColors();
  const scroller = useRef<ScrollView>(null);
  // Open on the working day, not midnight.
  useEffect(() => {
    scroller.current?.scrollTo({ y: 7 * HOUR_HEIGHT - 8, animated: false });
  }, []);

  const allDay = (day: string) =>
    events.filter((e) => e.allDay && day >= e.occurrenceDate && day <= e.occurrenceEndDate);
  const tallestAllDay = Math.max(0, ...days.map((d) => allDay(d).length));

  return (
    <View style={{ flex: 1, backgroundColor: g.surface }}>
      {/* Day headers */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: g.line, paddingRight: 0 }}>
        <View style={{ width: GUTTER }} />
        {days.map((day) => {
          const d = parseLocalDate(day);
          const isToday = day === today;
          return (
            <Pressable
              key={day}
              onPress={() => onPressDay(day)}
              style={({ hovered }: { hovered?: boolean }) => ({
                flex: 1,
                paddingHorizontal: 10,
                paddingTop: 8,
                paddingBottom: 6,
                borderLeftWidth: 1,
                borderLeftColor: g.line,
                borderTopWidth: 3,
                borderTopColor: isToday ? g.accent : "transparent",
                backgroundColor: hoverStyle(hovered, g.surface, g.hover),
              })}
            >
              <Text style={{ fontSize: 22, fontWeight: isToday ? "700" : "500", color: isToday ? g.accent : g.text }}>
                {d.getDate()}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: "600", color: isToday ? g.accent : g.muted }}>
                {WEEKDAYS_SHORT[d.getDay()]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* All-day row: all-day events and task due dates */}
      {tallestAllDay > 0 && (
        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: g.line, backgroundColor: g.surface }}>
          <View style={{ width: GUTTER, alignItems: "flex-end", paddingRight: 8, paddingTop: 6 }}>
            <Text style={{ fontSize: 10, color: g.faint }}>all-day</Text>
          </View>
          {days.map((day) => (
            <View key={day} style={{ flex: 1, padding: 3, gap: 2, borderLeftWidth: 1, borderLeftColor: g.line, minHeight: 30 }}>
              {allDay(day).map((event) => {
                const color = calendarColor(calendarsById.get(event.calendar));
                return (
                  <Pressable key={`${event._id}-${event.occurrenceDate}`} onPress={() => onPressEvent(event)}>
                    {event.task ? (
                      <TaskChip event={event} color={color} />
                    ) : (
                      <View
                        style={{
                          backgroundColor: hexToRgba(color, 0.18),
                          borderLeftWidth: 3,
                          borderLeftColor: color,
                          borderRadius: 5,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                        }}
                      >
                        <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "600", color: g.text }}>
                          {event.title}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      )}

      {/* Hours */}
      <ScrollView ref={scroller} style={{ flex: 1 }} showsVerticalScrollIndicator>
        <View style={{ flexDirection: "row", height: 24 * HOUR_HEIGHT }}>
          <View style={{ width: GUTTER }}>
            {Array.from({ length: 24 }, (_, h) => (
              <View key={h} style={{ height: HOUR_HEIGHT, alignItems: "flex-end", paddingRight: 8 }}>
                {h > 0 && <Text style={{ fontSize: 11, color: g.faint, marginTop: -7 }}>{minutesLabel(h * 60)}</Text>}
              </View>
            ))}
          </View>
          {days.map((day) => (
            <DayColumn
              key={day}
              day={day}
              isToday={day === today}
              nowMinutes={nowMinutes}
              events={events}
              calendarsById={calendarsById}
              onPressEvent={onPressEvent}
              onCreate={onCreate}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function DayColumn({
  day,
  isToday,
  nowMinutes,
  events,
  calendarsById,
  onPressEvent,
  onCreate,
}: {
  day: string;
  isToday: boolean;
  nowMinutes: number;
  events: EventOccurrence[];
  calendarsById: Map<string, EventCalendar>;
  onPressEvent: (event: EventOccurrence) => void;
  onCreate: (date: string, startMinutes: number, endMinutes: number) => void;
}) {
  const g = useGridColors();
  const column = useRef<View>(null);
  // While the mouse is held on empty time: where it went down and is now.
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const top = useRef(0);

  const minutesAt = (pageY: number) => {
    // (The mouse is measured on screen; the grid is laid out before the
    // page's scale is applied.)
    const raw = ((pageY - top.current) / getWebScale() / HOUR_HEIGHT) * 60;
    return Math.max(0, Math.min(1440, Math.round(raw / SNAP) * SNAP));
  };

  const laidOut = layoutDay(events.filter((e) => !e.allDay), day);
  const span = drag && { start: Math.min(drag.from, drag.to), end: Math.max(drag.from, drag.to) };

  return (
    <View ref={column} style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: g.line, backgroundColor: isToday ? g.todayWash : g.surface }}>
      {/* Hour and half-hour lines */}
      {Array.from({ length: 24 }, (_, h) => (
        <View key={h} pointerEvents="none" style={{ position: "absolute", top: h * HOUR_HEIGHT, left: 0, right: 0, height: HOUR_HEIGHT }}>
          <View style={{ borderTopWidth: 1, borderTopColor: g.line }} />
          <View style={{ borderTopWidth: 1, borderTopColor: g.halfLine, marginTop: HOUR_HEIGHT / 2 - 1 }} />
        </View>
      ))}

      {/* Empty time: click for an hour, or press and drag out a span. */}
      <View
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, cursor: "cell" } as object}
        onStartShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          const rect = (column.current as unknown as { getBoundingClientRect?: () => { top: number } } | null)?.getBoundingClientRect?.();
          top.current = (rect?.top ?? 0) + (typeof window !== "undefined" ? window.scrollY : 0);
          const at = minutesAt(e.nativeEvent.pageY);
          setDrag({ from: at, to: at });
        }}
        onResponderMove={(e) => {
          const to = minutesAt(e.nativeEvent.pageY);
          setDrag((prev) => (prev ? { ...prev, to } : prev));
        }}
        onResponderRelease={() => {
          if (span) {
            // A plain click books an hour from the half-hour it landed in.
            if (span.end - span.start < SNAP) {
              const start = Math.min(1380, Math.floor(span.start / 30) * 30);
              onCreate(day, start, start + 60);
            } else {
              onCreate(day, span.start, span.end);
            }
          }
          setDrag(null);
        }}
        onResponderTerminate={() => setDrag(null)}
      />

      {laidOut.map(({ event, start, end, column: col, columns }) => {
        const color = calendarColor(calendarsById.get(event.calendar));
        const height = Math.max(16, ((end - start) / 60) * HOUR_HEIGHT - 2);
        const widthPct = 100 / columns;
        return (
          <Pressable
            key={`${event._id}-${event.occurrenceDate}`}
            onPress={() => onPressEvent(event)}
            style={({ hovered }: { hovered?: boolean }) => ({
              position: "absolute",
              top: (start / 60) * HOUR_HEIGHT + 1,
              height,
              left: `${col * widthPct}%`,
              width: `${widthPct}%`,
              paddingRight: 4,
              paddingLeft: 1,
              opacity: hovered ? 0.85 : 1,
            })}
          >
            <View
              style={{
                flex: 1,
                overflow: "hidden",
                borderRadius: 6,
                backgroundColor: hexToRgba(color, 0.18),
                borderLeftWidth: 3,
                borderLeftColor: color,
                paddingHorizontal: 6,
                paddingVertical: height < 22 ? 0 : 3,
              }}
            >
              <Text
                numberOfLines={height < 36 ? 1 : 2}
                style={{
                  fontSize: height < 22 ? 11 : 12,
                  fontWeight: "600",
                  color: event.task?.completed ? g.faint : g.text,
                  textDecorationLine: event.task?.completed ? "line-through" : "none",
                }}
              >
                {event.task && <Ionicons name={event.task.depth > 0 ? "diamond-outline" : "flag"} size={10} color={color} />}
                {event.task ? " " : ""}
                {event.title}
              </Text>
              {event.meal && height >= 32 && (
                <Text numberOfLines={1} style={{ fontSize: 11, color: event.meal.food ? g.body : g.faint }}>
                  {event.meal.food?.eaten && <Ionicons name="checkmark-circle" size={10} color="#16A34A" />}
                  {event.meal.food?.eaten ? " " : ""}
                  {mealLine(event)}
                </Text>
              )}
              {height >= (event.meal ? 50 : 36) && (
                <Text numberOfLines={1} style={{ fontSize: 11, color: g.subtle }}>
                  {minutesLabel(event.startMinutes)} – {minutesLabel(event.endMinutes)}
                  {event.location ? ` · ${event.location}` : ""}
                </Text>
              )}
            </View>
          </Pressable>
        );
      })}

      {/* The span being dragged out */}
      {span && span.end > span.start && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 2,
            right: 4,
            top: (span.start / 60) * HOUR_HEIGHT,
            height: ((span.end - span.start) / 60) * HOUR_HEIGHT,
            borderRadius: 6,
            backgroundColor: g.spanFill,
            borderWidth: 1,
            borderColor: g.accent,
            paddingHorizontal: 6,
            paddingTop: 2,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "600", color: g.spanText }}>
            {minutesLabel(span.start)} – {minutesLabel(span.end)}
          </Text>
        </View>
      )}

      {isToday && (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: (nowMinutes / 60) * HOUR_HEIGHT - 1, flexDirection: "row", alignItems: "center" }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: g.now, marginLeft: -5 }} />
          <View style={{ flex: 1, height: 2, backgroundColor: g.now }} />
        </View>
      )}
    </View>
  );
}

// ── Month ────────────────────────────────────────────────────────────────────

const MONTH_CHIPS = 4;

export function WebMonthGrid({
  focusDate,
  today,
  weekStartDay,
  events,
  calendarsById,
  onPressEvent,
  onPressDay,
}: {
  focusDate: string;
  today: string;
  weekStartDay: number;
  events: EventOccurrence[];
  calendarsById: Map<string, EventCalendar>;
  onPressEvent: (event: EventOccurrence) => void;
  onPressDay: (date: string) => void;
}) {
  const g = useGridColors();
  const weeks = monthGrid(focusDate, weekStartDay);
  const month = parseLocalDate(focusDate).getMonth();
  const onDay = (day: string) =>
    events
      .filter((e) => day >= e.occurrenceDate && day <= e.occurrenceEndDate)
      .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startMinutes - b.startMinutes);

  return (
    <View style={{ flex: 1, backgroundColor: g.surface }}>
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: g.line }}>
        {weeks[0].map((day) => (
          <View key={day} style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8, borderLeftWidth: 1, borderLeftColor: g.line }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: g.muted }}>{WEEKDAYS_SHORT[parseLocalDate(day).getDay()]}</Text>
          </View>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]} style={{ flex: 1, flexDirection: "row", borderBottomWidth: 1, borderBottomColor: g.line }}>
          {week.map((day) => {
            const d = parseLocalDate(day);
            const outside = d.getMonth() !== month;
            const isToday = day === today;
            const dayEvents = onDay(day);
            return (
              <Pressable
                key={day}
                onPress={() => onPressDay(day)}
                style={({ hovered }: { hovered?: boolean }) => ({
                  flex: 1,
                  overflow: "hidden",
                  padding: 4,
                  borderLeftWidth: 1,
                  borderLeftColor: g.line,
                  borderTopWidth: 3,
                  borderTopColor: isToday ? g.accent : "transparent",
                  backgroundColor: hovered ? g.hover : outside ? g.outside : isToday ? g.monthToday : g.surface,
                })}
              >
                <Text
                  style={{
                    marginBottom: 2,
                    paddingHorizontal: 4,
                    fontSize: 13,
                    fontWeight: isToday ? "700" : "500",
                    color: isToday ? g.accent : outside ? g.faint : g.text,
                  }}
                >
                  {d.getDate() === 1 ? `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}` : d.getDate()}
                </Text>
                {dayEvents.slice(0, MONTH_CHIPS).map((event) => {
                  const color = calendarColor(calendarsById.get(event.calendar));
                  return (
                    <Pressable
                      key={`${event._id}-${event.occurrenceDate}`}
                      onPress={() => onPressEvent(event)}
                      style={({ hovered }: { hovered?: boolean }) => ({
                        marginBottom: 2,
                        flexDirection: "row",
                        alignItems: "center",
                        borderRadius: 4,
                        paddingHorizontal: 5,
                        paddingVertical: 1,
                        backgroundColor: hexToRgba(color, hovered ? 0.3 : 0.16),
                        borderLeftWidth: 3,
                        borderLeftColor: color,
                      })}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          flex: 1,
                          fontSize: 11,
                          color: event.task?.completed ? g.faint : g.text,
                          textDecorationLine: event.task?.completed ? "line-through" : "none",
                        }}
                      >
                        {!event.allDay && <Text style={{ color: g.muted }}>{minutesLabel(event.startMinutes)} </Text>}
                        <Text style={{ fontWeight: "600" }}>{event.title}</Text>
                      </Text>
                    </Pressable>
                  );
                })}
                {dayEvents.length > MONTH_CHIPS && (
                  <Text style={{ paddingHorizontal: 5, fontSize: 11, fontWeight: "600", color: g.muted }}>
                    +{dayEvents.length - MONTH_CHIPS} more
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ── Mini month (the date picker in the left panel) ───────────────────────────

export function WebMiniMonth({
  focusDate,
  today,
  weekStartDay,
  // The days the main view is showing, shaded as a band.
  shownDays,
  onPick,
}: {
  focusDate: string;
  today: string;
  weekStartDay: number;
  shownDays: string[];
  onPick: (date: string) => void;
}) {
  const g = useGridColors();
  // The month on show follows the focus, but can be paged on its own.
  const [month, setMonth] = useState(focusDate.slice(0, 7));
  useEffect(() => setMonth(focusDate.slice(0, 7)), [focusDate]);
  const anchor = `${month}-01`;
  const d = parseLocalDate(anchor);
  const weeks = monthGrid(anchor, weekStartDay);
  const page = (delta: number) => {
    const next = new Date(d.getFullYear(), d.getMonth() + delta, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  };
  const shown = new Set(shownDays);

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: g.text }}>
          {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][d.getMonth()]}{" "}
          {d.getFullYear()}
        </Text>
        {([-1, 1] as const).map((delta) => (
          <Pressable
            key={delta}
            onPress={() => page(delta)}
            accessibilityLabel={delta < 0 ? "Previous month" : "Next month"}
            style={({ hovered }: { hovered?: boolean }) => ({
              width: 26,
              height: 26,
              borderRadius: 13,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: hovered ? g.iconHover : "transparent",
            })}
          >
            <Ionicons name={delta < 0 ? "chevron-up" : "chevron-down"} size={15} color={g.subtle} />
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row" }}>
        {weeks[0].map((day) => (
          <Text key={day} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: "600", color: g.faint, marginBottom: 2 }}>
            {WEEKDAYS_SHORT[parseLocalDate(day).getDay()][0]}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]} style={{ flexDirection: "row", backgroundColor: week.some((day) => shown.has(day)) ? g.band : "transparent", borderRadius: g.bandRadius }}>
          {week.map((day) => {
            const dd = parseLocalDate(day);
            const outside = dd.getMonth() !== d.getMonth();
            const isToday = day === today;
            const isFocus = day === focusDate;
            return (
              <Pressable
                key={day}
                onPress={() => onPick(day)}
                style={({ hovered }: { hovered?: boolean }) => ({
                  flex: 1,
                  height: 28,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 14,
                  backgroundColor: isToday ? g.accent : hovered ? g.pick : "transparent",
                  borderWidth: isFocus && !isToday ? 1 : 0,
                  borderColor: g.accent,
                })}
              >
                <Text style={{ fontSize: 12, fontWeight: isToday || isFocus ? "700" : "400", color: isToday ? g.onAccent : outside ? g.dim : g.body }}>
                  {dd.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
