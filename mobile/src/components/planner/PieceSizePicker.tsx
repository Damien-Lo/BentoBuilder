import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";

import { shortDateLabel } from "@/src/components/calendar/calendarUtils";
import type { PieceChoice } from "@/src/components/planner/usePlanNeeds";
import { Tap } from "@/src/components/ui/Tap";
import type { PieceSizeInput } from "@/src/services/mealPlanApi";
import { useOrbitPage, useOrbitTheme } from "@/src/theme/orbit";
import type { AmountSlot, PieceSlot } from "@/src/utils/pieceSizing";

// "How big?" for a planned meal that takes a whole piece — a steak, a
// fillet, or a bag made ahead from one: each piece of that kind in the
// pantry (with what the meal comes to with it), the planner's choice, or
// Other — a weight typed in (the piece not bought yet, or one like a piece
// in the pantry without using that one: its weight's a tap away). Always
// asked, so a meal's size is never silently assumed: with nothing in
// stock, the planner's choice says the size it's counted at.
//
// `picked` (pantry entries kept for the meal) and `sizes` (sizes typed in)
// are the answer so far; `onChange` gives the next one. Used when adding a
// planned recipe, from a planned meal's sheet, and on the desktop week plan.
export function PieceSizePicker({
  slots,
  choices,
  picked,
  sizes,
  caloriesFor,
  onChange,
}: {
  slots: PieceSlot[];
  choices: PieceChoice[];
  picked: string[];
  sizes: PieceSizeInput[];
  // What the meal comes to with these sizes typed in.
  caloriesFor: (sizes: PieceSizeInput[]) => number;
  onChange: (picked: string[], sizes: PieceSizeInput[]) => void;
}) {
  // (In the page's colours on an Orbit page; Orbit's light ones elsewhere.)
  const page = useOrbitPage();
  const { colors } = useOrbitTheme();
  const c = page ?? colors;
  // What's typed in each piece's Other field, by its ingredient.
  const [typing, setTyping] = useState<Record<string, string>>(() => Object.fromEntries(sizes.map((s) => [s.ingredient, String(s.amount)])));

  // (The same look as confirming what was used — ResolveIngredientSourcesModal:
  // a card for each piece, every choice its own bordered option inside it,
  // the picked one ringed and ticked in the section's colour.)
  const option = (on: boolean) => ({ marginTop: 8, flexDirection: "row" as const, alignItems: "center" as const, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: c.surface, borderWidth: on ? 1.5 : 1, borderColor: on ? c.ink : c.border });
  const mark = (on: boolean) =>
    on ? (
      <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: c.ink }}>
        <Ionicons name="checkmark" size={14} color={c.onInk} />
      </View>
    ) : (
      <Ionicons name="ellipse-outline" size={22} color={c.faint} />
    );
  const kcal = (value: number | null, on: boolean) => <Text style={{ marginRight: 10, fontSize: 13, fontWeight: "600", color: on ? c.text : c.muted }}>{value == null ? "—" : `${value} kcal`}</Text>;

  return (
    <View style={{ gap: 14 }}>
      {slots.map((slot) => {
        const options = choices.filter((o) => o.group === slot.group);
        const ids = options.map((o) => o.pantryItemId);
        const typed = sizes.find((s) => s.ingredient === slot.ingredientId);
        const kept = picked.find((id) => ids.includes(id));
        const others = picked.filter((id) => !ids.includes(id));
        const withoutThis = sizes.filter((s) => s.ingredient !== slot.ingredientId);
        const text = typing[slot.ingredientId] ?? "";
        const amount = Number(text);
        const valid = Number.isFinite(amount) && amount > 0;
        const setSize = (value: string) => {
          setTyping((prev) => ({ ...prev, [slot.ingredientId]: value }));
          const n = Number(value);
          if (Number.isFinite(n) && n > 0) onChange(others, [...withoutThis, { ingredient: slot.ingredientId, amount: n, unit: slot.unit }]);
        };
        const plannerPick = options.find((o) => o.current);
        const planner = !kept && !typed;
        // (Weights in the pantry, to copy without using that piece.)
        const weights = [...new Set(options.filter((o) => o.weight && o.weight.unit === slot.unit).map((o) => o.weight!.amount))].sort((a, b) => a - b);

        return (
          <View key={`${slot.group}-${slot.ingredientId}`} style={{ padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: "600", color: c.text }}>
                {slot.name}
              </Text>
              {slot.max > 0 && (
                <Text style={{ marginLeft: 8, fontSize: 12, color: c.faint }}>
                  {slot.min}–{slot.max} {slot.unit}
                </Text>
              )}
            </View>

            {/* The pieces in the pantry */}
            {options.map((o) => {
              const on = kept === o.pantryItemId && !typed;
              return (
                <Tap key={o.pantryItemId} onPress={() => onChange([...others, o.pantryItemId], withoutThis)} style={option(on)} pressedStyle={{ opacity: 0.8 }} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: c.text }}>
                      {o.label}
                    </Text>
                    <Text style={{ marginTop: 1, fontSize: 12, color: c.muted }}>{o.elsewhere ? `In your pantry · going to ${shortDateLabel(o.elsewhere.date)} ${o.elsewhere.slot}` : "In your pantry"}</Text>
                  </View>
                  {kcal(o.calories, on)}
                  {mark(on)}
                </Tap>
              );
            })}

            {/* The planner's choice */}
            <Tap onPress={() => onChange(others, withoutThis)} style={option(planner)} pressedStyle={{ opacity: 0.8 }} accessibilityRole="radio" accessibilityState={{ selected: planner }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }}>Let the planner choose</Text>
                <Text style={{ marginTop: 1, fontSize: 12, color: c.muted }}>
                  {plannerPick ? `Now: ${plannerPick.label}` : options.length ? "The best fit for the day, then the soonest to go" : `Counts as ${slot.assumed} ${slot.unit} · none in pantry`}
                </Text>
              </View>
              {kcal(plannerPick ? plannerPick.calories : caloriesFor(withoutThis), planner)}
              {mark(planner)}
            </Tap>

            {/* Other: a weight typed in */}
            <View style={option(!!typed)}>
              <Tap onPress={() => valid && setSize(text)} style={{ flex: 1 }} accessibilityRole="radio" accessibilityState={{ selected: !!typed }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }}>Other weight</Text>
                <Text style={{ marginTop: 1, fontSize: 12, color: c.muted }}>{weights.length ? "Type one, or copy a size from your pantry" : "Not in your pantry yet"}</Text>
              </Tap>
              <View style={{ width: 92, height: 38, marginRight: 10, flexDirection: "row", alignItems: "center", paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: typed ? c.ink : c.border, backgroundColor: c.canvas }}>
                <TextInput
                  value={text}
                  onChangeText={(v) => setSize(v.replace(/[^0-9.]/g, ""))}
                  keyboardType="decimal-pad"
                  placeholder={String(slot.assumed)}
                  placeholderTextColor={c.faint}
                  accessibilityLabel={`${slot.name} weight`}
                  style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 15, color: c.text }}
                />
                <Text style={{ marginLeft: 3, fontSize: 13, color: c.muted }}>{slot.unit}</Text>
              </View>
              {mark(!!typed)}
            </View>
            {(typed || valid) && (
              <Text style={{ marginTop: 6, marginLeft: 4, fontSize: 12, color: c.muted }}>
                At {valid ? amount : typed?.amount} {slot.unit}: {caloriesFor([...withoutThis, { ingredient: slot.ingredientId, amount: valid ? amount : typed!.amount, unit: slot.unit }])} kcal
              </Text>
            )}
            {weights.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {weights.map((w) => (
                  <Tap key={w} onPress={() => setSize(String(w))} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: c.onPill }}>
                      Same as {w} {slot.unit}
                    </Text>
                  </Tap>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// "How much?" for a planned meal's lines that ask (the potatoes for fries):
// the recipe's amount, or another typed in — kept with the meal like a
// piece's size, and filled in when it's confirmed as eaten. The same look
// as How big?. (`sizes` holds every size and amount the meal has; only its
// own lines are changed.)
export function AmountPicker({
  slots,
  sizes,
  caloriesFor,
  onChange,
}: {
  slots: AmountSlot[];
  sizes: PieceSizeInput[];
  caloriesFor: (sizes: PieceSizeInput[]) => number;
  onChange: (sizes: PieceSizeInput[]) => void;
}) {
  const page = useOrbitPage();
  const { colors } = useOrbitTheme();
  const c = page ?? colors;
  const [typing, setTyping] = useState<Record<string, string>>(() => Object.fromEntries(sizes.map((s) => [s.ingredient, String(s.amount)])));
  const option = (on: boolean) => ({ marginTop: 8, flexDirection: "row" as const, alignItems: "center" as const, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: c.surface, borderWidth: on ? 1.5 : 1, borderColor: on ? c.ink : c.border });
  const mark = (on: boolean) =>
    on ? (
      <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: c.ink }}>
        <Ionicons name="checkmark" size={14} color={c.onInk} />
      </View>
    ) : (
      <Ionicons name="ellipse-outline" size={22} color={c.faint} />
    );

  return (
    <View style={{ gap: 14 }}>
      {slots.map((slot) => {
        const typed = sizes.find((s) => s.ingredient === slot.ingredientId);
        const withoutThis = sizes.filter((s) => s.ingredient !== slot.ingredientId);
        const text = typing[slot.ingredientId] ?? "";
        const amount = Number(text);
        const valid = Number.isFinite(amount) && amount > 0;
        const setAmount = (value: string) => {
          setTyping((prev) => ({ ...prev, [slot.ingredientId]: value }));
          const n = Number(value);
          if (Number.isFinite(n) && n > 0) onChange([...withoutThis, { ingredient: slot.ingredientId, amount: n, unit: slot.unit }]);
        };
        return (
          <View key={slot.ingredientId} style={{ padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: "600", color: c.text }}>
                {slot.name}
              </Text>
              <Text style={{ marginLeft: 8, fontSize: 12, color: c.faint }}>
                Recipe: {slot.amount} {slot.unit}
              </Text>
            </View>

            {/* The recipe's amount */}
            <Tap onPress={() => onChange(withoutThis)} style={option(!typed)} pressedStyle={{ opacity: 0.8 }} accessibilityRole="radio" accessibilityState={{ selected: !typed }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }}>The recipe&apos;s amount</Text>
                <Text style={{ marginTop: 1, fontSize: 12, color: c.muted }}>
                  {slot.amount} {slot.unit}
                </Text>
              </View>
              <Text style={{ marginRight: 10, fontSize: 13, fontWeight: "600", color: !typed ? c.text : c.muted }}>{caloriesFor(withoutThis)} kcal</Text>
              {mark(!typed)}
            </Tap>

            {/* Another amount, typed in */}
            <View style={option(!!typed)}>
              <Tap onPress={() => valid && setAmount(text)} style={{ flex: 1 }} accessibilityRole="radio" accessibilityState={{ selected: !!typed }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }}>Other amount</Text>
                <Text style={{ marginTop: 1, fontSize: 12, color: c.muted }}>How much you&apos;ll have</Text>
              </Tap>
              <View style={{ width: 92, height: 38, marginRight: 10, flexDirection: "row", alignItems: "center", paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: typed ? c.ink : c.border, backgroundColor: c.canvas }}>
                <TextInput
                  value={text}
                  onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ""))}
                  keyboardType="decimal-pad"
                  placeholder={String(slot.amount)}
                  placeholderTextColor={c.faint}
                  accessibilityLabel={`${slot.name} amount`}
                  style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 15, color: c.text }}
                />
                <Text style={{ marginLeft: 3, fontSize: 13, color: c.muted }}>{slot.unit}</Text>
              </View>
              {mark(!!typed)}
            </View>
            {(typed || valid) && (
              <Text style={{ marginTop: 6, marginLeft: 4, fontSize: 12, color: c.muted }}>
                At {valid ? amount : typed?.amount} {slot.unit}: {caloriesFor([...withoutThis, { ingredient: slot.ingredientId, amount: valid ? amount : typed!.amount, unit: slot.unit }])} kcal
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}
