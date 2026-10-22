import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, Text } from "react-native";

import { hoverable, PageTitle, WebPage } from "@/src/components/web/ui";
import { OrbitPage, useOrbitTheme } from "@/src/theme/orbit";

// The pages under Kitchen → Plan in a desktop browser (the menu, prep &
// shopping, the grocery list), in Orbit's look: the way back to Plan over
// the title.

// "‹ Plan" over the title.
export function PlanCrumb() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  return (
    <Pressable
      onPress={() => router.navigate("/plan")}
      accessibilityRole="link"
      accessibilityLabel="Back to Plan"
      style={hoverable(({ hovered }) => ({ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginBottom: 6, opacity: hovered ? 0.7 : 1 }))}
    >
      <Ionicons name="chevron-back" size={15} color={c.accent} />
      <Text style={{ marginLeft: 1, fontSize: 13.5, fontWeight: "600", color: c.accent }}>Plan</Text>
    </Pressable>
  );
}

// The page itself: the way back, a large title, then what's on it.
// (`crumb`: false for one shown as a tab of its own.)
export function PlanSubPage({ title, subtitle, right, crumb = true, children }: { title: string; subtitle?: string; right?: ReactNode; crumb?: boolean; children: ReactNode }) {
  return (
    <OrbitPage>
      <WebPage maxWidth={1180}>
        {crumb && <PlanCrumb />}
        <PageTitle title={title} subtitle={subtitle} right={right} />
        {children}
      </WebPage>
    </OrbitPage>
  );
}
