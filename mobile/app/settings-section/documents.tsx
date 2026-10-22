import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ComingSoon, DESKTOP_PAGE, neutralTile, PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { OrbitPage, sectionColor, useOrbitTheme } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// Settings → Documents: not built yet. On the phone, in Orbit's look under the
// way back to Settings; in a desktop browser the same, beside the Settings
// list (settings/web/WebSettingsFrame).
export default function DocumentsSettingsScreen() {
  const wide = useWideWeb();
  const back = useGoBack("/settings-section");
  const { colors: c, dark } = useOrbitTheme();

  return (
    <OrbitPage>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={wide ? DESKTOP_PAGE : { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48 }}>
          <PageHeader title="Documents" onBack={wide ? undefined : back} />
          <ComingSoon icon="document-text" color={sectionColor("documents", dark) ?? neutralTile(dark)} title="Coming soon" detail="Settings for your documents will be here." />
        </ScrollView>
      </SafeAreaView>
    </OrbitPage>
  );
}
