import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { Fragment, useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppleHealthCard } from "@/src/components/health/AppleHealthCard";
import { EnergyCard } from "@/src/components/health/EnergyCard";
import { toShown, useUnits } from "@/src/components/health/units";
import { useToday } from "@/src/components/home/useToday";
import { Hairline, IconTile, ListCard, ListRow, neutralTile, PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitSection, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import { getHealthMetrics } from "@/src/services/healthSync";

// Health on the phone: your body, what you eat, and how you're doing — one
// list, like Settings, each row opening its own page — About you (what the
// health numbers are worked out from) first. Today's energy at the top
// (budget, eaten, burned — Your burn, tapped), then weight and steps.
// Nutrition is part of
// it (its pages are the ones that were the Nutrition section's), with
// You, Activity & fitness, Body, Heart & vitals, Sleep & mind (most from
// Apple Health) and what's still to come. Today's two
// numbers at the top, then Apple Health's (connected and synced here). In
// Health's own colour.
//
// (In a desktop browser too, as a column — Health's Overview there.)

type Entry = { label: string; icon: keyof typeof Ionicons.glyphMap; path?: string; soon?: boolean };

const GROUPS: { title: string; entries: Entry[] }[] = [
  {
    title: "You",
    entries: [
      { label: "About you", icon: "person", path: "/health/about" },
      { label: "Your Targets", icon: "locate", path: "/health/targets" },
      { label: "Your burn", icon: "flame", path: "/health/burn" },
    ],
  },
  {
    title: "Activity & fitness",
    entries: [
      { label: "Activity", icon: "walk", path: "/health/section/activity" },
      { label: "Workouts", icon: "fitness", path: "/health/section/workouts" },
    ],
  },
  {
    title: "Body",
    entries: [
      { label: "Weight", icon: "scale", path: "/health/weight" },
      { label: "Body measurements", icon: "body", path: "/health/section/body" },
    ],
  },
  {
    title: "Heart & vitals",
    entries: [
      { label: "Heart", icon: "heart", path: "/health/section/heart" },
      { label: "Vitals", icon: "pulse", path: "/health/section/vitals" },
    ],
  },
  {
    title: "Sleep & mind",
    entries: [
      { label: "Sleep", icon: "moon", path: "/health/section/sleep" },
      { label: "Mind", icon: "happy", path: "/health/section/mind" },
    ],
  },
  {
    title: "Nutrition",
    entries: [
      { label: "Today", icon: "leaf", path: "/health/today" },
      { label: "All nutrients", icon: "list", path: "/health/nutrients" },
      { label: "Water & caffeine", icon: "water", path: "/health/section/drinks" },
      { label: "Weekly report", icon: "bar-chart", path: "/health/weekly-report" },
    ],
  },
  {
    title: "Still to come",
    entries: [
      { label: "Medications", icon: "medkit", soon: true },
      { label: "Records", icon: "document-text", soon: true },
    ],
  },
];

export default function HealthSection() {
  return (
    <OrbitSection section="health">
      <HealthList />
    </OrbitSection>
  );
}

function HealthList() {
  const router = useRouter();
  const leave = useGoBack("/");
  const { colors: c, dark } = useOrbitTheme();
  const t = useToday();
  const [units] = useUnits("weight");
  const kg = units === "metric";
  const open = (path: string) => router.push(path as Href);

  const weight = t.latestWeight;
  // Today's steps (as of the last Apple Health sync).
  const [steps, setSteps] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      getHealthMetrics(["steps"], t.today, t.today)
        .then((m) => setSteps(m[0]?.value ?? null))
        .catch(() => {});
    }, [t.today]),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        <PageHeader title="Health" subtitle="Your body, what you eat, and how you're doing" onBack={leave} />

        {/* Today's energy: budget, eaten, burned */}
        <EnergyCard />

        {/* Weight and steps, at a glance */}
        <View style={{ marginTop: 10, flexDirection: "row", gap: 10 }}>
          <Glance
            icon="scale-outline"
            value={weight ? `${Math.round(toShown("weight", weight.weight, units) * 10) / 10}` : "—"}
            unit={weight ? (kg ? "kg" : "lbs") : ""}
            detail={weight ? (t.weightChange == null ? `Weighed ${weight.date === t.today ? "today" : weight.date}` : `${t.weightChange > 0 ? "+" : ""}${Math.round(toShown("weight", t.weightChange, units) * 10) / 10} ${kg ? "kg" : "lbs"} this week`) : "No weigh-ins yet"}
            onPress={() => open("/health/weight")}
            colors={c}
          />
          <Glance icon="footsteps-outline" value={steps != null ? Math.round(steps).toLocaleString() : "—"} unit={steps != null ? "steps" : ""} detail={steps != null ? "Today, as of the last sync" : "None synced today"} onPress={() => open("/health/section/activity")} colors={c} />
        </View>

        {/* Apple Health: connected, synced, today's numbers */}
        <AppleHealthCard />

        {GROUPS.map((group) => (
          <View key={group.title}>
            <Text style={{ marginTop: 24, marginBottom: 8, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>{group.title.toUpperCase()}</Text>
            <ListCard>
              {group.entries.map((entry, i) => (
                <Fragment key={entry.label}>
                  {i > 0 && <Hairline />}
                  <ListRow
                    label={entry.label}
                    soon={entry.soon}
                    value={entry.soon ? "Coming" : undefined}
                    tile={<IconTile icon={entry.icon} color={entry.soon ? neutralTile(dark) : c.fill} />}
                    onPress={() => entry.path && open(entry.path)}
                  />
                </Fragment>
              ))}
            </ListCard>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// One of today's numbers, opening its page.
function Glance({ icon, value, unit, detail, tone, onPress, colors: c }: { icon: keyof typeof Ionicons.glyphMap; value: string; unit: string; detail: string; tone?: string; onPress: () => void; colors: OrbitColors }) {
  return (
    <Tap onPress={onPress} accessibilityRole="button" style={{ flex: 1, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }} pressedStyle={{ backgroundColor: c.pill }}>
      <Ionicons name={icon} size={18} color={c.ink} />
      <Text style={{ marginTop: 10, fontSize: 26, fontWeight: "800", color: tone ?? c.text }}>
        {value} <Text style={{ fontSize: 13, fontWeight: "500", color: c.muted }}>{unit}</Text>
      </Text>
      <Text style={{ marginTop: 2, fontSize: 12.5, color: c.muted }} numberOfLines={1}>
        {detail}
      </Text>
    </Tap>
  );
}
