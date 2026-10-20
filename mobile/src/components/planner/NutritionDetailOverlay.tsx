import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { FlatList, Modal, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type NutritionLimits } from "@/src/components/health/NutritionSummaryCard";
import { NutritionRings } from "@/src/components/planner/NutritionRings";
import { Tap } from "@/src/components/ui/Tap";
import { useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import type { AppSettings } from "@/src/services/settingsService";
import {
  EXTENDED_NUTRITION_FIELDS,
  EXTENDED_NUTRITION_GROUPS,
  NUTRITION_FIELD_META,
  type ExtendedNutritionField,
} from "@/src/types/nutrition";
import { pct, type DayNutrition } from "@/src/utils/mealPlan";
import { getEffectiveNutrientGoal } from "@/src/utils/nutritionGoals";

// One of the planner's nutrition cards (the day, the last 7 days, or the
// 7-day daily average), as the overlay shows it.
export interface NutritionDetailPage {
  title: string;
  subtitle?: string;
  confirmed: DayNutrition;
  planned: DayNutrition;
  limits: NutritionLimits;
  // Daily goals are multiplied by this for the page — 7 for a 7-day total,
  // 1 for a single day or a daily average.
  goalScale: number;
}

// Goals that are a ceiling (less is better) — only these turn amber when
// passed. Everything else (omega-3, potassium, the vitamins...) is a target
// where going over is fine.
const LIMIT_FIELDS = new Set<ExtendedNutritionField>([
  "sugar",
  "addedSugar",
  "saturatedFat",
  "transFat",
  "cholesterol",
  "caffeine",
]);

function formatAmount(value: number, decimals: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

// A tap on a planner nutrition card opens this: the same card at the top
// (calories, the macros, sodium), then every extended nutrient against its
// goal, scrollable — a card for each group. Swipe sideways to switch between
// the day / 7-day / average views, like the cards themselves. In Orbit's
// look, light or dark, like Log under it.
export function NutritionDetailOverlay({
  visible,
  pages,
  initialPage,
  settings,
  onClose,
}: {
  visible: boolean;
  pages: NutritionDetailPage[];
  initialPage: number;
  settings: AppSettings | null;
  // Called with the page that was showing, so the planner's own cards can
  // follow along.
  onClose: (page: number) => void;
}) {
  const { width } = useWindowDimensions();
  const { colors: oc } = useOrbitTheme();
  // SafeAreaView doesn't pick up the notch inside a Modal, so pad by the
  // insets directly.
  const insets = useSafeAreaInsets();
  const pageWidth = width - 24;
  const listRef = useRef<FlatList<NutritionDetailPage>>(null);
  const [page, setPage] = useState(initialPage);

  useEffect(() => {
    if (visible) setPage(initialPage);
  }, [visible, initialPage]);

  const current = pages[page] ?? pages[0];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => onClose(page)}>
      <View style={{ flex: 1, backgroundColor: oc.scrim }}>
        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <View style={{ flex: 1, marginHorizontal: 12, marginVertical: 8, overflow: "hidden", borderRadius: 26, backgroundColor: oc.canvas, borderWidth: 1, borderColor: oc.border }}>
            {/* Header, on the sheet itself: which view, page dots, close */}
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 22, fontWeight: "800", letterSpacing: -0.4, color: oc.text }}>{current?.title}</Text>
                {!!current?.subtitle && <Text style={{ marginTop: 1, fontSize: 13, color: oc.muted }}>{current.subtitle}</Text>}
              </View>
              <View style={{ marginRight: 12, flexDirection: "row", gap: 6 }}>
                {pages.map((p, i) => (
                  <View key={p.title} style={{ height: 6, width: i === page ? 16 : 6, borderRadius: 3, backgroundColor: i === page ? oc.ink : oc.track }} />
                ))}
              </View>
              <Tap
                accessibilityLabel="Close"
                onPress={() => onClose(page)}
                style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: oc.surface, borderWidth: 1, borderColor: oc.border }}
                pressedStyle={{ backgroundColor: oc.pill }}
              >
                <Ionicons name="close" size={20} color={oc.text} />
              </Tap>
            </View>

            <FlatList
              ref={listRef}
              data={pages}
              keyExtractor={(p) => p.title}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={initialPage}
              getItemLayout={(_, index) => ({ length: pageWidth, offset: pageWidth * index, index })}
              onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / pageWidth))}
              renderItem={({ item }) => (
                <ScrollView
                  style={{ width: pageWidth }}
                  contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
                  showsVerticalScrollIndicator={false}
                >
                  <NutritionRings
                    title={item.title}
                    subtitle={item.subtitle}
                    confirmed={item.confirmed}
                    planned={item.planned}
                    limits={item.limits}
                    untitled
                  />
                  <ExtendedNutrientList page={item} settings={settings} />
                </ScrollView>
              )}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ExtendedNutrientList({ page, settings }: { page: NutritionDetailPage; settings: AppSettings | null }) {
  const { colors: oc } = useOrbitTheme();
  const known = EXTENDED_NUTRITION_FIELDS.filter(
    (f) => page.confirmed[f] != null || page.planned[f] != null,
  ).length;
  const eyebrow = { fontSize: 11, fontWeight: "700" as const, letterSpacing: 1.2, color: oc.faint };

  return (
    <>
      <View style={{ marginTop: 22, marginBottom: 2, paddingHorizontal: 4, flexDirection: "row", alignItems: "flex-end" }}>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: oc.text }}>All nutrients</Text>
        <Text style={{ fontSize: 12, color: oc.faint }}>
          {known} of {EXTENDED_NUTRITION_FIELDS.length} with data
        </Text>
      </View>
      {/* A card for each group */}
      {EXTENDED_NUTRITION_GROUPS.map((group) => (
        <View key={group.title}>
          <Text style={[eyebrow, { marginTop: 16, marginBottom: 8, marginLeft: 4 }]}>{group.title.toUpperCase()}</Text>
          <View style={{ overflow: "hidden", borderRadius: 18, borderWidth: 1, borderColor: oc.border, backgroundColor: oc.surface }}>
            {group.fields.map((field, index) => (
              <NutrientRow
                key={field}
                field={field}
                confirmed={page.confirmed[field]}
                planned={page.planned[field]}
                goal={settings ? scaleGoal(getEffectiveNutrientGoal(settings, field), page.goalScale) : null}
                first={index === 0}
                colors={oc}
              />
            ))}
          </View>
        </View>
      ))}
      <Text style={{ marginTop: 14, paddingHorizontal: 4, fontSize: 12, lineHeight: 18, color: oc.faint }}>
        Solid bars are what you&apos;ve eaten, the faded part adds what&apos;s planned. Vitamins and
        minerals are measured against the daily value unless you&apos;ve set your own goal. These
        only add up from foods that have that nutrient on file.
      </Text>
    </>
  );
}

