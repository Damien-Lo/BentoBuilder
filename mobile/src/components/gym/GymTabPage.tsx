import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Tap } from "@/src/components/ui/Tap";
import { OrbitSection, useOrbitTheme } from "@/src/theme/orbit";

// A Gym tab's page: its large title on the page (no way back — it's a tab),
// then what's in it. In Orbit's look, in Gym's orange.
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

// A page opened from a tab (Progress → Personal records): a way back — to
// `parent` if there's nothing to go back to — then its large title and
// what's in it.
export function GymPage({ title, subtitle, parent, children }: { title: string; subtitle: string; parent: string; children?: ReactNode }) {
  return (
    <OrbitSection section="gym">
      <PageBody title={title} subtitle={subtitle} parent={parent}>
        {children}
      </PageBody>
    </OrbitSection>
  );
}

function PageBody({ title, subtitle, parent, children }: { title: string; subtitle: string; parent: string; children?: ReactNode }) {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const back = () => (router.canGoBack() ? router.back() : router.replace(parent as Href));
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6 }}>
        <Tap onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }} pressedStyle={{ backgroundColor: c.pill }}>
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </Tap>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>{title}</Text>
        <Text style={{ marginTop: 2, fontSize: 14, color: c.muted }}>{subtitle}</Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

// A small heading over a group, in capitals.
export function GroupHeading({ children }: { children: string }) {
  const { colors: c } = useOrbitTheme();
  return <Text style={{ marginTop: 22, marginBottom: 8, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>{children.toUpperCase()}</Text>;
}

// Choices in a row of chips: the chosen one in Gym's colour.
export function Chips<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  const { colors: c } = useOrbitTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Tap key={o.id} onPress={() => onChange(o.id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: on ? c.ink : c.pill }} pressedStyle={{ opacity: 0.75 }}>
            <Text style={{ fontSize: 13.5, fontWeight: "600", color: on ? c.onInk : c.onPill }}>{o.label}</Text>
          </Tap>
        );
      })}
    </View>
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
