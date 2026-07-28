import type { ComponentProps } from "react";
import { Text, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";

interface SectionTitleProps {
  title: string;
  description: string;
  first?: boolean;
  icon?: ComponentProps<typeof Ionicons>["name"];
}

export function SectionTitle({
  title,
  description,
  first = false,
  icon,
}: SectionTitleProps) {
  return (
    <View className={`mb-3 flex-row items-center ${first ? "mt-0" : "mt-8"}`}>
      {icon ? (
        <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-blue-50">
          <Ionicons name={icon} size={18} color="#2563EB" />
        </View>
      ) : null}

      <View className="flex-1">
        <Text className="text-base font-bold text-slate-950">{title}</Text>

        <Text className="mt-0.5 text-xs leading-4 text-slate-500">
          {description}
        </Text>
      </View>
    </View>
  );
}

export default SectionTitle;
