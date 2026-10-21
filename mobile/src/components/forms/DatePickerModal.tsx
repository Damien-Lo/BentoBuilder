import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";

import { useOrbitPage, useOrbitTheme } from "@/src/theme/orbit";
import { dateToInputString, parseDateOnly } from "@/src/utils/date";

interface DatePickerModalProps {
  visible: boolean;
  title: string;
  // "YYYY-MM-DD", or "" for no date yet (the picker then starts on today).
  value: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

// Picks a calendar day with the native picker, for date-only fields stored
// as "YYYY-MM-DD". iOS: an inline calendar in a bottom sheet with Cancel /
// Set date. Android: the system date dialog on its own (it has its own
// buttons), so nothing is wrapped around it.
export function DatePickerModal({ visible, title, value, onCancel, onConfirm }: DatePickerModalProps) {
  const [pickerDate, setPickerDate] = useState(() => parseDateOnly(value) ?? new Date());
  // (On an Orbit page: its sheet, light or dark, in the section's colour.)
  const o = useOrbitPage();
  const { dark } = useOrbitTheme();

  useEffect(() => {
    if (visible) setPickerDate(parseDateOnly(value) ?? new Date());
  }, [visible, value]);

  if (Platform.OS !== "ios") {
    if (!visible) return null;
    return (
      <DateTimePicker
        value={pickerDate}
        mode="date"
        onChange={(event, date) => {
          if (event.type === "set" && date) onConfirm(dateToInputString(date));
          else onCancel();
        }}
      />
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable className="flex-1 bg-black/40" onPress={onCancel} style={o && { backgroundColor: o.scrim }} />
      <View className="rounded-t-3xl bg-white px-5 pb-8 pt-5" style={o && { backgroundColor: o.canvas, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
        <Text className="text-lg font-bold text-slate-950" style={o && { color: o.text }}>{title}</Text>
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display="inline"
          themeVariant={o && dark ? "dark" : "light"}
          accentColor={o?.ink ?? "#2563EB"}
          onChange={(_, date) => date && setPickerDate(date)}
        />
        <View className="mt-2 flex-row gap-3">
          <Pressable onPress={onCancel} className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200" style={o && { backgroundColor: o.pill }}>
            <Text className="text-sm font-semibold text-slate-600" style={o && { color: o.onPill }}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => onConfirm(dateToInputString(pickerDate))}
            className="flex-1 items-center rounded-2xl bg-blue-600 py-3.5 active:bg-blue-700"
            style={o && { backgroundColor: o.ink }}
          >
            <Text className="text-sm font-semibold text-white" style={o && { color: o.onInk }}>Set date</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default DatePickerModal;
