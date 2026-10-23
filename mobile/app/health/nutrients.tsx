import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SettingsNumericInput } from "@/src/components/forms";
import { useWideForm } from "@/src/components/forms/wideForm";
import { deskCard, DeskHeader, NutritionDesk, useNutritionColors, useNutritionDesk } from "@/src/components/health/web/NutritionDesk";
import { PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { Tap } from "@/src/components/ui/Tap";
import { Button } from "@/src/components/web/ui";
import { useScrollFocusSection } from "@/src/hooks/useScrollFocusSection";
import { getMealPlanForDate, type MealPlanEntry } from "@/src/services/mealPlanApi";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from "@/src/services/settingsService";
import {
  CORE_NUTRITION_FIELDS,
  EXTENDED_NUTRITION_GROUPS,
  NUTRITION_FIELD_META,
  type NutritionField,
} from "@/src/types/nutrition";
import {
  computeDayNutrition,
  friendlyDayLabel,
  parseLocalDate,
  pct,
  toDateStr,
  todayStr,
} from "@/src/utils/mealPlan";
import { getEffectiveNutrientGoal, getSetNutrientGoal, withNutrientGoal } from "@/src/utils/nutritionGoals";
import { nutrientColor, type MainNutrient } from "@/src/theme/nutrients";
import type { OrbitColors } from "@/src/theme/orbit";

// (In a desktop browser, a main nutrient's bar is in its own colour; the
// rest in Nutrition's.)
const MAIN_NUTRIENTS: readonly string[] = ["calories", "protein", "carbs", "fats", "fiber", "sodium"] satisfies MainNutrient[];
// The goals set in Your Targets — shown in the edit mode, changed there.
const TARGETS_FIELDS: readonly NutritionField[] = ["calories", "protein", "carbs", "fats", "fiber", "sodium"];

type Row = { field: NutritionField; indent?: boolean };

// Nutrition-label order, same as MyFitnessPal's Nutrients tab: the label
// block first (sub-nutrients indented under their parent — fiber/sugars
// under carbs, the fat breakdown under fat), then the remaining groups in
// the shared EXTENDED_NUTRITION_GROUPS order, each under its own heading.
const SECTIONS: { title: string | null; rows: Row[] }[] = [
  {
    title: null,
    rows: [
      { field: "calories" },
      { field: "protein" },
      { field: "carbs" },
      { field: "fiber", indent: true },
      { field: "sugar", indent: true },
      { field: "addedSugar", indent: true },
      { field: "fats" },
      { field: "saturatedFat", indent: true },
      { field: "polyunsaturatedFat", indent: true },
      { field: "monounsaturatedFat", indent: true },
      { field: "transFat", indent: true },
      { field: "omega3", indent: true },
      { field: "cholesterol" },
      { field: "sodium" },
    ],
  },
  ...EXTENDED_NUTRITION_GROUPS
    .filter((group) => group.title !== "Sugars & fats")
    .map((group) => ({ title: group.title, rows: group.fields.map((field) => ({ field })) })),
];

const ROWS: Row[] = SECTIONS.flatMap((section) => section.rows);

// In a desktop browser the one long card is three, side by side: the label
// block, the vitamins, and the minerals with what's left.
const WIDE_CARDS = [SECTIONS.slice(0, 1), SECTIONS.slice(1, 2), SECTIONS.slice(2)];

function shiftDate(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

// Vitamins/minerals (the fields with a dailyValue) display as %DV; the
// rest in their own unit.
function toDisplay(field: NutritionField, value: number): number {
  const dv = NUTRITION_FIELD_META[field].dailyValue;
  return dv ? (value / dv) * 100 : value;
}

function fromDisplay(field: NutritionField, value: number): number {
  const dv = NUTRITION_FIELD_META[field].dailyValue;
  return dv ? (value * dv) / 100 : value;
}

function formatValue(field: NutritionField, value: number): string {
  const meta = NUTRITION_FIELD_META[field];
  const shown = toDisplay(field, value);
  const decimals = meta.dailyValue ? 0 : meta.decimals;
  const text = shown.toLocaleString(undefined, { maximumFractionDigits: decimals });
  return meta.dailyValue ? `${text}%` : text;
}

function displayUnit(field: NutritionField): string {
  const meta = NUTRITION_FIELD_META[field];
  return meta.dailyValue ? "% DV" : meta.unit;
}

// In Orbit's look — Health's colour on a phone, Nutrition's green in a
// desktop browser.
export default function NutrientsScreen() {
  return (
    <NutritionDesk>
      <NutrientsPage />
    </NutritionDesk>
  );
}

function NutrientsPage() {
  const router = useRouter();
  // The page's colours; the desktop's, when it's in a desktop browser.
  const o = useNutritionColors();
  const desk = useNutritionDesk();
  const leave = useGoBack("/health-section");
  const [isLoading, setIsLoading] = useState(true);
  const [isDayLoading, setIsDayLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [date, setDate] = useState(todayStr);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  // Goals being edited — null when not in edit mode.
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const layout = useWideForm();

  const scrollRef = useRef<ScrollView>(null);
  const scrollAnchorRef = useRef<View>(null);

  useEffect(() => {
    loadSettings()
      .then(setSettings)
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsDayLoading(true);
    getMealPlanForDate(date)
      .then(loaded => { if (!cancelled) setEntries(loaded); })
      .catch(() => { if (!cancelled) setEntries([]); })
      .finally(() => { if (!cancelled) setIsDayLoading(false); });
    return () => { cancelled = true; };
  }, [date]);

  // Only logged (confirmed) entries count toward the day — same as the
  // Nutrition tab's "eaten" figures; planned ones haven't happened yet.
  const confirmedEntries = useMemo(() => entries.filter(e => e.status === "confirmed"), [entries]);
  const plannedCount = entries.length - confirmedEntries.length;

  const totals = useMemo(
    () => computeDayNutrition(confirmedEntries, settings.unitConversions),
    [confirmedEntries, settings.unitConversions],
  );

  // How many of the day's logged items actually had data for each extended
  // nutrient — most catalog entries have none yet, so a total built from
  // 1 of 5 items shouldn't read as the whole day's intake.
  const coverage = useMemo(() => {
    const perEntry = confirmedEntries.map(e => computeDayNutrition([e], settings.unitConversions));
    const counts: Partial<Record<NutritionField, number>> = {};
    for (const { field } of ROWS) {
      counts[field] = perEntry.filter(n => n[field] != null).length;
    }
    return counts;
  }, [confirmedEntries, settings.unitConversions]);

  async function handleSave() {
    if (!draft) return;
    try {
      setIsSaving(true);
      // (The main six are Your Targets'; only the rest are saved here.)
      await saveSettings({ extendedNutrientGoals: draft.extendedNutrientGoals });
      setSettings(draft);
      setDraft(null);
    } catch {
      Alert.alert("Error", "Could not save your goals. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: o.canvas }}>
        <ActivityIndicator color={o.muted} />
      </SafeAreaView>
    );
  }

  const isEditing = draft != null;
  const card = { ...deskCard(o), overflow: "hidden" as const };
  const note = (children: React.ReactNode) => <Text style={{ marginTop: 12, paddingHorizontal: 4, fontSize: 12.5, lineHeight: 18, color: o.faint }}>{children}</Text>;

  // A card of goals to edit, and a card of the day's totals, for some of
  // the sections (all of them on a phone).
  const editCard = (sections: typeof SECTIONS) => (
    <View style={card}>
      {sections.map(section => (
        <View key={section.title ?? "label"}>
          {section.title && <SectionHeading title={section.title} o={o} />}
          {section.rows.map(({ field, indent }) =>
            TARGETS_FIELDS.includes(field) ? (
              <TargetsRow key={field} field={field} indent={indent} goal={getEffectiveNutrientGoal(settings, field)} onPress={() => router.push("/health/targets" as Href)} o={o} />
            ) : (
              <GoalEditRow
                key={field}
                field={field}
                indent={indent}
                goal={draft ? getSetNutrientGoal(draft, field) : null}
                onChange={goal => setDraft(prev => prev && withNutrientGoal(prev, field, goal))}
                scrollRef={scrollRef}
                anchorRef={scrollAnchorRef}
                o={o}
              />
            ),
          )}
        </View>
      ))}
    </View>
  );

  const totalsCard = (sections: typeof SECTIONS) => {
    const lastRows = sections[sections.length - 1].rows;
    const lastField = lastRows[lastRows.length - 1].field;
    const column = (label: string) => <Text style={{ width: 64, textAlign: "right", fontSize: 11, fontWeight: "700", letterSpacing: 0.8, color: o.faint }}>{label}</Text>;
    return (
      <View style={card}>
        {/* Column headers */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: o.border }}>
          <View style={{ flex: 1 }} />
          {column("TOTAL")}
          {column("GOAL")}
          {column("LEFT")}
        </View>

        {sections.map(section => (
          <View key={section.title ?? "label"}>
            {section.title && <SectionHeading title={section.title} o={o} />}
            {section.rows.map(({ field, indent }) => (
              <NutrientRow
                o={o}
                key={field}
                field={field}
                indent={indent}
                total={totals[field] ?? null}
                goal={getEffectiveNutrientGoal(settings, field)}
                covered={coverage[field] ?? 0}
                entryCount={confirmedEntries.length}
                isLast={field === lastField}
              />
            ))}
          </View>
        ))}
      </View>
    );
  };

  const editButton = (
    <Tap onPress={() => !isSaving && setDraft(isEditing ? null : settings)} accessibilityRole="button" style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: o.pill }} pressedStyle={{ opacity: 0.7 }}>
      <Text style={{ fontSize: 13.5, fontWeight: "700", color: o.onPill }}>{isEditing ? "Cancel" : "Edit goals"}</Text>
    </Tap>
  );

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: o.canvas }}>
      <KeyboardAvoidingView
        style={[{ flex: 1 }, layout.wide ? { width: "100%", maxWidth: 1280, alignSelf: "center" } : null]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header (in a desktop browser, the title large on the page) */}
        {desk ? (
          <DeskHeader
            o={o}
            title="All Nutrients"
            subtitle={isEditing ? "Editing daily goals" : friendlyDayLabel(date)}
            onBack={() => router.back()}
            right={<Button label={isEditing ? "Cancel" : "Edit goals"} icon={isEditing ? undefined : "create-outline"} onPress={() => !isSaving && setDraft(isEditing ? null : settings)} />}
          />
        ) : (
          <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
            <PageHeader title="All nutrients" subtitle={isEditing ? "Editing vitamin and mineral goals" : friendlyDayLabel(date)} onBack={leave} action={editButton} />
          </View>
        )}

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View ref={scrollAnchorRef} collapsable={false} />

          {isEditing ? (
            <>
              {layout.wide ? (
                <View style={layout.columns}>
                  {WIDE_CARDS.map((sections, i) => (
                    <View key={i} style={layout.column}>{editCard(sections)}</View>
                  ))}
                </View>
              ) : (
                editCard(SECTIONS)
              )}
              {note("Calories, protein, carbs, fat, fibre and sodium are set in Your Targets. Vitamins and minerals are set as a percentage of the standard Daily Value — leave one blank to use 100%. Leave any other goal blank to not track against one.")}
              {desk ? (
                <View style={{ marginTop: 18, flexDirection: "row", justifyContent: "flex-end" }}>
                  <Button label={isSaving ? "Saving…" : "Save goals"} kind="primary" onPress={() => !isSaving && void handleSave()} />
                </View>
              ) : (
                <Tap onPress={() => void handleSave()} disabled={isSaving} accessibilityRole="button" style={{ marginTop: 20, alignItems: "center", paddingVertical: 14, borderRadius: 16, backgroundColor: o.ink, opacity: isSaving ? 0.6 : 1 }} pressedStyle={{ opacity: 0.85 }}>
                  <Text style={{ fontSize: 15.5, fontWeight: "700", color: o.onInk }}>{isSaving ? "Saving…" : "Save goals"}</Text>
                </Tap>
              )}
            </>
          ) : (
            <>
              {/* Day picker */}
              <View style={{ ...deskCard(o), marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 6, ...(layout.wide ? { width: 360 } : null) }}>
                <Tap onPress={() => setDate(d => shiftDate(d, -1))} accessibilityLabel="The day before" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }} pressedStyle={{ backgroundColor: o.pill }}>
                  <Ionicons name="chevron-back" size={22} color={o.icon} />
                </Tap>
                <Tap onPress={() => setDate(todayStr())} accessibilityLabel="Today" style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: o.text }}>{friendlyDayLabel(date)}</Text>
                  {isDayLoading && <ActivityIndicator size="small" color={o.faint} style={{ marginLeft: 8 }} />}
                </Tap>
                <Tap onPress={() => setDate(d => shiftDate(d, 1))} accessibilityLabel="The day after" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }} pressedStyle={{ backgroundColor: o.pill }}>
                  <Ionicons name="chevron-forward" size={22} color={o.icon} />
                </Tap>
              </View>

              {layout.wide ? (
                <View style={layout.columns}>
                  {WIDE_CARDS.map((sections, i) => (
                    <View key={i} style={layout.column}>{totalsCard(sections)}</View>
                  ))}
                </View>
              ) : (
                totalsCard(SECTIONS)
              )}

              {note(
                <>
                  Totals count only meals you&apos;ve logged as eaten
                  {plannedCount > 0 ? ` — ${plannedCount} planned item${plannedCount === 1 ? "" : "s"} for this day ${plannedCount === 1 ? "isn't" : "aren't"} included` : ""}. Nutrients beyond the main six only add up from foods that have that data on file.
                </>,
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SectionHeading({ title, o }: { title: string; o: OrbitColors }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: o.canvas, borderBottomWidth: 1, borderBottomColor: o.border }}>
      <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, color: o.muted }}>{title.toUpperCase()}</Text>
    </View>
  );
}

