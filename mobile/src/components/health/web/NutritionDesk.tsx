import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { hoverable } from "@/src/components/web/ui";
import { OrbitPage, OrbitSection, useOrbitPage, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// Nutrition's own pages (All nutrients, Weekly report, Today) in Orbit's
// look: in a desktop browser in the section's green, on a phone in
// Health's (Nutrition is part of Health there).
export function NutritionDesk({ children }: { children: ReactNode }) {
  const wide = useWideWeb();
  return (
    <OrbitSection section={wide ? "nutrition" : "health"}>
      <OrbitPage>
        <Canvas>{children}</Canvas>
      </OrbitPage>
    </OrbitSection>
  );
}

// The page's colours, desktop or phone.
export function useNutritionColors(): OrbitColors {
  const page = useOrbitPage();
  const { colors } = useOrbitTheme();
  return page ?? colors;
}

// (Orbit's canvas edge to edge, round a page held to a width.)
function Canvas({ children }: { children: ReactNode }) {
  const { colors } = useOrbitTheme();
  return <View style={{ flex: 1, backgroundColor: colors.canvas }}>{children}</View>;
}

// The page's colours on the desktop; null on a phone.
export function useNutritionDesk(): OrbitColors | null {
  const wide = useWideWeb();
  const page = useOrbitPage();
  return wide ? page : null;
}

// The top of one of these pages on the desktop: the way back, then the
// title large on the page itself (not a band of its own), and anything for
// its right-hand side.
export function DeskHeader({ o, title, subtitle, onBack, right }: { o: OrbitColors; title: string; subtitle: string; onBack: () => void; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 16, paddingTop: 22, paddingBottom: 4 }}>
      <Pressable
        onPress={onBack}
        accessibilityLabel="Back"
        style={hoverable(({ hovered }) => ({
          width: 36,
          height: 36,
          marginRight: 12,
          marginBottom: 4,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: hovered ? o.pill : o.surface,
          borderWidth: 1,
          borderColor: o.border,
        }))}
      >
        <Ionicons name="chevron-back" size={20} color={o.text} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: o.text }}>{title}</Text>
        <Text style={{ marginTop: 2, fontSize: 14, color: o.muted }}>{subtitle}</Text>
      </View>
      {right}
    </View>
  );
}

// A card on one of these pages: Orbit's surface, hairline and corners.
export const deskCard = (o: OrbitColors) => ({ backgroundColor: o.surface, borderColor: o.border, borderWidth: 1, borderRadius: 18 }) as const;
