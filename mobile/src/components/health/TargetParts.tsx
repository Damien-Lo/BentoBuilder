import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { healthyRange, KG_PER_LB } from "@/src/components/health/bodyStats";
import { fit, KCAL_PER_KG_WEEK, PACES, type Aim, type Target } from "@/src/components/health/targets";
import { showMeasure, toShown, toStored, UNIT_LABEL } from "@/src/components/health/units";
import { IconTile } from "@/src/components/settings/AccountParts";
import { Tap } from "@/src/components/ui/Tap";
import type { AppSettings, Units } from "@/src/services/settingsService";
import type { OrbitColors } from "@/src/theme/orbit";

// Targets' pieces — a target's row, its editor (yours, beside the
// suggestion), and the goal weight with its pace — for the Targets page
// and the Health pages each target belongs to.

// The targets that are Kitchen's daily nutrition goals, and their fields.
export const SETTING: Partial<Record<string, keyof AppSettings>> = {
  calories: "dailyCalorieLimit",
  protein: "dailyProteinLimit",
  carbs: "dailyCarbsLimit",
  fats: "dailyFatsLimit",
  fiber: "dailyFiberLimit",
  sodium: "dailySodiumLimit",
};

// Far enough from what's set to suggest a change.
export const differs = (t: Target) => t.current == null || Math.abs(t.value - t.current) / t.value > 0.04;

// The paces' names, slowest first.
const PACE_NAMES = { lose: ["Gentle", "Steady", "Faster", "Fastest"], gain: ["Lean", "Steady", "Faster"] };

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  calories: "flame",
  protein: "barbell",
  carbs: "nutrition",
  fats: "water-outline",
  fiber: "leaf",
  sodium: "beaker",
  water: "water",
  steps: "footsteps",
  exercise: "stopwatch",
  workouts: "fitness",
  sleep: "moon",
};

// "2,140 kcal", "8h", "125 fl oz" (or mL), "4" (a week).
export function amount(t: Target, value: number, units: Units, withUnit = true) {
  if (t.key === "sleep") return `${Math.floor(value / 60)}h${value % 60 ? ` ${Math.round(value % 60)}m` : ""}`;
  if (t.key === "water") return withUnit ? showMeasure("volume", value, units, 0) : `${Math.round(toShown("volume", value, units)).toLocaleString()}`;
  if (t.key === "workouts" || !withUnit) return Math.round(value).toLocaleString();
  return `${Math.round(value).toLocaleString()} ${t.unit}`;
}
export const PER = { day: "a day", week: "a week", night: "a night" };