function NutrientRow({
  o,
  field,
  indent,
  total,
  goal,
  covered,
  entryCount,
  isLast,
}: {
  o: OrbitColors;
  field: NutritionField;
  indent?: boolean;
  total: number | null;
  goal: number | null;
  covered: number;
  entryCount: number;
  isLast: boolean;
}) {
  const meta = NUTRITION_FIELD_META[field];
  const left = total != null && goal != null ? goal - total : null;
  const isOver = left != null && left < 0;
  // Only the extended nutrients can be missing from some items — the core
  // six are always computed (unknown counted as 0), matching everywhere
  // else in the app.
  const showCoverage = !(CORE_NUTRITION_FIELDS as readonly string[]).includes(field) && entryCount > 0 && covered < entryCount;
  const figure = (text: string, color: string, weight: "400" | "600" = "600") => <Text style={{ width: 64, textAlign: "right", fontSize: 15, fontWeight: weight, color, fontVariant: ["tabular-nums"] }}>{text}</Text>;

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: o.border }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1, paddingRight: 8, paddingLeft: indent ? 16 : 0 }}>
          <Text style={{ fontSize: indent ? 14 : 15.5, fontWeight: indent ? "400" : "500", color: indent ? o.icon : o.text }}>
            {meta.label}
            <Text style={{ fontSize: 12, fontWeight: "400", color: o.faint }}>{`  ${displayUnit(field)}`}</Text>
          </Text>
          {showCoverage && <Text style={{ marginTop: 2, fontSize: 12, color: o.faint }}>{covered === 0 ? "No data from logged items" : `From ${covered} of ${entryCount} logged items`}</Text>}
        </View>
        {figure(total != null ? formatValue(field, total) : "–", o.text)}
        {figure(goal != null ? formatValue(field, goal) : "–", o.muted, "400")}
        {figure(left != null ? formatValue(field, left) : "–", isOver ? o.danger : o.icon)}
      </View>
      {goal != null && total != null && (
        <View style={{ marginTop: 8, marginLeft: indent ? 16 : 0, height: 4, borderRadius: 2, overflow: "hidden", backgroundColor: o.track }}>
          {/* (The bar in the nutrient's own colour, over its goal or not:
              the number left turns red instead.) */}
          <View style={{ height: 4, width: `${pct(total, goal) * 100}%`, backgroundColor: MAIN_NUTRIENTS.includes(field) ? nutrientColor(field as MainNutrient) : o.fill }} />
        </View>
      )}
    </View>
  );
}

