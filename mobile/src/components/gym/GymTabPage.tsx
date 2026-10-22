import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useOrbitTheme } from "@/src/theme/orbit";

// A Gym tab's page: its large title on the page (no way back — it's a tab),
// then what's in it. In Orbit's look, in Gym's black and white.
export function GymTabPage({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  const { colors: c } = useOrbitTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>{title}</Text>
        <Text style={{ marginTop: 2, fontSize: 14, color: c.muted }}>{subtitle}</Text>
        <View style={{ marginTop: 20 }}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

// What a tab will hold, while it's being built.
export function Planned({ icon, title, detail }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string }) {
  const { colors: c } = useOrbitTheme();
  return (
    <View style={{ alignItems: "center", paddingHorizontal: 24, paddingVertical: 36, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
      <View style={{ width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.ink }}>
        <Ionicons name={icon} size={26} color={c.onInk} />
      </View>
      <Text style={{ marginTop: 14, fontSize: 17, fontWeight: "700", color: c.text }}>{title}</Text>
      <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, textAlign: "center", color: c.muted }}>{detail}</Text>
    </View>
  );
}
