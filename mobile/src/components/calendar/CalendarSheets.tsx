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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { EventCalendar } from "@/src/services/calendarApi";

import { CALENDAR_COLORS, calendarColor } from "./calendarUtils";

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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} />
      <View className="rounded-t-3xl bg-white pt-4" style={{ paddingBottom: insets.bottom + 12, maxHeight: "70%" }}>
        <Text className="px-5 pb-2 text-lg font-bold text-slate-950">{title}</Text>
        <ScrollView>
          {options.map((option) => (
            <Pressable
              key={String(option.value)}
              onPress={() => {
                onSelect(option.value);
                onClose();
              }}
              className="flex-row items-center border-t border-slate-100 px-5 py-4 active:bg-slate-50"
            >
              {option.color && <View className="mr-3 h-3 w-3 rounded-full" style={{ backgroundColor: option.color }} />}
              <Text className="flex-1 text-base text-slate-900">{option.label}</Text>
              {option.value === value && <Ionicons name="checkmark" size={20} color="#2563EB" />}
            </Pressable>
          ))}
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
      <Pressable className="flex-1 bg-black/40" onPress={onCancel} />
      <View className="rounded-t-3xl bg-white px-5 pb-8 pt-5">
        <Text className="text-lg font-bold text-slate-950">{title}</Text>
        <DateTimePicker
          value={picked}
          mode="time"
          display="spinner"
          is24Hour
          minuteInterval={5}
          themeVariant="light"
          onChange={(_, d) => d && setPicked(d)}
        />
        <View className="mt-2 flex-row gap-3">
          <Pressable onPress={onCancel} className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200">
            <Text className="text-sm font-semibold text-slate-600">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => onConfirm(fromDate(picked))}
            className="flex-1 items-center rounded-2xl bg-blue-600 py-3.5 active:bg-blue-700"
          >
            <Text className="text-sm font-semibold text-white">Set time</Text>
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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-center bg-black/40 px-6"
      >
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="rounded-3xl bg-white p-5">
          <Text className="text-lg font-bold text-slate-950">{calendar ? "Edit calendar" : "New calendar"}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Gym, Classes, Personal"
            placeholderTextColor="#94A3B8"
            autoFocus={!calendar}
            className="mt-4 rounded-2xl border border-slate-200 px-4 text-base text-slate-950"
            style={{ height: 52 }}
          />
          <Text className="mb-2 mt-4 text-sm font-semibold text-slate-700">Colour</Text>
          <View className="flex-row flex-wrap gap-2.5">
            {Object.entries(CALENDAR_COLORS).map(([key, { value }]) => (
              <Pressable
                key={key}
                onPress={() => setColor(key)}
                className="h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: value }}
              >
                {color === key && <Ionicons name="checkmark" size={18} color="white" />}
              </Pressable>
            ))}
          </View>
          <View className="mt-5 flex-row gap-3">
            <Pressable onPress={onClose} className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200">
              <Text className="text-sm font-semibold text-slate-600">Cancel</Text>
            </Pressable>
            <Pressable
              disabled={!trimmed}
              onPress={() => onSave(trimmed, color)}
              className={`flex-1 items-center rounded-2xl py-3.5 ${trimmed ? "bg-blue-600 active:bg-blue-700" : "bg-blue-300"}`}
            >
              <Text className="text-sm font-semibold text-white">{calendar ? "Save" : "Create"}</Text>
            </Pressable>
          </View>
          {calendar && !calendar.isDefault && (
            <Pressable onPress={() => onDelete(calendar)} className="mt-3 items-center py-2 active:opacity-60">
              <Text className="text-sm font-semibold text-red-600">Delete calendar</Text>
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
export function CalendarsDrawer({
  visible,
  calendars,
  onClose,
  onToggle,
  onEdit,
  onAdd,
}: {
  visible: boolean;
  calendars: EventCalendar[];
  onClose: () => void;
  onToggle: (calendar: EventCalendar) => void;
  onEdit: (calendar: EventCalendar) => void;
  onAdd: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const drawerWidth = Math.min(340, width * 0.85);
  const slide = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(slide, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: true }).start(() => {
      if (!visible) setMounted(false);
    });
  }, [visible, slide]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", opacity: slide }}>
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
        }}
        className="rounded-r-3xl bg-white"
      >
        <View className="flex-row items-center px-5 pb-3">
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
            <Ionicons name="calendar" size={20} color="#2563EB" />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-lg font-bold text-slate-950">Calendars</Text>
            <Text className="text-xs text-slate-500">Tap to show or hide</Text>
          </View>
        </View>

        <ScrollView className="flex-1 border-t border-slate-100">
          {calendars.map((calendar) => {
            const color = calendarColor(calendar);
            return (
              <View key={calendar._id} className="flex-row items-center border-b border-slate-100 pl-5 pr-3">
                <Pressable onPress={() => onToggle(calendar)} className="flex-1 flex-row items-center py-3.5 active:opacity-60">
                  <View
                    className="h-6 w-6 items-center justify-center rounded-full"
                    style={
                      calendar.visible
                        ? { backgroundColor: color }
                        : { borderWidth: 2, borderColor: color, backgroundColor: "white" }
                    }
                  >
                    {calendar.visible && <Ionicons name="checkmark" size={15} color="white" />}
                  </View>
                  <Text
                    numberOfLines={1}
                    className={`ml-3 flex-1 text-base ${calendar.visible ? "text-slate-900" : "text-slate-400"}`}
                  >
                    {calendar.name}
                  </Text>
                </Pressable>
                <Pressable
                  hitSlop={8}
                  onPress={() => onEdit(calendar)}
                  className="h-9 w-9 items-center justify-center rounded-full active:bg-slate-100"
                >
                  <Ionicons name="settings-outline" size={19} color="#64748B" />
                </Pressable>
              </View>
            );
          })}
          <Pressable onPress={onAdd} className="flex-row items-center px-5 py-4 active:bg-slate-50">
            <Ionicons name="add-circle-outline" size={22} color="#2563EB" />
            <Text className="ml-3 text-base font-semibold text-blue-600">New calendar</Text>
          </Pressable>
        </ScrollView>
      </Animated.View>
    </Modal>
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