// A goal set in Your Targets (calories, the macros, fibre, sodium): shown,
// and changed there.
function TargetsRow({ field, indent, goal, onPress, o }: { field: NutritionField; indent?: boolean; goal: number | null; onPress: () => void; o: OrbitColors }) {
  const meta = NUTRITION_FIELD_META[field];
  return (
    <Tap onPress={onPress} accessibilityRole="link" accessibilityLabel={`${meta.label}: set in Your Targets`} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: o.border }} pressedStyle={{ backgroundColor: o.pill }}>
      <Text style={{ flex: 1, paddingRight: 12, paddingLeft: indent ? 16 : 0, fontSize: indent ? 14 : 15.5, color: indent ? o.icon : o.text }}>{meta.label}</Text>
      <Text style={{ fontSize: 15, fontWeight: "600", color: o.text, fontVariant: ["tabular-nums"] }}>{goal != null ? `${formatValue(field, goal)} ${meta.unit}` : "—"}</Text>
      <Text style={{ marginLeft: 10, fontSize: 12.5, fontWeight: "600", color: o.ink }}>Your Targets</Text>
      <Ionicons name="chevron-forward" size={14} color={o.ink} />
    </Tap>
  );
}

function GoalEditRow({
  field,
  indent,
  goal,
  onChange,
  scrollRef,
  anchorRef,
  o,
}: {
  field: NutritionField;
  indent?: boolean;
  goal: number | null;
  onChange: (goal: number | null) => void;
  scrollRef: RefObject<ScrollView | null>;
  anchorRef: RefObject<View | null>;
  o: OrbitColors;
}) {
  const section = useScrollFocusSection(scrollRef, anchorRef);
  const meta = NUTRITION_FIELD_META[field];
  const shown = goal != null ? Math.round(toDisplay(field, goal) * 10) / 10 : null;

  return (
    <View {...section.wrapperProps}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: o.border }}>
        <Text style={{ flex: 1, paddingRight: 12, paddingLeft: indent ? 16 : 0, fontSize: indent ? 14 : 15.5, color: indent ? o.icon : o.text }}>{meta.label}</Text>
        <SettingsNumericInput
          value={shown}
          onChange={v => onChange(v != null ? fromDisplay(field, v) : null)}
          placeholder={meta.dailyValue ? "100" : "—"}
          unit={meta.dailyValue ? "%" : meta.unit}
          onFocus={section.trigger}
        />
      </View>
    </View>
  );
}
