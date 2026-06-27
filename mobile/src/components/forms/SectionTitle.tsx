import { Text, View } from "react-native";

interface SectionTitleProps {
  title: string;
  description: string;
  first?: boolean;
}

export function SectionTitle({
  title,
  description,
  first = false,
}: SectionTitleProps) {
  return (
    <View className={`mb-1 ${first ? "mt-0" : "mt-8"}`}>
      <Text className="text-xl font-bold text-slate-950">{title}</Text>

      <Text className="mt-1 text-sm leading-5 text-slate-500">
        {description}
      </Text>
    </View>
  );
}

export default SectionTitle;
