import { Stack } from "expo-router";

import { WebSettingsFrame } from "@/src/components/settings/web/WebSettingsFrame";
import { useWideWeb } from "@/src/utils/useWideWeb";

// Settings: on the phone, one page that lists everything (index), each row
// opening its own page with a way back — like the iPhone's Settings. In a
// desktop browser the same list sits down the left of every page
// (settings/web/WebSettingsFrame), and /settings-section goes to Kitchen.
export default function SettingsSectionLayout() {
  const wide = useWideWeb();
  const stack = <Stack screenOptions={{ headerShown: false }} />;
  return wide ? <WebSettingsFrame>{stack}</WebSettingsFrame> : stack;
}
