import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { PaneContext } from "@/src/utils/pane";
import { useWideWeb } from "@/src/utils/useWideWeb";

// The desktop frame for the browser: a sidebar listing every section and
// its pages, with the app's screens shown in a pane beside it. On a phone,
// or a narrow window, it adds nothing and the app is laid out as usual.
//
// This is the bare structure. The screens in the pane are still the phone
// ones, held to a readable width; each gets its own wide layout in turn.

type IconName = keyof typeof Ionicons.glyphMap;

interface NavItem {
  label: string;
  icon: IconName;
  // Where it goes; omitted for a section that isn't built yet.
  path?: string;
  // Other paths that also count as "here" (its detail pages).
  also?: string[];
}

interface NavGroup {
  title?: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  { items: [{ label: "Home", icon: "grid-outline", path: "/" }] },
  {
    title: "Kitchen",
    items: [
      { label: "Planner", icon: "calendar-outline", path: "/planner" },
      { label: "Recipes & meals", icon: "restaurant-outline", path: "/RecipesMainPage", also: ["/recipes", "/meals", "/restaurant-meals"] },
      { label: "Pantry", icon: "basket-outline", path: "/PantryMainPage", also: ["/pantry", "/ingredients", "/storage"] },
      { label: "Grocery list", icon: "cart-outline", path: "/grocery-list" },
      { label: "Nutrition", icon: "pie-chart-outline", path: "/health" },
    ],
  },
  {
    title: "Lists",
    items: [
      { label: "Overview", icon: "speedometer-outline", path: "/lists" },
      { label: "Tasks", icon: "list-outline", path: "/lists/tasks", also: ["/lists/task"] },
      { label: "Checklists", icon: "checkbox-outline", path: "/lists/checklists" },
      { label: "Shopping", icon: "bag-handle-outline", path: "/lists/shopping" },
    ],
  },
  {
    title: "Calendar",
    items: [
      { label: "Calendar", icon: "calendar-clear-outline", path: "/calendar" },
      { label: "Meal times", icon: "time-outline", path: "/calendar/meal-times" },
    ],
  },
  {
    title: "Coming soon",
    items: [
      { label: "Gym", icon: "barbell-outline" },
      { label: "Food recommender", icon: "sparkles-outline" },
      { label: "Home planning", icon: "home-outline" },
      { label: "Documents", icon: "document-text-outline" },
    ],
  },
  {
    title: "App",
    items: [
      { label: "Settings", icon: "settings-outline", path: "/settings-section/kitchen", also: ["/settings-section"] },
      { label: "Developer", icon: "construct-outline", path: "/developer/home", also: ["/developer"] },
    ],
  },
];

export const WEB_SIDEBAR_WIDTH = 248;
// How wide a phone-shaped screen is allowed to grow in the content pane.
const CONTENT_MAX_WIDTH = 860;

// The item the current page belongs to: the longest matching path wins, so
// "/lists/tasks" is Tasks rather than Overview ("/lists").
function activePath(pathname: string): string | null {
  let best: string | null = null;
  let bestLength = -1;
  for (const group of NAV) {
    for (const item of group.items) {
      if (!item.path) continue;
      for (const candidate of [item.path, ...(item.also ?? [])]) {
        const matches = candidate === "/" ? pathname === "/" : pathname === candidate || pathname.startsWith(`${candidate}/`);
        if (matches && candidate.length > bestLength) {
          best = item.path;
          bestLength = candidate.length;
        }
      }
    }
  }
  return best;
}

export function WebShell({ children }: { children: ReactNode }) {
  const wide = useWideWeb();
  const router = useRouter();
  const pathname = usePathname();
  // The content pane's own size, for screens that lay out by width.
  const [pane, setPane] = useState<{ width: number; height: number } | null>(null);
  if (!wide) return <>{children}</>;

  const active = activePath(pathname);

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: "#F1F5F9" }}>
      {/* Sidebar */}
      <View
        style={{ width: WEB_SIDEBAR_WIDTH, backgroundColor: "#FFFFFF", borderRightWidth: 1, borderRightColor: "#E2E8F0" }}
      >
        <Pressable
          onPress={() => router.navigate("/")}
          style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, height: 68 }}
        >
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="grid-outline" size={18} color="#FFFFFF" />
          </View>
          <Text style={{ marginLeft: 10, fontSize: 18, fontWeight: "700", color: "#0F172A" }}>BentoBuilder</Text>
        </Pressable>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          {NAV.map((group, index) => (
            <View key={group.title ?? index} style={{ marginTop: group.title ? 18 : 4 }}>
              {!!group.title && (
                <Text style={{ marginBottom: 6, paddingHorizontal: 10, fontSize: 11, fontWeight: "700", letterSpacing: 1, color: "#94A3B8" }}>
                  {group.title.toUpperCase()}
                </Text>
              )}
              {group.items.map((item) => {
                const on = !!item.path && item.path === active;
                const built = !!item.path;
                return (
                  <Pressable
                    key={item.label}
                    disabled={!built}
                    onPress={() => item.path && router.navigate(item.path as Parameters<typeof router.navigate>[0])}
                    style={({ hovered }: { hovered?: boolean }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      height: 38,
                      paddingHorizontal: 10,
                      borderRadius: 10,
                      backgroundColor: on ? "#EFF6FF" : hovered && built ? "#F1F5F9" : "transparent",
                      opacity: built ? 1 : 0.5,
                    })}
                  >
                    <Ionicons name={item.icon} size={18} color={on ? "#1D4ED8" : "#64748B"} />
                    <Text style={{ marginLeft: 10, fontSize: 14, fontWeight: on ? "700" : "500", color: on ? "#1D4ED8" : "#334155" }}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Content pane: the app's screens, held to a readable width for now. */}
      <View style={{ flex: 1, alignItems: "center" }}>
        <View
          style={{
            flex: 1,
            width: "100%",
            maxWidth: CONTENT_MAX_WIDTH,
            backgroundColor: "#F8FAFC",
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: "#E2E8F0",
            overflow: "hidden",
          }}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setPane((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
          }}
        >
          {/* Nothing is drawn until the pane has been measured. */}
          {pane && <PaneContext.Provider value={pane}>{children}</PaneContext.Provider>}
        </View>
      </View>
    </View>
  );
}
