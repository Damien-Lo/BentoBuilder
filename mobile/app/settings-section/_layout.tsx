import { Stack } from "expo-router";

// Settings: on the phone, one page that lists everything (index), each row
// opening its own page with a way back — like the iPhone's Settings. In a
// desktop browser the same pages show under Settings' own tabs at the top
// (components/web/WebShell), and /settings-section goes to Kitchen.
export default function SettingsSectionLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
