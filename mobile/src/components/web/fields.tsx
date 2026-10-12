import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { minutesLabel, MONTHS_SHORT, parseTime, WEEKDAYS_SHORT } from "@/src/components/calendar/calendarUtils";
import { WebMiniMonth } from "@/src/components/calendar/web/WebCalendarGrids";
import { parseLocalDate, todayStr } from "@/src/utils/mealPlan";

import { getWebScale } from "./scale";

// Small form controls for the desktop pages: things that open a panel just
// beneath themselves (a date to pick, a short list to choose from).

type Hover = { hovered?: boolean };

// "Mon 12 Oct", with the year when it isn't this one.
export function compactDate(date: string): string {
  const d = parseLocalDate(date);
  const year = d.getFullYear() === new Date().getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${year}`;
}

// A panel that opens under whatever was clicked — or above it, when there
// isn't room below — and closes on a click anywhere else. It's drawn in a
// layer of its own, above the page, so it's never clipped by a scrolling
// area or covered by the next row.
export function Anchored({
  renderTrigger,
  children,
  width,
  align = "left",
}: {
  renderTrigger: (open: () => void) => ReactNode;
  // Given a way to close the panel.
  children: (close: () => void) => ReactNode;
  width: number;
  align?: "left" | "right";
}) {
  const anchor = useRef<View>(null);
  // Where the panel goes: `y` under the trigger, `above` the trigger's top.
  const [at, setAt] = useState<{ x: number; y: number; above: number } | null>(null);
  // Its height, once drawn: it's placed (and shown) only after that.
  const [height, setHeight] = useState<number | null>(null);

  function open() {
    const rect = (anchor.current as unknown as { getBoundingClientRect?: () => DOMRect } | null)?.getBoundingClientRect?.();
    if (!rect) return;
    // (Screen positions, turned back into layout positions — see scale.ts.)
    const scale = getWebScale();
    const x = (align === "right" ? rect.right : rect.left) / scale - (align === "right" ? width : 0);
    setHeight(null);
    setAt({ x: Math.max(8, Math.min(x, window.innerWidth / scale - width - 8)), y: rect.bottom / scale + 4, above: rect.top / scale - 4 });
  }
  const close = () => setAt(null);
  // Under the trigger if it fits, else above it, else against the bottom.
  const bottom = typeof window === "undefined" ? 0 : window.innerHeight / getWebScale() - 8;
  const top = !at || height === null || at.y + height <= bottom ? at?.y ?? 0 : Math.max(8, at.above - height >= 8 ? at.above - height : bottom - height);

  return (
    <>
      <View ref={anchor}>{renderTrigger(open)}</View>
      {at && (
        <Modal visible transparent animationType="none" onRequestClose={close}>
          <Pressable style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, cursor: "default" } as object} onPress={close} accessibilityLabel="Close" />
          <View
            onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
            style={{
              position: "absolute",
              left: at.x,
              top,
              opacity: height === null ? 0 : 1,
              width,
              padding: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              backgroundColor: "#FFFFFF",
              boxShadow: "0 12px 28px rgba(15,23,42,0.18)",
            }}
          >
            {children(close)}
          </View>
        </Modal>
      )}
    </>
  );
}

// A date shown as text that opens a month to pick from. `bare` draws it as
// plain text (for use inside a table row) rather than a bordered field.
export function DateField({
  value,
  onChange,
  placeholder = "Set date",
  clearable = true,
  weekStartDay = 1,
  bare,
  danger,
  align,
}: {
  value: string | null | undefined;
  onChange: (date: string | null) => void;
  placeholder?: string;
  clearable?: boolean;
  weekStartDay?: number;
  bare?: boolean;
  // Shown in red (an overdue date).
  danger?: boolean;
  align?: "left" | "right";
}) {
  return (
    <Anchored
      width={264}
      align={align}
      renderTrigger={(open) => (
        <Pressable
          onPress={open}
          style={({ hovered }: Hover) =>
            bare
              ? { height: 28, paddingHorizontal: 6, justifyContent: "center", borderRadius: 7, backgroundColor: hovered ? "#E2E8F0" : "transparent" }
              : {
                  flexDirection: "row",
                  alignItems: "center",
                  height: 34,
                  paddingHorizontal: 10,
                  borderRadius: 9,
                  borderWidth: 1,
                  borderColor: hovered ? "#94A3B8" : "#CBD5E1",
                  backgroundColor: "#FFFFFF",
                }
          }
        >
          {!bare && <Ionicons name="calendar-outline" size={14} color="#64748B" style={{ marginRight: 6 }} />}
          <Text style={{ fontSize: 13, fontWeight: value ? "600" : "400", color: danger ? "#DC2626" : value ? "#0F172A" : "#94A3B8" }}>
            {value ? compactDate(value) : placeholder}
          </Text>
        </Pressable>
      )}
    >
      {(close) => (
        <>
          <WebMiniMonth
            focusDate={value ?? todayStr()}
            today={todayStr()}
            weekStartDay={weekStartDay}
            shownDays={[]}
            onPick={(date) => {
              onChange(date);
              close();
            }}
          />
          {clearable && !!value && (
            <Pressable
              onPress={() => {
                onChange(null);
                close();
              }}
              style={({ hovered }: Hover) => ({ marginTop: 8, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: hovered ? "#E2E8F0" : "#F1F5F9" })}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#334155" }}>Clear date</Text>
            </Pressable>
          )}
        </>
      )}
    </Anchored>
  );
}

// A short list to choose one thing from, opened from a pill or a field.
export function Choice<T extends string>({
  value,
  options,
  onChange,
  renderTrigger,
  width = 190,
  align,
}: {
  value: T;
  options: { value: T; label: string; color?: string }[];
  onChange: (value: T) => void;
  renderTrigger: (open: () => void) => ReactNode;
  width?: number;
  align?: "left" | "right";
}) {
  return (
    <Anchored width={width} align={align} renderTrigger={renderTrigger}>
      {(close) =>
        options.map((option) => {
          const on = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                onChange(option.value);
                close();
              }}
              style={({ hovered }: Hover) => ({
                flexDirection: "row",
                alignItems: "center",
                height: 32,
                paddingHorizontal: 8,
                borderRadius: 8,
                backgroundColor: on ? "#EFF6FF" : hovered ? "#F1F5F9" : "transparent",
              })}
            >
              {!!option.color && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: option.color, marginRight: 8 }} />}
              <Text style={{ flex: 1, fontSize: 13, fontWeight: on ? "700" : "400", color: on ? "#1D4ED8" : "#0F172A" }}>{option.label}</Text>
              {on && <Ionicons name="checkmark" size={14} color="#1D4ED8" />}
            </Pressable>
          );
        })
      }
    </Anchored>
  );
}

// A time of day: typed straight into the field ("7", "730", "7:30pm" — Enter
// or leaving the field sets it), or picked from the list that opens beneath
// it. The list is part of the page, not a layer over it, so the field keeps
// the keyboard while it's open: whatever holds this needs `overflow`
// visible, and to sit above what follows it (`onOpenChange` says when).
export function TimeField({
  minutes,
  onChange,
  options,
  after,
  width = 104,
  listWidth,
  label = "Time",
  onOpenChange,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
  // What the list offers; quarter hours through the day, left out.
  options?: { value: number; label: string }[];
  // For an end time: only times after this are taken.
  after?: number;
  width?: number;
  listWidth?: number;
  label?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  // What's being typed; null while the field just shows the time.
  const [text, setText] = useState<string | null>(null);
  const input = useRef<TextInput>(null);
  const list = useRef<ScrollView>(null);
  const rows = options ?? Array.from({ length: 96 }, (_, i) => i * 15).filter((m) => after == null || m > after).map((m) => ({ value: m, label: minutesLabel(m) }));
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  // The row to show: the time being typed, as far as it reads as one (the
  // nearest in the list, when it falls between two) — else the time set.
  const typed = text == null ? null : parseTime(text);
  const sought = typed == null ? minutes % 1440 : (after != null && typed === 0 ? 1440 : typed) % 1440;
  const nearest = rows.reduce((best, row, index) => (Math.abs(row.value - sought) < Math.abs(rows[best].value - sought) ? index : best), 0);
  // The list opens on it, and follows it as you type.
  useEffect(() => {
    if (open && rows.length) list.current?.scrollTo({ y: Math.max(0, nearest * 32 - 96), animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, nearest]);

  function commit() {
    const typed = text == null ? null : parseTime(text);
    setText(null);
    if (typed == null || typed === minutes) return;
    // (An end at "0:00" is the day's end.)
    const value = after != null && typed === 0 ? 1440 : typed;
    if (after == null ? value < 1440 : value > after) onChange(value);
  }

  return (
    <View style={{ zIndex: open ? 50 : undefined }}>
      <View style={{ flexDirection: "row", alignItems: "center", width, height: 36, borderRadius: 10, borderWidth: 1, borderColor: open ? "#2563EB" : "#CBD5E1", backgroundColor: "#FFFFFF" }}>
        <TextInput
          ref={input}
          value={text ?? minutesLabel(minutes)}
          onChangeText={setText}
          onFocus={() => {
            setText(minutesLabel(minutes));
            setOpen(true);
          }}
          onBlur={() => {
            commit();
            setOpen(false);
          }}
          onSubmitEditing={() => input.current?.blur()}
          selectTextOnFocus
          accessibilityLabel={label}
          style={{ flex: 1, minWidth: 0, height: 34, paddingLeft: 12, fontSize: 14, fontWeight: "600", color: "#0F172A", outlineStyle: "none" } as object}
        />
        <Pressable onPress={() => (open ? input.current?.blur() : input.current?.focus())} accessibilityLabel={`${label}: choose from a list`} style={{ width: 28, height: 34, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="chevron-down" size={14} color="#64748B" />
        </Pressable>
      </View>
      {open && (
        <View
          // (A press in the list mustn't take the keyboard from the field.)
          {...({ onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault() } as object)}
          style={{ position: "absolute", top: 40, left: 0, width: listWidth ?? Math.max(width, 120), padding: 6, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", boxShadow: "0 12px 28px rgba(15,23,42,0.18)" }}
        >
          <ScrollView ref={list} style={{ maxHeight: 264 }}>
            {rows.map((row, index) => {
              const on = index === nearest;
              return (
                <Pressable
                  key={row.value}
                  onPress={() => {
                    setText(null);
                    onChange(after != null && row.value === 0 ? 1440 : row.value);
                    input.current?.blur();
                  }}
                  style={({ hovered }: Hover) => ({ height: 32, paddingHorizontal: 10, justifyContent: "center", borderRadius: 8, backgroundColor: on ? "#EFF6FF" : hovered ? "#F1F5F9" : "transparent" })}
                >
                  <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: on ? "700" : "400", color: on ? "#1D4ED8" : "#0F172A" }}>
                    {row.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