// Your goal weight, and how fast to get there — the pace sets the calories.
export function GoalCard({ aim, start, burn, units, onPace, onGoal, colors: c }: { aim: Aim; start: { kg: number; date: string | null } | null; burn: number; units: Units; onPace: (dir: "lose" | "gain", kg: number) => void; onGoal: () => void; colors: OrbitColors }) {
  const W = (kg: number, places = 1) => showMeasure("weight", kg, units, places);
  const dir = aim.direction;
  const away = aim.weightKg != null && aim.goalKg != null ? Math.abs(aim.weightKg - aim.goalKg) : null;
  const choices = dir === "stay" ? [] : PACES[dir][units];
  const chosen = Math.round(toShown("weight", aim.pace, units) * 100) / 100;
  const dateIn = (weeks: number | null) => (weeks != null ? new Date(Date.now() + weeks * 7 * 86_400_000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null);
  const when = dateIn(aim.weeks);
  const trendWhen = dateIn(aim.trendWeeks);
  const sinceStart = start && aim.weightKg != null ? aim.weightKg - start.kg : null;
  const tooFast = dir === "lose" && aim.weightKg != null && aim.pace > aim.weightKg * 0.01;
  return (
    <View style={{ padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <IconTile icon="scale" color={c.fill} />
        <Text style={{ flex: 1, marginLeft: 12, fontSize: 15, fontWeight: "600", color: c.text }}>Goal weight</Text>
        <Tap onPress={onGoal} accessibilityRole="link" hitSlop={8}>
          <Text style={{ fontSize: 13.5, fontWeight: "700", color: c.ink }}>{aim.goalKg != null ? "Edit" : "Set a goal"}</Text>
        </Tap>
      </View>
      {aim.goalKg != null ? (
        <>
          <Text style={{ marginTop: 10, fontSize: 22, fontWeight: "800", color: c.text }}>
            {dir === "lose" ? "Lose" : dir === "gain" ? "Gain" : "Stay at"} {dir === "stay" ? W(aim.goalKg) : away != null ? W(away) : ""}
          </Text>
          <Text style={{ marginTop: 2, fontSize: 13.5, color: c.muted }}>{aim.weightKg != null ? `${W(aim.weightKg)} now → ${W(aim.goalKg)}` : `Goal ${W(aim.goalKg)} — log a weigh-in to start`}</Text>
          {start && (
            <Text style={{ marginTop: 2, fontSize: 12.5, color: c.faint }}>
              {sinceStart != null && Math.abs(sinceStart) >= 0.05 ? `${sinceStart < 0 ? "−" : "+"}${W(Math.abs(sinceStart))} since ` : "Started "}
              {start.date ? new Date(`${start.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "the start"} (from {W(start.kg)})
            </Text>
          )}
          {aim.trend != null && (
            <Text style={{ marginTop: 8, fontSize: 13.5, lineHeight: 19, color: c.text }}>
              <Text style={{ fontWeight: "700" }}>Last 4 weeks: {Math.abs(aim.trend) < 0.05 ? "steady" : `${aim.trend < 0 ? "−" : "+"}${W(Math.abs(aim.trend), 2)} a week`}</Text>
              {trendWhen ? ` · there around ${trendWhen} at this rate` : dir !== "stay" && Math.abs(aim.trend) >= 0.05 ? " · heading away from your goal" : ""}
            </Text>
          )}
        </>
      ) : (
        <Text style={{ marginTop: 6, fontSize: 14.5, color: c.muted }}>No goal weight — the calories keep you where you are.</Text>
      )}

      {choices.length > 0 && (
        <>
          <Text style={{ marginTop: 14, marginBottom: 6, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>PACE, {UNIT_LABEL[units].weight.toUpperCase()} A WEEK</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {choices.map((shown, i) => {
              const on = Math.abs(shown - chosen) < 0.02;
              const name = PACE_NAMES[dir as "lose" | "gain"][i];
              return (
                <Tap key={shown} onPress={() => onPace(dir as "lose" | "gain", units === "imperial" ? shown * KG_PER_LB : shown)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${name}: ${shown} ${UNIT_LABEL[units].weight} a week`} style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: on ? c.ink : c.border, backgroundColor: on ? `${c.fill}1F` : c.canvas }} pressedStyle={{ opacity: 0.7 }}>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: on ? c.ink : c.text }}>{shown}</Text>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: on ? c.ink : c.muted }}>{name}</Text>
                </Tap>
              );
            })}
          </View>
          <Text style={{ marginTop: 10, fontSize: 13.5, lineHeight: 19, color: c.text }}>
            <Text style={{ fontWeight: "700" }}>
              {dir === "lose" ? "−" : "+"}
              {Math.round(aim.actualPace * KCAL_PER_KG_WEEK).toLocaleString()} kcal a day
            </Text>{" "}
            from your {Math.round(burn).toLocaleString()}
            {when ? ` · planned for around ${when}` : ""}
          </Text>
          {aim.actualPace < aim.pace - 0.01 && <Text style={{ marginTop: 6, fontSize: 12.5, lineHeight: 17, color: c.warning }}>Your calorie floor keeps this to {W(aim.actualPace, 2)} a week.</Text>}
          {tooFast && <Text style={{ marginTop: 6, fontSize: 12.5, lineHeight: 17, color: c.warning }}>More than 1% of your weight a week — harder to keep muscle and stick with.</Text>}
        </>
      )}
    </View>
  );
}

