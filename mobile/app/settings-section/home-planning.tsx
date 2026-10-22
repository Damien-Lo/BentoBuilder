import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ComingSoon, DESKTOP_PAGE, neutralTile, PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { OrbitPage, sectionColor, useOrbitTheme } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// Settings → Home planning: not built yet. On the phone, in Orbit's look under the
// way back to Settings; in a desktop browser the same, beside the Settings
// list (settings/web/WebSettingsFrame).
export default function HomePlanningSettingsScreen() {
  const wide = useWideWeb();
  const back = useGoBack("/settings-section");
  const { colors: c, dark } = useOrbitTheme();

  return (
    <OrbitPage>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={wide ? DESKTOP_PAGE : { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48 }}>
          <PageHeader title="Home planning" onBack={wide ? undefined : back} />
          <ComingSoon icon="home" color={sectionColor("home", dark) ?? neutralTile(dark)} title="Coming soon" detail="Settings for planning your home will be here." />
        </ScrollView>
      </SafeAreaView>
    </OrbitPage>
  );
}
