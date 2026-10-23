import { useFocusEffect, useRouter, type Href } from "expo-router";
import { Fragment, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import type { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { NutritionSummaryCard } from "@/src/components/health/NutritionSummaryCard";
import { Hairline, IconTile, ListCard, ListRow, PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { getMealPlanForDate, type MealPlanEntry } from "@/src/services/mealPlanApi";
import { DEFAULT_SETTINGS, loadSettings, type AppSettings } from "@/src/services/settingsService";
import { OrbitPage, OrbitSection, useOrbitTheme } from "@/src/theme/orbit";
import { computeDayNutrition, todayStr } from "@/src/utils/mealPlan";

// Health → Nutrition today, on a phone: what you've eaten against your
// targets (the lighter part of each bar, what's still planned), then the
// rest of Nutrition — All nutrients, Your Targets, Weight, the weekly
// report. A page of Health's (/health/today), so back goes to Health. (A
// desktop browser has Nutrition's own review page at /health.)

interface MoreRow {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}

const MORE_ROWS: MoreRow[] = [
  { id: "nutrients", label: "All nutrients", icon: "list", route: "/health/nutrients" },
  { id: "targets", label: "Your Targets", icon: "locate", route: "/health/targets" },
  { id: "weight", label: "Weight", icon: "scale", route: "/health/weight" },
  { id: "weekly-report", label: "Weekly report", icon: "bar-chart", route: "/health/weekly-report" },
];

export function NutritionToday() {
  return (
    <OrbitSection section="health">
      <OrbitPage>
        <PhoneNutrition />
      </OrbitPage>
    </OrbitSection>
  );
}

function PhoneNutrition() {
  const router = useRouter();
  const leave = useGoBack("/health-section");
  const { colors: c } = useOrbitTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Reloaded on every focus, not just mount — this tab stays mounted, and
  // goals/meals can change from the screens pushed on top of it (All
  // Nutrients, the planner).
  useFocusEffect(
    useCallback(() => {
      Promise.all([loadSettings(), getMealPlanForDate(todayStr())])
        .then(([loadedSettings, loadedEntries]) => {
          setSettings(loadedSettings);
          setEntries(loadedEntries);
        })
        .finally(() => setIsLoading(false));
    }, []),
  );

  const confirmedNutrition = useMemo(
    () => computeDayNutrition(entries.filter(e => e.status === "confirmed"), settings.unitConversions),
    [entries, settings.unitConversions],
  );
  const plannedNutrition = useMemo(
    () => computeDayNutrition(entries.filter(e => e.status === "planned"), settings.unitConversions),
    [entries, settings.unitConversions],
  );

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.canvas }}>
        <ActivityIndicator color={c.muted} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <PageHeader title="Nutrition" subtitle="Today's intake against your targets" onBack={leave} />

        <View style={{ marginTop: 18 }}>
          <NutritionSummaryCard
            title="Today"
            orbit={c}
            confirmed={confirmedNutrition}
            planned={plannedNutrition}
            limits={{
              calories: settings.dailyCalorieLimit,
              protein: settings.dailyProteinLimit,
              carbs: settings.dailyCarbsLimit,
              fats: settings.dailyFatsLimit,
              fiber: settings.dailyFiberLimit,
              sodium: settings.dailySodiumLimit,
            }}
          />
        </View>
        <Text style={{ marginTop: 8, marginHorizontal: 4, fontSize: 12.5, color: c.faint }}>Eaten so far; the lighter part is what&apos;s still planned for today.</Text>

        <Text style={{ marginTop: 24, marginBottom: 8, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>MORE</Text>
        <ListCard>
          {MORE_ROWS.map((row, i) => (
            <Fragment key={row.id}>
              {i > 0 && <Hairline />}
              <ListRow label={row.label} tile={<IconTile icon={row.icon} color={c.fill} />} onPress={() => router.push(row.route as Href)} />
            </Fragment>
          ))}
        </ListCard>
      </ScrollView>
    </SafeAreaView>
  );
}
