import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, Text, View } from "react-native";

import { addDays, nowMinutes, weekOf } from "@/src/components/calendar/calendarUtils";
import { useCalendarData } from "@/src/components/calendar/useCalendarData";
import { WebTimeGrid } from "@/src/components/calendar/web/WebCalendarGrids";
import { showActions } from "@/src/components/todo/theme";
import { Button, hoverable, IconButton, WEB } from "@/src/components/web/ui";
import { createCalendarEvent, deleteCalendarEvent, SESSION_TYPES, type EventOccurrence, type KitchenKind } from "@/src/services/calendarApi";
import { useOrbitPage } from "@/src/theme/orbit";
import { weekRangeLabel } from "@/src/utils/mealPlan";
import { useWideWeb } from "@/src/utils/useWideWeb";

// Booking prep sessions or shopping trips straight onto the week: your
// calendar comes up over the plan, and a drag on a day (or a click, for an
// hour) books a block there — as many as you like before closing. What each
// session is for is worked out from the meal plan, so a time is all it needs.
// (`start`: a day in the week to open on.)
export function SessionBooker({ kind, today, start, onClose }: { kind: KitchenKind; today: string; start: string; onClose: () => void }) {
  // (Opened from an Orbit page in a desktop browser: in its look, the
  // section's colour for the main button; elsewhere, as it was.)
  const page = useOrbitPage();
  const o = useWideWeb() ? page : null;
  const [focusDate, setFocusDate] = useState(start);
  const [booked, setBooked] = useState(0);
  const data = useCalendarData(focusDate);
  // (The calendars themselves — their colours, which are showing — load on asking.)
  const { reload } = data;
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const days = weekOf(focusDate, data.weekStartDay);
  const session = SESSION_TYPES.find((s) => s.value === kind)!;
  const plural = kind === "prep" ? "prep sessions" : "shopping trips";

  async function book(date: string, startMinutes: number, endMinutes: number) {
    try {
      const kitchen = data.calendars.find((c) => c.isKitchen);
      if (!kitchen) throw new Error("The Kitchen calendar is missing.");
      await createCalendarEvent({ title: session.title, calendar: kitchen._id, allDay: false, date, endDate: date, startMinutes, endMinutes, repeat: null, location: "", description: "", remindMinutes: 15, kitchenKind: kind });
      setBooked((n) => n + 1);
      // Make sure it shows: sessions can be switched off in the calendar list.
      if (!kitchen.visible) void data.toggleCalendar(kitchen);
      else if (kitchen.hiddenKinds?.includes(kind)) void data.toggleKind(kitchen, kind);
      data.reload();
    } catch (error) {
      Alert.alert("Couldn't book it", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  // A session of this kind can be taken off again here; anything else on the
  // calendar is just there to book around.
  function press(event: EventOccurrence) {
    if (event.kitchenKind !== kind) return;
    const remove = (scope: "one" | "all") =>
      void deleteCalendarEvent(event._id, scope, event.occurrenceDate).then(
        () => {
          setBooked((n) => Math.max(0, n - 1));
          data.reload();
        },
        (error) => Alert.alert("Couldn't remove it", error instanceof Error ? error.message : "Something went wrong."),
      );
    showActions(event.title, event.repeat ? [{ label: "Remove just this one", destructive: true, onPress: () => remove("one") }] : [{ label: "Remove", destructive: true, onPress: () => remove("all") }]);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15,23,42,0.4)" }}>
        <Pressable style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, cursor: "default" } as object} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ width: "94%", maxWidth: 1180, height: "88%", overflow: "hidden", borderRadius: o ? 18 : 16, backgroundColor: o?.surface ?? WEB.card, boxShadow: "0 18px 40px rgba(15,23,42,0.25)" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: o ? 6 : 0, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: o?.border ?? WEB.border }}>
            <Ionicons name={kind === "prep" ? "restaurant-outline" : "cart-outline"} size={18} color={o?.ink ?? WEB.blue} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: o?.text ?? WEB.text }}>Book {plural}</Text>
              <Text style={{ marginTop: 1, fontSize: 12, color: o?.muted ?? WEB.muted }}>
                Drag on a day to book a block, or click for an hour. Click one to remove it.{booked > 0 ? ` · ${booked} booked` : ""}
              </Text>
            </View>
            <Pressable
              onPress={() => setFocusDate(today)}
              style={hoverable(({ hovered }) => ({ height: 32, paddingHorizontal: o ? 12 : 10, justifyContent: "center", borderRadius: o ? 10 : 8, borderWidth: 1, borderColor: o?.border ?? WEB.border, backgroundColor: o && hovered ? o.pill : "transparent" }))}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: o?.text ?? WEB.body }}>This week</Text>
            </Pressable>
            <IconButton icon="chevron-back" label="Earlier week" onPress={() => setFocusDate(addDays(focusDate, -7))} color={o?.icon} />
            <IconButton icon="chevron-forward" label="Later week" onPress={() => setFocusDate(addDays(focusDate, 7))} color={o?.icon} />
            <Text style={{ minWidth: 150, marginHorizontal: 8, fontSize: 14, fontWeight: "600", color: o?.text ?? WEB.text }}>{weekRangeLabel(days)}</Text>
            <Button label="Done" kind="primary" onPress={onClose} />
          </View>
          <WebTimeGrid days={days} today={today} nowMinutes={nowMinutes()} events={data.visibleEvents} calendarsById={data.calendarsById} onPressEvent={press} onCreate={(date, start, end) => void book(date, start, end)} onPressDay={() => {}} />
        </View>
      </View>
    </Modal>
  );
}
