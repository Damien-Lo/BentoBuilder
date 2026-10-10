import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { WebMiniMonth } from "@/src/components/calendar/web/WebCalendarGrids";
import { loadSettings } from "@/src/services/settingsService";
import { todayStr } from "@/src/utils/mealPlan";

interface DatePickerModalProps {
  visible: boolean;
  title: string;
  // "YYYY-MM-DD", or "" for no date yet (the month then opens on today).
  value: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

type Hover = { hovered?: boolean };

// The browser's version of the date picker: the native picker the phone
// uses doesn't exist here, so this is a month to click a day in. Clicking
// a day picks it; there is nothing to confirm.
export function DatePickerModal({ visible, title, value, onCancel, onConfirm }: DatePickerModalProps) {
  const [weekStartDay, setWeekStartDay] = useState(1);
  useEffect(() => {
    if (!visible) return;
    loadSettings()
      .then((settings) => setWeekStartDay(settings.weekStartDay))
      .catch(() => {});
  }, [visible]);

  if (!visible) return null;
  const today = todayStr();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15,23,42,0.4)" }}>
        <Pressable style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, cursor: "default" } as object} onPress={onCancel} accessibilityLabel="Close" />
        <View style={{ width: 300, padding: 16, borderRadius: 16, backgroundColor: "#FFFFFF", boxShadow: "0 18px 40px rgba(15,23,42,0.25)" }}>
          <Text style={{ marginBottom: 10, fontSize: 16, fontWeight: "700", color: "#0F172A" }}>{title}</Text>
          <WebMiniMonth focusDate={value || today} today={today} weekStartDay={weekStartDay} shownDays={[]} onPick={onConfirm} />
          <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
            <Pressable
              onPress={() => onConfirm(today)}
              style={({ hovered }: Hover) => ({ height: 34, paddingHorizontal: 12, justifyContent: "center", borderRadius: 9, backgroundColor: hovered ? "#EFF6FF" : "transparent" })}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#1D4ED8" }}>Today</Text>
            </Pressable>
            <Pressable
              onPress={onCancel}
              style={({ hovered }: Hover) => ({ height: 34, paddingHorizontal: 12, justifyContent: "center", borderRadius: 9, backgroundColor: hovered ? "#E2E8F0" : "#F1F5F9" })}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#475569" }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default DatePickerModal;
