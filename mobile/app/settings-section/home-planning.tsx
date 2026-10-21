import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ComingSoon, neutralTile, PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { OrbitPage, sectionColor, useOrbitTheme } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// Settings → Home planning: not built yet. On the phone, in Orbit's look under the
// way back to Settings; a desktop browser keeps the older page.
export default function HomePlanningSettingsScreen() {
  const wide = useWideWeb();
  const back = useGoBack("/settings-section");
  const { colors: c, dark } = useOrbitTheme();

  if (wide) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-xl font-bold text-slate-900">Home Planning Settings</Text>
          <Text className="mt-2 text-center text-sm text-slate-400">Coming soon</Text>
        </View>
      </SafeAreaView>
    );
  }
  return (
    <OrbitPage>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48 }}>
          <PageHeader title="Home planning" onBack={back} />
          <ComingSoon icon="home" color={sectionColor("home", dark) ?? neutralTile(dark)} title="Coming soon" detail="Settings for planning your home will be here." />
        </ScrollView>
      </SafeAreaView>
    </OrbitPage>
  );
}
