import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { hoverable } from "@/src/components/web/ui";
import { useOrbitTheme } from "@/src/theme/orbit";

// Small pieces for the Pantry and Receipts pages in a desktop browser, in
// Orbit's look (the section's colours): a number at a glance, and the way
// back to the Pantry over a page under it.

type IconName = keyof typeof Ionicons.glyphMap;

// A number at a glance, in a card.
export function OrbitStat({ label, value, sub, icon, tone }: { label: string; value: string; sub?: string; icon: IconName; tone?: "warn" | "bad" }) {
  const { colors: c } = useOrbitTheme();
  const color = tone === "bad" ? c.danger : tone === "warn" ? c.warning : undefined;
  return (
    <View style={{ flex: 1, minWidth: 160, backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 16 }}>
      <Ionicons name={icon} size={18} color={color ?? c.muted} />
      <Text style={{ marginTop: 10, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: color ?? c.text }}>{value}</Text>
      <Text style={{ marginTop: 1, fontSize: 13, fontWeight: "600", color: c.text }}>{label}</Text>
      {!!sub && <Text style={{ marginTop: 1, fontSize: 12.5, color: c.muted }}>{sub}</Text>}
    </View>
  );
}

// "‹ Pantry" over the title of a page under the Pantry.
export function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors: c } = useOrbitTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`Back to ${label}`}
      style={hoverable(({ hovered }) => ({ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginBottom: 6, opacity: hovered ? 0.7 : 1 }))}
    >
      <Ionicons name="chevron-back" size={15} color={c.accent} />
      <Text style={{ marginLeft: 1, fontSize: 13.5, fontWeight: "600", color: c.accent }}>{label}</Text>
    </Pressable>
  );
}