export function FitChip({ target, colors: c }: { target: Target; colors: OrbitColors }) {
  const f = fit(target);
  const label = f === "yours" ? "From your data" : f === "partly" ? "Partly standard" : f === "guideline" ? "Guideline" : "Standard";
  return (
    <View style={{ alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: f === "yours" ? `${c.fill}26` : c.pill }}>
      <Text style={{ fontSize: 11, fontWeight: "700", color: f === "yours" ? c.ink : c.muted }}>{label}</Text>
    </View>
  );
}

// A target: yours (the suggestion, until you set one), how far along you
// are, and the suggestion when it's different.
export function TargetRow({ target: t, done, units, onPress, colors: c }: { target: Target; done: number | null; units: Units; onPress: () => void; colors: OrbitColors }) {
  const aimFor = t.current ?? t.value;
  const share = done != null ? Math.min(1, done / aimFor) : 0;
  const when = t.per === "week" ? "this week" : t.per === "night" ? "last night" : "today";
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={`${t.label}: ${amount(t, aimFor, units)} ${PER[t.per]}. Edit`} style={{ flexDirection: "row", gap: 12, paddingHorizontal: 14, paddingVertical: 12 }} pressedStyle={{ backgroundColor: c.pill }}>
      <IconTile icon={ICONS[t.key] ?? "flag"} color={c.fill} />
      <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 30 }}>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: c.text }}>{t.label}</Text>
        <Text style={{ fontSize: 16, fontWeight: "800", color: c.text, fontVariant: ["tabular-nums"] }}>{amount(t, aimFor, units)}</Text>
        <Text style={{ fontSize: 12.5, color: c.muted }}>{PER[t.per]}</Text>
      </View>
      <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.track, overflow: "hidden" }}>
          <View style={{ width: `${share * 100}%`, height: "100%", borderRadius: 3, backgroundColor: c.fill }} />
        </View>
        <Text style={{ width: 120, textAlign: "right", fontSize: 12, color: c.muted, fontVariant: ["tabular-nums"] }} numberOfLines={1}>
          {done != null ? `${amount(t, done, units)} ${when}` : `None ${when}`}
        </Text>
      </View>
      {t.current == null ? (
        <Text style={{ marginTop: 6, fontSize: 12.5, color: c.faint }}>The suggestion — tap to set your own</Text>
      ) : (
        differs(t) && <Text style={{ marginTop: 6, fontSize: 12.5, fontWeight: "600", color: c.ink }}>Suggested {amount(t, t.value, units)}</Text>
      )}
      </View>
    </Tap>
  );
}

