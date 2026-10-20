import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { minutesLabel, shortDateLabel } from "@/src/components/calendar/calendarUtils";
import { usePlanNeeds } from "@/src/components/planner/usePlanNeeds";
import { Tap } from "@/src/components/ui/Tap";
import { getGroceryItems, type GroceryItem } from "@/src/services/groceryListApi";
import { useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Kitchen → Plan: getting ready for the meals planned. The top half is what
// stands out now (a first go — what belongs here isn't settled yet); the
// bottom half, the pages it gathers: the menu (what you'd like to have
// soon, not yet on a day), the grocery list, and prep & shopping
// (what to make ahead and buy, the sessions booked for it, what's wrong with
// the plan, and the kitchen's tasks for the week). In Orbit's look.
export default function PlanTab() {
  const router = useRouter();
  const { colors } = useOrbitTheme();
  const plan = usePlanNeeds();
  const [items, setItems] = useState<GroceryItem[] | null>(null);

  const loadList = useCallback(() => {
    getGroceryItems().then(setItems).catch(() => {});
  }, []);
  useFocusEffect(loadList);
  // (Working out the plan's needs puts them on the list: read it again after.)
  useEffect(loadList, [plan.listSynced, loadList]);

  const toBuy = items?.filter((i) => i.status === "toBuy").length;
  const toLog = items?.filter((i) => i.status === "pendingLog").length ?? 0;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const next = plan.sessions
    .filter((s) => s.date > plan.today || (s.date === plan.today && s.endMinutes > nowMinutes))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes)[0];
  const tasksToday = plan.tasks.filter((t) => t.date <= plan.today).length;
  const onMenu = plan.menu.filter((m) => m.state === "menu").length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 28, fontWeight: "800", color: colors.text, letterSpacing: -0.5 }}>Plan</Text>
        <Text style={{ marginTop: 2, fontSize: 14, color: colors.muted }}>Getting ready for the meals you&apos;ve planned</Text>

        {/* Top half: what stands out now (room held for more) */}
        <View style={{ minHeight: 290, paddingTop: 20, gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Stat label="To buy" value={toBuy} icon="cart-outline" colors={colors} />
            <Stat label="To prep" value={plan.ready ? plan.prep.length : undefined} icon="flame-outline" colors={colors} />
            <Stat label="To fix" value={plan.ready ? plan.issues.length : undefined} icon="alert-circle-outline" tone={plan.issues.length ? colors.warning : undefined} colors={colors} />
          </View>
          <View style={{ backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 4 }}>
            <Line
              icon={next?.kind === "prep" ? "flame-outline" : "calendar-outline"}
              title={next ? next.title : plan.ready ? "No prep or shopping booked" : " "}
              detail={next ? `${next.date === plan.today ? "Today" : shortDateLabel(next.date)} · ${minutesLabel(next.startMinutes)} – ${minutesLabel(next.endMinutes)}` : "Book one in Prep & shopping"}
              colors={colors}
            />
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <Line
              icon="checkmark-done-outline"
              title={!plan.ready ? " " : tasksToday ? `${tasksToday} kitchen ${tasksToday === 1 ? "task" : "tasks"} for today` : "Nothing to do in the kitchen today"}
              detail={toLog ? `${toLog} bought, still to put in the pantry` : "From the meals planned"}
              colors={colors}
            />
          </View>
        </View>

        {/* Bottom half: the pages */}
        <Text style={{ marginTop: 20, marginBottom: 8, marginLeft: 4, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, color: colors.faint }}>PAGES</Text>
        <View style={{ backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
          <PageRow
            icon="reader-outline"
            title="Menu"
            detail={!plan.ready ? "What you'd like to have soon" : onMenu ? `${onMenu} on the menu` : "Nothing on it yet"}
            onPress={() => router.push("/menu" as Href)}
            colors={colors}
          />
          <View style={{ height: 1, marginLeft: 64, backgroundColor: colors.border }} />
          <PageRow
            icon="cart-outline"
            title="Grocery list"
            detail={toBuy === undefined ? "What to buy, and shopping mode" : toBuy ? `${toBuy} to buy${toLog ? ` · ${toLog} to put away` : ""}` : "Nothing to buy"}
            onPress={() => router.push("/grocery-list" as Href)}
            colors={colors}
          />
          <View style={{ height: 1, marginLeft: 64, backgroundColor: colors.border }} />
          <PageRow
            icon="flame-outline"
            title="Prep & shopping"
            detail="Make-ahead, shopping trips, kitchen tasks"
            onPress={() => router.push("/kitchen/needs" as Href)}
            colors={colors}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// A number at a glance (blank while it loads).
function Stat({ label, value, icon, tone, colors }: { label: string; value: number | undefined; icon: keyof typeof Ionicons.glyphMap; tone?: string; colors: OrbitColors }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
      <Ionicons name={icon} size={18} color={tone ?? colors.muted} />
      <Text style={{ marginTop: 10, fontSize: 26, fontWeight: "800", color: tone ?? colors.text }}>{value ?? " "}</Text>
      <Text style={{ marginTop: 1, fontSize: 12.5, color: colors.muted }}>{label}</Text>
    </View>
  );
}

function Line({ icon, title, detail, colors }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; colors: OrbitColors }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 }}>
      <Ionicons name={icon} size={20} color={colors.icon} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }} numberOfLines={1}>{title}</Text>
        <Text style={{ marginTop: 1, fontSize: 13, color: colors.muted }} numberOfLines={1}>{detail}</Text>
      </View>
    </View>
  );
}

function PageRow({ icon, title, detail, onPress, colors }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; onPress: () => void; colors: OrbitColors }) {
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 14 }} pressedStyle={{ backgroundColor: colors.pill }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.pill, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={19} color={colors.onPill} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }}>{title}</Text>
        <Text style={{ marginTop: 2, fontSize: 13, color: colors.muted }} numberOfLines={1}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </Tap>
  );
}
