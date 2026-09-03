import { Text } from "react-native";

// Small uppercase label used above a card of SettingsRow entries — shared
// across the Settings and Goals pages so both read as one visual language.
export function SettingsSectionHeader({ title }: { title: string }) {
  return (
    <Text className="mb-2 mt-6 text-xs font-bold uppercase tracking-widest text-slate-400">
      {title}
    </Text>
  );
}

export default SettingsSectionHeader;
