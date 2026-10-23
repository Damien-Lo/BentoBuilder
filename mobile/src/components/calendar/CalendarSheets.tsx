import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Tap } from "@/src/components/ui/Tap";
import { isAssistantCalendar, KITCHEN_KINDS, type EventCalendar } from "@/src/services/calendarApi";
import { useOrbitPage, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import { hexToRgba } from "@/src/utils/mealPlan";

import { CALENDAR_COLORS, calendarColor } from "./calendarUtils";

const CALENDAR_ROW_HEIGHT = 52;

// Each of these takes the look of the page it's opened on: on an Orbit page
// (useOrbitPage) its colours, light or dark, in the section's; anywhere
// else the older look, as before.

// A calendar's round check (or a kind's square one) in the drawer: filled
// in its colour when on, ringed when off — on the drawer's own colour.
function checkStyle(on: boolean, color: string, o: OrbitColors | null) {
  return on ? { backgroundColor: color } : { borderWidth: 2, borderColor: color, backgroundColor: o?.canvas ?? "white" };
}

// The drawer's small round buttons (a calendar's gear) and its "Times" pill.
function GearButton({ label, size, onPress }: { label: string; size: number; onPress: () => void }) {
  const o = useOrbitPage();
  return (
    <Tap
      hitSlop={8}
      onPress={onPress}
      accessibilityLabel={label}
      className="h-9 w-9 items-center justify-center rounded-full active:bg-slate-100"
      pressedStyle={o ? { backgroundColor: o.pill } : {}}
    >
      <Ionicons name="settings-outline" size={size} color={o?.muted ?? "#64748B"} />
    </Tap>
  );
}

function TimesButton({ onPress }: { onPress: () => void }) {
  const o = useOrbitPage();
  return (
    <Tap
      hitSlop={8}
      onPress={onPress}
      accessibilityLabel="Meal times"
      className="mr-1 h-9 flex-row items-center rounded-full bg-blue-50 px-3 active:bg-blue-100"
      // (Orbit: a soft wash of the section's colour.)
      style={o && { backgroundColor: hexToRgba(o.fill, 0.16) }}
      pressedStyle={o ? { backgroundColor: hexToRgba(o.fill, 0.28) } : {}}
    >
      <Ionicons name="time-outline" size={16} color={o?.ink ?? "#1D4ED8"} />
      <Text className="ml-1 text-xs font-semibold text-blue-700" style={o && { color: o.ink }}>Times</Text>
    </Tap>
  );
}

// ── Bottom sheet with a list of choices ─────────────────────────────────────

export function OptionSheet<T>({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { value: T; label: string; color?: string }[];
  value: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const o = useOrbitPage();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} style={o && { backgroundColor: o.scrim }} />
      <View
        className="rounded-t-3xl bg-white pt-4"
        style={[{ paddingBottom: insets.bottom + 12, maxHeight: "70%" }, o && { backgroundColor: o.canvas, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10 }]}
      >
        {/* (Orbit: a handle, then the choices in a card.) */}
        {o && (
          <View style={{ alignItems: "center", paddingBottom: 12 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: o.track }} />
          </View>
        )}
        <Text className="px-5 pb-2 text-lg font-bold text-slate-950" style={o && { fontWeight: "800", color: o.text, paddingBottom: 12 }}>{title}</Text>
        <ScrollView>
          <View style={o && { marginHorizontal: 16, backgroundColor: o.surface, borderRadius: 18, borderWidth: 1, borderColor: o.border, overflow: "hidden" }}>
            {options.map((option, i) => (
              <Tap
                key={String(option.value)}
                onPress={() => {
                  onSelect(option.value);
                  onClose();
                }}
                className="flex-row items-center border-t border-slate-100 px-5 py-4 active:bg-slate-50"
                style={o && { backgroundColor: "transparent", paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderTopColor: o.border }}
                pressedStyle={o ? { backgroundColor: o.pill } : {}}
              >
                {option.color && <View className="mr-3 h-3 w-3 rounded-full" style={{ backgroundColor: option.color }} />}
                <Text className="flex-1 text-base text-slate-900" style={o && { color: o.text, fontWeight: option.value === value ? "600" : "400" }}>{option.label}</Text>
                {option.value === value && <Ionicons name="checkmark" size={20} color={o?.ink ?? "#2563EB"} />}
              </Tap>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Time picker ─────────────────────────────────────────────────────────────

export function TimePickerModal({
  visible,
  title,
  minutes,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  minutes: number;
  onCancel: () => void;
  onConfirm: (minutes: number) => void;
}) {
  const toDate = (m: number) => {
    const d = new Date();
    d.setHours(Math.floor(m / 60) % 24, m % 60, 0, 0);
    return d;
  };
  const [picked, setPicked] = useState(() => toDate(minutes));
  useEffect(() => {
    if (visible) setPicked(toDate(minutes));
  }, [visible, minutes]);
  const fromDate = (d: Date) => d.getHours() * 60 + d.getMinutes();
  // (On an Orbit page: its sheet, light or dark, in the section's colour —
  // as DatePickerModal.)
  const o = useOrbitPage();
  const { dark } = useOrbitTheme();

  if (Platform.OS !== "ios") {
    if (!visible) return null;
    return (
      <DateTimePicker
        value={picked}
        mode="time"
        is24Hour
        minuteInterval={5}
        onChange={(event, d) => (event.type === "set" && d ? onConfirm(fromDate(d)) : onCancel())}
      />
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable className="flex-1 bg-black/40" onPress={onCancel} style={o && { backgroundColor: o.scrim }} />
      <View className="rounded-t-3xl bg-white px-5 pb-8 pt-5" style={o && { backgroundColor: o.canvas, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
        <Text className="text-lg font-bold text-slate-950" style={o && { color: o.text }}>{title}</Text>
        <DateTimePicker
          value={picked}
          mode="time"
          display="spinner"
          is24Hour
          minuteInterval={5}
          themeVariant={o && dark ? "dark" : "light"}
          onChange={(_, d) => d && setPicked(d)}
        />
        <View className="mt-2 flex-row gap-3">
          <Pressable onPress={onCancel} className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200" style={o && { backgroundColor: o.pill }}>
            <Text className="text-sm font-semibold text-slate-600" style={o && { color: o.onPill }}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => onConfirm(fromDate(picked))}
            className="flex-1 items-center rounded-2xl bg-blue-600 py-3.5 active:bg-blue-700"
            style={o && { backgroundColor: o.ink }}
          >
            <Text className="text-sm font-semibold text-white" style={o && { color: o.onInk }}>Set time</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ── Create / edit a calendar ────────────────────────────────────────────────

export function CalendarEditSheet({
  visible,
  calendar,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  // null = a new calendar.
  calendar: EventCalendar | null;
  onClose: () => void;
  onSave: (name: string, color: string) => void;
  onDelete: (calendar: EventCalendar) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("blue");
  useEffect(() => {
    if (visible) {
      setName(calendar?.name ?? "");
      setColor(calendar?.color ?? "blue");
    }
  }, [visible, calendar]);
  const trimmed = name.trim();
  const o = useOrbitPage();
  // (Orbit: the eyebrow headings of its sheets.)
  const eyebrow = o && { fontSize: 11, fontWeight: "700" as const, letterSpacing: 1.2, color: o.faint, marginLeft: 4 };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-center bg-black/40 px-6"
        style={o && { backgroundColor: o.scrim }}
      >
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="rounded-3xl bg-white p-5" style={o && { backgroundColor: o.canvas, borderRadius: 28 }}>
          <Text className="text-lg font-bold text-slate-950" style={o && { fontSize: 20, fontWeight: "800", letterSpacing: -0.3, color: o.text }}>
            {calendar ? "Edit calendar" : "New calendar"}
          </Text>
          {o && <Text style={[eyebrow, { marginTop: 18, marginBottom: 8 }]}>NAME</Text>}
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Gym, Classes, Personal"
            placeholderTextColor={o?.faint ?? "#94A3B8"}
            autoFocus={!calendar}
            className="mt-4 rounded-2xl border border-slate-200 px-4 text-base text-slate-950"
            style={[{ height: 52 }, o && { marginTop: 0, borderRadius: 16, borderColor: o.border, backgroundColor: o.surface, color: o.text }]}
          />
          {o ? (
            <Text style={[eyebrow, { marginTop: 18, marginBottom: 10 }]}>COLOUR</Text>
          ) : (
            <Text className="mb-2 mt-4 text-sm font-semibold text-slate-700">Colour</Text>
          )}
          <View className="flex-row flex-wrap gap-2.5">
            {Object.entries(CALENDAR_COLORS).map(([key, { value }]) => (
              <Pressable
                key={key}
                onPress={() => setColor(key)}
                accessibilityState={{ selected: color === key }}
                className="h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: value }}
              >
                {color === key && <Ionicons name="checkmark" size={18} color="white" />}
              </Pressable>
            ))}
          </View>
          <View className="mt-5 flex-row gap-3" style={o && { marginTop: 22 }}>
            <Pressable
              onPress={onClose}
              className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200"
              style={o && { height: 52, justifyContent: "center", paddingVertical: 0, borderRadius: 16, backgroundColor: o.pill }}
            >
              <Text className="text-sm font-semibold text-slate-600" style={o && { fontSize: 15, color: o.onPill }}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={!trimmed}
              onPress={() => onSave(trimmed, color)}
              className={`flex-1 items-center rounded-2xl py-3.5 ${trimmed ? "bg-blue-600 active:bg-blue-700" : "bg-blue-300"}`}
              style={o && { height: 52, justifyContent: "center", paddingVertical: 0, borderRadius: 16, backgroundColor: o.ink, opacity: trimmed ? 1 : 0.4 }}
            >
              <Text className="text-sm font-semibold text-white" style={o && { fontSize: 15, color: o.onInk }}>{calendar ? "Save" : "Create"}</Text>
            </Pressable>
          </View>
          {calendar && !calendar.isDefault && !calendar.isTasks && !calendar.isMeals && !calendar.isGym && (
            <Pressable onPress={() => onDelete(calendar)} className="mt-3 items-center py-2 active:opacity-60">
              <Text className="text-sm font-semibold text-red-600" style={o && { color: o.danger }}>Delete calendar</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Side drawer: your calendars ─────────────────────────────────────────────

// Slides in from the left (Outlook's top-left button): every calendar with
// a coloured check to show/hide it, a gear to edit it, and "New calendar".
// Hold a row and drag to reorder; calendars that are switched off sit in a
// collapsed "Hidden calendars" section.
export function CalendarsDrawer({
  visible,
  calendars,
  onClose,
  onToggle,
  onToggleKind,
  onKindSettings,
  onEdit,
  onMealTimes,
  onReorder,
  onAdd,
  onClosed,
}: {
  visible: boolean;
  calendars: EventCalendar[];
  onClose: () => void;
  onToggle: (calendar: EventCalendar) => void;
  // One kind of thing in a calendar (the Kitchen's meals, prep, shopping).
  onToggleKind: (calendar: EventCalendar, kind: string) => void;
  // The regular times of one of those kinds ("meals", "prep", "shop").
  onKindSettings: (kind: string) => void;
  onEdit: (calendar: EventCalendar) => void;
  // The Kitchen calendar's meal times: when each meal usually is.
  onMealTimes: () => void;
  // Every calendar's id in its new order, after one was dragged.
  onReorder: (ids: string[]) => void;
  onAdd: () => void;
  // Once the drawer has fully closed. iOS can't present another modal
  // (e.g. the calendar editor) while this one is still dismissing — doing
  // so freezes the screen — so open follow-ups from here.
  onClosed?: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const drawerWidth = Math.min(340, width * 0.85);
  const o = useOrbitPage();
  const slide = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const [showHidden, setShowHidden] = useState(false);
  // A row is being dragged: the list mustn't scroll under it.
  const [dragging, setDragging] = useState(false);
  // Your own calendars are listed (and reordered) apart from the ones the
  // app's sections fill for you, which keep their place at the end.
  const own = calendars.filter((c) => !isAssistantCalendar(c));
  const assistants = calendars.filter(isAssistantCalendar);
  const shown = own.filter((c) => c.visible);
  const hidden = own.filter((c) => !c.visible);
  const assistantIds = assistants.map((c) => c._id);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(slide, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: true }).start(() => {
      if (!visible) {
        setMounted(false);
        // iOS reports the end via onDismiss below.
        if (Platform.OS !== "ios") onClosed?.();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, slide]);

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} onDismiss={() => onClosed?.()}>
      <Animated.View style={{ flex: 1, backgroundColor: o?.scrim ?? "rgba(0,0,0,0.4)", opacity: slide }}>
        <Pressable className="flex-1" onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: drawerWidth,
          transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-drawerWidth, 0] }) }],
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 12,
          ...(o && { backgroundColor: o.canvas, borderTopRightRadius: 28, borderBottomRightRadius: 28 }),
        }}
        className="rounded-r-3xl bg-white"
      >
        <View className="flex-row items-center px-5 pb-3">
          <View
            className="h-10 w-10 items-center justify-center rounded-xl bg-blue-50"
            style={o && { borderRadius: 20, backgroundColor: o.surface, borderWidth: 1, borderColor: o.border }}
          >
            <Ionicons name="calendar" size={o ? 19 : 20} color={o?.ink ?? "#2563EB"} />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-lg font-bold text-slate-950" style={o && { fontSize: 20, fontWeight: "800", letterSpacing: -0.3, color: o.text }}>Calendars</Text>
            <Text className="text-xs text-slate-500" style={o && { color: o.muted }}>Tap to show or hide · hold and drag to reorder</Text>
          </View>
        </View>

        <ScrollView className="flex-1 border-t border-slate-100" style={o && { borderTopColor: o.border }} scrollEnabled={!dragging}>
          <CalendarRows
            calendars={shown}
            onToggle={onToggle}
            onEdit={onEdit}
            onMealTimes={onMealTimes}
            onDragChange={setDragging}
            onReorder={(ids) => onReorder([...ids, ...hidden.map((c) => c._id), ...assistantIds])}
          />

          {/* Calendars that are switched off, tucked away. */}
          {hidden.length > 0 && (
            <>
              <Tap
                onPress={() => setShowHidden((v) => !v)}
                className="flex-row items-center border-b border-slate-100 bg-slate-50 px-5 active:bg-slate-100"
                style={[{ height: 46 }, o && { backgroundColor: o.track, borderBottomColor: o.border }]}
                pressedStyle={o ? { backgroundColor: o.pill } : {}}
              >
                <Ionicons name="eye-off-outline" size={18} color={o?.muted ?? "#64748B"} />
                <Text className="ml-3 flex-1 text-sm font-semibold text-slate-600" style={o && { color: o.muted }}>
                  Hidden calendars ({hidden.length})
                </Text>
                <Ionicons name={showHidden ? "chevron-up" : "chevron-down"} size={18} color={o?.muted ?? "#64748B"} />
              </Tap>
              {showHidden && (
                <CalendarRows
                  calendars={hidden}
                  onToggle={onToggle}
                  onEdit={onEdit}
                  onMealTimes={onMealTimes}
                  onDragChange={setDragging}
                  onReorder={(ids) => onReorder([...shown.map((c) => c._id), ...ids, ...assistantIds])}
                />
              )}
            </>
          )}
          <Tap
            onPress={onAdd}
            className="flex-row items-center px-5 py-4 active:bg-slate-50"
            style={o && { backgroundColor: "transparent" }}
            pressedStyle={o ? { backgroundColor: o.pill } : {}}
          >
            <Ionicons name="add-circle-outline" size={22} color={o?.ink ?? "#2563EB"} />
            <Text className="ml-3 text-base font-semibold text-blue-600" style={o && { color: o.ink }}>New calendar</Text>
          </Tap>

          {/* What the app's sections put on the calendar for you. (Orbit:
              an eyebrow heading on the drawer, not a band.) */}
          <View
            className="border-y border-slate-100 bg-slate-50 px-5 py-2"
            style={o && { backgroundColor: "transparent", borderTopWidth: 0, borderBottomColor: o.border, paddingTop: 16, paddingBottom: 8 }}
          >
            <Text
              className="text-xs font-bold uppercase tracking-widest text-slate-500"
              style={o && { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: o.faint }}
            >
              Assistants
            </Text>
            <Text className="mt-0.5 text-xs text-slate-400" style={o && { color: o.faint }}>Filled in for you from the Kitchen and your tasks</Text>
          </View>
          {assistants.map((calendar) => {
            const color = calendarColor(calendar);
            return (
              <View key={calendar._id} className="border-b border-slate-100" style={o && { borderBottomColor: o.border }}>
                <View className="flex-row items-center pl-5 pr-3" style={{ height: CALENDAR_ROW_HEIGHT }}>
                  <Pressable onPress={() => onToggle(calendar)} className="flex-1 flex-row items-center self-stretch active:opacity-60">
                    <View className="h-6 w-6 items-center justify-center rounded-full" style={checkStyle(calendar.visible, color, o)}>
                      {calendar.visible && <Ionicons name="checkmark" size={15} color="white" />}
                    </View>
                    <Text
                      numberOfLines={1}
                      className={`ml-3 flex-1 text-base ${calendar.visible ? "text-slate-900" : "text-slate-400"}`}
                      style={o && { color: calendar.visible ? o.text : o.faint }}
                    >
                      {calendar.name}
                    </Text>
                  </Pressable>
                  {calendar.isMeals && <TimesButton onPress={onMealTimes} />}
                  <GearButton label={`Edit ${calendar.name}`} size={19} onPress={() => onEdit(calendar)} />
                </View>
                {/* The Kitchen's kinds, each on or off by itself. */}
                {calendar.isKitchen &&
                  calendar.visible &&
                  KITCHEN_KINDS.map((kind) => {
                    const on = !(calendar.hiddenKinds ?? []).includes(kind.value);
                    return (
                      <Tap
                        key={kind.value}
                        onPress={() => onToggleKind(calendar, kind.value)}
                        className="flex-row items-center pl-14 pr-5 active:bg-slate-50"
                        style={[{ height: 40 }, o && { backgroundColor: "transparent" }]}
                        pressedStyle={o ? { backgroundColor: o.pill } : {}}
                      >
                        <View className="h-5 w-5 items-center justify-center rounded-md" style={checkStyle(on, color, o)}>
                          {on && <Ionicons name="checkmark" size={13} color="white" />}
                        </View>
                        <Text className={`ml-3 flex-1 text-sm ${on ? "text-slate-700" : "text-slate-400"}`} style={o && { color: on ? o.icon : o.faint }}>
                          {kind.label}
                        </Text>
                        {/* Its regular times: the meals', or this kind of session's. */}
                        <GearButton label={`${kind.label}: regular times`} size={17} onPress={() => onKindSettings(kind.value)} />
                      </Tap>
                    );
                  })}
              </View>
            );
          })}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// One section of the drawer's list. Rows are a fixed height, so a drag is
// just "how many rows has it moved": hold a row, drag it, and a line shows
// where it will land.
function CalendarRows({
  calendars,
  onToggle,
  onEdit,
  onMealTimes,
  onDragChange,
  onReorder,
}: {
  calendars: EventCalendar[];
  onToggle: (calendar: EventCalendar) => void;
  onEdit: (calendar: EventCalendar) => void;
  onMealTimes: () => void;
  onDragChange: (dragging: boolean) => void;
  onReorder: (ids: string[]) => void;
}) {
  // While dragging: which row, and the slot it's over.
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const slotFor = (from: number, translationY: number) =>
    Math.max(0, Math.min(calendars.length - 1, from + Math.round(translationY / CALENDAR_ROW_HEIGHT)));

  function drop(from: number, to: number) {
    setDrag(null);
    onDragChange(false);
    if (from === to) return;
    const ids = calendars.map((c) => c._id);
    ids.splice(to, 0, ...ids.splice(from, 1));
    onReorder(ids);
  }

  // The line sits above the row at `to` when moving up, below it when down.
  const lineAt = drag && drag.to !== drag.from ? (drag.to > drag.from ? drag.to + 1 : drag.to) : null;
  const o = useOrbitPage();

  return (
    <View>
      {calendars.map((calendar, index) => (
        <CalendarRow
          key={calendar._id}
          calendar={calendar}
          onToggle={() => onToggle(calendar)}
          onEdit={() => onEdit(calendar)}
          onMealTimes={onMealTimes}
          onDragStart={() => {
            setDrag({ from: index, to: index });
            onDragChange(true);
          }}
          onDragMove={(y) => setDrag({ from: index, to: slotFor(index, y) })}
          onDragEnd={(y) => drop(index, slotFor(index, y))}
          onDragCancel={() => {
            setDrag(null);
            onDragChange(false);
          }}
        />
      ))}
      {lineAt != null && (
        <View
          pointerEvents="none"
          className="absolute left-3 right-3 rounded-full bg-blue-600"
          style={[{ top: lineAt * CALENDAR_ROW_HEIGHT - 2, height: 3 }, o && { backgroundColor: o.ink }]}
        />
      )}
    </View>
  );
}

function CalendarRow({
  calendar,
  onToggle,
  onEdit,
  onMealTimes,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: {
  calendar: EventCalendar;
  onToggle: () => void;
  onEdit: () => void;
  onMealTimes: () => void;
  onDragStart: () => void;
  onDragMove: (translationY: number) => void;
  onDragEnd: (translationY: number) => void;
  onDragCancel: () => void;
}) {
  const color = calendarColor(calendar);
  const o = useOrbitPage();
  const translateY = useSharedValue(0);
  const lifted = useSharedValue(0);

  const hold = Gesture.Pan()
    .runOnJS(true)
    .activateAfterLongPress(280)
    .onStart(() => {
      lifted.value = withTiming(1, { duration: 120 });
      onDragStart();
    })
    .onUpdate((e) => {
      translateY.value = e.translationY;
      onDragMove(e.translationY);
    })
    .onEnd((e) => onDragEnd(e.translationY))
    .onFinalize((_e, success) => {
      translateY.value = 0;
      lifted.value = withTiming(0, { duration: 120 });
      if (!success) onDragCancel();
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: 1 + lifted.value * 0.02 }],
    zIndex: lifted.value > 0 ? 10 : 0,
    shadowOpacity: lifted.value * 0.2,
  }));

  return (
    <GestureDetector gesture={hold}>
      <Reanimated.View
        className="flex-row items-center border-b border-slate-100 bg-white pl-5 pr-3"
        style={[
          { height: CALENDAR_ROW_HEIGHT, shadowColor: "#000", shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
          // (Orbit: on the drawer's colour — solid, so a lifted row hides
          // what's under it.)
          o && { backgroundColor: o.canvas, borderBottomColor: o.border },
          rowStyle,
        ]}
      >
        <Pressable onPress={onToggle} className="flex-1 flex-row items-center self-stretch active:opacity-60">
          <View className="h-6 w-6 items-center justify-center rounded-full" style={checkStyle(calendar.visible, color, o)}>
            {calendar.visible && <Ionicons name="checkmark" size={15} color="white" />}
          </View>
          <Text
            numberOfLines={1}
            className={`ml-3 flex-1 text-base ${calendar.visible ? "text-slate-900" : "text-slate-400"}`}
            style={o && { color: calendar.visible ? o.text : o.faint }}
          >
            {calendar.name}
          </Text>
        </Pressable>
        {calendar.isMeals && <TimesButton onPress={onMealTimes} />}
        <GearButton label={`Edit ${calendar.name}`} size={19} onPress={onEdit} />
      </Reanimated.View>
    </GestureDetector>
  );
}

export function confirmDeleteCalendar(calendar: EventCalendar, onConfirm: () => void) {
  Alert.alert(
    `Delete "${calendar.name}"?`,
    "Every event in this calendar will be deleted too.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onConfirm },
    ],
  );
}
