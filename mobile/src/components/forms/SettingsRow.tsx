import type { ReactNode } from "react";
import { Text, View } from "react-native";

export function SettingsRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between border-b border-slate-100 px-4 py-3.5 last:border-b-0">
      <Text className="text-base text-slate-700">{label}</Text>
      <View className="ml-4 flex-1 items-end">{children}</View>
    </View>
  );
}

export default SettingsRow;
