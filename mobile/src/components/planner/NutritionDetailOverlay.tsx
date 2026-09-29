import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NutritionSummaryCard, type NutritionLimits } from "@/src/components/health/NutritionSummaryCard";
import type { AppSettings } from "@/src/services/settingsService";
import {
  EXTENDED_NUTRITION_FIELDS,
  EXTENDED_NUTRITION_GROUPS,
  NUTRITION_FIELD_META,
  type ExtendedNutritionField,
} from "@/src/types/nutrition";
import { hexToRgba, pct, type DayNutrition } from "@/src/utils/mealPlan";
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

const GROUP_COLORS: Record<string, string> = {
  "Sugars & fats": "#F59E0B",
  Vitamins: "#10B981",
  Minerals: "#6366F1",
  Other: "#64748B",
};

// Goals that are a ceiling (less is better) — only these turn red when
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
// goal, scrollable. Swipe sideways to switch between the day / 7-day /
// average views, like the cards themselves.
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
      <View className="flex-1 bg-black/40">
        <View className="flex-1" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <View className="mx-3 my-2 flex-1 overflow-hidden rounded-3xl bg-slate-50">
            {/* Header: which view, page dots, close */}
            <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
              <View className="flex-1">
                <Text className="text-lg font-bold text-slate-950">{current?.title}</Text>
                {!!current?.subtitle && <Text className="text-xs text-slate-500">{current.subtitle}</Text>}
              </View>
              <View className="mr-3 flex-row gap-1.5">
                {pages.map((p, i) => (
                  <View
                    key={p.title}
                    className={`h-1.5 rounded-full ${i === page ? "w-4 bg-blue-600" : "w-1.5 bg-slate-300"}`}
                  />
                ))}
              </View>
              <Pressable
                accessibilityLabel="Close"
                onPress={() => onClose(page)}
                className="h-9 w-9 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200"
              >
                <Ionicons name="close" size={20} color="#334155" />
              </Pressable>
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
                  <NutritionSummaryCard
                    title={item.title}
                    subtitle={item.subtitle}
                    confirmed={item.confirmed}
                    planned={item.planned}
                    limits={item.limits}
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
  const known = EXTENDED_NUTRITION_FIELDS.filter(
    (f) => page.confirmed[f] != null || page.planned[f] != null,
  ).length;

  return (
    <>
      <View className="mb-2 mt-5 flex-row items-end justify-between px-1">
        <Text className="text-xs font-bold uppercase tracking-widest text-slate-400">All nutrients</Text>
        <Text className="text-xs text-slate-400">
          {known} of {EXTENDED_NUTRITION_FIELDS.length} with data
        </Text>
      </View>
      <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {EXTENDED_NUTRITION_GROUPS.map((group) => (
          <View key={group.title}>
            <View className="border-b border-slate-100 bg-slate-50 px-4 py-2">
              <Text className="text-xs font-bold uppercase tracking-wider text-slate-500">{group.title}</Text>
            </View>
            {group.fields.map((field) => (
              <NutrientRow
                key={field}
                field={field}
                confirmed={page.confirmed[field]}
                planned={page.planned[field]}
                goal={settings ? scaleGoal(getEffectiveNutrientGoal(settings, field), page.goalScale) : null}
                color={GROUP_COLORS[group.title] ?? "#3B82F6"}
              />
            ))}
          </View>
        ))}
      </View>
      <Text className="mt-3 px-1 text-xs leading-5 text-slate-400">
        Solid bars are what you&apos;ve eaten, lighter bars add what&apos;s planned. Vitamins and
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
  color,
}: {
  field: ExtendedNutritionField;
  confirmed: number | null | undefined;
  planned: number | null | undefined;
  goal: number | null;
  color: string;
}) {
  const meta = NUTRITION_FIELD_META[field];
  const eaten = confirmed ?? 0;
  const plannedAmount = planned ?? 0;
  const hasData = confirmed != null || planned != null;
  const confirmedF = pct(eaten, goal);
  const plannedF = Math.max(pct(eaten + plannedAmount, goal) - confirmedF, 0);
  const over = confirmedF >= 1 && LIMIT_FIELDS.has(field);
  const barColor = over ? "#F87171" : color;

  return (
    <View className="border-b border-slate-100 px-4 py-2.5">
      <View className="flex-row items-center">
        <Text className="flex-1 text-sm text-slate-700">{meta.label}</Text>
        {hasData ? (
          <Text className="text-sm font-semibold text-slate-900">
            {formatAmount(eaten, meta.decimals)}
            {plannedAmount > 0 && (
              <Text className="font-normal text-slate-300"> +{formatAmount(plannedAmount, meta.decimals)}</Text>
            )}
            <Text className="font-normal text-slate-400"> {meta.unit}</Text>
          </Text>
        ) : (
          <Text className="text-sm text-slate-300">—</Text>
        )}
        <Text className="w-20 text-right text-xs text-slate-400">
          {goal != null
            ? meta.dailyValue
              ? `${Math.round((eaten / goal) * 100)}% DV`
              : `/ ${formatAmount(goal, meta.decimals)}`
            : ""}
        </Text>
      </View>
      {goal != null && (
        <View className="mt-1.5 h-1.5 w-full flex-row overflow-hidden rounded-full bg-slate-100">
          <View style={{ width: `${confirmedF * 100}%`, backgroundColor: barColor }} />
          <View style={{ width: `${plannedF * 100}%`, backgroundColor: hexToRgba(barColor, 0.35) }} />
        </View>
      )}
    </View>
  );
}

export default NutritionDetailOverlay;