function scaleGoal(goal: number | null, scale: number): number | null {
  return goal == null ? null : goal * scale;
}

function NutrientRow({
  field,
  confirmed,
  planned,
  goal,
  first,
  colors: oc,
}: {
  field: ExtendedNutritionField;
  confirmed: number | null | undefined;
  planned: number | null | undefined;
  goal: number | null;
  first: boolean;
  colors: OrbitColors;
}) {
  const meta = NUTRITION_FIELD_META[field];
  const eaten = confirmed ?? 0;
  const plannedAmount = planned ?? 0;
  const hasData = confirmed != null || planned != null;
  const confirmedF = pct(eaten, goal);
  const plannedF = Math.max(pct(eaten + plannedAmount, goal) - confirmedF, 0);
  const over = confirmedF >= 1 && LIMIT_FIELDS.has(field);
  const tone = over ? oc.warning : oc.fill;

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: first ? 0 : 1, borderTopColor: oc.border }}>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text style={{ flex: 1, fontSize: 14, color: hasData ? oc.text : oc.muted }}>{meta.label}</Text>
        {hasData ? (
          <Text style={{ fontSize: 14, fontWeight: "700", color: over ? oc.warning : oc.text }}>
            {formatAmount(eaten, meta.decimals)}
            {plannedAmount > 0 && <Text style={{ fontWeight: "400", color: oc.faint }}> +{formatAmount(plannedAmount, meta.decimals)}</Text>}
            <Text style={{ fontWeight: "400", color: oc.faint }}> {meta.unit}</Text>
          </Text>
        ) : (
          <Text style={{ fontSize: 14, color: oc.faint }}>—</Text>
        )}
        <Text style={{ width: 76, textAlign: "right", fontSize: 12, color: over ? oc.warning : oc.faint }}>
          {goal != null
            ? meta.dailyValue
              ? `${Math.round((eaten / goal) * 100)}% DV`
              : `/ ${formatAmount(goal, meta.decimals)}`
            : ""}
        </Text>
      </View>
      {goal != null && (
        <View style={{ marginTop: 7, height: 4, borderRadius: 2, overflow: "hidden", flexDirection: "row", backgroundColor: oc.track }}>
          <View style={{ width: `${confirmedF * 100}%`, backgroundColor: tone }} />
          <View style={{ width: `${plannedF * 100}%`, backgroundColor: tone, opacity: 0.35 }} />
        </View>
      )}
    </View>
  );
}

export default NutritionDetailOverlay;
