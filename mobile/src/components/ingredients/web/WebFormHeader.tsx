import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { hoverable } from "@/src/components/web/ui";
import { useOrbitTheme } from "@/src/theme/orbit";

// The top of an ingredient or pantry page in a desktop browser, in Orbit's
// look (the section's colours): the way back, the page's title large, and
// its buttons on the right — the phone's header, laid out for a wide page.
export function WebFormHeader({
  title,
  subtitle,
  onBack,
  backDisabled,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  backDisabled?: boolean;
  right?: ReactNode;
}) {
  const { colors: c } = useOrbitTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 24, paddingBottom: 6 }}>
      <Pressable
        onPress={onBack}
        disabled={backDisabled}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={hoverable(({ hovered }) => ({
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: hovered ? c.pill : c.surface,
        }))}
      >
        <Ionicons name="chevron-back" size={20} color={c.text} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0, marginLeft: 14 }}>
        <Text numberOfLines={1} style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>
          {title}
        </Text>
        {!!subtitle && (
          <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 14, color: c.muted }}>
            {subtitle}
          </Text>
        )}
      </View>
      {!!right && <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 12 }}>{right}</View>}
    </View>
  );
}

// A destructive action at the shared Button's size (web/ui has none): red
// on a pale red wash, as the phone's Delete buttons.
export function WebDangerButton({ label, icon, onPress }: { label: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  const { colors: c } = useOrbitTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={hoverable(({ hovered }) => ({
        flexDirection: "row",
        alignItems: "center",
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 12,
        backgroundColor: "#FEF2F2",
        opacity: hovered ? 0.8 : 1,
      }))}
    >
      {!!icon && <Ionicons name={icon} size={16} color={c.danger} style={{ marginRight: 6 }} />}
      <Text style={{ fontSize: 13, fontWeight: "600", color: c.danger }}>{label}</Text>
    </Pressable>
  );
}
