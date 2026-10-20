import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { Modal, Pressable, Text, View } from "react-native";

import { Tap } from "@/src/components/ui/Tap";
import { useOrbitTheme } from "@/src/theme/orbit";

// The orb's quick actions — what tapping it on the home screen, or holding
// the floating orb in a section, offers. Where the voice assistant will go.
export const QUICK: { label: string; icon: keyof typeof Ionicons.glyphMap; route: Href }[] = [
  { label: "Plan a meal", icon: "restaurant-outline", route: "/planner" },
  { label: "Add to the grocery list", icon: "cart-outline", route: "/grocery-list" },
  { label: "New event", icon: "calendar-outline", route: "/calendar/edit" },
  { label: "New task", icon: "checkbox-outline", route: "/lists" },
  { label: "Log weight", icon: "scale-outline", route: "/health/weight" },
];

export function QuickActions({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const { colors } = useOrbitTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: colors.scrim }} onPress={onClose}>
        <Pressable style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }} onPress={() => {}}>
          <View style={{ marginBottom: 12, height: 4, width: 40, alignSelf: "center", borderRadius: 2, backgroundColor: colors.track }} />
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>What would you like to do?</Text>
          <Text style={{ marginTop: 2, marginBottom: 12, fontSize: 14, color: colors.muted }}>Soon you&apos;ll be able to just ask.</Text>
          {QUICK.map((q) => (
            <Tap
              key={q.label}
              onPress={() => {
                onClose();
                router.push(q.route);
              }}
              style={{ flexDirection: "row", alignItems: "center", borderRadius: 16, paddingHorizontal: 8, paddingVertical: 12 }}
              pressedStyle={{ backgroundColor: colors.pill }}
            >
              <View style={{ height: 36, width: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: colors.accentSoft }}>
                <Ionicons name={q.icon} size={18} color={colors.accent} />
              </View>
              <Text style={{ marginLeft: 12, flex: 1, fontSize: 15, fontWeight: "600", color: colors.text }}>{q.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.faint} />
            </Tap>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