// A target, tapped: yours to change, the suggestion beside it (to take),
// and what the suggestion's based on (yours, or standard and where to add
// yours) and how it was worked out.
export function TargetEditor({ target: t, units, onSave, onClose, onAdd, colors: c }: { target: Target | null; units: Units; onSave: (value: number) => void; onClose: () => void; onAdd: (href: string) => void; colors: OrbitColors }) {
  // Typed in as shown: hours of sleep, fl oz or mL of water, else as kept.
  const shown = (v: number) => (t?.key === "sleep" ? Math.round((v / 60) * 4) / 4 : t?.key === "water" ? Math.round(toShown("volume", v, units)) : Math.round(v));
  const kept = (v: number) => (t?.key === "sleep" ? Math.round(v * 60) : t?.key === "water" ? Math.round(toStored("volume", v, units)) : Math.round(v));
  const unit = t?.key === "sleep" ? "hours" : t?.key === "water" ? UNIT_LABEL[units].volume : t?.key === "workouts" ? "workouts" : t?.unit;
  const [text, setText] = useState("");
  useEffect(() => {
    if (t) setText(String(shown(t.current ?? t.value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.key]);
  if (!t) return null;

  const typed = Number(text.replace(/,/g, ""));
  const valid = text.trim() !== "" && Number.isFinite(typed) && typed > 0;
  const changed = valid && kept(typed) !== (t.current ?? null);
  function done() {
    if (!valid) return Alert.alert("That doesn't look right", "Put in a number above zero.");
    if (changed) onSave(kept(typed));
    onClose();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.5)" }}>
          {/* The backdrop: tapped, it closes (behind the card, so the card scrolls) */}
          <Pressable onPress={onClose} accessibilityLabel="Close" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} />
          <View style={{ width: "100%", maxWidth: 440, maxHeight: "88%", borderRadius: 22, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }}>
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", letterSpacing: 0.8, color: c.ink }}>{t.label.toUpperCase()}</Text>
                <Tap onPress={onClose} accessibilityLabel="Close" hitSlop={10}>
                  <Ionicons name="close" size={20} color={c.faint} />
                </Tap>
              </View>

              {/* Yours */}
              <Text style={{ marginTop: 12, marginBottom: 6, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>YOUR TARGET</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <TextInput
                  value={text}
                  onChangeText={(v) => setText(v.replace(/[^0-9.,]/g, ""))}
                  onSubmitEditing={done}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  selectTextOnFocus
                  accessibilityLabel={`Your ${t.label.toLowerCase()} target`}
                  style={[{ flex: 1, height: 52, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.canvas, fontSize: 24, fontWeight: "800", color: c.text, fontVariant: ["tabular-nums"] }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
                />
                <Text style={{ fontSize: 14, color: c.muted }}>
                  {unit} {PER[t.per]}
                </Text>
              </View>
              {t.current == null && <Text style={{ marginTop: 6, fontSize: 12.5, color: c.faint }}>Not set yet — following the suggestion.</Text>}

              {/* The suggestion */}
              <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, backgroundColor: `${c.fill}1A` }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: c.ink }}>SUGGESTED</Text>
                  <Text style={{ marginTop: 2, fontSize: 20, fontWeight: "800", color: c.text }}>
                    {amount(t, t.value, units)} <Text style={{ fontSize: 13, fontWeight: "500", color: c.muted }}>{PER[t.per]}</Text>
                  </Text>
                  <View style={{ marginTop: 4 }}>
                    <FitChip target={t} colors={c} />
                  </View>
                </View>
                {shown(t.value) !== typed && (
                  <Tap onPress={() => setText(String(shown(t.value)))} accessibilityRole="button" style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: c.ink }} pressedStyle={{ opacity: 0.8 }}>
                    <Text style={{ fontSize: 13.5, fontWeight: "700", color: c.onInk }}>Use this</Text>
                  </Tap>
                )}
              </View>

              <Tap onPress={done} accessibilityRole="button" style={{ marginTop: 14, alignItems: "center", paddingVertical: 13, borderRadius: 14, backgroundColor: changed ? c.ink : c.pill }} pressedStyle={{ opacity: 0.8 }}>
                <Text style={{ fontSize: 15.5, fontWeight: "700", color: changed ? c.onInk : c.onPill }}>{changed ? "Save" : "Done"}</Text>
              </Tap>
              {SETTING[t.key] && <Text style={{ marginTop: 6, fontSize: 12, textAlign: "center", color: c.faint }}>Also your daily goal in Kitchen and Nutrition</Text>}

              <Text style={{ marginTop: 18, marginBottom: 6, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>THE SUGGESTION&apos;S BASED ON</Text>
              <View style={{ borderRadius: 14, backgroundColor: c.canvas, paddingHorizontal: 12, paddingVertical: 4 }}>
                {t.basis.map((b) => (
                  <View key={b.label} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
                    <Ionicons name={b.yours ? "checkmark-circle" : "ellipse-outline"} size={16} color={b.yours ? c.ink : c.faint} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }}>{b.label}</Text>
                      <Text style={{ fontSize: 12.5, color: c.muted }}>{b.value}</Text>
                    </View>
                    {!b.yours && b.add && (
                      <Tap onPress={() => onAdd(b.add!.href)} accessibilityRole="link" style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: c.onPill }}>Add</Text>
                      </Tap>
                    )}
                  </View>
                ))}
              </View>

              <Text style={{ marginTop: 16, marginBottom: 6, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>HOW IT&apos;S WORKED OUT</Text>
              <View style={{ padding: 12, borderRadius: 14, backgroundColor: c.canvas, gap: 6 }}>
                {t.how.map((line, i) => (
                  <Text key={i} style={{ fontSize: 14, lineHeight: 20, color: c.text, fontVariant: ["tabular-nums"] }}>
                    {line}
                  </Text>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Your goal weight — typed in the page's units, kept in kilograms — with the
// healthy weights for your height beside it. Where it starts isn't typed:
// it's your weight when you set it (the server keeps it — see
// server/services/weightGoal.js).
export type WeightGoal = { goalWeight: number | null };
export function WeightGoalEditor({ open, value, heightCm, units, onSave, onClose, colors: c }: { open: boolean; value: WeightGoal; heightCm: number | null; units: Units; onSave: (v: WeightGoal) => void; onClose: () => void; colors: OrbitColors }) {
  const shown = (kg: number | null) => (kg == null ? "" : String(Math.round(toShown("weight", kg, units) * 10) / 10));
  const [goal, setGoal] = useState("");
  useEffect(() => {
    if (!open) return;
    setGoal(shown(value.goalWeight));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!open) return null;

  const U = UNIT_LABEL[units].weight;
  const range = heightCm ? healthyRange(heightCm) : null;
  const parse = (text: string) => (text.trim() ? Number(text.replace(/,/g, "")) : null);
  function save() {
    const g = parse(goal);
    if (g != null && (!Number.isFinite(g) || toStored("weight", g, units) < 25 || toStored("weight", g, units) > 350)) return Alert.alert("That weight doesn't look right", `Put in a weight in ${U === "kg" ? "kilograms" : "pounds"}.`);
    onSave({ goalWeight: g == null ? null : toStored("weight", g, units) });
    onClose();
  }
  const field = (label: string, text: string, set: (v: string) => void, hint?: string) => (
    <>
      <Text style={{ marginTop: 14, marginBottom: 6, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <TextInput
          value={text}
          onChangeText={(v) => set(v.replace(/[^0-9.,]/g, ""))}
          keyboardType="decimal-pad"
          returnKeyType="done"
          placeholder="—"
          placeholderTextColor={c.faint}
          selectTextOnFocus
          accessibilityLabel={label}
          style={[{ flex: 1, height: 50, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.canvas, fontSize: 22, fontWeight: "800", color: c.text, fontVariant: ["tabular-nums"] }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
        />
        <Text style={{ fontSize: 14, color: c.muted }}>{U}</Text>
      </View>
      {hint && <Text style={{ marginTop: 6, fontSize: 12.5, color: c.muted }}>{hint}</Text>}
    </>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.5)" }}>
          {/* The backdrop: tapped, it closes (behind the card, so the card scrolls) */}
          <Pressable onPress={onClose} accessibilityLabel="Close" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} />
          <View style={{ width: "100%", maxWidth: 440, maxHeight: "88%", borderRadius: 22, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }}>
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", letterSpacing: 0.8, color: c.ink }}>GOAL WEIGHT</Text>
                <Tap onPress={onClose} accessibilityLabel="Close" hitSlop={10}>
                  <Ionicons name="close" size={20} color={c.faint} />
                </Tap>
              </View>
              {field("YOUR GOAL", goal, setGoal, range ? `Healthy for your height: ${showMeasure("weight", range.low, units, 0)}–${showMeasure("weight", range.high, units, 0)} (a BMI of 18.5–25)` : "Add your height in About you to see the healthy weights for it.")}
              <Text style={{ marginTop: 14, fontSize: 12.5, lineHeight: 18, color: c.muted }}>Your progress is measured from your weight when you set a goal. Moving it the same way keeps that start; switching between losing, gaining and keeping starts a new goal, and the last one is kept in your Weight history.</Text>
              <Tap onPress={save} accessibilityRole="button" style={{ marginTop: 18, alignItems: "center", paddingVertical: 13, borderRadius: 14, backgroundColor: c.ink }} pressedStyle={{ opacity: 0.8 }}>
                <Text style={{ fontSize: 15.5, fontWeight: "700", color: c.onInk }}>Save</Text>
              </Tap>
              <Text style={{ marginTop: 8, fontSize: 12, textAlign: "center", color: c.faint }}>Your calories follow the goal, at the pace you choose.</Text>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
