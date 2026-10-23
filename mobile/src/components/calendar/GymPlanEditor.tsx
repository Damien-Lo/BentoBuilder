import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { WEEKDAYS_FULL } from "@/src/components/calendar/calendarUtils";
import { Tap } from "@/src/components/ui/Tap";
import type { GymPlan } from "@/src/services/calendarApi";
import type { GymWorkout } from "@/src/services/gymApi";
import type { OrbitColors } from "@/src/theme/orbit";

// A training time's workouts, planned across its series like a meal time's
// usual food: the same each time, one for each weekday it falls on, or in
// turn (an ordered list, each time it comes round the next). One day of it
// is changed from the event itself. Chips throughout — the same on a phone
// and in a desktop browser (the event editor of each).

const MODES: [GymPlan["mode"], string][] = [
  ["same", "Same each time"],
  ["weekday", "By weekday"],
  ["rotation", "In turn"],
];

export function GymPlanEditor({ plan, onChange, routines, days, repeats, colors: c }: { plan: GymPlan; onChange: (p: GymPlan) => void; routines: GymWorkout[]; days: number[]; repeats: boolean; colors: OrbitColors }) {
  const chip = (key: string, label: string, on: boolean, onPress: () => void, small = false) => (
    <Tap key={key} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ paddingHorizontal: small ? 10 : 12, paddingVertical: small ? 6 : 9, borderRadius: 10, backgroundColor: on ? c.ink : c.pill }} pressedStyle={{ opacity: 0.75 }}>
      <Text style={{ fontSize: small ? 12.5 : 13.5, fontWeight: "600", color: on ? c.onInk : c.onPill }}>{label}</Text>
    </Tap>
  );
  const name = (id: string) => routines.find((w) => w._id === id)?.name ?? "A workout";
  const choices = [{ _id: null as string | null, name: "Any workout" }, ...routines];

  return (
    <View style={{ marginBottom: 12, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
      <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }}>Workouts</Text>
      <Text style={{ marginTop: 2, fontSize: 12.5, lineHeight: 17, color: c.muted }}>What&apos;s planned each time, like a meal&apos;s usual food — change a single day from the event itself. Start it on the day, and it&apos;s marked done when you finish.</Text>

      <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
        {MODES.map(([mode, label]) => (
          <Tap key={mode} onPress={() => onChange({ ...plan, mode })} accessibilityRole="radio" accessibilityState={{ selected: plan.mode === mode }} style={{ flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10, backgroundColor: plan.mode === mode ? c.ink : c.pill }} pressedStyle={{ opacity: 0.75 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: plan.mode === mode ? c.onInk : c.onPill }}>{label}</Text>
          </Tap>
        ))}
      </View>

      {/* The same each time */}
      {plan.mode === "same" && (
        <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {choices.map((w) => chip(w._id ?? "any", w.name, (plan.workouts[0] ?? null) === w._id, () => onChange({ ...plan, workouts: w._id ? [w._id] : [] })))}
        </View>
      )}

      {/* One for each weekday it falls on */}
      {plan.mode === "weekday" && (
        <View style={{ marginTop: 6 }}>
          {days.map((day) => (
            <View key={day} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border, marginTop: 4 }}>
              <Text style={{ marginBottom: 6, fontSize: 13, fontWeight: "700", color: c.muted }}>{WEEKDAYS_FULL[day]}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {choices.map((w) => chip(`${day}-${w._id ?? "any"}`, w.name, (plan.byWeekday[String(day)] ?? null) === w._id, () => onChange({ ...plan, byWeekday: { ...plan.byWeekday, [String(day)]: w._id } }), true))}
              </View>
            </View>
          ))}
          {!repeats && <Text style={{ marginTop: 4, fontSize: 12, color: c.faint }}>Set it to repeat to plan more than one day.</Text>}
        </View>
      )}

      {/* In turn */}
      {plan.mode === "rotation" && (
        <View style={{ marginTop: 8 }}>
          {plan.workouts.map((id, i) => (
            <View key={`${id}-${i}`} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 9, borderTopWidth: 1, borderTopColor: c.border }}>
              <Text style={{ width: 26, fontSize: 13.5, fontWeight: "700", color: c.muted }}>{i + 1}</Text>
              <Text style={{ flex: 1, fontSize: 14.5, fontWeight: "600", color: c.text }}>{name(id)}</Text>
              <Tap onPress={() => onChange({ ...plan, workouts: plan.workouts.filter((_, j) => j !== i) })} accessibilityLabel={`Remove ${name(id)}`} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={c.faint} />
              </Tap>
            </View>
          ))}
          <Text style={{ marginTop: 10, marginBottom: 6, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, color: c.faint }}>ADD NEXT</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{routines.map((w) => chip(`add-${w._id}`, `+ ${w.name}`, false, () => onChange({ ...plan, workouts: [...plan.workouts, w._id] }), true))}</View>
          <Text style={{ marginTop: 8, fontSize: 12, color: c.faint }}>Each time it comes round, the next — in this order, then back to the first.</Text>
        </View>
      )}

      {routines.length === 0 && <Text style={{ marginTop: 8, fontSize: 12, color: c.faint }}>Build a routine in Gym → Workouts to plan it here.</Text>}
    </View>
  );
}

// The weekdays a series falls on (Monday first), for planning by weekday.
export function planDays(frequency: string | null, weeklyDays: number[], startWeekday: number) {
  const days = frequency === "daily" ? [0, 1, 2, 3, 4, 5, 6] : frequency === "weekdays" ? [1, 2, 3, 4, 5] : frequency === "weekly" ? weeklyDays : [startWeekday];
  return [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
}

// What's saved: only what the mode uses.
export const planToSave = (plan: GymPlan): GymPlan => ({ mode: plan.mode, workouts: plan.mode === "weekday" ? [] : plan.workouts, byWeekday: plan.mode === "weekday" ? plan.byWeekday : {} });
