import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { Fragment } from "react";
import { Platform, ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { APPEARANCE_LABEL, Hairline, ListCard, ListRow, PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { useOrbitTheme, type Appearance } from "@/src/theme/orbit";

const CHOICES: [Appearance, keyof typeof Ionicons.glyphMap][] = [
  ["system", "phone-portrait-outline"],
  ["light", "sunny-outline"],
  ["dark", "moon-outline"],
];

// Settings → Appearance (the phone): Automatic (as the phone is set), Light
// or Dark, kept on the device. In a browser the web's own light/dark switch
// (the sidebar's) does this, so there it's back to Settings.
export default function AppearanceSettingsScreen() {
  const back = useGoBack("/settings-section");
  const { colors: c, appearance, setAppearance } = useOrbitTheme();
  if (Platform.OS === "web") return <Redirect href="/settings-section" />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48 }}>
        <PageHeader title="Appearance" onBack={back} style={{ marginBottom: 20 }} />
        <ListCard>
          {CHOICES.map(([value, icon], i) => (
            <Fragment key={value}>
              {i > 0 && <Hairline inset={48} />}
              <ListRow label={APPEARANCE_LABEL[value]} tile={<Ionicons name={icon} size={20} color={c.icon} />} checked={appearance === value} onPress={() => setAppearance(value)} />
            </Fragment>
          ))}
        </ListCard>
        <Text style={{ marginTop: 10, marginHorizontal: 4, fontSize: 13, lineHeight: 18, color: c.muted }}>
          Automatic follows your phone. A few pages are still being redesigned and keep their light look for now.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

